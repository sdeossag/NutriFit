import base64
import io

from PIL import Image, ImageOps
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from .models import Comida, SesionGym, EjercicioLog, PesoCorporal, AlimentoAlacena, IngredientePlato, MensajeChat, SesionChat

User = get_user_model()


# ──────────────────────────────────────────────
#  USUARIO
# ──────────────────────────────────────────────

class UsuarioSerializer(serializers.ModelSerializer):
    avatar_display = serializers.SerializerMethodField()
    edad           = serializers.SerializerMethodField()
    # Cómo salieron las calorías (gasto, mínimo seguro y si se tuvo que aplicar)
    calculo_metas  = serializers.SerializerMethodField()
    peso_actual    = serializers.SerializerMethodField()
    meta_agua_ml   = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            'id', 'email', 'first_name', 'last_name',
            'avatar_url', 'avatar_display',
            'bio', 'idioma',
            # Metas
            'meta_calorias', 'meta_proteina', 'meta_carbos', 'meta_grasas', 'calculo_metas',
            'meta_agua_ml', 'metas_manuales',
            # Datos físicos
            'sexo', 'fecha_nacimiento', 'edad', 'estatura_cm',
            'peso_inicial_kg', 'peso_actual', 'peso_objetivo_kg',
            # Objetivo
            'objetivo', 'velocidad_objetivo', 'nivel_actividad',
            # Preferencias
            'alimentos_gustados', 'alimentos_no_gustados', 'restricciones_dieta', 'alergias', 'lesiones',
            # Control
            'onboarding_completo',
            'date_joined',
        ]
        read_only_fields = ['id', 'email', 'date_joined', 'avatar_display', 'edad']

    def get_avatar_display(self, obj):
        return obj.get_avatar()

    def get_edad(self, obj):
        return obj.get_edad()

    def get_calculo_metas(self, obj):
        return obj.calculo_metas()

    def get_peso_actual(self, obj):
        return obj.peso_actual()

    def get_meta_agua_ml(self, obj):
        return obj.meta_agua_ml()


class MetasSerializer(serializers.ModelSerializer):
    # Metas editadas a mano: mismos límites que en la app, también si llega por la API
    meta_calorias = serializers.IntegerField(min_value=1200, max_value=6000)
    meta_proteina = serializers.IntegerField(min_value=20, max_value=400)
    meta_carbos   = serializers.IntegerField(min_value=0, max_value=900)
    meta_grasas   = serializers.IntegerField(min_value=20, max_value=300)

    class Meta:
        model  = User
        fields = ['meta_calorias', 'meta_proteina', 'meta_carbos', 'meta_grasas']

    def update(self, instance, validated_data):
        # Si las ajusta a mano, cambiar de peso ya no las recalcula solas
        instance.metas_manuales = True
        return super().update(instance, validated_data)


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
        fields = ['alimentos_gustados', 'alimentos_no_gustados', 'restricciones_dieta', 'alergias', 'lesiones']

    def validate_lesiones(self, v):
        v = str(v or '').strip()
        if len(v) > 600:
            raise serializers.ValidationError('Máximo 600 caracteres.')
        return v

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
    # El peso de hoy: queda en el historial, que es de donde sale el cálculo
    peso_actual = serializers.FloatField(min_value=30, max_value=300, required=False, write_only=True)

    class Meta:
        model  = User
        fields = [
            'objetivo', 'velocidad_objetivo', 'nivel_actividad',
            'estatura_cm', 'peso_inicial_kg', 'peso_actual', 'peso_objetivo_kg',
        ]

    def update(self, instance, validated_data):
        peso = validated_data.pop('peso_actual', None)
        if peso and peso != instance.peso_actual():
            PesoCorporal.objects.update_or_create(
                usuario=instance, fecha=timezone.localdate(), defaults={'peso_kg': peso},
            )
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

class IngredienteEntradaSerializer(serializers.Serializer):
    alimento  = serializers.IntegerField()
    porciones = serializers.FloatField(min_value=0.1, max_value=20)


MACROS_ALACENA = ('calorias', 'proteina', 'carbos', 'grasas')


class AlimentoAlacenaSerializer(serializers.ModelSerializer):
    # Solo para platos: [{alimento: id, porciones}]. Los macros del plato se
    # calculan en el servidor con los de cada ingrediente.
    ingredientes = IngredienteEntradaSerializer(many=True, required=False, write_only=True)

    class Meta:
        model  = AlimentoAlacena
        fields = '__all__'
        read_only_fields = ['usuario', 'veces_usado', 'creado_en', 'actualizado', 'es_plato']

    def to_representation(self, obj):
        data = super().to_representation(obj)
        data['ingredientes'] = [
            {'alimento': i.alimento_id, 'nombre': i.alimento.nombre, 'porciones': i.porciones}
            for i in obj.ingredientes.all()
        ] if obj.es_plato else []
        return data

    def validate_ingredientes(self, value):
        if not value:
            raise serializers.ValidationError('Un plato necesita al menos un ingrediente.')
        if len(value) > 20:
            raise serializers.ValidationError('Máximo 20 ingredientes por plato.')
        ids = [i['alimento'] for i in value]
        if len(set(ids)) != len(ids):
            raise serializers.ValidationError('Hay un ingrediente repetido.')
        if self.instance is not None and self.instance.pk in ids:
            raise serializers.ValidationError('Un plato no puede llevarse a sí mismo.')
        validos = AlimentoAlacena.objects.filter(
            usuario=self.context['request'].user, pk__in=ids, es_plato=False
        ).count()
        if validos != len(ids):
            raise serializers.ValidationError('Algún ingrediente ya no está en tu alacena o es otro plato.')
        return value

    def validate(self, attrs):
        if self.instance is not None and 'ingredientes' in attrs and not self.instance.es_plato:
            raise serializers.ValidationError({'ingredientes': 'Este alimento no es un plato.'})
        return attrs

    @staticmethod
    def _poner_ingredientes(plato, ingredientes):
        plato.ingredientes.all().delete()
        IngredientePlato.objects.bulk_create([
            IngredientePlato(plato=plato, alimento_id=i['alimento'], porciones=round(i['porciones'], 2), orden=n)
            for n, i in enumerate(ingredientes)
        ])
        plato.recalcular()

    def create(self, validated_data):
        ingredientes = validated_data.pop('ingredientes', None)
        if ingredientes is None:
            return super().create(validated_data)
        for campo in MACROS_ALACENA:
            validated_data.pop(campo, None)
        with transaction.atomic():
            plato = super().create({**validated_data, 'es_plato': True})
            self._poner_ingredientes(plato, ingredientes)
        return plato

    def update(self, instance, validated_data):
        ingredientes = validated_data.pop('ingredientes', None)
        if instance.es_plato:
            # Los números del plato salen de sus ingredientes, no se editan a mano
            for campo in (*MACROS_ALACENA, 'descripcion'):
                validated_data.pop(campo, None)
        with transaction.atomic():
            recalcular = not instance.es_plato and any(
                campo in validated_data and validated_data[campo] != getattr(instance, campo)
                for campo in (*MACROS_ALACENA, 'nombre')
            )
            instance = super().update(instance, validated_data)
            if ingredientes is not None:
                self._poner_ingredientes(instance, ingredientes)
            if recalcular:
                instance.recalcular_platos()
        return instance


class MensajeChatSerializer(serializers.ModelSerializer):
    class Meta:
        model  = MensajeChat
        fields = ['id', 'rol', 'contenido', 'acciones', 'creado_en', 'valoracion']

class SesionChatSerializer(serializers.ModelSerializer):
    mensajes = MensajeChatSerializer(many=True, read_only=True)
    class Meta:
        model  = SesionChat
        fields = ['id', 'titulo', 'creado_en', 'activa', 'mensajes']