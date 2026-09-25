"""Notificaciones push de Bruce.

Un proceso en el servidor (manage.py enviar_notificaciones, cada 10 minutos)
revisa qué le toca a cada persona según SUS ajustes y solo envía lo que sirve:
no recuerda el almuerzo si ya lo registró, ni el gym en día de descanso, ni
nada dentro del horario silencioso, y nunca más del máximo diario.

El título lo arma el servidor con el dato concreto ("Almuerzo · Guiso de
lentejas"); la IA solo escribe el cuerpo, con los números reales, y ve sus
últimos mensajes para no repetirse. Si la IA falla, hay un texto útil de respaldo.

POST   /push/subscribe/     { endpoint, p256dh, auth }
DELETE /push/unsubscribe/   { endpoint }  → solo este dispositivo
GET    /push/estado/?endpoint=…            → si este dispositivo recibe
GET    /notificaciones/ajustes/  PATCH  → ajustes de la persona
POST   /notificaciones/prueba/          → envía una de prueba ya mismo
POST   /push/cron/  (X-Cron-Key)        → misma revisión que el proceso, a mano
"""
import json
import logging
import re
from copy import deepcopy
from datetime import datetime, time, timedelta

from django.conf import settings
from django.db import IntegrityError
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from . import estadisticas
from .models import (
    Comida, NotificacionEnviada, PesoCorporal, PlanDia, PushSubscription, RegistroAgua, RutinaDia, SesionGym,
)

logger = logging.getLogger(__name__)

VENTANA = timedelta(minutes=25)   # tolera que el proceso llegue unos minutos tarde

AJUSTES_POR_DEFECTO = {
    'comidas': {'activo': True, 'horas': {'desayuno': '07:30', 'almuerzo': '12:30', 'merienda': '16:00', 'cena': '19:30'}},
    'gym':     {'activo': True, 'hora': '18:00'},
    'agua':    {'activo': True, 'horas': ['10:00', '13:00', '16:00', '19:00']},
    'racha':   {'activo': True, 'hora': '20:30'},
    'resumen': {'activo': True, 'dia': 6, 'hora': '19:00'},   # 6 = domingo
    'silencio': {'desde': '22:00', 'hasta': '07:00'},
    'maximo_dia': 6,
}
MOMENTOS = ['desayuno', 'almuerzo', 'merienda', 'cena']
NOMBRE_MOMENTO = {'desayuno': 'Desayuno', 'almuerzo': 'Almuerzo', 'merienda': 'Merienda', 'cena': 'Cena'}
# Parte de la meta de calorías que ya debería estar comida DESPUÉS de cada comida
ACUMULADO = {'desayuno': 0.20, 'almuerzo': 0.55, 'merienda': 0.65, 'cena': 0.90}
HORA_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')


# ── Ajustes ────────────────────────────────────────────────────────────────

def ajustes_de(user):
    """Los ajustes guardados encima de los valores por defecto."""
    base = deepcopy(AJUSTES_POR_DEFECTO)
    for clave, valor in (user.ajustes_notif or {}).items():
        if isinstance(base.get(clave), dict) and isinstance(valor, dict):
            base[clave].update(valor)
        elif clave in base:
            base[clave] = valor
    return base


def _validar_ajustes(datos):
    """Deja pasar solo claves y horas válidas. Devuelve (limpio, error)."""
    if not isinstance(datos, dict):
        return None, 'Formato inválido'
    limpio = {}

    def hora(v):
        if not isinstance(v, str) or not HORA_RE.match(v):
            raise ValueError(f'Hora inválida: {v}')
        return v

    try:
        for tipo in ('gym', 'racha'):
            if tipo in datos:
                d = datos[tipo]
                limpio[tipo] = {k: v for k, v in {
                    'activo': bool(d['activo']) if 'activo' in d else None,
                    'hora': hora(d['hora']) if 'hora' in d else None,
                }.items() if v is not None}
        if 'comidas' in datos:
            d = datos['comidas']
            limpio['comidas'] = {}
            if 'activo' in d:
                limpio['comidas']['activo'] = bool(d['activo'])
            if 'horas' in d:
                limpio['comidas']['horas'] = {m: hora(d['horas'][m]) for m in MOMENTOS if m in d['horas']}
        if 'agua' in datos:
            d = datos['agua']
            limpio['agua'] = {}
            if 'activo' in d:
                limpio['agua']['activo'] = bool(d['activo'])
            if 'horas' in d:
                if not isinstance(d['horas'], list) or len(d['horas']) > 8:
                    raise ValueError('Máximo 8 recordatorios de agua')
                limpio['agua']['horas'] = sorted({hora(h) for h in d['horas']})
        if 'resumen' in datos:
            d = datos['resumen']
            limpio['resumen'] = {}
            if 'activo' in d:
                limpio['resumen']['activo'] = bool(d['activo'])
            if 'hora' in d:
                limpio['resumen']['hora'] = hora(d['hora'])
            if 'dia' in d:
                if int(d['dia']) not in range(7):
                    raise ValueError('Día inválido')
                limpio['resumen']['dia'] = int(d['dia'])
        if 'silencio' in datos:
            d = datos['silencio']
            limpio['silencio'] = {k: hora(d[k]) for k in ('desde', 'hasta') if k in d}
        if 'maximo_dia' in datos:
            m = int(datos['maximo_dia'])
            if not 1 <= m <= 12:
                raise ValueError('El máximo diario va de 1 a 12')
            limpio['maximo_dia'] = m
    except (ValueError, TypeError, KeyError, AttributeError) as e:
        return None, str(e) or 'Ajustes inválidos'
    return limpio, None


# ── Envío ──────────────────────────────────────────────────────────────────

def _send_push(sub, carga):
    """Envía a un dispositivo. Borra la suscripción si el navegador ya no existe."""
    try:
        from pywebpush import webpush
        webpush(
            subscription_info={'endpoint': sub.endpoint, 'keys': {'p256dh': sub.p256dh, 'auth': sub.auth}},
            data=json.dumps(carga, ensure_ascii=False),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={'sub': f'mailto:{settings.VAPID_CLAIM_EMAIL}'},
            ttl=60 * 60 * 3,   # si el teléfono está apagado, después de 3 h ya no sirve
            headers={'Urgency': 'normal'},
        )
        return True
    except Exception as exc:
        resp = getattr(exc, 'response', None)
        codigo = resp.status_code if resp is not None else None
        logger.warning('push_fail sub=%s status=%s err=%s', sub.id, codigo, str(exc)[:200])
        if codigo in (404, 410):
            sub.delete()
        return False


def enviar_a_usuario(user, tipo, titulo, cuerpo, destino='inicio', clave=None):
    """Envía a todos sus dispositivos y lo registra. Con clave, nunca repite."""
    if clave:
        try:
            registro = NotificacionEnviada.objects.create(usuario=user, clave=clave, tipo=tipo, titulo=titulo[:120], cuerpo=cuerpo[:300])
        except IntegrityError:
            return 0   # otro proceso ya la envió
    carga = {'title': titulo, 'body': cuerpo, 'tag': f'nf-{tipo}', 'destino': destino}
    enviados = sum(1 for sub in PushSubscription.objects.filter(usuario=user) if _send_push(sub, carga))
    if clave and not enviados:
        registro.delete()   # no llegó a ningún dispositivo: que se pueda reintentar
    return enviados


# ── Contexto y redacción ───────────────────────────────────────────────────

def _hora(texto):
    h, m = map(int, texto.split(':'))
    return time(h, m)


def _en_silencio(ajustes, ahora):
    desde, hasta = _hora(ajustes['silencio']['desde']), _hora(ajustes['silencio']['hasta'])
    t = ahora.time()
    return (desde <= t or t < hasta) if desde > hasta else (desde <= t < hasta)


def _toca(hora_texto, ahora):
    """True si la hora programada cayó en los últimos minutos (ventana del proceso)."""
    programada = timezone.make_aware(datetime.combine(ahora.date(), _hora(hora_texto)), ahora.tzinfo)
    return programada <= ahora < programada + VENTANA


def _datos_del_dia(user, hoy):
    hecho = Comida.objects.filter(usuario=user, fecha=hoy).aggregate(cal=Sum('calorias'), prot=Sum('proteina'))
    return {
        'nombre':    (user.first_name or user.email.split('@')[0]).split(' ')[0],
        'cal':       round(hecho['cal'] or 0),
        'prot':      round(hecho['prot'] or 0),
        'meta_cal':  user.meta_calorias or 0,
        'meta_prot': user.meta_proteina or 0,
        'agua':      RegistroAgua.objects.filter(usuario=user, fecha=hoy).aggregate(t=Sum('cantidad_ml'))['t'] or 0,
        'objetivo':  {'perder': 'perder grasa', 'ganar': 'ganar músculo'}.get(user.objetivo, 'mantener peso'),
    }


_ESTILO = """Eres Bruce, el coach de NutriFit: un perro salchicha con humor seco, directo y con cariño de parcero colombiano.
Le escribes a {nombre} una notificación push, como un amigo que le manda un mensaje por WhatsApp. El título ya existe: "{titulo}". Tú escribes solo el cuerpo.

Cómo escribir:
- Una sola idea, máximo {largo} caracteres. Español colombiano natural, con tildes.
- Algo concreto que pueda hacer ya, con UN dato (redondeado: "medio litro", "40 g", "700 kcal"; nunca cifras raras como 1071 ml).
- Un toque de personalidad de Bruce (ironía suave, complicidad), sin exagerar.
- Usa SOLO los números de la situación. No calcules calorías ni proteína de alimentos por tu cuenta.
- Nada de frases de bot ni de motivación genérica ("¡Vamos!", "Tú puedes", "Recuerda que…", "No olvides…").
- No repitas el título ni arranques igual que tus mensajes anteriores.
- Sin emojis, sin comillas, sin firmar. Respeta alergias ({alergias}) y restricciones ({restricciones}).

Así sí:
- "Las lentejas ya te están esperando. Con eso llegas a 100 g de proteína antes de las 2."
- "Medio litro de agua y quedas al día. Yo que soy perro tomo más que tú."
- "Espalda y brazos hoy. Arranca con el jalón al pecho, el resto sale solo."
Así no:
- "¡Recuerda tomar agua! Mantente hidratado para alcanzar tus metas."
- "Bebe 500 ml ahora y repite en 30 min hasta alcanzar 1071 ml."

Situación: {situacion}
Tus últimos mensajes (no los repitas): {anteriores}"""

LARGO = {'resumen': 180}


def redactar(user, tipo, titulo, situacion, respaldo):
    """Cuerpo escrito por la IA con los datos reales; si falla, el respaldo."""
    from .views import _groq_chat  # evita importación circular
    anteriores = list(NotificacionEnviada.objects.filter(usuario=user).values_list('cuerpo', flat=True)[:5])
    prompt = _ESTILO.format(
        nombre=(user.first_name or 'la persona').split(' ')[0], titulo=titulo, situacion=situacion,
        largo=LARGO.get(tipo, 120),
        alergias=', '.join(user.alergias or []) or 'ninguna',
        restricciones=', '.join(user.restricciones_dieta or []) or 'ninguna',
        anteriores=' | '.join(anteriores) or 'ninguno',
    )
    try:
        texto = _groq_chat({
            'model': settings.GROQ_MODEL_TEXTO,
            'messages': [{'role': 'user', 'content': prompt}],
            'max_tokens': 400,
            'temperature': 0.8,
            'reasoning_effort': 'low',
        }, timeout=15)
        texto = re.sub(r'<think>.*?</think>', '', texto, flags=re.S).strip().strip('"“”\'')
        if 10 <= len(texto) <= LARGO.get(tipo, 120) + 40:
            return texto
        logger.warning('notif_ia_largo user=%s tipo=%s len=%s', user.id, tipo, len(texto))
    except Exception as e:
        logger.warning('notif_ia_fail user=%s tipo=%s err=%s', user.id, tipo, str(e)[:120])
    return respaldo


# ── Qué le toca a cada persona ─────────────────────────────────────────────

def pendientes(user, ahora):
    """Lista de notificaciones a enviar ahora: (tipo, clave, titulo, situacion, respaldo, destino)."""
    ajustes = ajustes_de(user)
    hoy = ahora.date()
    if _en_silencio(ajustes, ahora):
        return []
    enviadas_hoy = NotificacionEnviada.objects.filter(usuario=user, enviada__date=hoy).count()
    cupo = ajustes['maximo_dia'] - enviadas_hoy
    if cupo <= 0:
        return []

    d = _datos_del_dia(user, hoy)
    lista = []

    # Comidas: con el plato del plan si existe; no suena si ya va comido lo de esa hora
    if ajustes['comidas']['activo']:
        plan = PlanDia.objects.filter(usuario=user, fecha=hoy).first()
        for momento in MOMENTOS:
            hora = ajustes['comidas']['horas'].get(momento)
            if not hora or not _toca(hora, ahora):
                continue
            del_plan = next((c for c in (plan.comidas if plan else []) if c['momento'] == momento), None)
            if del_plan and del_plan.get('registrada'):
                continue
            if d['meta_cal'] and d['cal'] >= d['meta_cal'] * ACUMULADO[momento]:
                continue
            if del_plan:
                titulo = f"{NOMBRE_MOMENTO[momento]} · {del_plan['nombre']}"[:110]
                situacion = (f"Es hora del {momento}. Su plan dice: {del_plan['nombre']} ({del_plan['calorias']} kcal, "
                             f"{round(del_plan['proteina'])} g proteína). Lleva hoy {d['cal']} de {d['meta_cal']} kcal "
                             f"y {d['prot']} de {d['meta_prot']} g de proteína.")
                respaldo = f"Te toca: {round(del_plan['calorias'])} kcal y {round(del_plan['proteina'])} g de proteína. Toca para ver la receta."
            else:
                titulo = f"Hora del {momento}"
                situacion = (f"Es hora del {momento} y no tiene plan del día. Lleva {d['cal']} de {d['meta_cal']} kcal y "
                             f"{d['prot']} de {d['meta_prot']} g de proteína. Le gusta: {', '.join(user.alimentos_gustados or []) or 'variado'}. "
                             f"Sugiere algo concreto o que le pida el plan a Bruce en Comidas.")
                respaldo = f"Llevas {d['prot']} de {d['meta_prot']} g de proteína. Si no sabes qué comer, pídele el plan a Bruce."
            lista.append(('comida', f'comida:{momento}:{hoy}', titulo, situacion, respaldo, 'plan'))

    # Gym: el nombre de la rutina de hoy; nada en día de descanso ni si ya fue
    if ajustes['gym']['activo'] and _toca(ajustes['gym']['hora'], ahora):
        rutinas = list(RutinaDia.objects.filter(usuario=user, dia_semana=hoy.weekday()).select_related('rutina'))
        rutinas = [r.rutina for r in rutinas if r.rutina.ejercicios]
        hecha = SesionGym.objects.filter(usuario=user, fecha=hoy, completada=True).exists()
        if rutinas and not hecha:
            nombres = ' y '.join(r.nombre for r in rutinas)
            ejercicios = sum(len(r.ejercicios) for r in rutinas)
            racha = estadisticas.racha_gym(user, hoy)
            titulo = f"Hoy toca {nombres}"[:110]
            situacion = (f"Hoy tiene {nombres} ({ejercicios} ejercicios) y aún no la registra. Racha de gym actual: {racha} días. "
                         f"Primeros ejercicios: {', '.join(e['nombre'] for e in rutinas[0].ejercicios[:3])}.")
            respaldo = f"{ejercicios} ejercicios esperando" + (f" y una racha de {racha} días que cuidar." if racha >= 2 else ".")
            lista.append(('gym', f'gym:{hoy}', titulo, situacion, respaldo, 'gym'))

    # Agua: solo si va atrasado frente a lo que debería llevar a esta hora
    if ajustes['agua']['activo']:
        for hora in ajustes['agua']['horas']:
            if not _toca(hora, ahora):
                continue
            h = _hora(hora)
            meta_agua = user.meta_agua_ml()
            esperado = meta_agua * min(max((h.hour + h.minute / 60 - 7) / 14, 0), 1)   # de 7 a. m. a 9 p. m.
            falta = round(esperado - d['agua'])
            if falta < 250:
                continue
            titulo = 'Agua'
            situacion = (f"Lleva {d['agua']} ml de agua; a esta hora debería llevar unos {round(esperado)} ml "
                         f"(meta {meta_agua} ml). Le faltan ~{falta} ml para ir al día.")
            respaldo = f"Vas en {d['agua'] / 1000:.1f} L. Un vaso grande ahora y quedas al día."
            lista.append(('agua', f'agua:{hora}:{hoy}', titulo, situacion, respaldo, 'agua'))

    # Racha en riesgo: solo si de verdad hay algo por perder hoy
    if ajustes['racha']['activo'] and _toca(ajustes['racha']['hora'], ahora):
        racha_comida = estadisticas.racha_comida(user, hoy)
        comio_hoy = d['cal'] > 0
        descanso = estadisticas.dias_descanso(user)
        racha_gym = estadisticas.racha_gym(user, hoy, descanso)
        gym_pendiente = hoy.weekday() not in descanso and not SesionGym.objects.filter(usuario=user, fecha=hoy, completada=True).exists()
        if (racha_comida >= 2 and not comio_hoy) or (racha_gym >= 2 and gym_pendiente):
            en_riesgo = racha_gym if (racha_gym >= 2 and gym_pendiente) else racha_comida
            cual = 'de gym' if (racha_gym >= 2 and gym_pendiente) else 'registrando comidas'
            titulo = f"Tu racha {cual} de {en_riesgo} días"
            situacion = (f"Son las {ahora:%H:%M}. Tiene una racha {cual} de {en_riesgo} días y hoy aún no cumple. "
                         f"Calorías hoy: {d['cal']} de {d['meta_cal']}.")
            respaldo = f"{en_riesgo} días seguidos se cortan hoy si no registras. Te toma un minuto."
            lista.append(('racha', f'racha:{hoy}', titulo, situacion, respaldo, 'gym' if 'gym' in cual else 'comida'))

    # Resumen semanal
    r = ajustes['resumen']
    if r['activo'] and hoy.weekday() == r['dia'] and _toca(r['hora'], ahora):
        desde = hoy - timedelta(days=6)
        totales = estadisticas.totales_por_dia(user, desde, hoy)
        dias_gym = len(estadisticas.dias_con_gym(user, desde, hoy))
        planeados = max(7 - len(estadisticas.dias_descanso(user)), 1)
        prot_ok = sum(1 for t in totales.values() if d['meta_prot'] and t['proteina'] >= d['meta_prot'] * 0.9)
        pesos = list(PesoCorporal.objects.filter(usuario=user, fecha__gte=desde).order_by('fecha').values_list('peso_kg', flat=True))
        cambio_peso = f"{pesos[-1] - pesos[0]:+.1f} kg" if len(pesos) >= 2 else 'sin pesajes suficientes'
        titulo = 'Tu semana con Bruce'
        situacion = (f"Resumen de la semana: gym {dias_gym} de {planeados} días planeados; registró comida {len(totales)} de 7 días; "
                     f"cumplió la proteína {prot_ok} de 7 días; peso {cambio_peso}. Resalta lo mejor y lo que más debe mejorar.")
        respaldo = f"Gym {dias_gym} de {planeados} días y proteína cumplida {prot_ok} de 7. Toca para ver en qué mejorar la próxima."
        lista.append(('resumen', f'resumen:{hoy}', titulo, situacion, respaldo, 'progreso'))

    return lista[:cupo]


def revisar_todos(ahora=None):
    """Lo que corre el proceso cada 10 minutos. Devuelve cuántas envió."""
    from .models import Usuario
    ahora = ahora or timezone.localtime()
    enviadas = 0
    usuarios = Usuario.objects.filter(push_subscriptions__isnull=False).distinct()
    for user in usuarios:
        for tipo, clave, titulo, situacion, respaldo, destino in pendientes(user, ahora):
            if NotificacionEnviada.objects.filter(usuario=user, clave=clave).exists():
                continue
            cuerpo = redactar(user, tipo, titulo, situacion, respaldo)
            enviadas += 1 if enviar_a_usuario(user, tipo, titulo, cuerpo, destino, clave) else 0
    return enviadas


# ── Vistas ─────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def suscribir(request):
    endpoint = str(request.data.get('endpoint', '')).strip()
    p256dh   = str(request.data.get('p256dh', '')).strip()
    auth     = str(request.data.get('auth', '')).strip()
    if not all([endpoint, p256dh, auth]) or not endpoint.startswith('https://'):
        return Response({'error': 'Suscripción inválida'}, status=status.HTTP_400_BAD_REQUEST)
    PushSubscription.objects.update_or_create(
        endpoint=endpoint, defaults={'usuario': request.user, 'p256dh': p256dh, 'auth': auth},
    )
    return Response({'ok': True})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def desuscribir(request):
    """Solo este dispositivo; sin endpoint (apps viejas), todos."""
    endpoint = request.data.get('endpoint') if isinstance(request.data, dict) else None
    qs = PushSubscription.objects.filter(usuario=request.user)
    if endpoint:
        qs = qs.filter(endpoint=endpoint)
    qs.delete()
    return Response({'ok': True})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def estado(request):
    endpoint = request.query_params.get('endpoint')
    qs = PushSubscription.objects.filter(usuario=request.user)
    return Response({'suscrito': (qs.filter(endpoint=endpoint) if endpoint else qs).exists()})


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def ajustes(request):
    if request.method == 'PATCH':
        limpio, error = _validar_ajustes(request.data)
        if error:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
        actuales = dict(request.user.ajustes_notif or {})
        for clave, valor in limpio.items():
            if isinstance(valor, dict):
                actuales[clave] = {**actuales.get(clave, {}), **valor}
            else:
                actuales[clave] = valor
        request.user.ajustes_notif = actuales
        request.user.save(update_fields=['ajustes_notif'])
    return Response(ajustes_de(request.user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def prueba(request):
    """Una notificación ya mismo, para comprobar que llegan a este teléfono."""
    user = request.user
    d = _datos_del_dia(user, timezone.localdate())
    cuerpo = redactar(
        user, 'prueba', 'Bruce al habla',
        f"Es una notificación de prueba que pidió. Hoy lleva {d['cal']} de {d['meta_cal']} kcal. Salúdalo y confírmale que ya le llegan.",
        'Si ves esto, las notificaciones funcionan. Nos vemos a la hora de comer.',
    )
    enviados = enviar_a_usuario(user, 'prueba', 'Bruce al habla', cuerpo, 'inicio')
    if not enviados:
        return Response({'error': 'No hay dispositivos activos. Vuelve a activar las notificaciones.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'enviados': enviados, 'cuerpo': cuerpo})


@api_view(['POST'])
@permission_classes([AllowAny])
def cron(request):
    """Revisión manual (la automática la hace el proceso del servidor)."""
    secreto = getattr(settings, 'CRON_SECRET', '')
    if not secreto or request.headers.get('X-Cron-Key') != secreto:
        return Response({'error': 'forbidden'}, status=status.HTTP_403_FORBIDDEN)
    return Response({'enviadas': revisar_todos()})
