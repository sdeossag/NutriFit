"""Logros por niveles, calculados con los datos reales del usuario.

GET  /logros/         → { logros: [...], nuevos: n }
POST /logros/vistos/  → marca como vistas las celebraciones pendientes

Cada logro tiene niveles (bronce, plata, oro, diamante…). El nivel alcanzado
se guarda en LogroUsuario y nunca baja: si cambias tu meta de proteína, lo
ganado se queda. Todo se calcula con pocas consultas agregadas.
"""
from collections import defaultdict
from datetime import timedelta

from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import estadisticas
from .models import Comida, EjercicioLog, LogroUsuario, PesoCorporal, RegistroAgua, SesionGym

NOMBRES_NIVEL = ['Bronce', 'Plata', 'Oro', 'Diamante', 'Leyenda']

# Singular de cada frase y unidad, para no escribir "1 días" ni "1 récords"
SINGULAR = {
    'sesiones completadas': 'sesión completada', 'días de rutina seguidos': 'día de rutina',
    'semanas sin faltar': 'semana sin faltar', 'récords personales': 'récord personal',
    'días cumpliendo': 'día cumpliendo', 'días dentro': 'día dentro',
    'días seguidos registrando': 'día registrando', 'días tomando': 'día tomando',
    'pesajes registrados': 'pesaje registrado',
    'sesiones': 'sesión', 'días': 'día', 'semanas': 'semana', 'récords': 'récord', 'pesajes': 'pesaje',
}


def _numero(n, texto):
    """'{n} días …' con n=1 → '1 día …'."""
    texto = texto.format(n=n)
    if n == 1:
        for plural, singular in SINGULAR.items():
            texto = texto.replace(plural, singular)
    return texto


META_AGUA_ML = 2500


def _definiciones(objetivo):
    """(clave, título, descripción con {n}, unidad, ícono, color, niveles)."""
    base = [
        ('sesiones',         'Constancia',        '{n} sesiones completadas',            'sesiones', 'barbell',  '#4ade80', [1, 10, 25, 50, 100]),
        ('racha_gym',        'En racha',          '{n} días de rutina seguidos',          'días',     'flame',    '#fb923c', [3, 7, 14, 30]),
        ('semana_perfecta',  'Semana perfecta',   '{n} semanas sin faltar a una rutina',  'semanas',  'calendar', '#a78bfa', [1, 4, 12, 26]),
        ('records',          'Más fuerte',        '{n} récords personales',               'récords',  'trophy',   '#fbbf24', [1, 5, 15, 40]),
        ('proteina',         'Proteína al día',   '{n} días cumpliendo tu proteína',      'días',     'meat',     '#60a5fa', [1, 7, 30, 100]),
        ('calorias',         'En el objetivo',    '{n} días dentro de tu meta de calorías', 'días',   'target',   '#2dd4bf', [3, 14, 50, 100]),
        ('registro',         'Sin fallar',        '{n} días seguidos registrando comidas', 'días',    'notebook', '#f472b6', [3, 7, 30, 100]),
        ('agua',             'Bien hidratado',    '{n} días tomando 2.5 L de agua',       'días',     'droplet',  '#22d3ee', [3, 14, 50]),
    ]
    if objetivo == 'perder':
        base.append(('peso', 'Transformación', '{n} kg menos desde que empezaste', 'kg', 'scale', '#4ade80', [1, 3, 5, 10]))
    elif objetivo == 'ganar':
        base.append(('peso', 'Construyendo', '{n} kg más desde que empezaste', 'kg', 'scale', '#60a5fa', [1, 2, 4, 6]))
    else:
        base.append(('peso', 'Bajo control', '{n} pesajes registrados', 'pesajes', 'scale', '#a3a3a3', [4, 12, 26, 52]))
    return base


def _mejor_racha(fechas, desde, hasta, se_salta=lambda d: False):
    """La racha más larga de fechas cumplidas; los días que se saltan no la rompen."""
    mejor = actual = 0
    dia = desde
    while dia <= hasta:
        if dia in fechas:
            actual += 1
            mejor = max(mejor, actual)
        elif not se_salta(dia) and dia != hasta:
            actual = 0
        dia += timedelta(days=1)
    return mejor


def metricas(user, hoy):
    """El valor actual de cada logro."""
    descanso = estadisticas.dias_descanso(user)
    planeados = max(7 - len(descanso), 1)

    sesiones = list(
        SesionGym.objects.filter(usuario=user, completada=True, fecha__lte=hoy).values_list('fecha', flat=True)
    )
    fechas_gym = set(sesiones)

    por_dia = (
        Comida.objects.filter(usuario=user, fecha__lte=hoy).values('fecha')
        .annotate(cal=Sum('calorias'), prot=Sum('proteina'))
    )
    meta_cal, meta_prot = user.meta_calorias or 0, user.meta_proteina or 0
    fechas_comida = set()
    dias_prot = dias_cal = 0
    for f in por_dia:
        fechas_comida.add(f['fecha'])
        if meta_prot and (f['prot'] or 0) >= meta_prot * 0.9:
            dias_prot += 1
        if meta_cal and meta_cal * 0.8 <= (f['cal'] or 0) <= meta_cal * 1.1:
            dias_cal += 1

    dias_agua = (
        RegistroAgua.objects.filter(usuario=user, fecha__lte=hoy).values('fecha')
        .annotate(total=Sum('cantidad_ml')).filter(total__gte=META_AGUA_ML).count()
    )

    # Récord: superar el peso máximo que se había levantado antes en ese ejercicio
    records = 0
    maximo = {}
    logs = (
        EjercicioLog.objects.filter(sesion__usuario=user, peso_kg__gt=0)
        .order_by('sesion__fecha', 'id').values_list('nombre', 'peso_kg')
    )
    for nombre, peso in logs:
        clave = nombre.strip().lower()
        if clave in maximo and peso > maximo[clave]:
            records += 1
        maximo[clave] = max(maximo.get(clave, 0), peso)

    # Semanas (lunes a domingo) con todas las rutinas planeadas hechas
    por_semana = defaultdict(set)
    for f in fechas_gym:
        por_semana[f - timedelta(days=f.weekday())].add(f)
    semanas_perfectas = sum(1 for dias in por_semana.values() if len(dias) >= planeados)

    pesos = list(PesoCorporal.objects.filter(usuario=user).values_list('peso_kg', flat=True))
    inicial = user.peso_inicial_kg or (pesos[0] if pesos else None)
    if user.objetivo == 'perder':
        valor_peso = round(max(0, inicial - min(pesos)), 1) if inicial and pesos else 0
    elif user.objetivo == 'ganar':
        valor_peso = round(max(0, max(pesos) - inicial), 1) if inicial and pesos else 0
    else:
        valor_peso = len(pesos)

    inicio_gym = min(fechas_gym) if fechas_gym else hoy
    inicio_comida = min(fechas_comida) if fechas_comida else hoy
    return {
        'sesiones':        len(sesiones),
        'racha_gym':       _mejor_racha(fechas_gym, inicio_gym, hoy, lambda d: d.weekday() in descanso),
        'semana_perfecta': semanas_perfectas,
        'records':         records,
        'proteina':        dias_prot,
        'calorias':        dias_cal,
        'registro':        _mejor_racha(fechas_comida, inicio_comida, hoy),
        'agua':            dias_agua,
        'peso':            valor_peso,
    }


def calcular(user, hoy=None):
    """Lista de logros con nivel, progreso al siguiente y si hay que celebrarlo."""
    hoy = hoy or timezone.localdate()
    valores = metricas(user, hoy)
    guardados = {l.clave: l for l in LogroUsuario.objects.filter(usuario=user)}
    ahora = timezone.now()

    resultado = []
    for clave, titulo, desc, unidad, icono, color, niveles in _definiciones(user.objetivo):
        valor = valores[clave]
        nivel_calculado = sum(1 for umbral in niveles if valor >= umbral)
        guardado = guardados.get(clave)
        nivel = max(nivel_calculado, guardado.nivel if guardado else 0)

        if nivel_calculado > (guardado.nivel if guardado else 0):
            guardado, _ = LogroUsuario.objects.update_or_create(
                usuario=user, clave=clave,
                defaults={'nivel': nivel_calculado, 'desbloqueado_en': ahora, 'visto': False},
            )

        siguiente = niveles[nivel] if nivel < len(niveles) else None
        anterior = niveles[nivel - 1] if nivel > 0 else 0
        progreso = 1.0 if siguiente is None else max(0.0, min((valor - anterior) / (siguiente - anterior), 1.0))
        resultado.append({
            'clave':           clave,
            'titulo':          titulo,
            'descripcion':     _numero(siguiente if siguiente is not None else niveles[-1], desc),
            'icono':           icono,
            'color':           color,
            'unidad':          SINGULAR.get(unidad, unidad) if (siguiente if siguiente is not None else valor) == 1 else unidad,
            'valor':           valor,
            'nivel':           nivel,
            'nivel_nombre':    NOMBRES_NIVEL[nivel - 1] if nivel else None,
            'niveles':         niveles,
            'siguiente':       siguiente,
            'progreso':        round(progreso, 3),
            'desbloqueado_en': guardado.desbloqueado_en.isoformat() if guardado and nivel else None,
            'nuevo':           bool(guardado and nivel and not guardado.visto),
        })
    # Primero lo recién ganado, luego lo más avanzado
    resultado.sort(key=lambda l: (not l['nuevo'], -l['nivel'], -l['progreso']))
    return resultado


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def logros(request):
    lista = calcular(request.user)
    return Response({'logros': lista, 'nuevos': sum(1 for l in lista if l['nuevo'])})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logros_vistos(request):
    LogroUsuario.objects.filter(usuario=request.user, visto=False).update(visto=True)
    return Response({'ok': True})
