"""Gasto real: cuánto gasta la persona de verdad, según lo que come y cómo se
mueve su peso, en vez de solo la fórmula.

La idea es la de apps como MacroFactor: si en tres semanas comiste en promedio
2.000 kcal al día y tu peso no se movió, tu gasto real ronda las 2.000, diga lo
que diga la fórmula. Con eso se corrige la meta cada semana.

Cuidados para que no haga locuras:
- Pide datos suficientes: 10 días con comida registrada y 3 pesajes que cubran
  al menos 10 días, dentro de las últimas 3 semanas.
- Los días con muy poca comida registrada no cuentan (seguro se olvidó de anotar).
- El peso se mira como tendencia (recta de mínimos cuadrados), no primer y último
  pesaje: un día de retención de líquidos no mueve nada.
- La corrección nunca pasa de ±20 % de la fórmula y se aplica de a poco: cada
  semana avanza la mitad del camino (menos si hay pocos datos).
"""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import estadisticas
from .models import AjusteGasto, PesoCorporal, Usuario

VENTANA_DIAS = 21
MIN_DIAS_COMIDA = 10
MIN_PESAJES = 3
MIN_DIAS_ENTRE_PESAJES = 10
KCAL_POR_KG = 7700
FACTOR_MIN, FACTOR_MAX = 0.8, 1.2
DIA_AJUSTE = 6            # domingo
CAMBIO_MINIMO_KCAL = 50   # menos que esto no vale la pena mover la meta


def _pendiente(puntos):
    """Pendiente (kg por día) de la recta que mejor pasa por los pesajes."""
    n = len(puntos)
    mx = sum(x for x, _ in puntos) / n
    my = sum(y for _, y in puntos) / n
    den = sum((x - mx) ** 2 for x, _ in puntos)
    return sum((x - mx) * (y - my) for x, y in puntos) / den if den else 0.0


def estimar(user, hoy=None):
    """Lo que dicen los datos de las últimas 3 semanas (sin guardar nada).
    Si faltan datos, dice cuántos faltan para poder mostrarlo en la app."""
    hoy = hoy or timezone.localdate()
    hasta = hoy - timedelta(days=1)                  # hoy todavía no termina
    desde = hasta - timedelta(days=VENTANA_DIAS - 1)
    formula = user.calcular_tdee()

    meta = user.meta_calorias or 2000
    totales = estadisticas.totales_por_dia(user, desde, hasta)
    dias = [t['calorias'] for t in totales.values() if t['calorias'] >= meta * 0.4]
    pesajes = list(PesoCorporal.objects.filter(usuario=user, fecha__range=[desde, hoy])
                   .order_by('fecha').values_list('fecha', 'peso_kg'))
    cubre = (pesajes[-1][0] - pesajes[0][0]).days if len(pesajes) >= 2 else 0

    datos = {
        'dias_comida': len(dias), 'dias_comida_min': MIN_DIAS_COMIDA,
        'pesajes': len(pesajes), 'pesajes_min': MIN_PESAJES,
        'dias_pesajes': cubre, 'dias_pesajes_min': MIN_DIAS_ENTRE_PESAJES,
        'gasto_formula': formula,
    }
    if not formula or len(dias) < MIN_DIAS_COMIDA or len(pesajes) < MIN_PESAJES or cubre < MIN_DIAS_ENTRE_PESAJES:
        return {**datos, 'listo': False}

    pendiente = _pendiente([((f - desde).days, kg) for f, kg in pesajes])
    ingesta = sum(dias) / len(dias)
    real = ingesta - pendiente * KCAL_POR_KG       # si bajas, gastas más de lo que comes
    confianza = min(len(dias) / VENTANA_DIAS, 1) * min(len(pesajes) / 6, 1)
    return {
        **datos, 'listo': True,
        'ingesta_media': round(ingesta),
        'cambio_kg_semana': round(pendiente * 7, 2),
        'gasto_real': round(real),
        'factor_datos': min(max(real / formula, FACTOR_MIN), FACTOR_MAX),
        'confianza': round(confianza, 2),
    }


def ajustar(user, hoy=None):
    """El ajuste de la semana: mueve el factor hacia lo que dicen los datos y,
    si la meta cambia lo suficiente, la recalcula. Devuelve el AjusteGasto o None."""
    hoy = hoy or timezone.localdate()
    e = estimar(user, hoy)
    if not e['listo']:
        return None

    anterior = user.factor_gasto or 1.0
    # De a poco: la mitad del camino por semana, menos si hay pocos datos
    factor = anterior + 0.5 * e['confianza'] * (e['factor_datos'] - anterior)
    factor = round(min(max(factor, FACTOR_MIN), FACTOR_MAX), 3)
    antes = user.meta_calorias

    with transaction.atomic():
        user.factor_gasto = factor
        user.save(update_fields=['factor_gasto'])
        despues = antes
        if not user.metas_manuales:
            calculo = user.calculo_metas()
            if calculo and abs(calculo['calorias'] - antes) >= CAMBIO_MINIMO_KCAL:
                user.calcular_metas()
                despues = user.meta_calorias
        ajuste, _ = AjusteGasto.objects.update_or_create(usuario=user, fecha=hoy, defaults={
            'ingesta_media': e['ingesta_media'], 'cambio_kg_semana': e['cambio_kg_semana'],
            'gasto_formula': e['gasto_formula'], 'gasto_real': e['gasto_real'],
            'factor': factor, 'calorias_antes': antes, 'calorias_despues': despues,
            'dias_comida': e['dias_comida'], 'pesajes': e['pesajes'],
        })
    return ajuste


def revisar_semana(ahora=None):
    """Lo llama el proceso que corre cada 10 minutos: los domingos desde las 6 a. m.
    ajusta a quien no se haya ajustado esta semana. Devuelve cuántos ajustó."""
    ahora = ahora or timezone.localtime()
    hoy = ahora.date()
    if hoy.weekday() != DIA_AJUSTE or ahora.hour < 6:
        return 0
    hechos = AjusteGasto.objects.filter(fecha__gt=hoy - timedelta(days=6)).values_list('usuario_id', flat=True)
    n = 0
    for user in Usuario.objects.filter(onboarding_completo=True).exclude(pk__in=hechos):
        n += 1 if ajustar(user, hoy) else 0
    return n


def texto_ajuste(ajuste):
    """Una línea para el resumen del domingo y el chat de Bruce."""
    if not ajuste:
        return None
    base = (f"Comió en promedio {ajuste.ingesta_media} kcal y su peso va {ajuste.cambio_kg_semana:+.2f} kg por semana, "
            f"así que su gasto real ronda {ajuste.gasto_real} kcal (la fórmula decía {ajuste.gasto_formula}).")
    if ajuste.calorias_despues != ajuste.calorias_antes:
        return base + f" Su meta pasa de {ajuste.calorias_antes} a {ajuste.calorias_despues} kcal."
    return base + f" Su meta se queda en {ajuste.calorias_antes} kcal."


def ultimo_ajuste(user, dias=14):
    return AjusteGasto.objects.filter(usuario=user, fecha__gte=timezone.localdate() - timedelta(days=dias)).first()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def estado(request):
    """Para la tarjeta de Progreso: qué falta para calcularlo o qué salió."""
    user = request.user
    ultimo = AjusteGasto.objects.filter(usuario=user).first()
    hoy = timezone.localdate()
    dias_al_domingo = (DIA_AJUSTE - hoy.weekday()) % 7
    if dias_al_domingo == 0 and ultimo and ultimo.fecha == hoy:
        dias_al_domingo = 7
    return Response({
        'estimacion': estimar(user, hoy),
        'factor': user.factor_gasto,
        'metas_manuales': user.metas_manuales,
        'proximo_ajuste': (hoy + timedelta(days=dias_al_domingo)).isoformat(),
        'ultimo': ultimo and {
            'fecha': ultimo.fecha.isoformat(), 'gasto_real': ultimo.gasto_real,
            'gasto_formula': ultimo.gasto_formula, 'ingesta_media': ultimo.ingesta_media,
            'cambio_kg_semana': ultimo.cambio_kg_semana,
            'calorias_antes': ultimo.calorias_antes, 'calorias_despues': ultimo.calorias_despues,
        },
    })
