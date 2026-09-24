"""Rutinas como paquetes reutilizables y la semana que las asigna a cada día.

GET    /rutinas/           → { rutinas: [...], semana: {"0": [id, ...], ...} }
POST   /rutinas/           → crea una rutina
PATCH  /rutinas/<id>/      → edita nombre, emoji, color o ejercicios
DELETE /rutinas/<id>/      → la borra y la quita de los días que la usaban
PUT    /rutinas/semana/    → { semana: {"1": [id, id], "3": []} } reemplaza esos días

Un día puede tener varias rutinas (doble entreno); una lista vacía es descanso.
"""
import re

from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Rutina, RutinaDia

MAX_EJERCICIOS = 40
MAX_RUTINAS    = 30
MAX_POR_DIA    = 3
COLOR_HEX      = re.compile(r'#[0-9a-fA-F]{6}')

_PECHO = [
    {'nombre': 'Chest press máquina',   'musculo': 'Pecho',   'series': 3, 'reps': '10', 'peso': '36–64 kg'},
    {'nombre': 'Press banca plano',     'musculo': 'Pecho',   'series': 4, 'reps': '10', 'peso': '10–12.5 kg'},
    {'nombre': 'Pec fly',               'musculo': 'Pecho',   'series': 3, 'reps': '10', 'peso': '32–52 kg'},
    {'nombre': 'Press militar',         'musculo': 'Hombros', 'series': 3, 'reps': '10', 'peso': '8–10 kg'},
    {'nombre': 'Elevaciones laterales', 'musculo': 'Hombros', 'series': 3, 'reps': '10', 'peso': '6–8 kg'},
    {'nombre': 'Tríceps polea',         'musculo': 'Brazos',  'series': 3, 'reps': '10', 'peso': '18–27 kg'},
    {'nombre': 'Elevación de piernas',  'musculo': 'Core',    'series': 3, 'reps': '12', 'peso': '—'},
]
# La semana con la que arranca toda cuenta nueva (antes vivía solo en el frontend)
RUTINAS_POR_DEFECTO = [
    {'clave': 'pecho',    'nombre': 'Pecho/Hombros',  'emoji': '💪', 'color': '#60a5fa', 'ejercicios': _PECHO},
    {'clave': 'natacion', 'nombre': 'Natación',       'emoji': '🏊', 'color': '#fb923c', 'ejercicios': [
        {'nombre': 'Natación libre', 'musculo': 'Cardio', 'series': 1, 'reps': '15-20m', 'peso': '—'},
    ]},
    {'clave': 'espalda',  'nombre': 'Espalda/Brazos', 'emoji': '🦾', 'color': '#a78bfa', 'ejercicios': [
        {'nombre': 'Jalón al pecho',   'musculo': 'Espalda', 'series': 4, 'reps': '10',  'peso': '32–45 kg'},
        {'nombre': 'Remo mancuerna',   'musculo': 'Espalda', 'series': 3, 'reps': '10',  'peso': '18–20 kg'},
        {'nombre': 'Remo máquina',     'musculo': 'Espalda', 'series': 3, 'reps': '10',  'peso': '32–45 kg'},
        {'nombre': 'Curl bíceps',      'musculo': 'Brazos',  'series': 4, 'reps': '10',  'peso': '8–10 kg'},
        {'nombre': 'Curl martillo',    'musculo': 'Brazos',  'series': 3, 'reps': '10',  'peso': '8–10 kg'},
        {'nombre': 'Plancha',          'musculo': 'Core',    'series': 4, 'reps': '45s', 'peso': '—'},
        {'nombre': 'Crunch bicicleta', 'musculo': 'Core',    'series': 3, 'reps': '20',  'peso': '—'},
    ]},
]
SEMANA_POR_DEFECTO = ['pecho', 'natacion', 'espalda', 'natacion', 'pecho', 'natacion', None]


# ── Serialización y validación ─────────────────────────────────────────────

def rutina_a_dict(r):
    return {'id': r.id, 'nombre': r.nombre, 'emoji': r.emoji, 'color': r.color, 'ejercicios': r.ejercicios}


def _texto(valor, largo, por_defecto=''):
    return str(valor if valor not in (None, '') else por_defecto).strip()[:largo]


def limpiar_ejercicios(lista):
    """Valida la lista de ejercicios de una rutina. Devuelve (lista, error)."""
    if not isinstance(lista, list) or len(lista) > MAX_EJERCICIOS:
        return None, f'ejercicios debe ser una lista de máximo {MAX_EJERCICIOS}'
    limpios = []
    for i, e in enumerate(lista, 1):
        if not isinstance(e, dict) or not _texto(e.get('nombre'), 200):
            return None, f'el ejercicio {i} no tiene nombre'
        try:
            series = int(float(e.get('series', 3)))
        except (TypeError, ValueError):
            series = 3
        item = {
            'nombre':  _texto(e.get('nombre'), 200),
            'musculo': _texto(e.get('musculo'), 100),
            'series':  min(max(series, 1), 50),
            'reps':    _texto(e.get('reps'), 50, '10'),
            'peso':    _texto(e.get('peso'), 50, '—'),
        }
        if e.get('custom'):
            item['custom'] = True
            if COLOR_HEX.fullmatch(str(e.get('color') or '')):
                item['color'] = e['color']
        limpios.append(item)
    return limpios, None


def _datos_rutina(data, parcial):
    """Campos válidos para crear/editar una rutina. Devuelve (campos, error)."""
    campos = {}
    if 'nombre' in data or not parcial:
        nombre = _texto(data.get('nombre'), 100)
        if not nombre:
            return None, 'La rutina necesita un nombre'
        campos['nombre'] = nombre
    if 'emoji' in data:
        campos['emoji'] = _texto(data.get('emoji'), 10, '💪')
    if 'color' in data:
        if not COLOR_HEX.fullmatch(str(data.get('color') or '')):
            return None, 'color debe ser hexadecimal (#rrggbb)'
        campos['color'] = data['color'].lower()
    if 'ejercicios' in data or not parcial:
        ejercicios, error = limpiar_ejercicios(data.get('ejercicios', []))
        if error:
            return None, error
        campos['ejercicios'] = ejercicios
    return campos, None


# ── Semana ─────────────────────────────────────────────────────────────────

def _semana_dict(user):
    semana = {str(d): [] for d in range(7)}
    for d, rid in RutinaDia.objects.filter(usuario=user).values_list('dia_semana', 'rutina_id'):
        semana[str(d)].append(rid)
    return semana


@transaction.atomic
def asegurar_semana(user):
    """La primera vez, la cuenta recibe la semana por defecto como paquetes
    propios que puede editar. Después nunca se vuelve a tocar."""
    if user.semana_creada:
        return
    user = type(user).objects.select_for_update().get(pk=user.pk)
    if user.semana_creada:
        return
    if not RutinaDia.objects.filter(usuario=user).exists():
        creadas = {}
        for dia, clave in enumerate(SEMANA_POR_DEFECTO):
            if clave is None:
                continue
            if clave not in creadas:
                base = next(r for r in RUTINAS_POR_DEFECTO if r['clave'] == clave)
                creadas[clave] = Rutina.objects.filter(usuario=user, nombre=base['nombre']).first() or Rutina.objects.create(
                    usuario=user, nombre=base['nombre'], emoji=base['emoji'],
                    color=base['color'], ejercicios=base['ejercicios'],
                )
            RutinaDia.objects.create(usuario=user, dia_semana=dia, rutina=creadas[clave])
    user.semana_creada = True
    user.save(update_fields=['semana_creada'])


def _respuesta_completa(user):
    asegurar_semana(user)
    return {
        'rutinas': [rutina_a_dict(r) for r in Rutina.objects.filter(usuario=user)],
        'semana':  _semana_dict(user),
    }


# ── Vistas ─────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def rutinas(request):
    if request.method == 'GET':
        return Response(_respuesta_completa(request.user))

    if Rutina.objects.filter(usuario=request.user).count() >= MAX_RUTINAS:
        return Response({'error': f'Máximo {MAX_RUTINAS} rutinas'}, status=status.HTTP_400_BAD_REQUEST)
    campos, error = _datos_rutina(request.data, parcial=False)
    if error:
        return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
    rutina = Rutina.objects.create(usuario=request.user, **campos)
    return Response(rutina_a_dict(rutina), status=status.HTTP_201_CREATED)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def rutina_detalle(request, pk):
    rutina = Rutina.objects.filter(pk=pk, usuario=request.user).first()
    if rutina is None:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        rutina.delete()  # se quita de los días que la usaban (CASCADE)
        return Response(_respuesta_completa(request.user))

    campos, error = _datos_rutina(request.data, parcial=True)
    if error:
        return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
    for k, v in campos.items():
        setattr(rutina, k, v)
    rutina.save()
    return Response(rutina_a_dict(rutina))


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def semana(request):
    """Reemplaza las rutinas de los días enviados. Mover o intercambiar es
    mandar los dos días a la vez. Acepta lista, un id suelto o null."""
    cambios = request.data.get('semana')
    if not isinstance(cambios, dict) or not cambios:
        return Response({'error': 'Se requiere semana: {dia: [rutina_id, ...]}'}, status=status.HTTP_400_BAD_REQUEST)

    propias = set(Rutina.objects.filter(usuario=request.user).values_list('id', flat=True))
    asignar = {}
    for dia, ids in cambios.items():
        if str(dia) not in {str(d) for d in range(7)}:
            return Response({'error': f'Día inválido: {dia}'}, status=status.HTTP_400_BAD_REQUEST)
        ids = [] if ids is None else ids if isinstance(ids, list) else [ids]
        ids = list(dict.fromkeys(ids))  # sin repetidos, en orden
        if len(ids) > MAX_POR_DIA:
            return Response({'error': f'Máximo {MAX_POR_DIA} rutinas por día'}, status=status.HTTP_400_BAD_REQUEST)
        if any(i not in propias for i in ids):
            return Response({'error': 'Esa rutina no existe'}, status=status.HTTP_400_BAD_REQUEST)
        asignar[int(dia)] = ids

    with transaction.atomic():
        asegurar_semana(request.user)
        for d, ids in asignar.items():
            RutinaDia.objects.filter(usuario=request.user, dia_semana=d).delete()
            RutinaDia.objects.bulk_create([
                RutinaDia(usuario=request.user, dia_semana=d, rutina_id=rid, orden=i) for i, rid in enumerate(ids)
            ])
    return Response({'semana': _semana_dict(request.user)})


# ── Compatibilidad con versiones viejas de la app (/rutinas-dia/) ──────────

@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def rutinas_dia(request):
    """Formato viejo: un objeto por día (la primera rutina). El PUT la edita."""
    asegurar_semana(request.user)
    primera = {}
    for dia in RutinaDia.objects.filter(usuario=request.user).select_related('rutina'):
        primera.setdefault(dia.dia_semana, dia.rutina)

    if request.method == 'GET':
        return Response({
            str(d): {
                'nombre':     primera[d].nombre if d in primera else 'Descanso',
                'rutina_id':  'A' if d in primera else 'R',
                'emoji':      primera[d].emoji if d in primera else '🛌',
                'ejercicios': primera[d].ejercicios if d in primera else [],
            }
            for d in range(7)
        })

    try:
        d = int(request.data.get('dia_semana'))
        assert 0 <= d <= 6
    except (TypeError, ValueError, AssertionError):
        return Response({'error': 'dia_semana debe estar entre 0 y 6'}, status=status.HTTP_400_BAD_REQUEST)
    campos, error = _datos_rutina({k: request.data[k] for k in ('nombre', 'emoji', 'ejercicios') if k in request.data}, parcial=True)
    if error:
        return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        r = primera.get(d)
        if r is None:
            r = Rutina.objects.create(usuario=request.user, nombre=campos.pop('nombre', 'Rutina'), **campos)
            RutinaDia.objects.create(usuario=request.user, dia_semana=d, rutina=r)
        else:
            for k, v in campos.items():
                setattr(r, k, v)
            r.save()
    return Response({'nombre': r.nombre, 'rutina_id': 'A', 'emoji': r.emoji, 'ejercicios': r.ejercicios})
