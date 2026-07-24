import json
import re
import requests

from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    Comida, SesionGym, EjercicioLog, PesoCorporal, AlimentoAlacena,
    MensajeChat, SesionChat, RutinaDia, EjercicioPersonalizado
)
from .serializers import (
    ComidaSerializer, SesionGymSerializer,
    EjercicioLogSerializer, PesoCorporalSerializer,
    UsuarioSerializer, MetasSerializer, PerfilUpdateSerializer,
    AlimentoAlacenaSerializer, OnboardingSerializer, SesionChatSerializer, MensajeChatSerializer
)

User = get_user_model()


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


def _groq_chat(payload, timeout=30):
    """POST genérico a Groq chat completions. Devuelve el texto crudo del mensaje."""
    groq_url = 'https://api.groq.com/openai/v1/chat/completions'
    headers = {
        'Authorization': f'Bearer {settings.GROQ_API_KEY}',
        'Content-Type': 'application/json',
    }
    resp = requests.post(groq_url, headers=headers, json=payload, timeout=timeout)
    resp.raise_for_status()
    return resp.json()['choices'][0]['message']['content'].strip()


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
    from datetime import timedelta
    user = request.user
    hoy  = timezone.localdate()

    sesiones_totales = SesionGym.objects.filter(usuario=user).count()

    racha = 0
    dia   = hoy
    while SesionGym.objects.filter(usuario=user, fecha=dia).exists():
        racha += 1
        dia   -= timedelta(days=1)

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

    prompt = f"""Eres un nutricionista experto. Crea un plan de alimentación personalizado para este usuario colombiano:

PERFIL:
- Objetivo: {objetivo_texto}
- Calorías diarias meta: {user.meta_calorias} kcal
- Proteína diaria meta: {user.meta_proteina}g
- Carbohidratos diarios meta: {user.meta_carbos}g
- Grasas diarias meta: {user.meta_grasas}g
- Alimentos que le gustan: {gustados}
- Alimentos que NO le gustan: {no_gustados}
- Restricciones dietarias: {restricciones}

TAREA:
Genera una lista de 15 a 20 alimentos/preparaciones concretas y realistas que este usuario pueda comer frecuentemente. Deben ser alimentos colombianos o fácilmente conseguibles en Colombia. Incluye desayunos, almuerzos, cenas y snacks.

Responde ÚNICAMENTE con este JSON válido, sin texto adicional:
{{
  "plan_descripcion": "descripción breve del enfoque del plan en 2 oraciones",
  "alimentos": [
    {{
      "nombre": "nombre del alimento o preparación",
      "descripcion": "cantidad/porción típica, ej: 1 taza (200g)",
      "calorias": 000,
      "proteina": 00.0,
      "carbos": 00.0,
      "grasas": 00.0
    }}
  ]
}}"""

    payload = {
        'model': 'qwen/qwen3.6-27b',
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': 2500,
        'temperature': 0.4,
        'reasoning_effort': 'none',  # sin esto, Qwen antepone <think>...</think> y rompe el JSON
    }

    try:
        contenido = _groq_chat(payload, timeout=45)
        data = _extraer_json(contenido)
        return Response(data)
    except requests.RequestException as e:
        return Response({'error': f'Error Groq API: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)
    except json.JSONDecodeError:
        return Response({'error': 'Groq no devolvió JSON válido'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ──────────────────────────────────────────────
#  RESUMEN DIARIO (Home screen)
# ──────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def resumen_hoy(request):
    hoy     = timezone.localdate()
    comidas = Comida.objects.filter(usuario=request.user, fecha=hoy)

    totales = {
        'calorias': sum(c.calorias for c in comidas),
        'proteina': round(sum(c.proteina for c in comidas), 1),
        'carbos':   round(sum(c.carbos   for c in comidas), 1),
        'grasas':   round(sum(c.grasas   for c in comidas), 1),
    }

    user  = request.user
    metas = {
        'calorias': user.meta_calorias,
        'proteina': user.meta_proteina,
        'carbos':   user.meta_carbos,
        'grasas':   user.meta_grasas,
    }

    return Response({
        'fecha':   hoy.isoformat(),
        'totales': totales,
        'metas':   metas,
        'comidas': ComidaSerializer(comidas, many=True).data,
    })


# ──────────────────────────────────────────────
#  COMIDAS (Food screen)
# ──────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def comidas(request):
    if request.method == 'GET':
        fecha = request.query_params.get('fecha', timezone.localdate().isoformat())
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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sesion_de_hoy(request):
    hoy    = timezone.localdate()
    sesion = SesionGym.objects.filter(usuario=request.user, fecha=hoy).first()

    if not sesion:
        return Response({'rutina': '', 'completada': False, 'ejercicios': []})

    ejercicios = EjercicioLog.objects.filter(sesion=sesion)
    return Response({
        'rutina':     sesion.rutina,
        'completada': sesion.completada,
        'ejercicios': [
            {'nombre': e.nombre, 'series': e.series, 'reps': e.reps, 'peso_kg': e.peso_kg}
            for e in ejercicios
        ],
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sesion_por_fecha(request, fecha):
    from datetime import datetime
    try:
        fecha_obj = datetime.strptime(fecha, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return Response({'error': 'Formato de fecha inválido (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)

    sesion = SesionGym.objects.filter(usuario=request.user, fecha=fecha_obj).first()
    if not sesion:
        return Response({'rutina': '', 'completada': False, 'ejercicios': []})

    ejercicios = EjercicioLog.objects.filter(sesion=sesion)
    return Response({
        'rutina':     sesion.rutina,
        'completada': sesion.completada,
        'ejercicios': [
            {'nombre': e.nombre, 'series': e.series, 'reps': e.reps, 'peso_kg': e.peso_kg}
            for e in ejercicios
        ],
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def registrar_sesion(request):
    fecha = request.data.get('fecha', timezone.localdate().isoformat())
    sesion, _ = SesionGym.objects.update_or_create(
        usuario=request.user,
        fecha=fecha,
        defaults={
            'rutina':     request.data.get('rutina', 'R'),
            'completada': request.data.get('completada', False),
            'notas':      request.data.get('notas', ''),
        },
    )
    return Response(SesionGymSerializer(sesion).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def log_ejercicio(request):
    from datetime import datetime

    fecha = request.data.get('fecha')
    if fecha:
        try:
            fecha_obj = datetime.strptime(fecha, '%Y-%m-%d').date()
        except (ValueError, TypeError):
            return Response({'error': 'Formato de fecha inválido (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)
    else:
        fecha_obj = timezone.localdate()

    sesion, _ = SesionGym.objects.get_or_create(
        usuario=request.user,
        fecha=fecha_obj,
        defaults={'rutina': 'R', 'completada': False},
    )

    nombre = request.data.get('nombre')
    if not nombre:
        return Response({'error': 'Campo "nombre" requerido'}, status=status.HTTP_400_BAD_REQUEST)

    ejercicio, created = EjercicioLog.objects.update_or_create(
        sesion=sesion,
        nombre=nombre,
        defaults={
            'series':  request.data.get('series'),
            'reps':    request.data.get('reps'),
            'peso_kg': request.data.get('peso_kg'),
        },
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

    calorias_semana = []
    for i in range(6, -1, -1):
        dia         = hoy - timedelta(days=i)
        comidas_dia = Comida.objects.filter(usuario=user, fecha=dia)
        total_cal   = sum(c.calorias for c in comidas_dia)
        hubo_gym    = SesionGym.objects.filter(usuario=user, fecha=dia, completada=True).exists()

        calorias_semana.append({
            'fecha':    dia.isoformat(),
            'dia':      dia.strftime('%a'),
            'calorias': total_cal,
            'gym':      hubo_gym,
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
    if serializer.is_valid():
        peso, _ = PesoCorporal.objects.update_or_create(
            usuario=request.user,
            fecha=request.data.get('fecha', timezone.localdate().isoformat()),
            defaults={'peso_kg': request.data['peso_kg']},
        )
        return Response(PesoCorporalSerializer(peso).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


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

    porciones = float(request.data.get('porciones', 1))
    fecha     = request.data.get('fecha', timezone.localdate().isoformat())

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

    calorias_hoy  = request.data.get('calorias_hoy', 0)
    meta_calorias = request.data.get('meta_calorias', 1900)
    proteina_hoy  = request.data.get('proteina_hoy', 0)
    meta_proteina = request.data.get('meta_proteina', 140)
    fue_al_gym    = request.data.get('fue_al_gym', False)
    es_dia_gym    = request.data.get('es_dia_gym', True)
    hora          = request.data.get('hora', 12)

    pct_calorias  = round((calorias_hoy / meta_calorias) * 100) if meta_calorias else 0
    pct_proteina  = round((proteina_hoy / meta_proteina) * 100) if meta_proteina else 0

    if hora < 12:   momento = 'mañana'
    elif hora < 18: momento = 'tarde'
    else:           momento = 'noche'

    if pct_calorias >= 95 and (fue_al_gym or not es_dia_gym):
        pose = 'muyfeliz'
    elif pct_calorias >= 70 and fue_al_gym:
        pose = 'sonrisa'
    elif pct_calorias < 30 and hora >= 18:
        pose = 'triste'
    elif not fue_al_gym and es_dia_gym and hora >= 16:
        pose = 'determinado'
    elif pct_calorias >= 40 and pct_calorias < 80:
        pose = 'pensando'
    else:
        pose = 'normal'

    contexto = f"""
- Hora del día: {momento} ({hora}h)
- Calorías consumidas: {calorias_hoy} de {meta_calorias} kcal ({pct_calorias}%)
- Proteína consumida: {proteina_hoy}g de {meta_proteina}g ({pct_proteina}%)
- ¿Es día de gym?: {'Sí' if es_dia_gym else 'No, es día de descanso'}
- ¿Fue al gym hoy?: {'Sí, ya entrenó' if fue_al_gym else ('No ha ido aún' if es_dia_gym else 'No aplica, es descanso')}
"""

    prompt = f"""Eres Bruce, un dachshund miniatura con personalidad de entrenador personal de élite.
Eres directo, motivador, a veces sarcástico pero siempre con cariño. Hablas como un coach real, no como un bot.
NUNCA uses emojis. Máximo 2 oraciones cortas. En español colombiano casual.
NUNCA menciones el gym si es día de descanso.
Si es día de descanso: habla solo de nutrición, recuperación o descanso activo.
Si cumplió todo: celebra con actitud, no con exageración.
Si le falta comer: motívalo sin ser condescendiente.

Contexto de hoy:
{contexto}

Genera UNA frase personalizada basada en ese contexto. Solo la frase, sin comillas, sin explicaciones."""

    payload = {
        'model':            'qwen/qwen3.6-27b',
        'messages':         [{'role': 'user', 'content': prompt}],
        'max_tokens':       80,
        'temperature':      0.85,
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
    """Busca información nutricional real en internet via Groq con web search."""
    payload = {
        'model': 'qwen/qwen3.6-27b',
        'messages': [{
            'role': 'user',
            'content': f"""Busca la información nutricional real de: {nombre_alimento}

Responde ÚNICAMENTE con JSON válido:
{{
  "encontrado": true/false,
  "fuente": "nombre del sitio o fuente",
  "calorias": 000,
  "proteina": 00.0,
  "carbos": 00.0,
  "grasas": 00.0,
  "porcion": "descripción de la porción encontrada"
}}

Si no encuentras información confiable, usa encontrado: false y estima los valores."""
        }],
        'tools': [{
            'type': 'function',
            'function': {
                'name': 'web_search',
                'description': 'Search the web for nutritional information',
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'query': {'type': 'string'}
                    },
                    'required': ['query']
                }
            }
        }],
        'max_tokens':       400,
        'temperature':      0.1,
        'reasoning_effort': 'none',
    }

    try:
        contenido = _groq_chat(payload, timeout=20)
        return _extraer_json(contenido)
    except Exception:
        return {'encontrado': False}


# ── Analizar foto de plato ────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def analizar_foto(request):
    imagen_b64  = request.data.get('imagen')
    correccion  = request.data.get('correccion', '').strip()
    nombre_prev = request.data.get('nombre_anterior', '').strip()

    if not imagen_b64:
        return Response({'error': 'Se requiere campo "imagen"'}, status=status.HTTP_400_BAD_REQUEST)

    # Si viene corrección, primero buscar en internet
    info_web = None
    if correccion:
        info_web = _buscar_info_nutricional(correccion)

    if correccion and nombre_prev:
        prompt = f"""Analizaste una foto de comida y la identificaste como "{nombre_prev}".
El usuario dice que en realidad es: "{correccion}".

{'Información nutricional encontrada en internet: ' + json.dumps(info_web, ensure_ascii=False) if info_web and info_web.get('encontrado') else 'No se encontró información en internet, estima basado en el nombre.'}

Corrige el análisis y responde ÚNICAMENTE con JSON válido, sin texto adicional antes ni después, sin explicar tu razonamiento:
{{
  "nombre": "nombre corregido del plato",
  "calorias": 000,
  "proteina": 00.0,
  "carbos": 00.0,
  "grasas": 00.0,
  "confianza": "alta|media|baja",
  "descripcion": "descripción corregida",
  "fuente": "internet|estimacion"
}}"""
    else:
        prompt = """Analiza esta foto de comida. Si puedes identificar claramente el plato,
responde ÚNICAMENTE con JSON válido, sin texto adicional antes ni después, sin explicar tu razonamiento:
{
  "nombre": "nombre del plato en español",
  "calorias": 000,
  "proteina": 00.0,
  "carbos": 00.0,
  "grasas": 00.0,
  "confianza": "alta|media|baja",
  "descripcion": "descripción breve",
  "fuente": "estimacion"
}
Estima porciones promedio colombianas. Si no puedes identificar, usa confianza "baja"."""

    messages = [{'role': 'user', 'content': [
        {'type': 'text', 'text': prompt},
        {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{imagen_b64}'}},
    ]}]

    payload = {
        'model':            'qwen/qwen3.6-27b',
        'messages':         messages,
        'max_tokens':       500,
        'temperature':      0.1,
        'reasoning_effort': 'none',  # clave: sin esto el modelo antepone <think> y rompe el parseo
    }

    try:
        contenido = _groq_chat(payload, timeout=30)
        data = _extraer_json(contenido)
        return Response(data)
    except requests.RequestException as e:
        return Response({'error': f'Error Groq: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)
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
        prompt = f"""Leíste una etiqueta nutricional y la identificaste como "{nombre_prev}".
El usuario dice que en realidad es: "{correccion}".

{'Información nutricional encontrada en internet: ' + json.dumps(info_web, ensure_ascii=False) if info_web and info_web.get('encontrado') else 'Estima basado en el nombre del producto.'}

Corrige y responde ÚNICAMENTE con JSON válido, sin texto adicional antes ni después, sin explicar tu razonamiento:
{{
  "nombre": "nombre corregido del producto",
  "descripcion": "tamaño de porción",
  "calorias": 000,
  "proteina": 00.0,
  "carbos": 00.0,
  "grasas": 00.0,
  "confianza": "alta|media|baja",
  "fuente": "internet|estimacion"
}}"""
    else:
        prompt = """Analiza esta etiqueta nutricional y responde ÚNICAMENTE con JSON válido, sin texto adicional antes ni después, sin explicar tu razonamiento:
{
  "nombre": "nombre del producto",
  "descripcion": "tamaño de porción tal como aparece en la etiqueta",
  "calorias": 000,
  "proteina": 00.0,
  "carbos": 00.0,
  "grasas": 00.0,
  "confianza": "alta|media|baja",
  "fuente": "etiqueta"
}
IMPORTANTE: usa los valores POR PORCIÓN. Si no puedes leer algún valor usa 0."""

    messages = [{'role': 'user', 'content': [
        {'type': 'text', 'text': prompt},
        {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{imagen_b64}'}},
    ]}]

    payload = {
        'model':            'qwen/qwen3.6-27b',
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
        return Response({'error': f'Error Groq: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)
    except json.JSONDecodeError:
        return Response({'error': 'Groq no devolvió JSON válido'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── Chat con Bruce ────────────────────────────────────────────────────────

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
    hoy     = timezone.localdate()
    comidas = Comida.objects.filter(usuario=request.user, fecha=hoy)
    totales = {
        'calorias': sum(c.calorias for c in comidas),
        'proteina': round(sum(c.proteina for c in comidas), 1),
        'carbos':   round(sum(c.carbos   for c in comidas), 1),
        'grasas':   round(sum(c.grasas   for c in comidas), 1),
    }
    metas = {
        'calorias': request.user.meta_calorias,
        'proteina': request.user.meta_proteina,
        'carbos':   request.user.meta_carbos,
        'grasas':   request.user.meta_grasas,
    }
    sesion_gym = SesionGym.objects.filter(usuario=request.user, fecha=hoy).first()
    fue_al_gym = sesion_gym.completada if sesion_gym else False
    ultimo_peso = PesoCorporal.objects.filter(usuario=request.user).first()

    contexto_dia = f"""
Contexto del usuario hoy ({hoy.strftime('%A %d de %B')}):
- Calorías: {totales['calorias']} / {metas['calorias']} kcal
- Proteína: {totales['proteina']}g / {metas['proteina']}g
- Carbos: {totales['carbos']}g / {metas['carbos']}g
- Grasas: {totales['grasas']}g / {metas['grasas']}g
- Gym hoy: {'Sí, completó la sesión' if fue_al_gym else 'No'}
- Peso actual: {ultimo_peso.peso_kg if ultimo_peso else 'No registrado'} kg
- Nombre del usuario: {request.user.first_name or request.user.email}
"""

    # Historial de la sesión (últimos 20 mensajes)
    historial = MensajeChat.objects.filter(sesion=sesion).order_by('-creado_en')[:20]
    historial_groq = []
    for m in reversed(list(historial)):
        historial_groq.append({
            'role':    'user'      if m.rol == 'user' else 'assistant',
            'content': m.contenido,
        })

    system_prompt = f"""Eres Bruce, un dachshund miniatura con personalidad de entrenador personal de élite.
Eres directo, motivador, a veces sarcástico pero siempre con cariño. Hablas como un coach real, no como un bot.
Nunca uses emojis. Respuestas cortas y directas — máximo 3 oraciones salvo que el usuario pida más detalle.
En español colombiano casual. Puedes buscar información nutricional si te la piden.
Si te preguntan cuántas calorías tiene algo, da un número concreto con contexto de porción.

{contexto_dia}"""

    messages = [{'role': 'system', 'content': system_prompt}]
    messages += historial_groq
    messages.append({'role': 'user', 'content': mensaje_usuario})

    payload = {
        'model':            'qwen/qwen3.6-27b',
        'messages':         messages,
        'max_tokens':       300,
        'temperature':      0.8,
        'reasoning_format': 'hidden',  # deja pensar al modelo pero oculta el <think> del output
    }

    try:
        respuesta_bruce = _groq_chat(payload, timeout=20)
        # Red de seguridad por si igual se cuela un bloque <think>
        respuesta_bruce = _THINK_RE.sub('', respuesta_bruce).strip()
    except Exception:
        respuesta_bruce = 'Parcero, tuve un problema técnico. Intenta de nuevo.'

    # Guardar ambos mensajes
    msg_user  = MensajeChat.objects.create(sesion=sesion, rol='user',  contenido=mensaje_usuario)
    msg_bruce = MensajeChat.objects.create(sesion=sesion, rol='bruce', contenido=respuesta_bruce)

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
    dias = []
    for i in range(29, -1, -1):
        dia         = hoy - timedelta(days=i)
        comidas_dia = Comida.objects.filter(usuario=user, fecha=dia)
        total_cal   = sum(c.calorias for c in comidas_dia)
        total_prot  = round(sum(c.proteina for c in comidas_dia), 1)
        hubo_gym    = SesionGym.objects.filter(usuario=user, fecha=dia, completada=True).exists()
        dias.append({
            'fecha':    dia.isoformat(),
            'dia_sem':  dia.weekday(),
            'dia_abr':  dia.strftime('%a'),
            'calorias': total_cal,
            'proteina': total_prot,
            'gym':      hubo_gym,
        })

    semana_actual   = dias[-7:]
    semana_anterior = dias[-14:-7]

    # ── Todos los pesos históricos ────────────────────────────────────────
    pesos_qs = PesoCorporal.objects.filter(usuario=user).order_by('fecha')
    pesos    = [{'fecha': p.fecha.isoformat(), 'peso_kg': p.peso_kg} for p in pesos_qs]

    # ── Proyección lineal de peso ─────────────────────────────────────────
    proyeccion = None
    pesos_recientes = [p for p in pesos if p['peso_kg']][-14:]
    if len(pesos_recientes) >= 2:
        n      = len(pesos_recientes)
        delta  = (pesos_recientes[-1]['peso_kg'] - pesos_recientes[0]['peso_kg']) / max(n - 1, 1)
        ultimo = pesos_recientes[-1]['peso_kg']
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
    meta_cal     = user.meta_calorias or 1900
    dias_s       = semana_actual
    dias_gym     = sum(1 for d in dias_s if d['gym'])
    dias_cal     = sum(1 for d in dias_s if d['calorias'] >= meta_cal * 0.8 and d['calorias'] <= meta_cal * 1.1)
    dias_activos = sum(1 for d in dias_s if d['calorias'] > 0 or d['gym'])
    score = round(
        (dias_gym / 7)     * 50 +
        (dias_cal / 7)     * 35 +
        (dias_activos / 7) * 15
    )

    # ── Racha real (hacia atrás desde hoy sin límite de 7 días) ──────────
    racha_gym    = 0
    racha_comida = 0
    dia_check    = hoy

    while True:
        existe = SesionGym.objects.filter(
            usuario=user, fecha=dia_check, completada=True
        ).exists()
        if not existe:
            break
        racha_gym += 1
        dia_check -= timedelta(days=1)

    dia_check = hoy
    while True:
        tiene_comida = Comida.objects.filter(usuario=user, fecha=dia_check).exists()
        if not tiene_comida:
            break
        racha_comida += 1
        dia_check -= timedelta(days=1)

    # ── Logros desbloqueados ──────────────────────────────────────────────
    total_sesiones = SesionGym.objects.filter(usuario=user).count()
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
            'pct_gym':       round((dias_gym / 7) * 50),
            'pct_cal':       round((dias_cal / 7) * 35),
            'pct_constancia': round((dias_activos / 7) * 15),
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

    por_ejercicio = defaultdict(list)
    for log in logs:
        por_ejercicio[log.nombre].append({
            'fecha':   log.sesion.fecha.isoformat(),
            'peso_kg': log.peso_kg,
            'reps':    log.reps,
            'series':  log.series,
        })

    resultado = [
        {'nombre': nombre, 'registros': registros}
        for nombre, registros in sorted(
            por_ejercicio.items(),
            key=lambda x: len(x[1]),
            reverse=True
        )
    ]

    return Response(resultado)


# ── Rutinas personalizadas por día ──────────────────────────────────────────

@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def rutinas_dia(request):
    """
    GET: devuelve todas las rutinas del usuario, indexadas por dia_semana.
    PUT: guarda/actualiza UNA rutina de un día.
         Body: { dia_semana: 0, nombre, rutina_id, emoji, ejercicios }
    """
    if request.method == 'GET':
        rutinas = RutinaDia.objects.filter(usuario=request.user)
        data = {
            str(r.dia_semana): {
                'nombre': r.nombre,
                'rutina_id': r.rutina_id,
                'emoji': r.emoji,
                'ejercicios': r.ejercicios,
            }
            for r in rutinas
        }
        return Response(data)

    dia_semana = request.data.get('dia_semana')
    if dia_semana is None:
        return Response({'error': 'Se requiere dia_semana'}, status=status.HTTP_400_BAD_REQUEST)

    nombre     = request.data.get('nombre', '')
    rutina_id  = request.data.get('rutina_id', 'A')
    emoji      = request.data.get('emoji', '💪')
    ejercicios = request.data.get('ejercicios', [])

    rutina, _ = RutinaDia.objects.update_or_create(
        usuario=request.user, dia_semana=dia_semana,
        defaults={
            'nombre': nombre,
            'rutina_id': rutina_id,
            'emoji': emoji,
            'ejercicios': ejercicios,
        },
    )
    return Response({
        'nombre': rutina.nombre,
        'rutina_id': rutina.rutina_id,
        'emoji': rutina.emoji,
        'ejercicios': rutina.ejercicios,
    })


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

    ejercicio = EjercicioPersonalizado.objects.create(
        usuario=request.user,
        nombre=nombre,
        musculo=request.data.get('musculo', 'Personalizado'),
        series=request.data.get('series', 3),
        reps=request.data.get('reps', '10'),
        peso=request.data.get('peso', '—'),
        color=request.data.get('color', '#4ade80'),
    )
    return Response({
        'nombre': ejercicio.nombre, 'musculo': ejercicio.musculo,
        'series': ejercicio.series, 'reps': ejercicio.reps, 'peso': ejercicio.peso,
        'color': ejercicio.color, 'custom': True,
    }, status=status.HTTP_201_CREATED)