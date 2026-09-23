"""Cálculos compartidos sobre los datos del usuario: rachas y totales por día.

Cada función hace una o dos consultas en total (no una por día): la base de
datos está en Neon y el servidor en Oracle, así que cada consulta cuesta.
"""
from datetime import date, datetime, timedelta

from django.db.models import Sum

from .models import Comida, RutinaDia, SesionGym

# Días sin rutina guardada: la app trae Lunes–Sábado con rutina y Domingo libre
DESCANSO_POR_DEFECTO = {6}
LIMITE_RACHA = 400


def parsear_fecha(valor, por_defecto=None):
    """'YYYY-MM-DD' → date. Devuelve None si el texto no es una fecha válida."""
    if valor in (None, ''):
        return por_defecto
    if isinstance(valor, date):
        return valor
    try:
        return datetime.strptime(str(valor), '%Y-%m-%d').date()
    except ValueError:
        return None


def dias_descanso(user):
    """Días de la semana (0=Lunes) en que el usuario no tiene que entrenar."""
    guardados = {d.dia_semana: d for d in RutinaDia.objects.filter(usuario=user).select_related('rutina')}
    descanso = set()
    for dia in range(7):
        d = guardados.get(dia)
        if d is None:
            if dia in DESCANSO_POR_DEFECTO:
                descanso.add(dia)
        elif d.rutina is None or not d.rutina.ejercicios:
            descanso.add(dia)
    return descanso


def _contar_racha(fechas_hechas, hoy, se_salta=lambda dia: False):
    """Días seguidos cumplidos hacia atrás desde hoy.

    Hoy todavía no cuenta como fallo (el día no ha terminado) y los días que
    `se_salta` marca (descanso) ni suman ni rompen la racha.
    """
    racha = 0
    dia = hoy
    for _ in range(LIMITE_RACHA):
        if dia in fechas_hechas:
            racha += 1
        elif dia != hoy and not se_salta(dia):
            break
        dia -= timedelta(days=1)
    return racha


def racha_gym(user, hoy, descanso=None):
    """Sesiones completadas seguidas, contando solo los días con rutina."""
    descanso = dias_descanso(user) if descanso is None else descanso
    if len(descanso) == 7:
        return 0
    fechas = set(
        SesionGym.objects
        .filter(usuario=user, completada=True, fecha__gt=hoy - timedelta(days=LIMITE_RACHA), fecha__lte=hoy)
        .values_list('fecha', flat=True)
    )
    return _contar_racha(fechas, hoy, se_salta=lambda d: d.weekday() in descanso)


def racha_comida(user, hoy):
    """Días seguidos con al menos una comida registrada."""
    fechas = set(
        Comida.objects
        .filter(usuario=user, fecha__gt=hoy - timedelta(days=LIMITE_RACHA), fecha__lte=hoy)
        .values_list('fecha', flat=True)
        .distinct()
    )
    return _contar_racha(fechas, hoy)


def totales_por_dia(user, desde, hasta):
    """{fecha: {calorias, proteina, carbos, grasas}} en una sola consulta."""
    filas = (
        Comida.objects
        .filter(usuario=user, fecha__range=[desde, hasta])
        .values('fecha')
        .annotate(calorias=Sum('calorias'), proteina=Sum('proteina'),
                  carbos=Sum('carbos'), grasas=Sum('grasas'))
    )
    return {
        f['fecha']: {
            'calorias': f['calorias'] or 0,
            'proteina': round(f['proteina'] or 0, 1),
            'carbos':   round(f['carbos'] or 0, 1),
            'grasas':   round(f['grasas'] or 0, 1),
        }
        for f in filas
    }


def dias_con_gym(user, desde, hasta):
    """Fechas con sesión completada en el rango."""
    return set(
        SesionGym.objects
        .filter(usuario=user, completada=True, fecha__range=[desde, hasta])
        .values_list('fecha', flat=True)
    )
