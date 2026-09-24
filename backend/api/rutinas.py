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


def asegurar_semana(user):
    """Las cuentas nuevas empiezan con la semana vacía: la arman ellas o se la
    arma Bruce (POST /rutinas/generar/). RUTINAS_POR_DEFECTO queda solo para
    la migración 0014, que completó las semanas de cuentas anteriores."""
    if not user.semana_creada:
        type(user).objects.filter(pk=user.pk).update(semana_creada=True)


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


# ── Bruce arma la rutina ───────────────────────────────────────────────────

MUSCULOS = ['Piernas', 'Pecho', 'Hombros', 'Espalda', 'Brazos', 'Core', 'Cardio']
EJERCICIOS_POR_TIEMPO = {30: 4, 45: 5, 60: 6, 90: 8}
PALETA = ['#4ade80', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c', '#fbbf24', '#2dd4bf']
NOMBRE_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']


def _prompt_rutina(user, dias, minutos, lugar, nivel, biblioteca):
    edad = user.get_edad()
    peso = user.peso_actual()
    objetivo = {'perder': 'perder grasa', 'ganar': 'ganar músculo'}.get(user.objetivo, 'mantener y estar en forma')
    donde = 'un gimnasio' if lugar == 'gym' else 'casa, con peso corporal y mancuernas'
    return f"""Eres un entrenador personal. Arma la rutina semanal de esta persona.

Persona: objetivo {objetivo}; nivel {nivel}; {f'{edad} años; ' if edad else ''}{f'{peso} kg; ' if peso else ''}sexo {user.sexo or 'no indicado'}.
Entrena: {', '.join(NOMBRE_DIA[d] for d in dias)} ({len(dias)} días), unos {minutos} minutos por sesión, en {donde}.
Su biblioteca de ejercicios (úsalos con estos nombres exactos siempre que puedas): {', '.join(biblioteca)}.

Reglas:
- Elige la división que mejor encaje con los días (cuerpo completo, torso/pierna, empuje/jalón/pierna...). Puedes repetir una rutina en varios días.
- Unos {EJERCICIOS_POR_TIEMPO[minutos]} ejercicios por sesión. Series y repeticiones según el nivel y el objetivo.
- Cuando sea posible, deja un día entre dos sesiones que trabajen los mismos músculos.
- "musculo" debe ser uno de: {', '.join(MUSCULOS)}. "peso" es una guía corta ("moderado", "peso corporal", "—"), nunca kilos exactos.
- Nombres de rutina cortos en español (máximo 3 palabras) y un emoji para cada una.
- En "semana", la clave es el número de día (0 = lunes ... 6 = domingo) y el valor la clave de la rutina.

Responde solo con JSON:
{{"rutinas": [{{"clave": "A", "nombre": "Torso", "emoji": "💪", "ejercicios": [{{"nombre": "...", "musculo": "Pecho", "series": 3, "reps": "10", "peso": "moderado"}}]}}],
 "semana": {{"0": "A", "2": "B"}},
 "explicacion": "una o dos frases de Bruce (directo, colombiano, sin emojis) explicando por qué armó la semana así"}}"""


def _pedir_rutina_ia(prompt):
    from django.conf import settings
    from .views import _extraer_json, _groq_chat  # evita importación circular
    return _extraer_json(_groq_chat({
        'model': settings.GROQ_MODEL_TEXTO,
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': 3500, 'temperature': 0.5, 'reasoning_effort': 'low',
        'response_format': {'type': 'json_object'},
    }, timeout=60))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generar(request):
    """Bruce arma rutinas y las asigna a los días elegidos (los demás, descanso).
    Body: { dias: [0, 2, 4], minutos: 30|45|60|90, lugar: gym|casa, nivel }"""
    import json
    import requests
    from .ejercicios import asegurar_biblioteca
    from .models import EjercicioPersonalizado
    from .views import _respuesta_error_groq

    dias = request.data.get('dias')
    if not isinstance(dias, list) or not dias or any(d not in range(7) for d in dias):
        return Response({'error': 'Elige al menos un día'}, status=status.HTTP_400_BAD_REQUEST)
    dias = sorted(set(dias))
    minutos = request.data.get('minutos', 60)
    lugar = request.data.get('lugar', 'gym')
    nivel = request.data.get('nivel', 'principiante')
    if minutos not in EJERCICIOS_POR_TIEMPO or lugar not in ('gym', 'casa') or nivel not in ('principiante', 'intermedio', 'avanzado'):
        return Response({'error': 'Datos inválidos'}, status=status.HTTP_400_BAD_REQUEST)
    if Rutina.objects.filter(usuario=request.user).count() + len(dias) > MAX_RUTINAS:
        return Response({'error': f'Máximo {MAX_RUTINAS} rutinas'}, status=status.HTTP_400_BAD_REQUEST)

    asegurar_biblioteca(request.user)
    biblioteca = {e.nombre.lower(): e for e in EjercicioPersonalizado.objects.filter(usuario=request.user)}
    try:
        datos = _pedir_rutina_ia(_prompt_rutina(request.user, dias, minutos, lugar, nivel, [e.nombre for e in biblioteca.values()]))
    except requests.RequestException as e:
        return _respuesta_error_groq(e, 'Bruce está armando muchas rutinas. Intenta de nuevo en un minuto.')
    except (json.JSONDecodeError, ValueError):
        return Response({'error': 'Bruce no pudo armar la rutina. Intenta de nuevo.'}, status=status.HTTP_502_BAD_GATEWAY)

    # Validar lo que devolvió la IA antes de guardar nada
    propuestas = {}
    for r in (datos.get('rutinas') or [])[:len(dias)]:
        if not isinstance(r, dict) or not r.get('clave'):
            continue
        ejercicios, error = limpiar_ejercicios(r.get('ejercicios') or [])
        if error or not ejercicios:
            continue
        for e in ejercicios:
            e['musculo'] = e['musculo'] if e['musculo'] in MUSCULOS else 'Core'
            en_biblio = biblioteca.get(e['nombre'].lower())
            if en_biblio:
                e['nombre'] = en_biblio.nombre
        propuestas[str(r['clave'])] = {
            'nombre': _texto(r.get('nombre'), 100, 'Rutina'), 'emoji': _texto(r.get('emoji'), 10, '💪'),
            'ejercicios': ejercicios,
        }
    semana = {int(d): str(c) for d, c in (datos.get('semana') or {}).items()
              if str(d).isdigit() and int(d) in dias and str(c) in propuestas}
    if not propuestas or not semana:
        return Response({'error': 'Bruce no pudo armar una rutina válida. Intenta de nuevo.'}, status=status.HTTP_502_BAD_GATEWAY)

    with transaction.atomic():
        creadas = {}
        for i, (clave, p) in enumerate(propuestas.items()):
            if clave in semana.values():
                creadas[clave] = Rutina.objects.create(usuario=request.user, color=PALETA[i % len(PALETA)], **p)
        # Lo que Bruce propuso y no está en la biblioteca, se agrega
        nuevos = {}
        for rutina in creadas.values():
            for e in rutina.ejercicios:
                n = e['nombre'].lower()
                if n not in biblioteca and n not in nuevos:
                    nuevos[n] = EjercicioPersonalizado(usuario=request.user, nombre=e['nombre'], musculo=e['musculo'],
                                                       series=e['series'], reps=e['reps'], peso='—', color='', custom=True)
        EjercicioPersonalizado.objects.bulk_create(nuevos.values())
        # Días elegidos: su rutina. Los demás: descanso.
        RutinaDia.objects.filter(usuario=request.user).delete()
        RutinaDia.objects.bulk_create([
            RutinaDia(usuario=request.user, dia_semana=d, rutina=creadas[c], orden=0) for d, c in semana.items()
        ])
    return Response({**_respuesta_completa(request.user), 'explicacion': _texto(datos.get('explicacion'), 300)})
