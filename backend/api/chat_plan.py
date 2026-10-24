"""Herramientas del chat de Bruce sobre el plan del día.

La IA decide cuándo usarlas ("cámbiame la cena por algo con huevo"), pero las
ejecuta el mismo código del plan: alergias, restricciones y verificación por
ingrediente se cumplen igual que desde la pantalla. Cada acción vuelve como
una tarjeta en el mensaje de Bruce (con "Deshacer" cuando aplica).
"""
import json
import logging
from datetime import timedelta

import requests
from django.conf import settings
from django.utils import timezone

from . import plan as plan_mod
from django.db.models import Sum

from . import estadisticas
from .models import Comida, EjercicioLog, MemoriaBruce, PlanDia, RegistroAgua

logger = logging.getLogger(__name__)

MOMENTOS = ['desayuno', 'almuerzo', 'merienda', 'cena']

HERRAMIENTAS = [
    {'type': 'function', 'function': {
        'name': 'ver_plan',
        'description': 'Muestra el plan de comidas de Bruce para hoy o mañana (qué comida, calorías, proteína y si ya se registró).',
        'parameters': {'type': 'object', 'properties': {
            'dia': {'type': 'string', 'enum': ['hoy', 'manana']},
        }, 'required': ['dia']},
    }},
    {'type': 'function', 'function': {
        'name': 'cambiar_comida',
        'description': 'Cambia UNA comida del plan por otra con los mismos macros, siguiendo lo que la persona pide. Úsala cuando pida cambiar, reemplazar o variar una comida del plan.',
        'parameters': {'type': 'object', 'properties': {
            'dia': {'type': 'string', 'enum': ['hoy', 'manana']},
            'momento': {'type': 'string', 'enum': MOMENTOS},
            'pedido': {'type': 'string', 'description': 'Lo que quiere en la comida nueva, en sus palabras (ej. "algo con huevo", "más rápido de preparar"). Vacío si no pidió nada en especial.'},
        }, 'required': ['dia', 'momento']},
    }},
    {'type': 'function', 'function': {
        'name': 'armar_plan',
        'description': 'Arma (o rehace completo) el plan de comidas del día con lo que falta de sus metas. Úsala cuando pida que le armes el plan, qué comer hoy o mañana.',
        'parameters': {'type': 'object', 'properties': {
            'dia': {'type': 'string', 'enum': ['hoy', 'manana']},
            'pedido': {'type': 'string', 'description': 'Preferencia para todo el día si la dio (ej. "todo rápido", "sin cocinar"). Vacío si no.'},
        }, 'required': ['dia']},
    }},
    {'type': 'function', 'function': {
        'name': 'registrar_comida',
        'description': ('Anota en su diario de hoy algo que YA comió, cuando lo cuenta o pide anotarlo. Estima tú los macros de la '
                        'porción que describió. No registres lo que solo piensa comer.'),
        'parameters': {'type': 'object', 'properties': {
            'nombre': {'type': 'string', 'description': 'Lo que comió con la porción, ej. "2 arepas con queso".'},
            'calorias': {'type': 'integer'},
            'proteina': {'type': 'number', 'description': 'gramos'},
            'carbos': {'type': 'number', 'description': 'gramos'},
            'grasas': {'type': 'number', 'description': 'gramos'},
        }, 'required': ['nombre', 'calorias', 'proteina', 'carbos', 'grasas']},
    }},
    {'type': 'function', 'function': {
        'name': 'registrar_agua',
        'description': 'Anota agua que ya tomó hoy, cuando lo cuenta o pide anotarlo.',
        'parameters': {'type': 'object', 'properties': {
            'ml': {'type': 'integer', 'description': 'Mililitros (un vaso son unos 250).'},
        }, 'required': ['ml']},
    }},
    {'type': 'function', 'function': {
        'name': 'consultar_ejercicio',
        'description': ('Trae el historial de un ejercicio (fecha, series, reps y kg) de las últimas semanas. Úsala cuando pregunte '
                        'por su progreso en un ejercicio o necesites cargas más viejas que las de ENTRENOS RECIENTES.'),
        'parameters': {'type': 'object', 'properties': {
            'nombre': {'type': 'string', 'description': 'Nombre o parte del nombre, ej. "press banca".'},
            'semanas': {'type': 'integer', 'description': 'Cuántas semanas atrás (1 a 26). Por defecto 8.'},
        }, 'required': ['nombre']},
    }},
    {'type': 'function', 'function': {
        'name': 'consultar_comidas',
        'description': ('Trae lo que comió día por día (calorías, proteína y qué comió) entre dos fechas, hasta 31 días. Úsala para '
                        'preguntas de días que no están en DÍA POR DÍA o de más de una semana.'),
        'parameters': {'type': 'object', 'properties': {
            'desde': {'type': 'string', 'description': 'YYYY-MM-DD'},
            'hasta': {'type': 'string', 'description': 'YYYY-MM-DD'},
        }, 'required': ['desde', 'hasta']},
    }},
    {'type': 'function', 'function': {
        'name': 'recordar',
        'description': ('Guarda un dato duradero de la persona para recordarlo en conversaciones futuras: gustos o alimentos que evita, '
                        'horarios, lesiones, equipo que tiene, metas personales. No guardes lo de hoy ni lo que ya está en su perfil.'),
        'parameters': {'type': 'object', 'properties': {
            'texto': {'type': 'string', 'description': 'Una frase corta en tercera persona, ej. "Entrena a las 6 am", "No le gusta el salmón".'},
        }, 'required': ['texto']},
    }},
    {'type': 'function', 'function': {
        'name': 'olvidar',
        'description': 'Borra un recuerdo que ya no es cierto o que la persona pide olvidar.',
        'parameters': {'type': 'object', 'properties': {
            'id': {'type': 'integer', 'description': 'El número del recuerdo en "LO QUE RECUERDAS".'},
        }, 'required': ['id']},
    }},
]


def _fecha(dia):
    hoy = timezone.localdate()
    return hoy + timedelta(days=1) if dia == 'manana' else hoy


def _resumen_comida(c):
    return {'momento': c['momento'], 'nombre': c['nombre'], 'calorias': c['calorias'],
            'proteina': c['proteina'], 'registrada': bool(c.get('registrada'))}


def ejecutar(user, nombre, args):
    """Corre una herramienta. Devuelve (resultado para la IA, acción para la app o None)."""
    if nombre in HERRAMIENTAS_SIMPLES:
        return HERRAMIENTAS_SIMPLES[nombre](user, args)
    if nombre == 'recordar':
        return _recordar(user, args)
    if nombre == 'olvidar':
        return _olvidar(user, args)
    dia = 'manana' if args.get('dia') == 'manana' else 'hoy'
    fecha = _fecha(dia)
    pedido = str(args.get('pedido') or '').strip()[:200] or None
    plan_dia = PlanDia.objects.filter(usuario=user, fecha=fecha).first()
    try:
        if nombre == 'ver_plan':
            if not plan_dia or not plan_dia.comidas:
                return {'plan': None, 'nota': f'No hay plan para {dia}. Puedes ofrecer armarlo.'}, None
            return {'plan': [_resumen_comida(c) for c in plan_dia.comidas]}, None

        if nombre == 'cambiar_comida':
            momento = args.get('momento')
            if not plan_dia:
                return {'error': f'No hay plan para {dia}. Ofrece armarlo primero.'}, None
            i = next((n for n, c in enumerate(plan_dia.comidas) if c['momento'] == momento), None)
            if i is None:
                return {'error': f'El plan de {dia} no tiene {momento}.'}, None
            antes = plan_dia.comidas[i]
            nueva = plan_mod.cambiar_comida(user, plan_dia, i, pedido)
            return {'cambiada': _resumen_comida(nueva), 'antes': antes['nombre']}, {
                'tipo': 'comida_cambiada', 'dia': dia, 'fecha': fecha.isoformat(), 'indice': i,
                'comida': _resumen_comida(nueva), 'antes': antes['nombre'],
            }

        if nombre == 'armar_plan':
            plan_dia = plan_mod.armar_plan(user, fecha, plan_dia, pedido)
            comidas = [_resumen_comida(c) for c in plan_dia.comidas]
            return {'plan': comidas}, {
                'tipo': 'plan_armado', 'dia': dia, 'fecha': fecha.isoformat(), 'comidas': comidas,
                'calorias': sum(c['calorias'] for c in comidas),
            }
    except plan_mod.ErrorPlan as e:
        return {'error': e.mensaje}, None
    except (requests.RequestException, json.JSONDecodeError, ValueError) as e:
        logger.warning('chat_herramienta_fail %s: %s', nombre, str(e)[:150])
        return {'error': 'El generador de comidas falló. Pide que lo intente de nuevo en un minuto.'}, None
    return {'error': 'Herramienta desconocida'}, None


def _numero(valor, minimo, maximo):
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return None
    return n if minimo <= n <= maximo else None


def _registrar_comida(user, args):
    nombre = ' '.join(str(args.get('nombre') or '').split())[:200]
    kcal = _numero(args.get('calorias'), 1, 4000)
    macros = {k: _numero(args.get(k), 0, 400) for k in ('proteina', 'carbos', 'grasas')}
    if not nombre or kcal is None or None in macros.values():
        return {'error': 'Faltan datos o los macros no tienen sentido; pregúntale la porción.'}, None
    c = Comida.objects.create(usuario=user, nombre=nombre, calorias=round(kcal), fecha=timezone.localdate(),
                              **{k: round(v, 1) for k, v in macros.items()})
    totales = Comida.objects.filter(usuario=user, fecha=c.fecha).aggregate(cal=Sum('calorias'), prot=Sum('proteina'))
    return {'ok': True, 'lleva_hoy': {'calorias': totales['cal'], 'proteina': round(totales['prot'] or 0)}}, {
        'tipo': 'comida_registrada', 'id': c.id, 'nombre': c.nombre, 'calorias': c.calorias, 'proteina': c.proteina,
    }


def _registrar_agua(user, args):
    ml = _numero(args.get('ml'), 50, 3000)
    if ml is None:
        return {'error': 'Cantidad de agua inválida (entre 50 y 3000 ml).'}, None
    hoy = timezone.localdate()
    r = RegistroAgua.objects.create(usuario=user, fecha=hoy, cantidad_ml=round(ml))
    total = RegistroAgua.objects.filter(usuario=user, fecha=hoy).aggregate(t=Sum('cantidad_ml'))['t'] or 0
    meta = user.meta_agua_ml()
    return {'ok': True, 'lleva_hoy_ml': total, 'meta_ml': meta}, {
        'tipo': 'agua_registrada', 'id': r.id, 'ml': r.cantidad_ml, 'total': total, 'meta': meta,
    }


def _consultar_ejercicio(user, args):
    nombre = str(args.get('nombre') or '').strip()[:80]
    semanas = int(_numero(args.get('semanas') or 8, 1, 26) or 8)
    if not nombre:
        return {'error': 'Falta el nombre del ejercicio.'}, None
    desde = timezone.localdate() - timedelta(weeks=semanas)
    logs = (EjercicioLog.objects
            .filter(sesion__usuario=user, nombre__icontains=nombre, sesion__fecha__gte=desde)
            .select_related('sesion').order_by('sesion__fecha', 'id')[:30])
    registros = [{
        'fecha': log.sesion.fecha.isoformat(), 'ejercicio': log.nombre, 'series': log.series, 'reps': log.reps,
        'kg_max': log.peso_kg, 'series_detalle': log.series_detalle or None, 'nota': log.notas or None,
    } for log in logs]
    if not registros:
        return {'registros': [], 'nota': f'No hay registros de "{nombre}" en las últimas {semanas} semanas.'}, None
    return {'registros': registros}, None


def _consultar_comidas(user, args):
    from datetime import date
    try:
        desde, hasta = date.fromisoformat(str(args.get('desde'))), date.fromisoformat(str(args.get('hasta')))
    except ValueError:
        return {'error': 'Fechas inválidas: usa YYYY-MM-DD.'}, None
    hoy = timezone.localdate()
    hasta = min(hasta, hoy)
    if desde > hasta:
        desde, hasta = hasta, desde
    desde = max(desde, hasta - timedelta(days=30))
    totales = estadisticas.totales_por_dia(user, desde, hasta)
    platos = {}
    for fecha, nombre in Comida.objects.filter(usuario=user, fecha__range=[desde, hasta]).values_list('fecha', 'nombre'):
        platos.setdefault(fecha, []).append(nombre)
    dias, d = [], desde
    while d <= hasta:
        t = totales.get(d)
        dias.append({'fecha': d.isoformat(), 'calorias': t['calorias'], 'proteina': round(t['proteina']), 'comio': platos.get(d, [])[:8]}
                    if t else {'fecha': d.isoformat(), 'registro': 'sin comida registrada (no anotó, no es que comiera 0)'})
        d += timedelta(days=1)
    return {'dias': dias}, None


HERRAMIENTAS_SIMPLES = {
    'registrar_comida': _registrar_comida,
    'registrar_agua': _registrar_agua,
    'consultar_ejercicio': _consultar_ejercicio,
    'consultar_comidas': _consultar_comidas,
}


def _recordar(user, args):
    texto = ' '.join(str(args.get('texto') or '').split())[:200]
    if not texto:
        return {'error': 'El recuerdo está vacío.'}, None
    if MemoriaBruce.objects.filter(usuario=user, texto__iexact=texto).exists():
        return {'ok': True, 'nota': 'Ya lo recordabas.'}, None
    viejas = list(MemoriaBruce.objects.filter(usuario=user).values_list('id', flat=True))
    if len(viejas) >= MemoriaBruce.MAXIMO:
        MemoriaBruce.objects.filter(id__in=viejas[:len(viejas) - MemoriaBruce.MAXIMO + 1]).delete()
    m = MemoriaBruce.objects.create(usuario=user, texto=texto)
    return {'ok': True, 'id': m.id}, {'tipo': 'memoria_guardada', 'id': m.id, 'texto': texto}


def _olvidar(user, args):
    try:
        m = MemoriaBruce.objects.filter(usuario=user, pk=int(args.get('id'))).first()
    except (TypeError, ValueError):
        m = None
    if m is None:
        return {'error': 'No existe ese recuerdo.'}, None
    texto = m.texto
    m.delete()
    return {'ok': True}, {'tipo': 'memoria_olvidada', 'texto': texto}


def memorias(user, con_numero=False):
    """Los recuerdos como líneas para el prompt (con su número si la IA puede olvidarlos)."""
    return [f'• [{m.id}] {m.texto}' if con_numero else f'• {m.texto}'
            for m in MemoriaBruce.objects.filter(usuario=user)]


def resumen(acciones):
    """Lo que Bruce dice si la IA no alcanzó a responder después de actuar."""
    partes = []
    for a in acciones:
        dia = 'mañana' if a.get('dia') == 'manana' else 'hoy'
        if a['tipo'] == 'comida_registrada':
            partes.append(f"Anoté {a['nombre']}: {a['calorias']} kcal y {round(a['proteina'])} g de proteína.")
        elif a['tipo'] == 'agua_registrada':
            partes.append(f"Anoté {a['ml']} ml de agua; llevas {a['total']} de {a['meta']} ml.")
        elif a['tipo'] == 'memoria_guardada':
            partes.append('Anotado, lo tendré en cuenta.')
        elif a['tipo'] == 'memoria_olvidada':
            partes.append('Listo, ya lo olvidé.')
        elif a['tipo'] == 'comida_cambiada':
            partes.append(f"Te cambié {a['antes']} por {a['comida']['nombre']} ({round(a['comida']['calorias'])} kcal).")
        elif a['tipo'] == 'plan_armado':
            partes.append(f"Listo el plan de {dia}: {len(a['comidas'])} comidas, {round(a['calorias'])} kcal en total.")
    plan = any(a['tipo'] in ('comida_cambiada', 'plan_armado') for a in acciones)
    return ' '.join(partes) + (' Míralo abajo.' if plan else '')


def conversar(user, messages, llamar, acciones=None):
    """Conversación con herramientas: la IA puede pedir hasta 3 rondas de acciones.
    `llamar(payload)` devuelve el mensaje crudo de la IA. Devuelve (texto, acciones)."""
    acciones = [] if acciones is None else acciones  # se llena aunque luego falle la IA
    for _ in range(4):
        mensaje = llamar({
            'model': settings.GROQ_MODEL_TEXTO,
            'messages': messages,
            'tools': HERRAMIENTAS,
            'tool_choice': 'auto',
            'max_tokens': 1500,
            'temperature': 0.7,
            'reasoning_effort': 'low',
        })
        llamadas = mensaje.get('tool_calls') or []
        if not llamadas:
            return (mensaje.get('content') or '').strip(), acciones
        messages = messages + [{'role': 'assistant', 'content': mensaje.get('content') or '', 'tool_calls': llamadas}]
        for ll in llamadas:
            try:
                args = json.loads(ll['function'].get('arguments') or '{}')
            except (json.JSONDecodeError, TypeError):
                args = {}
            resultado, accion = ejecutar(user, ll['function'].get('name'), args)
            if accion:
                acciones.append(accion)
            messages.append({'role': 'tool', 'tool_call_id': ll['id'], 'content': json.dumps(resultado, ensure_ascii=False)})
    return resumen(acciones) if acciones else 'Listo.', acciones
