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
from .models import PlanDia

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
]


def _fecha(dia):
    hoy = timezone.localdate()
    return hoy + timedelta(days=1) if dia == 'manana' else hoy


def _resumen_comida(c):
    return {'momento': c['momento'], 'nombre': c['nombre'], 'calorias': c['calorias'],
            'proteina': c['proteina'], 'registrada': bool(c.get('registrada'))}


def ejecutar(user, nombre, args):
    """Corre una herramienta. Devuelve (resultado para la IA, acción para la app o None)."""
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


def resumen(acciones):
    """Lo que Bruce dice si la IA no alcanzó a responder después de actuar."""
    partes = []
    for a in acciones:
        dia = 'mañana' if a['dia'] == 'manana' else 'hoy'
        if a['tipo'] == 'comida_cambiada':
            partes.append(f"Te cambié {a['antes']} por {a['comida']['nombre']} ({round(a['comida']['calorias'])} kcal).")
        elif a['tipo'] == 'plan_armado':
            partes.append(f"Listo el plan de {dia}: {len(a['comidas'])} comidas, {round(a['calorias'])} kcal en total.")
    return ' '.join(partes) + ' Míralo abajo.'


def conversar(user, messages, llamar, acciones=None):
    """Conversación con herramientas: la IA puede pedir hasta 2 rondas de acciones.
    `llamar(payload)` devuelve el mensaje crudo de la IA. Devuelve (texto, acciones)."""
    acciones = [] if acciones is None else acciones  # se llena aunque luego falle la IA
    for _ in range(3):
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
    return 'Listo, ya hice los cambios en tu plan.', acciones
