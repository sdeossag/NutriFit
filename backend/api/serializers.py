import base64
import io

from PIL import Image, ImageOps
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Comida, SesionGym, EjercicioLog, PesoCorporal, AlimentoAlacena, MensajeChat, SesionChat

User = get_user_model()


# ──────────────────────────────────────────────
#  USUARIO
# ──────────────────────────────────────────────

class UsuarioSerializer(serializers.ModelSerializer):
    avatar_display = serializers.SerializerMethodField()
    edad           = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            'id', 'email', 'first_name', 'last_name',
            'avatar_url', 'avatar_display',
            'bio', 'idioma',
            # Metas
            'meta_calorias', 'meta_proteina', 'meta_carbos', 'meta_grasas',
            # Datos físicos
            'sexo', 'fecha_nacimiento', 'edad', 'estatura_cm',
            'peso_inicial_kg', 'peso_objetivo_kg',
            # Objetivo
            'objetivo', 'velocidad_objetivo', 'nivel_actividad',
            # Preferencias
            'alimentos_gustados', 'alimentos_no_gustados', 'restricciones_dieta', 'alergias',
            # Control
            'onboarding_completo',
            'date_joined',
        ]
        read_only_fields = ['id', 'email', 'date_joined', 'avatar_display', 'edad']

    def get_avatar_display(self, obj):
        return obj.get_avatar()

    def get_edad(self, obj):
        return obj.get_edad()


class MetasSerializer(serializers.ModelSerializer):
    class Meta:
        model  = User
        fields = ['meta_calorias', 'meta_proteina', 'meta_carbos', 'meta_grasas']


def _avatar_a_data_url(archivo, lado=256):
    """Endereza, recorta al centro en cuadrado y reduce la foto de perfil."""
    archivo.seek(0)
    img = ImageOps.exif_transpose(Image.open(archivo)).convert('RGB')
    img = ImageOps.fit(img, (lado, lado), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=85, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


class PerfilUpdateSerializer(serializers.ModelSerializer):
    # La foto llega como archivo pero se guarda en la base de datos (avatar_data)
    avatar = serializers.ImageField(write_only=True, required=False)

    class Meta:
        model  = User
        fields = ['first_name', 'last_name', 'bio', 'idioma', 'avatar']

    def update(self, instance, validated_data):
        foto = validated_data.pop('avatar', None)
        if foto is not None:
            instance.avatar_data = _avatar_a_data_url(foto)
        return super().update(instance, validated_data)


RESTRICCIONES_VALIDAS = {'vegetariano', 'vegano', 'sin_gluten', 'sin_lacteos', 'sin_cerdo', 'halal', 'sin_vegetales'}


def _lista_de_alimentos(valor):
    """Lista de textos cortos, sin vacíos ni repetidos (sin importar mayúsculas)."""
    if not isinstance(valor, list) or len(valor) > 60:
        raise serializers.ValidationError('Debe ser una lista de máximo 60 alimentos.')
    limpios, vistos = [], set()
    for item in valor:
        texto = str(item).strip()[:40]
        if texto and texto.lower() not in vistos:
            vistos.add(texto.lower())
            limpios.append(texto)
    return limpios


class PreferenciasSerializer(serializers.ModelSerializer):
    """Gustos, lo que no le gusta, restricciones y alergias (Ajustes → Alimentación)."""
    class Meta:
        model  = User
        fields = ['alimentos_gustados', 'alimentos_no_gustados', 'restricciones_dieta', 'alergias']

    def validate_alimentos_gustados(self, v):
        return _lista_de_alimentos(v)

    def validate_alimentos_no_gustados(self, v):
        return _lista_de_alimentos(v)

    def validate_alergias(self, v):
        return _lista_de_alimentos(v)

    def validate_restricciones_dieta(self, v):
        if not isinstance(v, list) or any(r not in RESTRICCIONES_VALIDAS for r in v):
            raise serializers.ValidationError('Restricción no válida.')
        return list(dict.fromkeys(v))

    def validate(self, datos):
        # Lo que se marca como alergia o "no me gusta" no puede quedar en "me gusta"
        gustos = datos.get('alimentos_gustados', self.instance.alimentos_gustados or [])
        evitar = {x.lower() for x in datos.get('alimentos_no_gustados', self.instance.alimentos_no_gustados or [])}
        evitar |= {x.lower() for x in datos.get('alergias', self.instance.alergias or [])}
        if any(g.lower() in evitar for g in gustos):
            datos['alimentos_gustados'] = [g for g in gustos if g.lower() not in evitar]
        return datos


class ObjetivoSerializer(serializers.ModelSerializer):
    """
    Edita objetivo, velocidad, datos físicos y nivel de actividad.
    Al guardar recalcula las metas automáticamente.
    """
    class Meta:
        model  = User
        fields = [
            'objetivo', 'velocidad_objetivo', 'nivel_actividad',
            'estatura_cm', 'peso_inicial_kg', 'peso_objetivo_kg',
        ]

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        instance.calcular_metas()
        return instance


class OnboardingSerializer(serializers.ModelSerializer):
    """
    Recibe todos los datos del onboarding en un solo PATCH.
    Al guardar, llama a calcular_metas() automáticamente.
    """
    class Meta:
        model  = User
        fields = [
            'sexo', 'fecha_nacimiento', 'estatura_cm',
            'peso_inicial_kg', 'peso_objetivo_kg',
            'objetivo', 'velocidad_objetivo', 'nivel_actividad',
            'alimentos_gustados', 'alimentos_no_gustados', 'restricciones_dieta',
        ]

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        # Calcula y guarda metas automáticamente
        instance.calcular_metas()
        return instance


# ──────────────────────────────────────────────
#  COMIDAS
# ──────────────────────────────────────────────

class ComidaSerializer(serializers.ModelSerializer):
    calorias = serializers.IntegerField(min_value=0, max_value=10000, required=False)
    proteina = serializers.FloatField(min_value=0, max_value=1000, required=False)
    carbos   = serializers.FloatField(min_value=0, max_value=1000, required=False)
    grasas   = serializers.FloatField(min_value=0, max_value=1000, required=False)

    class Meta:
        model  = Comida
        fields = '__all__'
        read_only_fields = ['usuario']


# ──────────────────────────────────────────────
#  GYM
# ──────────────────────────────────────────────

class EjercicioLogSerializer(serializers.ModelSerializer):
    class Meta:
        model  = EjercicioLog
        fields = '__all__'


class SesionGymSerializer(serializers.ModelSerializer):
    ejercicios = EjercicioLogSerializer(many=True, read_only=True)

    class Meta:
        model  = SesionGym
        fields = '__all__'
        read_only_fields = ['usuario']


# ──────────────────────────────────────────────
#  PROGRESO
# ──────────────────────────────────────────────

class PesoCorporalSerializer(serializers.ModelSerializer):
    peso_kg = serializers.FloatField(min_value=20, max_value=400)

    class Meta:
        model  = PesoCorporal
        fields = '__all__'
        read_only_fields = ['usuario']
        # La unicidad (usuario, fecha) la resuelve la vista con update_or_create
        validators = []


# ──────────────────────────────────────────────
#  ALACENA
# ──────────────────────────────────────────────

class AlimentoAlacenaSerializer(serializers.ModelSerializer):
    class Meta:
        model  = AlimentoAlacena
        fields = '__all__'
        read_only_fields = ['usuario', 'veces_usado', 'creado_en', 'actualizado']


class MensajeChatSerializer(serializers.ModelSerializer):
    class Meta:
        model  = MensajeChat
        fields = ['id', 'rol', 'contenido', 'creado_en']

class SesionChatSerializer(serializers.ModelSerializer):
    mensajes = MensajeChatSerializer(many=True, read_only=True)
    class Meta:
        model  = SesionChat
        fields = ['id', 'titulo', 'creado_en', 'activa', 'mensajes']