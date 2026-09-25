import base64
import io
import json
import logging
import re
import time
import requests
from datetime import timedelta

from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models, transaction
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from . import chat_plan, estadisticas
from .models import (
    Comida, SesionGym, EjercicioLog, PesoCorporal, AlimentoAlacena,
    MensajeChat, SesionChat, Rutina, RutinaDia, EjercicioPersonalizado,
    RegistroAgua,
)
from .serializers import (
    ComidaSerializer, SesionGymSerializer,
    EjercicioLogSerializer, PesoCorporalSerializer,
    UsuarioSerializer, MetasSerializer, PerfilUpdateSerializer, ObjetivoSerializer, PreferenciasSerializer,
    AlimentoAlacenaSerializer, OnboardingSerializer, SesionChatSerializer, MensajeChatSerializer
)

User = get_user_model()
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
#  AUTH — helpers
# ──────────────────────────────────────────────

def _jwt_para_usuario(user):
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access':  str(refresh.access_token),
    }


# ──────────────────────────────────────────────
#  GROQ — helpers de JSON robusto
# ──────────────────────────────────────────────
#
# qwen/qwen3.6-27b es un modelo "reasoning": por defecto piensa antes de
# responder y antepone un bloque <think>...</think> a la respuesta real.
# Eso rompe json.loads() aunque el resto del contenido sea JSON válido.
#
# Solución:
#   1. Mandamos "reasoning_effort": "none" en el payload para apagar el
#      modo pensamiento (soportado solo por la familia Qwen3 en Groq).
#   2. Igual limpiamos cualquier <think> residual como red de seguridad,
#      por si el modelo decide razonar de todas formas.

_THINK_RE = re.compile(r'<think>.*?</think>', re.DOTALL | re.IGNORECASE)


def _extraer_json(contenido):
    """
    Limpia la respuesta de Groq (quita bloques <think>, fences de markdown,
    texto suelto antes/después) y devuelve el dict ya parseado.
    Lanza json.JSONDecodeError si no logra encontrar JSON válido.
    """
    texto = contenido.strip()

    # 1. Quitar cualquier bloque de razonamiento tipo <think>...</think>
    texto = _THINK_RE.sub('', texto).strip()

    # 2. Quitar fences de markdown ```json ... ``` o ``` ... ```
    if texto.startswith('```'):
        partes = texto.split('```')
        if len(partes) >= 2:
            texto = partes[1]
            if texto.startswith('json'):
                texto = texto[4:]
        texto = texto.strip()

    # 3. Intento directo
    try:
        return json.loads(texto)
    except json.JSONDecodeError:
        pass

    # 4. Fallback: extraer el primer objeto/array JSON balanceado que
    #    aparezca en el texto (por si el modelo dejó texto suelto antes
    #    o después, o el <think> no vino con las etiquetas esperadas).
    for abre, cierra in (('{', '}'), ('[', ']')):
        inicio = texto.find(abre)
        if inicio == -1:
            continue
        profundidad = 0
        for i in range(inicio, len(texto)):
            if texto[i] == abre:
                profundidad += 1
            elif texto[i] == cierra:
                profundidad -= 1
                if profundidad == 0:
                    candidato = texto[inicio:i + 1]
                    try:
                        return json.loads(candidato)
                    except json.JSONDecodeError:
                        break

    # Si nada funcionó, deja que reviente arriba con el error original
    return json.loads(texto)


def _adaptar_payload(payload):
    """Los modelos gpt-oss piden el razonamiento distinto que qwen: no aceptan
    "none" ni reasoning_format. Se traduce aquí para que cada vista no tenga que saberlo."""
    if not str(payload.get('model', '')).startswith('openai/gpt-oss'):
        return payload
    payload = dict(payload)
    esfuerzo = payload.pop('reasoning_effort', None)
    payload['reasoning_effort'] = {'none': 'low', 'default': 'medium'}.get(esfuerzo, esfuerzo or 'low')
    payload.pop('reasoning_format', None)
    payload['include_reasoning'] = False
    return payload


def _groq_chat(payload, timeout=30):
    """POST genérico a Groq chat completions. Devuelve el texto crudo del mensaje."""
    groq_url = 'https://api.groq.com/openai/v1/chat/completions'
    payload = _adaptar_payload(payload)
    headers = {
        'Authorization': f'Bearer {settings.GROQ_API_KEY}',
        'Content-Type': 'application/json',
    }
    resp = requests.post(groq_url, headers=headers, json=payload, timeout=timeout)
    resp.raise_for_status()
    return resp.json()['choices'][0]['message']['content'].strip()


def _groq_mensaje(payload, timeout=25):
    """Como _groq_chat pero devuelve el mensaje entero (con tool_calls si los hay)."""
    payload = _adaptar_payload(payload)
    headers = {
        'Authorization': f'Bearer {settings.GROQ_API_KEY}',
        'Content-Type': 'application/json',
    }
    url = 'https://api.groq.com/openai/v1/chat/completions'
    resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    # Tras armar un plan (varias llamadas seguidas) Groq a veces pide esperar unos segundos
    if resp.status_code == 429:
        try:
            espera = float(resp.headers.get('retry-after', 3))
        except ValueError:
            espera = 3
        if espera <= 8:
            time.sleep(espera)
            resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    resp.raise_for_status()
    return resp.json()['choices'][0]['message']


# ──────────────────────────────────────────────
#  AUTH — Google
# ──────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def google_login(request):
    token = request.data.get('token')
    if not token:
        return Response({'error': 'Token requerido'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        info = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            audience=settings.GOOGLE_CLIENT_IDS[0],
        )
    except ValueError as e:
        import logging
        logging.getLogger(__name__).error(f'Google token error: {e}')
        return Response({'error': f'Token inválido: {e}'}, status=status.HTTP_401_UNAUTHORIZED)

    email      = info.get('email', '')
    first_name = info.get('given_name', '')
    last_name  = info.get('family_name', '')
    avatar_url = info.get('picture', '')

    if not email:
        return Response({'error': 'No se pudo obtener email de Google'}, status=status.HTTP_400_BAD_REQUEST)

    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            'username':   email,
            'first_name': first_name,
            'last_name':  last_name,
            'avatar_url': avatar_url,
        },
    )
    if not created and avatar_url and user.avatar_url != avatar_url:
        user.avatar_url = avatar_url
        user.save(update_fields=['avatar_url'])

    tokens = _jwt_para_usuario(user)
    return Response(
        {**tokens, 'usuario': UsuarioSerializer(user).data, 'nuevo': created},
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


# ──────────────────────────────────────────────
#  AUTH — Apple
# ──────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def apple_login(request):
    import jwt as pyjwt
    from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers
    from cryptography.hazmat.backends import default_backend
    import base64

    identity_token = request.data.get('token')
    if not identity_token:
        return Response({'error': 'Token requerido'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        apple_keys = requests.get('https://appleid.apple.com/auth/keys', timeout=10).json()['keys']
    except Exception:
        return Response({'error': 'No se pudo contactar a Apple'}, status=status.HTTP_502_BAD_GATEWAY)

    try:
        header   = pyjwt.get_unverified_header(identity_token)
        key_data = next(k for k in apple_keys if k['kid'] == header['kid'])
    except Exception:
        return Response({'error': 'Key ID no encontrado'}, status=status.HTTP_401_UNAUTHORIZED)

    def _b64_to_int(b64):
        data = base64.urlsafe_b64decode(b64 + '==')
        return int.from_bytes(data, 'big')

    pub_numbers = RSAPublicNumbers(n=_b64_to_int(key_data['n']), e=_b64_to_int(key_data['e']))
    public_key  = pub_numbers.public_key(default_backend())

    try:
        claims = pyjwt.decode(
            identity_token, public_key,
            algorithms=['RS256'],
            audience=settings.APPLE_BUNDLE_ID,
            issuer='https://appleid.apple.com',
        )
    except pyjwt.PyJWTError as e:
        return Response({'error': f'Token inválido: {e}'}, status=status.HTTP_401_UNAUTHORIZED)

    apple_sub  = claims['sub']
    email      = claims.get('email') or request.data.get('email', f'{apple_sub}@privaterelay.appleid.com')
    first_name = request.data.get('first_name', '')
    last_name  = request.data.get('last_name', '')

    user, created = User.objects.get_or_create(
        username=f'apple_{apple_sub}',
        defaults={'email': email, 'first_name': first_name, 'last_name': last_name},
    )

    tokens = _jwt_para_usuario(user)
    return Response(
        {**tokens, 'usuario': UsuarioSerializer(user).data, 'nuevo': created},
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


# ──────────────────────────────────────────────
#  AUTH — Perfil
# ──────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mi_perfil(request):
    user = request.user
    hoy  = timezone.localdate()

    sesiones_totales = SesionGym.objects.filter(usuario=user, completada=True).count()
    racha = estadisticas.racha_gym(user, hoy)

    ultimo_peso = PesoCorporal.objects.filter(usuario=user).order_by('-fecha').first()

    return Response({
        'usuario': UsuarioSerializer(user).data,
        'stats': {
            'sesiones_totales': sesiones_totales,
            'racha_gym':        racha,
            'peso_actual':      ultimo_peso.peso_kg if ultimo_peso else None,
            'peso_fecha':       ultimo_peso.fecha.isoformat() if ultimo_peso else None,
        },
    })


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def actualizar_perfil(request):
    serializer = PerfilUpdateSerializer(request.user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(UsuarioSerializer(request.user).data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def actualizar_objetivo(request):
    serializer = ObjetivoSerializer(request.user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(UsuarioSerializer(request.user).data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def actualizar_preferencias(request):
    serializer = PreferenciasSerializer(request.user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(UsuarioSerializer(request.user).data)
    return Response({'error': ' '.join(str(e) for errs in serializer.errors.values() for e in errs)},
                    status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def actualizar_metas(request):
    serializer = MetasSerializer(request.user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    try:
        token = RefreshToken(request.data.get('refresh'))
        token.blacklist()
        return Response({'detail': 'Sesión cerrada'})
    except Exception:
        return Response({'error': 'Token inválido'}, status=status.HTTP_400_BAD_REQUEST)


# ──────────────────────────────────────────────
#  ONBOARDING
# ──────────────────────────────────────────────

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def completar_onboarding(request):
    """
    Recibe todos los datos del onboarding, los guarda en el usuario
    y calcula automáticamente las metas nutricionales.
    """
    serializer = OnboardingSerializer(request.user, data=request.data, partial=True)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    serializer.save()  # llama a calcular_metas() internamente

    # Registrar peso inicial en PesoCorporal si no hay registros aún
    user = request.user
    if user.peso_inicial_kg and not PesoCorporal.objects.filter(usuario=user).exists():
        PesoCorporal.objects.create(
            usuario = user,
            peso_kg = user.peso_inicial_kg,
            fecha   = timezone.localdate(),
        )

    return Response(UsuarioSerializer(user).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generar_plan_groq(request):
    """
    Llama a Groq con el perfil completo del usuario y genera un plan
    de alimentación con alimentos reales para poblar la alacena.
    """
    user = request.user

    if not user.onboarding_completo:
        return Response(
            {'error': 'Completa el onboarding antes de generar un plan.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    gustados      = ', '.join(user.alimentos_gustados)    or 'variado'
    no_gustados   = ', '.join(user.alimentos_no_gustados) or 'ninguno'
    restricciones = ', '.join(user.restricciones_dieta)   or 'ninguna'

    objetivo_texto = {
        'perder':   'perder grasa',
        'mantener': 'mantener peso',
        'ganar':    'ganar músculo',
    }.get(user.objetivo, 'mantener peso')

    system_msg = (
        'Eres un nutricionista deportivo especializado en alimentación colombiana. '
        'Conoces a fondo los alimentos del mercado colombiano, sus porciones reales y sus macros exactos. '
        'Respondes únicamente con JSON válido, sin texto adicional.'
    )

    prompt = f"""Crea un plan nutricional personalizado para este usuario colombiano con objetivo de {objetivo_texto}.

METAS DIARIAS:
- Calorías: {user.meta_calorias} kcal
- Proteína: {user.meta_proteina}g | Carbos: {user.meta_carbos}g | Grasas: {user.meta_grasas}g

PREFERENCIAS:
- Le gustan: {gustados}
- NO le gustan (EXCLUIR): {no_gustados}
- Restricciones: {restricciones}
- ALERGIAS (nunca, ni como ingrediente menor): {', '.join(user.alergias or []) or 'ninguna'}

INSTRUCCIONES ALIMENTOS:
1. Genera entre 18 y 22 alimentos o preparaciones concretas, variadas y reales.
2. USA los alimentos que le gustan. NUNCA uses los que no le gustan ni los que van contra sus restricciones.
3. Prioriza alimentos colombianos o conseguibles en supermercados colombianos (Éxito, D1, Ara, Jumbo).
4. Distribuye equilibradamente: desayunos (4-5), almuerzos (4-5), cenas (4-5), snacks (4-5).
5. Los macros deben ser precisos para la porción indicada, no valores genéricos.
6. Cada porción debe ser práctica (ej: "1 pechuga mediana cocida (120g)", no "100g pollo crudo").
7. Para perder grasa: prioriza volumen con pocas calorías y alta proteína.
   Para ganar músculo: prioriza proteínas completas y carbos de calidad.
   Para mantener: balance entre todos los macros.

INSTRUCCIONES DÍA DE EJEMPLO:
- Crea UN día de comidas de ejemplo usando solo alimentos de la lista anterior.
- Las 4 comidas del día (desayuno, almuerzo, cena, snack) deben sumar aproximadamente las metas diarias.
- Usa nombres exactos de los alimentos de la lista "alimentos".

Responde ÚNICAMENTE con este JSON válido, sin texto adicional:
{{
  "plan_descripcion": "2 oraciones describiendo el enfoque del plan y cómo se adaptó a las preferencias específicas",
  "alimentos": [
    {{
      "nombre": "nombre del alimento o preparación",
      "descripcion": "porción específica y práctica",
      "calorias": 000,
      "proteina": 00.0,
      "carbos": 00.0,
      "grasas": 00.0
    }}
  ],
  "dia_ejemplo": {{
    "desayuno": {{ "nombre": "nombre exacto del alimento", "descripcion": "porción", "calorias": 000, "proteina": 00.0, "carbos": 00.0, "grasas": 00.0 }},
    "almuerzo": {{ "nombre": "nombre exacto del alimento", "descripcion": "porción", "calorias": 000, "proteina": 00.0, "carbos": 00.0, "grasas": 00.0 }},
    "cena":     {{ "nombre": "nombre exacto del alimento", "descripcion": "porción", "calorias": 000, "proteina": 00.0, "carbos": 00.0, "grasas": 00.0 }},
    "snack":    {{ "nombre": "nombre exacto del alimento", "descripcion": "porción", "calorias": 000, "proteina": 00.0, "carbos": 00.0, "grasas": 00.0 }}
  }}
}}"""

    payload = {
        'model': settings.GROQ_MODEL_TEXTO,
        'messages': [
            {'role': 'system', 'content': system_msg},
            {'role': 'user',   'content': prompt},
        ],
        'max_tokens': 3500,
        'temperature': 0.3,
        'reasoning_effort': 'none',
    }

    try:
        contenido = _groq_chat(payload, timeout=60)
        data = _extraer_json(contenido)
        return Response(data)
    except requests.RequestException as e:
        return _respuesta_error_groq(e, 'Bruce está armando muchos planes. Intenta de nuevo en un minuto.')
    except json.JSONDecodeError:
        return Response({'error': 'Groq no devolvió JSON válido'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ──────────────────────────────────────────────
#  VALIDACIÓN DE ENTRADAS
# ──────────────────────────────────────────────

MAX_EJERCICIOS = 40


def _a_bool(valor):
    if isinstance(valor, str):
        return valor.strip().lower() in ('true', '1', 'si', 'sí', 'yes')
    return bool(valor)


def _numero(valor, minimo, maximo, entero=False, opcional=False):
    """Convierte a número dentro de [minimo, maximo]. Devuelve (numero, error)."""
    if valor in (None, ''):
        return (None, None) if opcional else (None, 'es obligatorio')
    try:
        n = float(str(valor).replace(',', '.'))
    except (TypeError, ValueError):
        return None, 'no es un número'
    if n != n or not (minimo <= n <= maximo):  # n != n: NaN
        return None, f'debe estar entre {minimo} y {maximo}'
    return (round(n) if entero else n), None


def _validar_ejercicio(item):
    """Limpia un ejercicio registrado. Devuelve (datos, error)."""
    if not isinstance(item, dict):
        return None, 'formato inválido'
    nombre = str(item.get('nombre') or '').strip()[:200]
    if not nombre:
        return None, 'falta el nombre'
    series, err = _numero(item.get('series', 3), 1, 50, entero=True)
    if err:
        return None, f'series {err}'
    peso, err = _numero(item.get('peso_kg'), 0, 1000, opcional=True)
    if err:
        return None, f'peso {err}'
    return {
        'nombre':  nombre,
        'musculo': str(item.get('musculo') or '')[:100],
        'series':  series,
        'reps':    str(item.get('reps') or '10').strip()[:50],
        'peso_kg': peso,
        'notas':   str(item.get('notas') or '')[:500],
    }, None


# ──────────────────────────────────────────────
#  RESUMEN DIARIO (Home screen)
# ──────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def resumen_hoy(request):
    from datetime import timedelta
    hoy     = timezone.localdate()
    user    = request.user
    comidas = Comida.objects.filter(usuario=user, fecha=hoy)

    totales = {
        'calorias': sum(c.calorias for c in comidas),
        'proteina': round(sum(c.proteina for c in comidas), 1),
        'carbos':   round(sum(c.carbos   for c in comidas), 1),
        'grasas':   round(sum(c.grasas   for c in comidas), 1),
    }

    metas = {
        'calorias': user.meta_calorias,
        'proteina': user.meta_proteina,
        'carbos':   user.meta_carbos,
        'grasas':   user.meta_grasas,
    }

    descanso     = estadisticas.dias_descanso(user)
    racha_gym    = estadisticas.racha_gym(user, hoy, descanso)
    racha_comida = estadisticas.racha_comida(user, hoy)

    agua_ml = RegistroAgua.objects.filter(usuario=user, fecha=hoy).aggregate(
        total=models.Sum('cantidad_ml')
    )['total'] or 0

    return Response({
        'fecha':        hoy.isoformat(),
        'totales':      totales,
        'metas':        metas,
        'comidas':      ComidaSerializer(comidas, many=True).data,
        'racha_gym':    racha_gym,
        'agua_ml':      agua_ml,
        'meta_agua_ml': user.meta_agua_ml(),
        'racha_comida': racha_comida,
        'es_dia_descanso': hoy.weekday() in descanso,
        'objetivo':     getattr(user, 'objetivo', 'mantener'),
    })


# ──────────────────────────────────────────────
#  COMIDAS (Food screen)
# ──────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def comidas(request):
    if request.method == 'GET':
        fecha = estadisticas.parsear_fecha(request.query_params.get('fecha'), timezone.localdate())
        if fecha is None:
            return Response({'error': 'Formato de fecha inválido (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)
        qs    = Comida.objects.filter(usuario=request.user, fecha=fecha)
        return Response(ComidaSerializer(qs, many=True).data)

    serializer = ComidaSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(usuario=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def comida_detalle(request, pk):
    try:
        comida = Comida.objects.get(pk=pk, usuario=request.user)
    except Comida.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    comida.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ──────────────────────────────────────────────
#  GYM (Gym screen)
# ──────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sesiones_semana(request):
    from datetime import timedelta
    hoy    = timezone.localdate()
    inicio = hoy - timedelta(days=6)
    sesiones = SesionGym.objects.filter(usuario=request.user, fecha__range=[inicio, hoy])
    return Response(SesionGymSerializer(sesiones, many=True).data)


def _sesiones_del_dia(user, fecha):
    """Resumen de un día que puede tener varias sesiones (doble entreno)."""
    sesiones = list(SesionGym.objects.filter(usuario=user, fecha=fecha).prefetch_related('ejercicios'))
    if not sesiones:
        return {'rutina': '', 'completada': False, 'ejercicios': []}
    return {
        'rutina':     sesiones[0].rutina,
        'completada': any(s.completada for s in sesiones),
        'ejercicios': [
            {'nombre': e.nombre, 'series': e.series, 'reps': e.reps, 'peso_kg': e.peso_kg, 'rutina_ref': s.rutina_ref_id}
            for s in sesiones for e in s.ejercicios.all()
        ],
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sesion_de_hoy(request):
    return Response(_sesiones_del_dia(request.user, timezone.localdate()))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sesion_por_fecha(request, fecha):
    fecha_obj = estadisticas.parsear_fecha(fecha)
    if fecha_obj is None:
        return Response({'error': 'Formato de fecha inválido (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)
    return Response(_sesiones_del_dia(request.user, fecha_obj))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def registrar_sesion(request):
    """Guarda la sesión de un día y, si llegan, sus ejercicios hechos.

    Body: { fecha, rutina, notas, ejercicios?: [{nombre, musculo, series, reps, peso_kg, notas}] }
    Con `ejercicios`, los registros del día se reemplazan por los enviados (lo
    que se desmarcó desaparece) y la sesión cuenta como completada si hubo al
    menos uno. Todo en una transacción: o se guarda completa o nada.
    """
    fecha = estadisticas.parsear_fecha(request.data.get('fecha'), timezone.localdate())
    if fecha is None:
        return Response({'error': 'Formato de fecha inválido (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)
    if fecha > timezone.localdate() + timedelta(days=1):
        return Response({'error': 'No se pueden registrar sesiones futuras'}, status=status.HTTP_400_BAD_REQUEST)

    rutina = str(request.data.get('rutina') or 'R')[:1]
    lista  = request.data.get('ejercicios')

    rutina_ref = None
    if request.data.get('rutina_ref') is not None:
        rutina_ref = Rutina.objects.filter(pk=request.data.get('rutina_ref'), usuario=request.user).first()
        if rutina_ref is None:
            return Response({'error': 'Esa rutina no existe'}, status=status.HTTP_400_BAD_REQUEST)
        rutina = 'A'

    registros = None
    if lista is not None:
        if not isinstance(lista, list) or len(lista) > MAX_EJERCICIOS:
            return Response({'error': 'ejercicios debe ser una lista'}, status=status.HTTP_400_BAD_REQUEST)
        registros, errores = [], []
        vistos = set()
        for i, item in enumerate(lista):
            datos, error = _validar_ejercicio(item)
            if error:
                errores.append(f'Ejercicio {i + 1}: {error}')
            elif datos['nombre'].lower() not in vistos:
                vistos.add(datos['nombre'].lower())
                registros.append(datos)
        if errores:
            return Response({'error': ' · '.join(errores)}, status=status.HTTP_400_BAD_REQUEST)
        completada = len(registros) > 0
    else:
        completada = _a_bool(request.data.get('completada', False))

    with transaction.atomic():
        # Una sesión por rutina y día: el doble entreno guarda cada una aparte
        sesion, _ = SesionGym.objects.update_or_create(
            usuario=request.user,
            fecha=fecha,
            rutina_ref=rutina_ref,
            defaults={
                'rutina':     rutina,
                'completada': completada,
                'notas':      str(request.data.get('notas', ''))[:500],
            },
        )
        if registros is not None:
            sesion.ejercicios.all().delete()
            EjercicioLog.objects.bulk_create([EjercicioLog(sesion=sesion, **r) for r in registros])

    return Response(SesionGymSerializer(sesion).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def log_ejercicio(request):
    """Registra un solo ejercicio (versiones viejas de la app). Marca la sesión como hecha."""
    fecha = estadisticas.parsear_fecha(request.data.get('fecha'), timezone.localdate())
    if fecha is None:
        return Response({'error': 'Formato de fecha inválido (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)

    datos, error = _validar_ejercicio(request.data)
    if error:
        return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        sesion, _ = SesionGym.objects.get_or_create(
            usuario=request.user,
            fecha=fecha,
            rutina_ref=None,
            defaults={'rutina': 'R'},
        )
        if not sesion.completada:
            sesion.completada = True
            sesion.save(update_fields=['completada'])
        nombre = datos.pop('nombre')
        ejercicio, created = EjercicioLog.objects.update_or_create(
            sesion=sesion, nombre=nombre, defaults=datos,
        )
    return Response(
        EjercicioLogSerializer(ejercicio).data,
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


# ──────────────────────────────────────────────
#  PROGRESS (Progress screen)
# ──────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def progreso_semanal(request):
    from datetime import timedelta
    hoy  = timezone.localdate()
    user = request.user

    inicio   = hoy - timedelta(days=6)
    totales  = estadisticas.totales_por_dia(user, inicio, hoy)
    con_gym  = estadisticas.dias_con_gym(user, inicio, hoy)

    calorias_semana = []
    for i in range(6, -1, -1):
        dia = hoy - timedelta(days=i)
        calorias_semana.append({
            'fecha':    dia.isoformat(),
            'dia':      dia.strftime('%a'),
            'calorias': totales.get(dia, {}).get('calorias', 0),
            'gym':      dia in con_gym,
        })

    pesos = PesoCorporal.objects.filter(usuario=user).order_by('-fecha')[:7]

    return Response({
        'calorias_semana': calorias_semana,
        'pesos':           PesoCorporalSerializer(pesos, many=True).data,
        'meta_calorias':   user.meta_calorias,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def registrar_peso(request):
    serializer = PesoCorporalSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    datos = serializer.validated_data
    peso, _ = PesoCorporal.objects.update_or_create(
        usuario=request.user,
        fecha=datos.get('fecha') or timezone.localdate(),
        defaults={'peso_kg': datos['peso_kg']},
    )
    # Con 2 kg de diferencia las metas quedan viejas: se reajustan y se avisa
    ajuste = request.user.revisar_metas_por_peso()
    return Response({**PesoCorporalSerializer(peso).data, 'metas_ajustadas': ajuste}, status=status.HTTP_201_CREATED)


# ──────────────────────────────────────────────
#  ALACENA
# ──────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def alacena(request):
    if request.method == 'GET':
        qs = AlimentoAlacena.objects.filter(usuario=request.user)
        return Response(AlimentoAlacenaSerializer(qs, many=True).data)

    serializer = AlimentoAlacenaSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(usuario=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def alacena_detalle(request, pk):
    try:
        alimento = AlimentoAlacena.objects.get(pk=pk, usuario=request.user)
    except AlimentoAlacena.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        alimento.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = AlimentoAlacenaSerializer(alimento, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def alacena_usar(request, pk):
    try:
        alimento = AlimentoAlacena.objects.get(pk=pk, usuario=request.user)
    except AlimentoAlacena.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    porciones, error = _numero(request.data.get('porciones', 1), 0.1, 20)
    if error:
        return Response({'error': f'porciones {error}'}, status=status.HTTP_400_BAD_REQUEST)
    porciones = round(porciones, 2)
    fecha = estadisticas.parsear_fecha(request.data.get('fecha'), timezone.localdate())
    if fecha is None:
        return Response({'error': 'Formato de fecha inválido (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)

    comida = Comida.objects.create(
        usuario     = request.user,
        nombre      = alimento.nombre,
        descripcion = f"{porciones}x {alimento.descripcion}" if alimento.descripcion else f"{porciones} porción(es)",
        calorias    = round(alimento.calorias * porciones),
        proteina    = round(alimento.proteina * porciones, 1),
        carbos      = round(alimento.carbos   * porciones, 1),
        grasas      = round(alimento.grasas   * porciones, 1),
        fecha       = fecha,
    )

    alimento.veces_usado += 1
    alimento.save(update_fields=['veces_usado'])

    return Response(ComidaSerializer(comida).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bruce_frase(request):
    import random

    calorias_hoy    = request.data.get('calorias_hoy', 0)
    meta_calorias   = request.data.get('meta_calorias', 1900)
    proteina_hoy    = request.data.get('proteina_hoy', 0)
    meta_proteina   = request.data.get('meta_proteina', 140)
    carbos_hoy      = request.data.get('carbos_hoy', 0)
    meta_carbos     = request.data.get('meta_carbos', 200)
    fue_al_gym      = request.data.get('fue_al_gym', False)
    es_dia_gym      = request.data.get('es_dia_gym', True)
    hora            = request.data.get('hora', 12)
    racha_gym       = request.data.get('racha_gym', 0)
    racha_comida    = request.data.get('racha_comida', 0)
    nombre_usuario  = request.data.get('nombre_usuario') or request.user.first_name or 'parcero'
    objetivo        = request.data.get('objetivo', 'mantener')

    pct_calorias  = round((calorias_hoy / meta_calorias) * 100) if meta_calorias else 0
    pct_proteina  = round((proteina_hoy / meta_proteina) * 100) if meta_proteina else 0

    if hora < 12:   momento = 'mañana'
    elif hora < 18: momento = 'tarde'
    else:           momento = 'noche'

    if pct_calorias >= 95 and pct_proteina >= 90 and (fue_al_gym or not es_dia_gym):
        pose = 'muyfeliz'
    elif pct_calorias >= 75 and fue_al_gym:
        pose = 'sonrisa'
    elif pct_calorias < 25 and hora >= 19:
        pose = 'triste'
    elif not fue_al_gym and es_dia_gym and hora >= 16:
        pose = 'determinado'
    elif pct_calorias >= 40 and pct_calorias < 80:
        pose = 'pensando'
    else:
        pose = 'normal'

    objetivo_texto = {'perder': 'perder grasa', 'ganar': 'ganar músculo'}.get(objetivo, 'mantener peso')

    gym_estado = (
        'Sí, ya entrenó hoy' if fue_al_gym
        else ('No ha ido aún — debería ir' if es_dia_gym
        else 'Día de descanso')
    )

    racha_info = ''
    if racha_gym >= 3:
        racha_info = f'Lleva {racha_gym} días seguidos de gym. '
    if racha_comida >= 5:
        racha_info += f'Lleva {racha_comida} días registrando comida sin falla.'

    prompt = f"""Eres Bruce, un dachshund salchicha que es el coach personal de {nombre_usuario}. \
Hablas como parcero colombiano — directo, sarcástico con cariño, sin rodeos. \
Usas vocabulario de fitness natural ("macros", "déficit", "proteína", "racha"). \
NUNCA usas emojis. NUNCA predicas ni repites consejos genéricos.

OBJETIVO DEL USUARIO: {objetivo_texto}
RESTRICCIONES DE DIETA (nunca sugieras algo que las viole): {', '.join(request.user.restricciones_dieta or []) or 'ninguna'}
ALERGIAS (peligroso, jamás las sugieras): {', '.join(request.user.alergias or []) or 'ninguna'}
NO LE GUSTA (no lo sugieras): {', '.join(request.user.alimentos_no_gustados or []) or 'nada en particular'}

SITUACIÓN REAL DE HOY ({momento}, {hora}h):
- Calorías: {calorias_hoy}/{meta_calorias} kcal ({pct_calorias}%)
- Proteína: {proteina_hoy}g/{meta_proteina}g ({pct_proteina}%)
- Carbos: {carbos_hoy}g/{meta_carbos}g
- Gym: {gym_estado}
{f'- {racha_info}' if racha_info else ''}

REGLAS ABSOLUTAS:
1. Exactamente 1 a 2 oraciones. Directas. Sin preámbulos.
2. Si es día de descanso: JAMÁS menciones el gym. Habla de nutrición, recuperación o sueño.
3. Basa la frase en los números reales de hoy — no en generalidades.
4. Varía el inicio: no siempre empieces igual.
5. Si cumplió todo: celebra con actitud pero sin exagerar.
6. Si le falta proteína más que calorías: menciona eso específicamente.
7. Si sugieres un alimento, que respete sus restricciones y alergias (vegetariano: nada de carne, pollo ni pescado; vegano: además nada de huevo, lácteos ni whey de leche; sin_vegetales: nada de ensaladas ni verduras a la vista).

Solo la frase. Sin comillas. Sin explicaciones."""

    payload = {
        'model':            settings.GROQ_MODEL_TEXTO,
        'messages':         [{'role': 'user', 'content': prompt}],
        'max_tokens':       400,  # gpt-oss gasta parte en razonar
        'temperature':      0.9,
        'reasoning_effort': 'none',
    }

    try:
        frase = _groq_chat(payload, timeout=15).strip('"').strip("'")
        # Por si acaso el modelo dejó algún <think> residual
        frase = _THINK_RE.sub('', frase).strip()
        return Response({'frase': frase, 'pose': pose})
    except Exception:
        frases_fallback = [
            "Sin datos no hay diagnóstico. Registra lo que comes.",
            "La consistencia gana siempre. Siempre.",
            "Cada decisión cuenta, parcero.",
            "No hay días perfectos, hay días que suman.",
        ]
        return Response({'frase': random.choice(frases_fallback), 'pose': 'normal'})


# ── Helper búsqueda nutricional ───────────────────────────────────────────

def _buscar_info_nutricional(nombre_alimento):
    """Estima información nutricional de un alimento usando conocimiento del modelo."""
    payload = {
        'model': settings.GROQ_MODEL_TEXTO,
        'messages': [
            {
                'role': 'system',
                'content': (
                    'Eres un nutricionista con base de datos nutricional extensa, '
                    'especializado en alimentos colombianos y latinoamericanos. '
                    'Conoces los macros exactos de preparaciones típicas colombianas '
                    '(bandeja paisa, ajiaco, arepa, changua, etc.) y productos de supermercado. '
                    'Respondes solo con JSON válido.'
                ),
            },
            {
                'role': 'user',
                'content': f"""Dame la información nutricional de: {nombre_alimento}

Usa tus conocimientos nutricionales para dar valores precisos por porción típica colombiana.

Responde ÚNICAMENTE con JSON válido:
{{
  "encontrado": true,
  "fuente": "base de conocimiento nutricional",
  "calorias": 000,
  "proteina": 00.0,
  "carbos": 00.0,
  "grasas": 00.0,
  "porcion": "descripción de la porción usada, ej: 1 plato mediano (350g)"
}}

Si es un alimento completamente desconocido o imposible de estimar, usa encontrado: false.""",
            },
        ],
        'max_tokens':       700,  # gpt-oss gasta parte en razonar
        'temperature':      0.1,
        'reasoning_effort': 'none',
    }

    try:
        contenido = _groq_chat(payload, timeout=20)
        return _extraer_json(contenido)
    except Exception:
        return {'encontrado': False}


# ── Analizar foto de plato ────────────────────────────────────────────────

def _preparar_imagen(imagen_b64, lado_max=768):
    """Normaliza la foto antes de mandarla a la IA.

    Las fotos del celular llegan de varios MB, a veces de lado (orientación en
    EXIF) y no siempre en JPEG. Se enderezan, se pasan a JPEG y se reducen: el
    modelo reconoce mejor y cada análisis gasta muchos menos tokens (el plan de
    Groq permite pocos por minuto). Si algo falla, se envía la original.
    """
    datos = imagen_b64.split(',', 1)[1] if imagen_b64.startswith('data:') else imagen_b64
    try:
        from PIL import Image, ImageOps
        img = Image.open(io.BytesIO(base64.b64decode(datos)))
        img = ImageOps.exif_transpose(img).convert('RGB')
        img.thumbnail((lado_max, lado_max))
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=85)
        datos = base64.b64encode(buf.getvalue()).decode()
    except Exception:
        pass
    return f'data:image/jpeg;base64,{datos}'


def _respuesta_error_groq(e, ocupado='Bruce está atendiendo muchas fotos. Intenta de nuevo en un minuto.'):
    """Traduce errores de Groq a algo que la app pueda mostrar. El detalle
    técnico va al log del servidor, no a la pantalla."""
    codigo = getattr(getattr(e, 'response', None), 'status_code', None)
    if codigo == 429:
        return Response({'error': ocupado}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    logger.warning('Error de Groq (%s): %s', codigo, e)
    return Response({'error': 'Bruce no pudo responder ahora. Intenta de nuevo.'}, status=status.HTTP_502_BAD_GATEWAY)


def _sumar_alimentos(data):
    """El modelo da macros por alimento; el total lo calcula el servidor.

    Sumar en código es más confiable que pedirle al modelo que sume, y así las
    calorías siempre cuadran con los macros (4·P + 4·C + 9·G).
    """
    def num(v):
        try:
            return max(float(v), 0.0)
        except (TypeError, ValueError):
            return 0.0

    alimentos = [a for a in (data.get('alimentos') or []) if isinstance(a, dict)]
    if data.get('es_comida') is False or not alimentos:
        return {
            'es_comida': False,
            'nombre': 'No se ve comida',
            'calorias': 0, 'proteina': 0.0, 'carbos': 0.0, 'grasas': 0.0,
            'confianza': 'baja',
            'descripcion': data.get('observacion') or 'No se ve comida en la foto.',
            'fuente': 'estimacion',
            'alimentos': [],
        }

    proteina = round(sum(num(a.get('proteina')) for a in alimentos), 1)
    carbos   = round(sum(num(a.get('carbos'))   for a in alimentos), 1)
    grasas   = round(sum(num(a.get('grasas'))   for a in alimentos), 1)
    calorias = round(sum(num(a.get('calorias')) for a in alimentos))
    por_macros = round(4 * proteina + 4 * carbos + 9 * grasas)
    # Si las calorías no cuadran con los macros (más de 20%), mandan los macros
    if por_macros and abs(calorias - por_macros) > 0.2 * por_macros:
        calorias = por_macros

    confianza = data.get('confianza') if data.get('confianza') in ('alta', 'media', 'baja') else 'media'
    return {
        'es_comida':   True,
        'nombre':      data.get('nombre') or alimentos[0].get('nombre', 'Comida'),
        'calorias':    calorias,
        'proteina':    proteina,
        'carbos':      carbos,
        'grasas':      grasas,
        'confianza':   confianza,
        'descripcion': data.get('descripcion') or data.get('observacion', ''),
        'fuente':      data.get('fuente', 'estimacion'),
        'alimentos':   alimentos,
    }


_FORMATO_ANALISIS = """Responde únicamente con un objeto JSON con esta forma:
{
  "observacion": "qué se ve, en una frase",
  "es_comida": true,
  "nombre": "nombre corto en español de Colombia",
  "alimentos": [
    {"nombre": "...", "cantidad": "unidades o porción", "gramos": 0, "calorias": 0, "proteina": 0.0, "carbos": 0.0, "grasas": 0.0}
  ],
  "confianza": "alta | media | baja",
  "descripcion": "la porción en palabras, con los gramos aproximados"
}

Confianza: "alta" si se reconoce sin duda; "media" si se reconoce pero la preparación, los ingredientes o la porción son inciertos; "baja" si la foto es borrosa, oscura o ambigua."""

_PROMPT_FOTO = """Vas a registrar lo que una persona está por comer a partir de esta foto.

PASO 1 — Observa antes de nombrar.
Describe solo lo que se ve: cuántos elementos hay, forma, color, textura, brillo, si están enteros, pelados o cortados, y en qué recipiente o superficie están. No supongas ingredientes que no se vean.

PASO 2 — Identifica cada alimento a partir de esa evidencia.
- Si es un alimento entero y simple (una fruta, un huevo, un pan, una verdura), nómbralo tal cual. No lo conviertas en un plato ni en un producto procesado.
- Cuidado con alimentos que se parecen: una fruta tiene piel natural, brillo irregular, tallo, hoja o semillas; un producto procesado (panela, queso, galletas, pan) tiene forma geométrica regular y superficie mate o uniforme.
- Nombres en Colombia: "banano" es la fruta amarilla que se come cruda; "plátano" es el de cocinar (más grande, verde o maduro, casi siempre frito, asado o cocido). No los confundas.
- Si los componentes visibles corresponden a un plato conocido, usa su nombre común en Colombia. Ejemplos: arroz amarillo mezclado con trozos de pollo = arroz con pollo; fríjoles, arroz, carne molida, chicharrón, huevo frito, plátano maduro, arepa y aguacate en un mismo plato = bandeja paisa. Si solo ves algunos componentes, nombra lo que ves en vez de inventar el plato completo.
- Si no hay comida en la foto, responde con "es_comida": false.

PASO 3 — Estima la porción que aparece en la foto (no valores por 100 g).
Cuenta las unidades cuando se pueda y usa pesos típicos por unidad. En platos, usa referencias visuales como el tamaño del plato (plato llano ≈ 26 cm), cubiertos, vasos o manos.

PASO 4 — Calcula los macros de cada alimento con valores nutricionales estándar (USDA o tabla del ICBF). Verifica que calorias ≈ 4×proteina + 4×carbos + 9×grasas.

""" + _FORMATO_ANALISIS


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def analizar_foto(request):
    imagen_b64  = request.data.get('imagen')
    correccion  = request.data.get('correccion', '').strip()
    nombre_prev = request.data.get('nombre_anterior', '').strip()

    if not imagen_b64:
        return Response({'error': 'Se requiere campo "imagen"'}, status=status.HTTP_400_BAD_REQUEST)

    info_web = None
    if correccion:
        # La persona corrige qué es: se respeta su palabra y la foto sirve para la porción
        info_web = _buscar_info_nutricional(correccion)
        info_str = (
            'Referencia nutricional disponible: ' + json.dumps(info_web, ensure_ascii=False)
            if info_web and info_web.get('encontrado')
            else 'No hay referencia externa: usa valores nutricionales estándar (USDA o ICBF).'
        )
        prompt = f"""Antes identificaste esta foto como "{nombre_prev or 'otra cosa'}", pero la persona corrige: es "{correccion}".
Confía en la corrección para saber QUÉ es, y usa la foto solo para estimar CUÁNTO hay (unidades, tamaño del plato, porción visible).

{info_str}

Calcula los macros de la porción que se ve. Verifica que calorias ≈ 4×proteina + 4×carbos + 9×grasas. Usa "{correccion}" como nombre.

""" + _FORMATO_ANALISIS
    else:
        prompt = _PROMPT_FOTO

    payload = {
        'model':       settings.GROQ_MODEL,
        'messages':    [{'role': 'user', 'content': [
            {'type': 'text', 'text': prompt},
            {'type': 'image_url', 'image_url': {'url': _preparar_imagen(imagen_b64)}},
        ]}],
        'max_tokens':  900,
        'temperature': 0.1,
        # Razona antes de responder (mejora la identificación) pero sin mezclar
        # ese razonamiento en el texto: la respuesta llega como JSON limpio.
        'reasoning_effort': 'default',
        'reasoning_format': 'hidden',
        'response_format':  {'type': 'json_object'},
    }

    try:
        data = _extraer_json(_groq_chat(payload, timeout=45))
        resultado = _sumar_alimentos(data)
        if correccion:
            resultado['nombre'] = correccion
            if info_web and info_web.get('encontrado'):
                resultado['fuente'] = 'internet'
        return Response(resultado)
    except requests.RequestException as e:
        return _respuesta_error_groq(e)
    except json.JSONDecodeError:
        return Response({'error': 'Groq no devolvió JSON válido'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── Analizar etiqueta nutricional ─────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def analizar_etiqueta(request):
    imagen_b64  = request.data.get('imagen')
    correccion  = request.data.get('correccion', '').strip()
    nombre_prev = request.data.get('nombre_anterior', '').strip()

    if not imagen_b64:
        return Response({'error': 'Se requiere campo "imagen"'}, status=status.HTTP_400_BAD_REQUEST)

    info_web = None
    if correccion:
        info_web = _buscar_info_nutricional(correccion)

    if correccion and nombre_prev:
        info_str = (
            'Referencia nutricional: ' + json.dumps(info_web, ensure_ascii=False)
            if info_web and info_web.get('encontrado')
            else 'Sin referencia externa — estima con tu conocimiento del producto.'
        )
        prompt = f"""Leíste una etiqueta como "{nombre_prev}" pero el usuario dice que es "{correccion}".

{info_str}

Corrige con los valores de "{correccion}" por porción.
Responde ÚNICAMENTE con JSON válido:
{{
  "nombre": "{correccion}",
  "descripcion": "tamaño de porción del producto corregido",
  "calorias": 000,
  "proteina": 00.0,
  "carbos": 00.0,
  "grasas": 00.0,
  "confianza": "alta|media|baja",
  "fuente": "estimacion"
}}"""
    else:
        prompt = """Analiza esta etiqueta nutricional con precisión.

PASOS:
1. Encuentra la sección "Información Nutricional" o "Nutrition Facts".
2. Lee el "Tamaño de porción" o "Serving size".
3. Extrae los valores POR ESA PORCIÓN (no por 100g).
4. Si la etiqueta está en inglés: Calories→calorías, Total Fat→grasas, Total Carbohydrate→carbos, Protein→proteína.
5. Si hay azúcar y fibra pero no carbos totales, suma azúcar + fibra + almidón para estimar carbos.

Responde ÚNICAMENTE con JSON válido:
{
  "nombre": "nombre del producto tal como aparece en la etiqueta",
  "descripcion": "tamaño de porción exacto de la etiqueta, ej: '1 porción (30g)' o '1 taza (240mL)'",
  "calorias": 000,
  "proteina": 00.0,
  "carbos": 00.0,
  "grasas": 00.0,
  "confianza": "alta|media|baja",
  "fuente": "etiqueta"
}

Usa confianza "baja" si la etiqueta está muy borrosa o incompleta. Nunca uses 0 en todos los campos si puedes leer aunque sea parcialmente."""

    messages = [{'role': 'user', 'content': [
        {'type': 'text', 'text': prompt},
        {'type': 'image_url', 'image_url': {'url': _preparar_imagen(imagen_b64, lado_max=1280)}},
    ]}]

    payload = {
        'model':            settings.GROQ_MODEL,
        'messages':         messages,
        'max_tokens':       500,
        'temperature':      0.1,
        'reasoning_effort': 'none',
    }

    try:
        contenido = _groq_chat(payload, timeout=30)
        data = _extraer_json(contenido)
        return Response(data)
    except requests.RequestException as e:
        return _respuesta_error_groq(e, 'Bruce está leyendo muchas etiquetas. Intenta de nuevo en un minuto.')
    except json.JSONDecodeError:
        return Response({'error': 'Groq no devolvió JSON válido'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── Chat con Bruce ────────────────────────────────────────────────────────

def _contexto_semana(user, hoy):
    """Lo que Bruce necesita para hablar de patrones y no solo del día."""
    from .models import PlanDia
    desde = hoy - timedelta(days=6)
    totales = estadisticas.totales_por_dia(user, desde, hoy - timedelta(days=1))
    lineas = ['ÚLTIMOS 7 DÍAS (sin contar hoy):']
    if totales:
        n = len(totales)
        prom_cal  = round(sum(t['calorias'] for t in totales.values()) / n)
        prom_prot = round(sum(t['proteina'] for t in totales.values()) / n)
        dias_prot = sum(1 for t in totales.values() if user.meta_proteina and t['proteina'] >= user.meta_proteina * 0.9)
        lineas.append(f'• Registró comida {n} de 6 días. Promedio: {prom_cal} kcal y {prom_prot} g proteína por día. '
                      f'Cumplió la proteína {dias_prot} de {n} días.')
    else:
        lineas.append('• No registró comidas.')
    dias_gym = estadisticas.dias_con_gym(user, desde, hoy - timedelta(days=1))
    lineas.append(f'• Fue al gym {len(dias_gym)} días.')

    recientes = (
        Comida.objects.filter(usuario=user, fecha__gte=hoy - timedelta(days=2))
        .order_by('-fecha', '-creado_en').values_list('fecha', 'nombre')[:12]
    )
    if recientes:
        lineas.append('• Comió hace poco: ' + '; '.join(f'{n} ({"hoy" if f == hoy else f.strftime("%a")})' for f, n in recientes))

    pesos = list(PesoCorporal.objects.filter(usuario=user, fecha__gte=hoy - timedelta(days=21)).order_by('fecha').values_list('peso_kg', flat=True))
    if len(pesos) >= 2:
        lineas.append(f'• Peso últimas 3 semanas: de {pesos[0]} a {pesos[-1]} kg ({pesos[-1] - pesos[0]:+.1f} kg).')
    from .gasto_real import texto_ajuste, ultimo_ajuste
    ajuste = ultimo_ajuste(user)
    if ajuste:
        lineas.append(f'• Gasto real (ajuste del {ajuste.fecha:%d/%m}): {texto_ajuste(ajuste)}')

    rutinas_hoy = list(RutinaDia.objects.filter(usuario=user, dia_semana=hoy.weekday()).values_list('rutina__nombre', flat=True))
    lineas.append(f'• Rutina de hoy: {", ".join(rutinas_hoy) if rutinas_hoy else "descanso"}.')

    plan = PlanDia.objects.filter(usuario=user, fecha=hoy).first()
    if plan and plan.comidas:
        pendientes = [f'{c["momento"]}: {c["nombre"]} ({c["calorias"]} kcal, {c["proteina"]} g prot)' for c in plan.comidas if not c.get('registrada')]
        if pendientes:
            lineas.append('• Plan de hoy pendiente: ' + '; '.join(pendientes))
    return '\n'.join(lineas)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def sesiones_chat(request):
    """GET lista de sesiones / POST crea sesión nueva."""
    if request.method == 'GET':
        sesiones = SesionChat.objects.filter(usuario=request.user)
        return Response(SesionChatSerializer(sesiones, many=True).data)

    sesion = SesionChat.objects.create(usuario=request.user)
    return Response(SesionChatSerializer(sesion).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'DELETE'])
@permission_classes([IsAuthenticated])
def sesion_chat_detalle(request, pk):
    """GET mensajes de una sesión / DELETE eliminar sesión."""
    try:
        sesion = SesionChat.objects.get(pk=pk, usuario=request.user)
    except SesionChat.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        sesion.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    return Response(SesionChatSerializer(sesion).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bruce_chat(request, pk):
    """
    Envía un mensaje a Bruce dentro de una sesión.
    Body: { mensaje: 'texto del usuario' }
    Devuelve: { mensaje_usuario, mensaje_bruce }
    """
    try:
        sesion = SesionChat.objects.get(pk=pk, usuario=request.user)
    except SesionChat.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    mensaje_usuario = request.data.get('mensaje', '').strip()
    if not mensaje_usuario:
        return Response({'error': 'Mensaje vacío'}, status=status.HTTP_400_BAD_REQUEST)

    # Contexto del día
    from datetime import timedelta
    hoy     = timezone.localdate()
    user    = request.user
    comidas = Comida.objects.filter(usuario=user, fecha=hoy)
    totales = {
        'calorias': sum(c.calorias for c in comidas),
        'proteina': round(sum(c.proteina for c in comidas), 1),
        'carbos':   round(sum(c.carbos   for c in comidas), 1),
        'grasas':   round(sum(c.grasas   for c in comidas), 1),
    }
    metas = {
        'calorias': user.meta_calorias,
        'proteina': user.meta_proteina,
        'carbos':   user.meta_carbos,
        'grasas':   user.meta_grasas,
    }
    sesion_gym  = SesionGym.objects.filter(usuario=user, fecha=hoy).first()
    fue_al_gym  = sesion_gym.completada if sesion_gym else False
    ultimo_peso = PesoCorporal.objects.filter(usuario=user).order_by('-fecha').first()

    racha_gym    = estadisticas.racha_gym(user, hoy)
    racha_comida = estadisticas.racha_comida(user, hoy)

    objetivo_texto = {
        'perder':   'perder grasa',
        'mantener': 'mantener peso',
        'ganar':    'ganar músculo',
    }.get(getattr(user, 'objetivo', 'mantener'), 'mantener peso')

    nombre = user.first_name or user.email.split('@')[0]

    pct_cal  = round((totales['calorias'] / metas['calorias']) * 100) if metas['calorias'] else 0
    pct_prot = round((totales['proteina'] / metas['proteina']) * 100) if metas['proteina'] else 0

    gustados      = ', '.join(getattr(user, 'alimentos_gustados',    None) or []) or 'variado'
    no_gustados   = ', '.join(getattr(user, 'alimentos_no_gustados', None) or []) or 'ninguno'
    restricciones = ', '.join(getattr(user, 'restricciones_dieta',   None) or []) or 'ninguna'
    peso_objetivo = f'{user.peso_objetivo_kg} kg' if getattr(user, 'peso_objetivo_kg', None) else 'no establecido'

    contexto_dia = f"""PERFIL DE {nombre.upper()}:
• Objetivo: {objetivo_texto}
• Peso actual: {f'{ultimo_peso.peso_kg} kg' if ultimo_peso else 'no registrado'} | Peso objetivo: {peso_objetivo}
• Alimentos que le gustan: {gustados}
• Alimentos que NO le gustan: {no_gustados}
• Restricciones dieta: {restricciones}
• ALERGIAS (peligroso: nunca, ni como ingrediente menor): {', '.join(user.alergias or []) or 'ninguna'}
• Metas: {metas['calorias']} kcal | {metas['proteina']}g prot | {metas['carbos']}g carbos | {metas['grasas']}g grasas

HOY ({hoy.strftime('%A %d de %B')}):
• Calorías: {totales['calorias']}/{metas['calorias']} kcal ({pct_cal}%)
• Proteína: {totales['proteina']}g/{metas['proteina']}g ({pct_prot}%)
• Carbos: {totales['carbos']}g/{metas['carbos']}g | Grasas: {totales['grasas']}g/{metas['grasas']}g
• FALTA HOY (ya calculado, úsalo tal cual): {max(metas['calorias'] - totales['calorias'], 0)} kcal y {max(round(metas['proteina'] - totales['proteina']), 0)} g de proteína
• Gym hoy: {'completó la sesión' if fue_al_gym else 'no fue'}
• Racha gym: {racha_gym} días | Racha registro comida: {racha_comida} días

{_contexto_semana(user, hoy)}"""

    # Historial de la sesión (últimos 20 mensajes)
    historial = MensajeChat.objects.filter(sesion=sesion).order_by('-creado_en')[:20]
    historial_groq = []
    for m in reversed(list(historial)):
        contenido = m.contenido
        for a in (m.acciones or []):
            if a.get('tipo') == 'comida_cambiada':
                contenido += f"\n[Cambié {a['antes']} por {a['comida']['nombre']} en el plan de {a['dia']}]"
            elif a.get('tipo') == 'plan_armado':
                contenido += f"\n[Armé el plan de {a['dia']}: {', '.join(c['nombre'] for c in a['comidas'])}]"
        historial_groq.append({
            'role':    'user'      if m.rol == 'user' else 'assistant',
            'content': contenido,
        })

    system_prompt = f"""Eres Bruce, el coach personal de {nombre}. Eres un dachshund salchicha con más disciplina que cualquier humano.

PERSONALIDAD:
- Directo y sin rodeos — dices lo que es, no lo que quieren escuchar.
- Sarcástico con cariño, como un parcero que te conoce bien.
- Hablas en español colombiano casual. Nada de formal.
- NUNCA usas emojis. NUNCA.
- No repites consejos genéricos — siempre basas tu respuesta en los números reales del usuario.
- Mira la semana, no solo hoy: si ves un patrón (poca proteína varios días, se salta el gym, el peso no se mueve), dilo con el número concreto.
- Usa los números del contexto tal como vienen; no recalcules porcentajes ni totales de la semana.

ESTILO DE RESPUESTA:
- Máximo 3-4 oraciones salvo que pidan más detalle, un plan o una receta.
- Sin preámbulos del tipo "Claro!" o "Buena pregunta!" — ve directo al punto.
- Texto plano: nada de markdown (sin ** ni #). Para listas usa guiones o números.
- Si te preguntan calorías, da número exacto con porción ("100g pechuga cocida = ~165 kcal, 31g prot").
- Si piden plan de comidas o entrenamiento: dalo completo y estructurado.
- Si piden una RECETA: da nombre, ingredientes con cantidades, pasos numerados cortos y macros totales al final. Usa SIEMPRE los alimentos que le gustan al usuario y respeta sus restricciones.

CONOCIMIENTO:
- Nutrición, macros, déficit/superávit calórico, timing de comidas, suplementación básica.
- Gym: técnica, volumen, progresión de cargas, descanso.
- Recetas colombianas saludables adaptadas a los macros del usuario.
- Si te preguntan algo fuera de fitness/nutrición: redirige con humor ("Eso no lo sé, soy perro entrenador, no abogado").

SEGURIDAD:
- Sus alergias, restricciones de dieta y lo que no le gusta se respetan siempre, sin excepción. Sin vegetales significa: nada de ensaladas ni verduras a la vista; sí frutas, legumbres y verduras escondidas en sopas, guisos o cremas.
- Si pregunta qué comer, propón comidas concretas con cantidades que cuadren con lo que le falta HOY; también puede pedirle el "Plan de Bruce" en la pestaña Comidas.
- Nada de diagnósticos ni dietas extremas: si menciona dolor, lesión, mareos o algo médico, recomiéndale ir a un profesional.

PLAN DEL DÍA (tienes herramientas):
- Si pide cambiar una comida del plan, armarle el plan de hoy o mañana, o pregunta qué le toca comer, USA las herramientas en vez de inventar un plan en texto. Se aplican de una vez y la persona puede deshacer.
- Después de usarlas, cuenta en 1-2 oraciones qué quedó y por qué sirve (ej. "lista en 10 minutos"). No repitas nombres largos ni la receta: la ve en una tarjeta debajo de tu mensaje. No digas si está registrada.
- Si una herramienta devuelve error, explícalo con tus palabras y ofrece otra salida.

{contexto_dia}"""

    messages = [{'role': 'system', 'content': system_prompt}]
    messages += historial_groq
    messages.append({'role': 'user', 'content': mensaje_usuario})

    acciones = []
    try:
        respuesta_bruce, _ = chat_plan.conversar(user, messages, _groq_mensaje, acciones)
        # Red de seguridad por si igual se cuela un bloque <think>
        respuesta_bruce = _THINK_RE.sub('', respuesta_bruce).replace('**', '').strip()
        if not respuesta_bruce:
            respuesta_bruce = chat_plan.resumen(acciones) if acciones else 'Parcero, me quedé en blanco. Pregúntame otra vez.'
    except Exception as e:
        logger.warning('bruce_chat_fail: %s', str(e)[:200])
        respuesta_bruce = (chat_plan.resumen(acciones) if acciones
                           else 'Parcero, tuve un problema técnico. Intenta de nuevo.')

    # Guardar ambos mensajes
    msg_user  = MensajeChat.objects.create(sesion=sesion, rol='user',  contenido=mensaje_usuario)
    msg_bruce = MensajeChat.objects.create(sesion=sesion, rol='bruce', contenido=respuesta_bruce, acciones=acciones)

    # Generar título de la sesión con el primer mensaje
    if not sesion.titulo:
        sesion.titulo = mensaje_usuario[:60]
        sesion.save(update_fields=['titulo'])

    return Response({
        'mensaje_usuario': MensajeChatSerializer(msg_user).data,
        'mensaje_bruce':   MensajeChatSerializer(msg_bruce).data,
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def progreso_completo(request):
    from datetime import timedelta
    hoy  = timezone.localdate()
    user = request.user

    # ── 30 días de actividad ──────────────────────────────────────────────
    inicio  = hoy - timedelta(days=29)
    totales = estadisticas.totales_por_dia(user, inicio, hoy)
    con_gym = estadisticas.dias_con_gym(user, inicio, hoy)
    dias = []
    for i in range(29, -1, -1):
        dia = hoy - timedelta(days=i)
        t   = totales.get(dia, {})
        dias.append({
            'fecha':    dia.isoformat(),
            'dia_sem':  dia.weekday(),
            'dia_abr':  dia.strftime('%a'),
            'calorias': t.get('calorias', 0),
            'proteina': t.get('proteina', 0),
            'gym':      dia in con_gym,
        })

    semana_actual   = dias[-7:]
    semana_anterior = dias[-14:-7]

    # ── Todos los pesos históricos ────────────────────────────────────────
    pesos_qs = PesoCorporal.objects.filter(usuario=user).order_by('fecha')
    pesos    = [{'fecha': p.fecha.isoformat(), 'peso_kg': p.peso_kg} for p in pesos_qs]

    # ── Proyección lineal de peso ─────────────────────────────────────────
    proyeccion = None
    # Tendencia en kg por DÍA (recta por los pesajes de las últimas 4 semanas),
    # no por pesaje: quien se pesa cada 5 días no debe ver la tendencia ×5
    from .gasto_real import _pendiente
    recientes = [p for p in pesos_qs if p.peso_kg and p.fecha >= hoy - timedelta(days=28)]
    if len(recientes) >= 2 and (recientes[-1].fecha - recientes[0].fecha).days >= 3:
        delta  = _pendiente([((p.fecha - recientes[0].fecha).days, p.peso_kg) for p in recientes])
        ultimo = recientes[-1].peso_kg
        peso_obj = user.peso_objetivo_kg

        proyeccion_puntos = []
        for d in range(1, 31):
            fecha_p = hoy + timedelta(days=d)
            peso_p  = round(ultimo + delta * d, 2)
            proyeccion_puntos.append({'fecha': fecha_p.isoformat(), 'peso_kg': peso_p})

        dias_objetivo = None
        if peso_obj and delta != 0:
            dias_falta = (peso_obj - ultimo) / delta
            if dias_falta > 0:
                dias_objetivo = round(dias_falta)

        proyeccion = {
            'puntos':              proyeccion_puntos,
            'tendencia_kg_semana': round(delta * 7, 2),
            'dias_para_objetivo':  dias_objetivo,
            'peso_objetivo':       peso_obj,
        }

    # ── Score semanal (0–100) ─────────────────────────────────────────────
    # El gym se mide contra los días que la persona planeó entrenar, no contra 7
    descanso       = estadisticas.dias_descanso(user)
    dias_planeados = max(7 - len(descanso), 1)
    meta_cal     = user.meta_calorias or 1900
    dias_s       = semana_actual
    dias_gym     = sum(1 for d in dias_s if d['gym'])
    dias_cal     = sum(1 for d in dias_s if d['calorias'] >= meta_cal * 0.8 and d['calorias'] <= meta_cal * 1.1)
    dias_activos = sum(1 for d in dias_s if d['calorias'] > 0 or d['gym'])
    pct_gym        = round(min(dias_gym / dias_planeados, 1) * 50)
    pct_cal        = round((dias_cal / 7) * 35)
    pct_constancia = round((dias_activos / 7) * 15)
    score = pct_gym + pct_cal + pct_constancia

    racha_gym    = estadisticas.racha_gym(user, hoy, descanso)
    racha_comida = estadisticas.racha_comida(user, hoy)

    # ── Logros desbloqueados ──────────────────────────────────────────────
    total_sesiones = SesionGym.objects.filter(usuario=user, completada=True).count()
    total_pesos    = len(pesos)
    peso_inicial   = user.peso_inicial_kg or (pesos[0]['peso_kg'] if pesos else None)
    peso_actual    = pesos[-1]['peso_kg'] if pesos else None
    kg_perdidos    = round(peso_inicial - peso_actual, 1) if peso_inicial and peso_actual and peso_inicial > peso_actual else 0
    kg_ganados     = round(peso_actual - peso_inicial, 1) if peso_inicial and peso_actual and peso_actual > peso_inicial else 0

    logros = []
    if total_sesiones >= 1:   logros.append({'id': 'primera_sesion', 'titulo': 'Primera sesion',    'desc': 'Empezaste el camino',        'color': '#4ade80'})
    if total_sesiones >= 10:  logros.append({'id': '10_sesiones',    'titulo': '10 sesiones',       'desc': 'La disciplina habla',        'color': '#60a5fa'})
    if total_sesiones >= 30:  logros.append({'id': '30_sesiones',    'titulo': '30 sesiones',       'desc': 'Un mes de consistencia',     'color': '#a78bfa'})
    if kg_perdidos >= 1:      logros.append({'id': '1kg_perdido',    'titulo': '-1 kg',             'desc': 'Primer kilogramo perdido',   'color': '#4ade80'})
    if kg_perdidos >= 5:      logros.append({'id': '5kg_perdidos',   'titulo': '-5 kg',             'desc': 'Transformacion en progreso', 'color': '#f97316'})
    if kg_ganados  >= 2:      logros.append({'id': '2kg_ganados',    'titulo': '+2 kg musculo',     'desc': 'El bulking va bien',         'color': '#60a5fa'})
    if total_pesos >= 7:      logros.append({'id': 'semana_pesaje',  'titulo': 'Semana de pesaje',  'desc': '7 registros de peso',        'color': '#fbbf24'})
    if score >= 80:           logros.append({'id': 'score_alto',     'titulo': 'Semana perfecta',   'desc': 'Score mayor a 80',           'color': '#4ade80'})

    return Response({
        'dias':             dias,
        'semana_actual':    semana_actual,
        'semana_anterior':  semana_anterior,
        'pesos':            pesos,
        'proyeccion':       proyeccion,
        'score_semanal':    score,
        'desglose_score': {
            'dias_gym':      dias_gym,
            'dias_cal':      dias_cal,
            'dias_activos':  dias_activos,
            'dias_planeados': dias_planeados,
            'pct_gym':       pct_gym,
            'pct_cal':       pct_cal,
            'pct_constancia': pct_constancia,
        },
        'racha_gym':        racha_gym,
        'racha_comida':     racha_comida,
        'logros':           logros,
        'metas': {
            'calorias': user.meta_calorias,
            'proteina': user.meta_proteina,
            'carbos':   user.meta_carbos,
            'grasas':   user.meta_grasas,
        },
        'objetivo':         user.objetivo,
        'peso_objetivo':    user.peso_objetivo_kg,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def historial_ejercicios(request):
    from collections import defaultdict
    user = request.user

    logs = (
        EjercicioLog.objects
        .filter(sesion__usuario=user, peso_kg__isnull=False)
        .select_related('sesion')
        .order_by('sesion__fecha')
    )

    por_ejercicio = defaultdict(lambda: {'musculo': '', 'registros': []})
    for log in logs:
        entry = por_ejercicio[log.nombre]
        entry['registros'].append({
            'fecha':   log.sesion.fecha.isoformat(),
            'peso_kg': log.peso_kg,
            'reps':    log.reps,
            'series':  log.series,
        })
        if log.musculo and not entry['musculo']:
            entry['musculo'] = log.musculo

    resultado = [
        {'nombre': nombre, 'musculo': data['musculo'], 'registros': data['registros']}
        for nombre, data in sorted(
            por_ejercicio.items(),
            key=lambda x: len(x[1]['registros']),
            reverse=True
        )
    ]

    return Response(resultado)


# ── Ejercicios personalizados del pool ──────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def ejercicios_personalizados(request):
    """
    GET: lista los ejercicios personalizados del usuario.
    POST: crea uno nuevo.
         Body: { nombre, musculo, series, reps, peso, color }
    """
    if request.method == 'GET':
        ejercicios = EjercicioPersonalizado.objects.filter(usuario=request.user)
        data = [
            {
                'nombre': e.nombre, 'musculo': e.musculo,
                'series': e.series, 'reps': e.reps, 'peso': e.peso,
                'color': e.color, 'custom': True,
            }
            for e in ejercicios
        ]
        return Response(data)

    nombre = request.data.get('nombre', '').strip()
    if not nombre:
        return Response({'error': 'Se requiere nombre'}, status=status.HTTP_400_BAD_REQUEST)

    series, error = _numero(request.data.get('series', 3), 1, 50, entero=True)
    if error:
        return Response({'error': f'series {error}'}, status=status.HTTP_400_BAD_REQUEST)
    color = str(request.data.get('color') or '#4ade80')
    if not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
        return Response({'error': 'color debe ser hexadecimal (#rrggbb)'}, status=status.HTTP_400_BAD_REQUEST)

    ejercicio = EjercicioPersonalizado.objects.create(
        usuario=request.user,
        nombre=nombre[:200],
        musculo=str(request.data.get('musculo') or 'Personalizado')[:100],
        series=series,
        reps=str(request.data.get('reps') or '10')[:50],
        peso=str(request.data.get('peso') or '—')[:50],
        color=color,
    )
    return Response({
        'nombre': ejercicio.nombre, 'musculo': ejercicio.musculo,
        'series': ejercicio.series, 'reps': ejercicio.reps, 'peso': ejercicio.peso,
        'color': ejercicio.color, 'custom': True,
    }, status=status.HTTP_201_CREATED)

# ──────────────────────────────────────────────
#  AGUA
# ──────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def agua(request):
    hoy  = timezone.localdate()
    user = request.user

    fecha = estadisticas.parsear_fecha(
        request.query_params.get('fecha') if request.method == 'GET' else request.data.get('fecha'), hoy)
    if fecha is None:
        return Response({'error': 'Formato de fecha inválido (YYYY-MM-DD)'}, status=400)

    if request.method == 'GET':
        registros = RegistroAgua.objects.filter(usuario=user, fecha=fecha)
        total_ml  = registros.aggregate(total=models.Sum('cantidad_ml'))['total'] or 0
        return Response({
            'fecha':    fecha.isoformat(),
            'total_ml': total_ml,
            'meta_ml':  user.meta_agua_ml(),
            'registros': [{'id': r.id, 'cantidad_ml': r.cantidad_ml} for r in registros],
        })

    cantidad_ml, error = _numero(request.data.get('cantidad_ml'), 1, 5000, entero=True)
    if error:
        return Response({'error': f'cantidad_ml {error}'}, status=400)

    registro = RegistroAgua.objects.create(usuario=user, fecha=fecha, cantidad_ml=cantidad_ml)
    total_ml  = RegistroAgua.objects.filter(usuario=user, fecha=fecha).aggregate(
        total=models.Sum('cantidad_ml')
    )['total'] or 0
    return Response({'id': registro.id, 'cantidad_ml': registro.cantidad_ml, 'total_ml': total_ml}, status=201)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def agua_detalle(request, pk):
    try:
        registro = RegistroAgua.objects.get(pk=pk, usuario=request.user)
        registro.delete()
        return Response(status=204)
    except RegistroAgua.DoesNotExist:
        return Response(status=404)


# ──────────────────────────────────────────────
#  HEALTH CHECK (UptimeRobot)
# ──────────────────────────────────────────────

@api_view(['GET', 'HEAD'])
@permission_classes([AllowAny])
def health(request):
    return Response({'status': 'ok', 'service': 'nutrifit-api'})
