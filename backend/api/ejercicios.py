"""Biblioteca de ejercicios de cada persona.

GET    /ejercicios/        → [{id, nombre, musculo, series, reps, peso, color, custom, usado_en}]
POST   /ejercicios/        → crea uno
PATCH  /ejercicios/<id>/   → lo edita y actualiza las rutinas e historial que lo usan
DELETE /ejercicios/<id>/   → lo quita de la biblioteca (las rutinas lo conservan)

La primera vez, la biblioteca recibe una lista base genérica (sin pesos de
nadie). Desde ahí todo es de la persona: puede editar o borrar lo que quiera.
"""
import re

from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import EjercicioLog, EjercicioPersonalizado, Rutina

COLOR_HEX = re.compile(r'#[0-9a-fA-F]{6}')
MAX_EJERCICIOS = 200

# Lista base: ejercicios comunes, con series y repeticiones típicas y sin pesos
BASE = [
    ('Sentadilla', 'Piernas', 4, '8'), ('Prensa de pierna', 'Piernas', 4, '12'), ('Zancadas', 'Piernas', 3, '10'),
    ('Curl femoral', 'Piernas', 3, '12'), ('Extensión de cuádriceps', 'Piernas', 3, '12'), ('Peso muerto rumano', 'Piernas', 3, '10'),
    ('Hip thrust', 'Piernas', 3, '10'), ('Pantorrilla de pie', 'Piernas', 3, '15'), ('Aductor / abductor', 'Piernas', 3, '12'),
    ('Press banca plano', 'Pecho', 4, '8'), ('Press banca inclinado', 'Pecho', 3, '10'), ('Chest press máquina', 'Pecho', 3, '10'),
    ('Aperturas (pec fly)', 'Pecho', 3, '12'), ('Flexiones de pecho', 'Pecho', 3, '12'), ('Fondos en paralelas', 'Pecho', 3, '10'),
    ('Press militar', 'Hombros', 3, '10'), ('Elevaciones laterales', 'Hombros', 3, '15'), ('Elevaciones frontales', 'Hombros', 3, '12'),
    ('Face pull', 'Hombros', 3, '15'),
    ('Jalón al pecho', 'Espalda', 4, '10'), ('Remo con mancuerna', 'Espalda', 3, '10'), ('Remo en máquina', 'Espalda', 3, '12'),
    ('Remo con barra', 'Espalda', 4, '8'), ('Dominadas', 'Espalda', 4, '6'),
    ('Curl de bíceps', 'Brazos', 3, '12'), ('Curl martillo', 'Brazos', 3, '12'), ('Tríceps en polea', 'Brazos', 3, '12'),
    ('Tríceps francés', 'Brazos', 3, '12'),
    ('Plancha', 'Core', 3, '45s'), ('Plancha lateral', 'Core', 3, '30s'), ('Crunch en polea', 'Core', 3, '15'),
    ('Crunch bicicleta', 'Core', 3, '20'), ('Elevación de piernas', 'Core', 3, '12'),
    ('Caminadora', 'Cardio', 1, '20 min'), ('Bicicleta estática', 'Cardio', 1, '20 min'), ('Elíptica', 'Cardio', 1, '20 min'),
    ('Natación', 'Cardio', 1, '30 min'), ('Saltar lazo', 'Cardio', 3, '1 min'),
]


def _a_dict(e, usos=None):
    return {
        'id': e.id, 'nombre': e.nombre, 'musculo': e.musculo, 'series': e.series, 'reps': e.reps,
        'peso': e.peso, 'color': e.color, 'custom': e.custom, 'usado_en': (usos or {}).get(e.nombre.lower(), []),
    }


@transaction.atomic
def asegurar_biblioteca(user):
    """La primera vez copia la lista base; los ya creados por la persona se conservan."""
    if type(user).objects.filter(pk=user.pk, biblioteca_creada=True).exists():
        return
    tiene = {n.lower() for n in EjercicioPersonalizado.objects.filter(usuario=user).values_list('nombre', flat=True)}
    EjercicioPersonalizado.objects.bulk_create([
        EjercicioPersonalizado(usuario=user, nombre=n, musculo=m, series=s, reps=r, peso='—', color='', custom=False)
        for n, m, s, r in BASE if n.lower() not in tiene
    ])
    type(user).objects.filter(pk=user.pk).update(biblioteca_creada=True)


def _usos(user):
    """{nombre en minúscula: [rutinas que lo usan]}"""
    usos = {}
    for r in Rutina.objects.filter(usuario=user).only('nombre', 'ejercicios'):
        for e in r.ejercicios:
            usos.setdefault(str(e.get('nombre', '')).lower(), []).append(r.nombre)
    return usos


def _datos(data, parcial):
    """Campos válidos. Devuelve (campos, error)."""
    campos = {}
    if 'nombre' in data or not parcial:
        nombre = str(data.get('nombre') or '').strip()[:200]
        if not nombre:
            return None, 'El ejercicio necesita un nombre'
        campos['nombre'] = nombre
    if 'musculo' in data:
        campos['musculo'] = str(data.get('musculo') or 'Personalizado').strip()[:100] or 'Personalizado'
    if 'series' in data:
        try:
            campos['series'] = min(max(int(float(data['series'])), 1), 50)
        except (TypeError, ValueError):
            return None, 'series debe ser un número'
    for k, largo, defecto in (('reps', 50, '10'), ('peso', 50, '—')):
        if k in data:
            campos[k] = str(data.get(k) or defecto).strip()[:largo] or defecto
    if 'color' in data:
        color = str(data.get('color') or '')
        if color and not COLOR_HEX.fullmatch(color):
            return None, 'color debe ser hexadecimal (#rrggbb)'
        campos['color'] = color.lower()
    return campos, None


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def ejercicios(request):
    asegurar_biblioteca(request.user)
    if request.method == 'GET':
        usos = _usos(request.user)
        return Response([_a_dict(e, usos) for e in EjercicioPersonalizado.objects.filter(usuario=request.user)])

    if EjercicioPersonalizado.objects.filter(usuario=request.user).count() >= MAX_EJERCICIOS:
        return Response({'error': f'Máximo {MAX_EJERCICIOS} ejercicios'}, status=status.HTTP_400_BAD_REQUEST)
    campos, error = _datos(request.data, parcial=False)
    if error:
        return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
    if EjercicioPersonalizado.objects.filter(usuario=request.user, nombre__iexact=campos['nombre']).exists():
        return Response({'error': 'Ya tienes un ejercicio con ese nombre'}, status=status.HTTP_400_BAD_REQUEST)
    e = EjercicioPersonalizado.objects.create(usuario=request.user, custom=True, **campos)
    return Response(_a_dict(e), status=status.HTTP_201_CREATED)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def ejercicio_detalle(request, pk):
    e = EjercicioPersonalizado.objects.filter(pk=pk, usuario=request.user).first()
    if e is None:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        usado_en = _usos(request.user).get(e.nombre.lower(), [])
        e.delete()
        return Response({'ok': True, 'usado_en': usado_en})

    campos, error = _datos(request.data, parcial=True)
    if error:
        return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
    nuevo = campos.get('nombre', e.nombre)
    if nuevo.lower() != e.nombre.lower() and EjercicioPersonalizado.objects.filter(
            usuario=request.user, nombre__iexact=nuevo).exclude(pk=e.pk).exists():
        return Response({'error': 'Ya tienes un ejercicio con ese nombre'}, status=status.HTTP_400_BAD_REQUEST)

    anterior = {k: getattr(e, k) for k in ('nombre', 'musculo', 'series', 'reps', 'peso', 'color')}
    with transaction.atomic():
        for k, v in campos.items():
            setattr(e, k, v)
        e.save()
        actualizadas = _propagar(request.user, anterior, e)
    usos = _usos(request.user)
    return Response({**_a_dict(e, usos), 'rutinas_actualizadas': actualizadas})


def _propagar(user, anterior, e):
    """Lleva el cambio a las rutinas y al historial.

    Nombre, músculo y color cambian siempre. Series, repeticiones y peso solo
    donde la rutina aún tenía el valor anterior de la biblioteca: si la persona
    los había ajustado en esa rutina, se respeta su ajuste.
    """
    viejo = anterior['nombre'].lower()
    actualizadas = []
    for r in Rutina.objects.filter(usuario=user):
        cambio = False
        for item in r.ejercicios:
            if str(item.get('nombre', '')).lower() != viejo:
                continue
            item['nombre'], item['musculo'] = e.nombre, e.musculo
            if e.color:
                item['color'], item['custom'] = e.color, True
            for k in ('series', 'reps', 'peso'):
                if str(item.get(k)) == str(anterior[k]):
                    item[k] = getattr(e, k)
            cambio = True
        if cambio:
            r.save(update_fields=['ejercicios', 'actualizado'])
            actualizadas.append(r.nombre)
    if e.nombre != anterior['nombre']:
        # El historial sigue siendo el mismo ejercicio: así el gráfico de progreso no se parte en dos
        EjercicioLog.objects.filter(sesion__usuario=user, nombre__iexact=anterior['nombre']).update(nombre=e.nombre)
    return actualizadas
