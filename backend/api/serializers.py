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
            'avatar', 'avatar_url', 'avatar_display',
            'bio', 'idioma',
            # Metas
            'meta_calorias', 'meta_proteina', 'meta_carbos', 'meta_grasas',
            # Datos físicos
            'sexo', 'fecha_nacimiento', 'edad', 'estatura_cm',
            'peso_inicial_kg', 'peso_objetivo_kg',
            # Objetivo
            'objetivo', 'velocidad_objetivo', 'nivel_actividad',
            # Preferencias
            'alimentos_gustados', 'alimentos_no_gustados', 'restricciones_dieta',
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


class PerfilUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = User
        fields = ['first_name', 'last_name', 'bio', 'idioma', 'avatar']


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
    class Meta:
        model  = PesoCorporal
        fields = '__all__'
        read_only_fields = ['usuario']


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