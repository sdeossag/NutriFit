"""Plan del día: Bruce propone qué comer con lo que falta de las metas.

GET  /plan/?fecha=YYYY-MM-DD   → { plan, restante, momentos }
POST /plan/                    → { fecha } genera (o rehace) el plan
POST /plan/cambiar/            → { fecha, indice } otra opción para una comida
POST /plan/registrar/          → { fecha, indice } la agrega a las comidas del día

La IA propone; el servidor verifica. Las restricciones y lo que no le gusta a
la persona se revisan ingrediente por ingrediente: si algo se cuela, se pide
otra opción y, si vuelve a pasar, esa comida se descarta. Los totales se
recalculan en el servidor para que calorías y macros siempre cuadren.
"""
import json
import re
import unicodedata
from datetime import timedelta

import requests
from django.conf import settings
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import estadisticas
from .models import AlimentoAlacena, Comida, PlanDia

MAX_GENERACIONES_DIA = 15

# Parte de las calorías del día que suele ir en cada comida
REPARTO = {'desayuno': 0.25, 'almuerzo': 0.35, 'merienda': 0.10, 'cena': 0.30}
NOMBRE_MOMENTO = {'desayuno': 'Desayuno', 'almuerzo': 'Almuerzo', 'merienda': 'Merienda', 'cena': 'Cena'}

# Palabras que no pueden aparecer según cada restricción
_CARNES = ['carne', 'res', 'pollo', 'cerdo', 'pescado', 'atun', 'salmon', 'tilapia', 'trucha', 'jamon',
           'tocino', 'chorizo', 'salchicha', 'chicharron', 'camaron', 'marisco', 'pavo', 'higado',
           'sardina', 'costilla', 'lomo', 'pechuga', 'muslo', 'morcilla', 'mortadela', 'bondiola']
_LACTEOS = ['leche', 'queso', 'yogur', 'mantequilla', 'crema de leche', 'kumis', 'suero', 'arequipe',
            'cuajada', 'kefir', 'quesillo', 'ghee']
_GLUTEN  = ['trigo', 'pan', 'pasta', 'espagueti', 'galleta', 'cebada', 'centeno', 'cuscus',
            'seitan', 'cerveza', 'tostada', 'croissant', 'wrap', 'tortilla de harina']
_CERDO   = ['cerdo', 'tocino', 'jamon', 'chorizo', 'chicharron', 'morcilla', 'salchicha', 'bondiola']
PROHIBIDOS = {
    'vegetariano': _CARNES,
    'vegano':      _CARNES + _LACTEOS + ['huevo', 'miel'],
    'sin_lacteos': _LACTEOS,
    'sin_gluten':  _GLUTEN,
    'sin_cerdo':   _CERDO,
    'halal':       _CERDO + ['vino', 'cerveza', 'ron', 'aguardiente'],
}
# "Leche de almendras" o "mantequilla de maní" no son lácteos
EXCEPCIONES = ['de almendra', 'de coco', 'de soya', 'de soja', 'de avena', 'de arroz', 'vegetal',
               'de mani', 'sin gluten', 'de maiz']


def _normalizar(texto):
    sin_tildes = unicodedata.normalize('NFKD', str(texto).lower())
    return ' ' + ''.join(c for c in sin_tildes if not unicodedata.combining(c)) + ' '


def _num(v):
    try:
        return max(float(v), 0.0)
    except (TypeError, ValueError):
        return 0.0


# ── Contexto ───────────────────────────────────────────────────────────────

def momentos_restantes(fecha, ahora):
    """Qué comidas faltan: hoy depende de la hora; otro día, todas."""
    if fecha != ahora.date():
        return list(REPARTO) if fecha > ahora.date() else []
    h = ahora.hour
    if h < 10:
        return ['desayuno', 'almuerzo', 'merienda', 'cena']
    if h < 15:
        return ['almuerzo', 'merienda', 'cena']
    if h < 18:
        return ['merienda', 'cena']
    if h < 22:
        return ['cena']
    return []


def restante_del_dia(user, fecha):
    """Metas menos lo ya registrado ese día."""
    hecho = Comida.objects.filter(usuario=user, fecha=fecha).aggregate(
        cal=Sum('calorias'), prot=Sum('proteina'), carb=Sum('carbos'), gras=Sum('grasas'),
    )
    return {
        'calorias': max(round((user.meta_calorias or 0) - (hecho['cal'] or 0)), 0),
        'proteina': max(round((user.meta_proteina or 0) - (hecho['prot'] or 0)), 0),
        'carbos':   max(round((user.meta_carbos or 0) - (hecho['carb'] or 0)), 0),
        'grasas':   max(round((user.meta_grasas or 0) - (hecho['gras'] or 0)), 0),
    }


def objetivos_por_momento(restante, momentos, metas=None):
    """Reparte lo que falta entre las comidas que quedan.

    Cada comida tiene un tope realista (su parte normal del día + 15%): si a
    las 8 de la noche falta casi todo, la cena no puede ser de 2.000 kcal.
    """
    total = sum(REPARTO[m] for m in momentos) or 1
    objetivos = {}
    for m in momentos:
        o = {k: round(v * REPARTO[m] / total) for k, v in restante.items()}
        if metas and metas.get('calorias'):
            tope = metas['calorias'] * (REPARTO[m] + 0.15)
            if o['calorias'] > tope:
                factor = tope / o['calorias']
                o = {k: round(v * factor) for k, v in o.items()}
        objetivos[m] = o
    return objetivos


def _perfil(user):
    alacena = list(AlimentoAlacena.objects.filter(usuario=user).values_list('nombre', flat=True)[:25])
    recientes = list(
        Comida.objects.filter(usuario=user, fecha__gte=timezone.localdate() - timedelta(days=3))
        .values_list('nombre', flat=True)[:15]
    )
    return {
        'gustos':        user.alimentos_gustados or [],
        'no_gustan':     user.alimentos_no_gustados or [],
        'restricciones': user.restricciones_dieta or [],
        'objetivo':      {'perder': 'perder grasa', 'ganar': 'ganar músculo'}.get(user.objetivo, 'mantener peso'),
        'alacena':       alacena,
        'recientes':     recientes,
    }


# ── Verificación ───────────────────────────────────────────────────────────

def violaciones(comida, perfil):
    """Ingredientes que chocan con restricciones o con lo que no le gusta."""
    textos = [comida.get('nombre', '')] + [
        i.get('nombre', '') for i in comida.get('ingredientes', []) if isinstance(i, dict)
    ]
    prohibidas = [(p, r) for r in perfil['restricciones'] for p in PROHIBIDOS.get(r, [])]
    prohibidas += [(_normalizar(x).strip(), 'no te gusta') for x in perfil['no_gustan'] if str(x).strip()]
    encontradas = []
    for texto in textos:
        t = _normalizar(texto)
        if any(e in t for e in EXCEPCIONES):
            continue
        for palabra, motivo in prohibidas:
            # Palabra completa (y su plural): "pan" no debe atrapar "panela"
            if re.search(rf'\b{re.escape(palabra.strip())}(es|s)?\b', t):
                encontradas.append(f'{texto.strip()} ({motivo})')
    return encontradas


def limpiar_comida(c, momento):
    """Normaliza lo que devuelve la IA y hace cuadrar calorías con macros."""
    crudos = [i for i in (c.get('ingredientes') or []) if isinstance(i, dict) and i.get('nombre')][:12]
    ingredientes = [{'nombre': str(i['nombre'])[:80], 'cantidad': str(i.get('cantidad', ''))[:40]} for i in crudos]
    pasos = [str(p)[:200] for p in (c.get('preparacion') or []) if str(p).strip()][:6]
    # Los totales se suman aquí, ingrediente por ingrediente: pedirle a la IA el
    # total hace que copie el objetivo en vez de calcularlo.
    if crudos and all('proteina' in i for i in crudos):
        prot = round(sum(_num(i.get('proteina')) for i in crudos), 1)
        carb = round(sum(_num(i.get('carbos')) for i in crudos), 1)
        gras = round(sum(_num(i.get('grasas')) for i in crudos), 1)
        cal  = round(sum(_num(i.get('calorias')) for i in crudos))
    else:
        prot, carb, gras = round(_num(c.get('proteina')), 1), round(_num(c.get('carbos')), 1), round(_num(c.get('grasas')), 1)
        cal = round(_num(c.get('calorias')))
    por_macros = round(4 * prot + 4 * carb + 9 * gras)
    if por_macros and abs(cal - por_macros) > 0.2 * por_macros:
        cal = por_macros
    return {
        'momento':      momento,
        'nombre':       str(c.get('nombre') or NOMBRE_MOMENTO[momento])[:120],
        'porcion':      str(c.get('porcion') or '')[:160],
        'ingredientes': ingredientes,
        'preparacion':  pasos,
        'minutos':      int(_num(c.get('minutos'))) or None,
        'calorias':     cal,
        'proteina':     prot,
        'carbos':       carb,
        'grasas':       gras,
        'registrada':   False,
    }


# ── IA ─────────────────────────────────────────────────────────────────────

def _prompt(perfil, objetivos, evitar=None, no_repetir=None):
    lineas = '\n'.join(
        f'- {NOMBRE_MOMENTO[m]}: ~{o["calorias"]} kcal, {o["proteina"]} g proteína, {o["carbos"]} g carbos, {o["grasas"]} g grasas'
        for m, o in objetivos.items()
    )
    extra = ''
    if evitar:
        extra += f'\nIMPORTANTE: la propuesta anterior tenía ingredientes prohibidos ({", ".join(evitar)}). No los uses.'
    if no_repetir:
        extra += f'\nNo repitas estas opciones: {", ".join(no_repetir)}.'
    return f"""Eres un nutricionista colombiano práctico. Propón comidas reales para hoy.

Persona:
- Objetivo: {perfil['objetivo']}
- Le gusta: {', '.join(perfil['gustos']) or 'de todo'}
- NO le gusta (nunca lo uses): {', '.join(perfil['no_gustan']) or 'nada en particular'}
- Restricciones (obligatorias, sin excepción): {', '.join(perfil['restricciones']) or 'ninguna'}
- Tiene en su alacena: {', '.join(perfil['alacena']) or 'no registrado'}
- Comió en los últimos días (varía): {', '.join(perfil['recientes']) or 'sin registros'}

Comidas a proponer y su objetivo nutricional:
{lineas}
{extra}
Reglas:
- Comida casera y fácil de conseguir en Colombia; prefiere lo que le gusta y lo de su alacena.
- Cantidades concretas en gramos o unidades para cada ingrediente.
- Para cada ingrediente calcula sus macros según esa cantidad con valores estándar (USDA o tabla del ICBF). No ajustes los números para que den el objetivo: ajusta las cantidades.
- Cada comida debe acercarse a su objetivo (±10%), sobre todo en proteína.
- Máximo 5 pasos de preparación, cortos.

Responde solo con JSON:
{{"comidas": [{{"momento": "almuerzo", "nombre": "...", "porcion": "cómo se sirve", "ingredientes": [{{"nombre": "...", "cantidad": "150 g", "calorias": 0, "proteina": 0, "carbos": 0, "grasas": 0}}], "preparacion": ["..."], "minutos": 15}}],
 "consejo": "una frase de Bruce (directo, colombiano, sin emojis) con algo concreto de este plan, por ejemplo qué comida carga la proteína o qué preparar desde antes. Sin cifras exactas y nada de frases motivacionales genéricas."}}"""


def _pedir_a_la_ia(prompt):
    from .views import _extraer_json, _groq_chat  # evita importación circular
    payload = {
        'model':            settings.GROQ_MODEL_TEXTO,
        'messages':         [{'role': 'user', 'content': prompt}],
        'max_tokens':       4000,
        'temperature':      0.6,
        'reasoning_effort': 'low',
        'response_format':  {'type': 'json_object'},
    }
    return _extraer_json(_groq_chat(payload, timeout=60))


def _lejos(comida, objetivo):
    """Queda corta si le falta más del 15% de calorías o del 20% de proteína."""
    return (comida['calorias'] < objetivo['calorias'] * 0.85
            or comida['proteina'] < objetivo['proteina'] * 0.8)


def _distancia(comida, objetivo):
    return (abs(comida['calorias'] - objetivo['calorias']) / max(objetivo['calorias'], 1)
            + abs(comida['proteina'] - objetivo['proteina']) / max(objetivo['proteina'], 1))


def _prompt_ajuste(perfil, comidas, objetivos):
    faltas = '\n'.join(
        f'- {NOMBRE_MOMENTO[m]} "{c["nombre"]}": tiene {c["calorias"]} kcal y {c["proteina"]} g proteína; '
        f'objetivo {objetivos[m]["calorias"]} kcal y {objetivos[m]["proteina"]} g proteína'
        for m, c in comidas.items()
    )
    actuales = json.dumps({'comidas': list(comidas.values())}, ensure_ascii=False)
    return f"""Estas comidas quedaron cortas frente a su objetivo:
{faltas}

Ajústalas: sube cantidades o agrega una fuente de proteína que encaje (respetando restricciones: {', '.join(perfil['restricciones']) or 'ninguna'}; nunca uses: {', '.join(perfil['no_gustan']) or 'nada'}). Mantén la idea de cada plato. Recalcula los macros de cada ingrediente con su nueva cantidad (USDA o ICBF).

Comidas actuales:
{actuales}

Responde solo con JSON con la misma forma: {{"comidas": [...]}}"""


def generar_comidas(perfil, objetivos, no_repetir=None):
    """Pide las comidas a la IA y descarta lo que viole restricciones.
    Devuelve (comidas_por_momento, consejo)."""
    evitar, resultado, consejo = None, {}, ''
    for _ in range(2):  # un reintento si algo prohibido se coló
        datos = _pedir_a_la_ia(_prompt(perfil, {m: objetivos[m] for m in objetivos if m not in resultado},
                                       evitar, no_repetir))
        consejo = consejo or re.sub(r'^\s*bruce( dice)?\s*:\s*', '', str(datos.get('consejo') or ''), flags=re.I).strip()[:300]
        consejo = consejo[:1].upper() + consejo[1:]
        evitar = []
        for c in datos.get('comidas') or []:
            momento = c.get('momento') if isinstance(c, dict) else None
            if momento not in objetivos or momento in resultado:
                continue
            problemas = violaciones(c, perfil)
            if problemas:
                evitar += problemas
            else:
                resultado[momento] = limpiar_comida(c, momento)
        if len(resultado) == len(objetivos) or not evitar:
            break

    # Segunda pasada solo si hace falta: la IA suele quedarse corta en proteína
    cortas = {m: c for m, c in resultado.items() if _lejos(c, objetivos[m])}
    if cortas:
        try:
            datos = _pedir_a_la_ia(_prompt_ajuste(perfil, cortas, objetivos))
        except (requests.RequestException, json.JSONDecodeError, ValueError):
            datos = {}
        for c in datos.get('comidas') or []:
            momento = c.get('momento') if isinstance(c, dict) else None
            if momento in cortas and not violaciones(c, perfil):
                ajustada = limpiar_comida(c, momento)
                if _distancia(ajustada, objetivos[momento]) < _distancia(cortas[momento], objetivos[momento]):
                    resultado[momento] = ajustada
    return resultado, consejo


# ── Vistas ─────────────────────────────────────────────────────────────────

def _fecha(request):
    fecha = estadisticas.parsear_fecha(
        request.query_params.get('fecha') if request.method == 'GET' else request.data.get('fecha'),
        timezone.localdate(),
    )
    if fecha is None or not (timezone.localdate() <= fecha <= timezone.localdate() + timedelta(days=1)):
        return None
    return fecha


def _respuesta(user, fecha, plan):
    momentos = momentos_restantes(fecha, timezone.localtime())
    restante = restante_del_dia(user, fecha)
    cubre = sum(c['calorias'] for c in plan.comidas if not c.get('registrada')) if plan else 0
    return {
        # Hoy ya no alcanza: mejor decirlo que meter toda la meta en una comida
        'no_alcanza': bool(plan) and fecha == timezone.localdate() and cubre < restante['calorias'] * 0.8,
        'fecha':    fecha.isoformat(),
        'plan':     {'comidas': plan.comidas, 'consejo': plan.consejo, 'actualizado': plan.actualizado.isoformat()} if plan else None,
        'restante': restante,
        'momentos': momentos,
    }


def _error_ia(e):
    from .views import _respuesta_error_groq
    if isinstance(e, requests.RequestException):
        return _respuesta_error_groq(e, 'Bruce está armando muchos planes. Intenta de nuevo en un minuto.')
    return Response({'error': 'Bruce no pudo armar el plan. Intenta de nuevo.'}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def plan(request):
    fecha = _fecha(request)
    if fecha is None:
        return Response({'error': 'Solo se puede planear hoy o mañana'}, status=status.HTTP_400_BAD_REQUEST)
    existente = PlanDia.objects.filter(usuario=request.user, fecha=fecha).first()
    if request.method == 'GET':
        return Response(_respuesta(request.user, fecha, existente))

    if existente and existente.generaciones >= MAX_GENERACIONES_DIA:
        return Response({'error': 'Ya pediste muchos planes para este día. Mañana hay más.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    momentos = momentos_restantes(fecha, timezone.localtime())
    restante = restante_del_dia(request.user, fecha) if fecha == timezone.localdate() else {
        'calorias': request.user.meta_calorias, 'proteina': request.user.meta_proteina,
        'carbos': request.user.meta_carbos, 'grasas': request.user.meta_grasas,
    }
    if not momentos or restante['calorias'] < 150:
        return Response({'error': 'Por hoy ya cumpliste tus comidas. Puedes planear mañana.'}, status=status.HTTP_400_BAD_REQUEST)

    metas = {'calorias': request.user.meta_calorias}
    objetivos = objetivos_por_momento(restante, momentos, metas)
    try:
        comidas, consejo = generar_comidas(_perfil(request.user), objetivos)
    except (requests.RequestException, json.JSONDecodeError, ValueError) as e:
        return _error_ia(e)
    if not comidas:
        return Response({'error': 'Bruce no encontró opciones que respeten tus restricciones. Intenta de nuevo.'}, status=status.HTTP_502_BAD_GATEWAY)

    plan_dia, _ = PlanDia.objects.get_or_create(usuario=request.user, fecha=fecha)
    plan_dia.comidas = [comidas[m] for m in momentos if m in comidas]
    plan_dia.consejo = consejo
    plan_dia.generaciones += 1
    plan_dia.save()
    return Response(_respuesta(request.user, fecha, plan_dia))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cambiar(request):
    """Otra opción para una sola comida, con el mismo objetivo nutricional."""
    fecha = _fecha(request)
    plan_dia = PlanDia.objects.filter(usuario=request.user, fecha=fecha).first() if fecha else None
    try:
        i = int(request.data.get('indice'))
        actual = plan_dia.comidas[i]
    except (TypeError, ValueError, IndexError, AttributeError):
        return Response({'error': 'Esa comida no está en el plan'}, status=status.HTTP_400_BAD_REQUEST)
    if actual.get('registrada'):
        return Response({'error': 'Esa comida ya la registraste'}, status=status.HTTP_400_BAD_REQUEST)
    if plan_dia.generaciones >= MAX_GENERACIONES_DIA:
        return Response({'error': 'Ya pediste muchos cambios para este día. Mañana hay más.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    objetivo = {actual['momento']: {k: round(actual[k]) for k in ('calorias', 'proteina', 'carbos', 'grasas')}}
    try:
        nuevas, _ = generar_comidas(_perfil(request.user), objetivo, no_repetir=[actual['nombre']])
    except (requests.RequestException, json.JSONDecodeError, ValueError) as e:
        return _error_ia(e)
    if actual['momento'] not in nuevas:
        return Response({'error': 'Bruce no encontró otra opción que respete tus restricciones.'}, status=status.HTTP_502_BAD_GATEWAY)

    plan_dia.comidas[i] = nuevas[actual['momento']]
    plan_dia.generaciones += 1
    plan_dia.save()
    return Response(_respuesta(request.user, fecha, plan_dia))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def registrar(request):
    """Agrega una comida del plan a lo que se comió ese día."""
    fecha = _fecha(request)
    plan_dia = PlanDia.objects.filter(usuario=request.user, fecha=fecha).first() if fecha else None
    try:
        i = int(request.data.get('indice'))
        c = plan_dia.comidas[i]
    except (TypeError, ValueError, IndexError, AttributeError):
        return Response({'error': 'Esa comida no está en el plan'}, status=status.HTTP_400_BAD_REQUEST)
    if c.get('registrada'):
        return Response({'error': 'Esa comida ya está registrada'}, status=status.HTTP_400_BAD_REQUEST)

    comida = Comida.objects.create(
        usuario=request.user, fecha=fecha, nombre=c['nombre'][:200],
        descripcion=f"{NOMBRE_MOMENTO[c['momento']]} del plan de Bruce · {c.get('porcion', '')}"[:500],
        calorias=c['calorias'], proteina=c['proteina'], carbos=c['carbos'], grasas=c['grasas'],
    )
    c['registrada'] = True
    c['comida_id'] = comida.id
    plan_dia.comidas[i] = c
    plan_dia.save(update_fields=['comidas', 'actualizado'])
    return Response({**_respuesta(request.user, fecha, plan_dia), 'comida_id': comida.id}, status=status.HTTP_201_CREATED)
