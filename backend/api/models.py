from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone

import re
import uuid


# ──────────────────────────────────────────────
#  USUARIO (AUTH_USER_MODEL)
# ──────────────────────────────────────────────

# ── Cálculo de metas ──────────────────────────────────────────────────────────
FACTOR_ACTIVIDAD = {
    'sedentario': 1.2, 'ligero': 1.375, 'moderado': 1.55, 'activo': 1.725, 'muy_activo': 1.9,
}
# Perder: cuánto del peso corporal por semana (%). Así el ritmo escala con la persona:
# "moderado" son ~0,45 kg/sem con 90 kg y ~0,28 kg/sem con 55 kg.
PERDIDA_SEMANAL_PCT = {'suave': 0.25, 'moderado': 0.5, 'agresivo': 0.8}
DEFICIT_MAXIMO = 0.25          # nunca más del 25 % del gasto del día
# Ganar: superávit sobre el gasto. Más de ~15 % suma sobre todo grasa.
SUPERAVIT_PCT = {'suave': 0.05, 'moderado': 0.10, 'agresivo': 0.15}
# Piso de seguridad al perder peso, además del gasto en reposo
CALORIAS_MINIMAS = {'M': 1500, 'F': 1200}
# Cuánto tiene que cambiar el peso para reajustar las metas solas
CAMBIO_PESO_METAS_KG = 2


class Usuario(AbstractUser):
    """
    Usuario personalizado.
    settings.py tiene AUTH_USER_MODEL = 'api.Usuario'
    """
    avatar     = models.ImageField(upload_to='avatars/', null=True, blank=True)  # obsoleto: ver avatar_data
    avatar_url = models.URLField(blank=True)
    # Foto subida por la persona, reducida a 256 px, como data URL (~20 KB).
    # Vive en la base de datos porque el disco del servidor se reemplaza en cada despliegue.
    avatar_data = models.TextField(blank=True)
    bio        = models.CharField(max_length=160, blank=True)
    idioma     = models.CharField(max_length=5, default='es')

    # ── Metas nutricionales (se calculan en el onboarding, editables después) ──
    meta_calorias = models.IntegerField(default=0)
    meta_proteina = models.IntegerField(default=0)
    meta_carbos   = models.IntegerField(default=0)
    meta_grasas   = models.IntegerField(default=0)
    # Con qué peso se calcularon (para reajustarlas cuando el peso cambie) y si
    # la persona las editó a mano (entonces no se tocan solas)
    peso_metas_kg  = models.FloatField(null=True, blank=True)
    metas_manuales = models.BooleanField(default=False)
    # Corrección del gasto de la fórmula según los datos reales (ver gasto_real.py)
    factor_gasto   = models.FloatField(default=1.0)

    # ── Datos físicos ──────────────────────────────────────────────────────────
    SEXO_CHOICES = [('M', 'Masculino'), ('F', 'Femenino')]
    sexo             = models.CharField(max_length=1, choices=SEXO_CHOICES, blank=True)
    fecha_nacimiento = models.DateField(null=True, blank=True)
    estatura_cm      = models.IntegerField(null=True, blank=True)
    peso_inicial_kg  = models.FloatField(null=True, blank=True)   # peso al hacer onboarding
    peso_objetivo_kg = models.FloatField(null=True, blank=True)   # peso meta declarado

    # ── Objetivo y ritmo ──────────────────────────────────────────────────────
    OBJETIVO_CHOICES = [
        ('perder',    'Perder peso'),
        ('mantener',  'Mantener peso'),
        ('ganar',     'Ganar músculo'),
    ]
    VELOCIDAD_CHOICES = [
        ('suave',     'Suave (~0.25 kg/sem)'),
        ('moderado',  'Moderado (~0.5 kg/sem)'),
        ('agresivo',  'Agresivo (~1 kg/sem)'),
    ]
    objetivo          = models.CharField(max_length=10, choices=OBJETIVO_CHOICES, blank=True)
    velocidad_objetivo = models.CharField(max_length=10, choices=VELOCIDAD_CHOICES, blank=True)

    # ── Nivel de actividad ────────────────────────────────────────────────────
    ACTIVIDAD_CHOICES = [
        ('sedentario',  'Sedentario (sin ejercicio)'),
        ('ligero',      'Ligero (1-3 días/sem)'),
        ('moderado',    'Moderado (3-5 días/sem)'),
        ('activo',      'Activo (6-7 días/sem)'),
        ('muy_activo',  'Muy activo (2x/día)'),
    ]
    nivel_actividad = models.CharField(max_length=12, choices=ACTIVIDAD_CHOICES, blank=True)

    # ── Preferencias alimentarias (JSON arrays) ───────────────────────────────
    alimentos_gustados     = models.JSONField(default=list, blank=True)
    alimentos_no_gustados  = models.JSONField(default=list, blank=True)
    restricciones_dieta    = models.JSONField(default=list, blank=True)
    # Alergias: el filtro más estricto (ni como ingrediente menor ni en la preparación)
    alergias               = models.JSONField(default=list, blank=True)
    # Qué notificaciones recibe y a qué hora (se combina con los valores por defecto)
    ajustes_notif          = models.JSONField(default=dict, blank=True)
    # ej: ["vegetariano", "sin_gluten", "sin_lacteos", "sin_cerdo", "halal"]

    # ── Control de flujo ──────────────────────────────────────────────────────
    onboarding_completo = models.BooleanField(default=False)
    # La semana de rutinas ya se creó (una semana toda de descanso no tiene filas)
    semana_creada       = models.BooleanField(default=False)
    # La biblioteca de ejercicios ya recibió la lista base
    biblioteca_creada   = models.BooleanField(default=False)

    class Meta:
        verbose_name        = 'Usuario'
        verbose_name_plural = 'Usuarios'

    def get_avatar(self):
        if self.avatar_data:
            return self.avatar_data
        if self.avatar_url:
            # Google entrega la foto a 96 px; se pide a 256 para que se vea nítida
            return re.sub(r'=s\d+-c$', '=s256-c', self.avatar_url)
        return None

    def get_edad(self):
        if not self.fecha_nacimiento:
            return None
        hoy  = timezone.localdate()
        edad = hoy.year - self.fecha_nacimiento.year
        if (hoy.month, hoy.day) < (self.fecha_nacimiento.month, self.fecha_nacimiento.day):
            edad -= 1
        return edad

    def peso_actual(self):
        """Último peso registrado; si nunca se ha pesado, el del onboarding."""
        ultimo = self.pesos.order_by('-fecha').values_list('peso_kg', flat=True).first()
        return ultimo or self.peso_inicial_kg

    def calcular_tmb(self):
        """Gasto en reposo con Mifflin-St Jeor. None si faltan datos."""
        edad, peso, estatura = self.get_edad(), self.peso_actual(), self.estatura_cm
        if not all([edad, peso, estatura, self.sexo]):
            return None
        return 10 * peso + 6.25 * estatura - 5 * edad + (5 if self.sexo == 'M' else -161)

    def calcular_tdee(self):
        """Gasto del día: reposo × nivel de actividad. None si faltan datos."""
        tmb = self.calcular_tmb()
        if not tmb or not self.nivel_actividad:
            return None
        return round(tmb * FACTOR_ACTIVIDAD.get(self.nivel_actividad, 1.55))

    def peso_referencia(self):
        """Peso para calcular proteína y grasa. Con sobrepeso, 2 g por kg del peso
        total da cantidades imposibles de comer (240 g con 120 kg), así que se topa
        en el peso de un IMC de 27, o en el peso objetivo si es mayor."""
        peso = self.peso_actual() or 70
        if not self.estatura_cm:
            return peso
        tope = 27 * (self.estatura_cm / 100) ** 2
        return min(peso, max(tope, self.peso_objetivo_kg or 0))

    def calculo_metas(self):
        """Cómo salen las calorías, paso a paso. None si faltan datos."""
        tmb, formula = self.calcular_tmb(), self.calcular_tdee()
        if not formula:
            return None
        # La fórmula, corregida con lo que dicen sus pesos y comidas
        gasto = round(formula * (self.factor_gasto or 1.0))
        velocidad = self.velocidad_objetivo or 'moderado'
        minimo, limitada = None, False

        if self.objetivo == 'perder':
            # Déficit según lo que la persona pesa: 1 kg de grasa ≈ 7.700 kcal
            deficit = self.peso_actual() * PERDIDA_SEMANAL_PCT.get(velocidad, 0.5) / 100 * 7700 / 7
            deficit = min(deficit, gasto * DEFICIT_MAXIMO)
            calorias = gasto - deficit
            # Nunca por debajo del gasto en reposo ni del mínimo seguro
            minimo = min(gasto, max(CALORIAS_MINIMAS.get(self.sexo, 1200), tmb))
            if calorias < minimo:
                calorias, limitada = minimo, True
        elif self.objetivo == 'ganar':
            calorias = gasto * (1 + SUPERAVIT_PCT.get(velocidad, 0.10))
        else:
            calorias = gasto

        return {
            'reposo': round(tmb), 'gasto': gasto, 'gasto_formula': formula,
            'calorias': int(round(calorias / 10) * 10),
            'minimo': round(minimo) if minimo else None, 'limitada': limitada,
        }

    def calcular_metas(self):
        """
        Calcula y guarda las metas nutricionales según el gasto y el objetivo.
        Se llama al terminar el onboarding y al editar el objetivo.
        """
        calculo = self.calculo_metas()
        if not calculo:
            return
        calorias = calculo['calorias']
        ref = self.peso_referencia()

        # Proteína alta (2 g/kg) pero nunca más del 35 % de las calorías;
        # grasa 25 % con un piso de 0,6 g/kg; el resto, carbohidratos.
        proteina = round(min(ref * 2, calorias * 0.35 / 4))
        grasas   = round(max(calorias * 0.25 / 9, ref * 0.6))
        carbos   = round((calorias - proteina * 4 - grasas * 9) / 4)

        self.meta_calorias = calorias
        self.meta_proteina = proteina
        self.meta_carbos   = max(carbos, 50)   # mínimo 50g
        self.meta_grasas   = grasas
        self.peso_metas_kg = self.peso_actual()
        self.metas_manuales = False
        self.onboarding_completo = True
        self.save(update_fields=[
            'meta_calorias', 'meta_proteina', 'meta_carbos', 'meta_grasas',
            'peso_metas_kg', 'metas_manuales', 'onboarding_completo',
        ])

    def revisar_metas_por_peso(self):
        """Si el peso cambió 2 kg o más desde el último cálculo, recalcula las
        metas. Devuelve qué cambió (para avisarle a la persona) o None."""
        if self.metas_manuales or not self.calculo_metas():
            return None
        base = self.peso_metas_kg or self.peso_inicial_kg
        peso = self.peso_actual()
        if not base or abs(peso - base) < CAMBIO_PESO_METAS_KG:
            return None
        antes = self.meta_calorias
        self.calcular_metas()
        if self.meta_calorias == antes:
            return None
        return {'antes': antes, 'despues': self.meta_calorias,
                'cambio_kg': round(peso - base, 1), 'proteina': self.meta_proteina}

    def meta_agua_ml(self):
        """~35 ml por kg (+500 si entrena casi a diario), en pasos de 250 ml."""
        ml = 35 * (self.peso_actual() or 70)
        if self.nivel_actividad in ('activo', 'muy_activo'):
            ml += 500
        return int(min(max(round(ml / 250) * 250, 1500), 4500))

    def __str__(self):
        return self.email or self.username


class AjusteGasto(models.Model):
    """El ajuste semanal del gasto: qué dijeron los datos y cómo quedó la meta."""
    usuario          = models.ForeignKey(Usuario, on_delete=models.CASCADE, related_name='ajustes_gasto')
    fecha            = models.DateField()
    ingesta_media    = models.IntegerField()
    cambio_kg_semana = models.FloatField()
    gasto_formula    = models.IntegerField()
    gasto_real       = models.IntegerField()
    factor           = models.FloatField()
    calorias_antes   = models.IntegerField()
    calorias_despues = models.IntegerField()
    dias_comida      = models.IntegerField()
    pesajes          = models.IntegerField()

    class Meta:
        ordering = ['-fecha']
        constraints = [models.UniqueConstraint(fields=['usuario', 'fecha'], name='ajuste_gasto_unico_por_dia')]


# ──────────────────────────────────────────────
#  COMIDAS
# ──────────────────────────────────────────────

class Comida(models.Model):
    usuario     = models.ForeignKey(
        'Usuario', on_delete=models.CASCADE,
        null=True, blank=True, related_name='comidas'
    )
    nombre      = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True)
    calorias    = models.IntegerField(default=0)
    proteina    = models.FloatField(default=0)
    carbos      = models.FloatField(default=0)
    grasas      = models.FloatField(default=0)
    fecha       = models.DateField(default=timezone.localdate)
    creado_en   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-creado_en']
        indexes  = [models.Index(fields=['usuario', 'fecha'], name='comida_usuario_fecha')]

    def __str__(self):
        return f"{self.nombre} ({self.fecha}) — {self.calorias} kcal"


# ──────────────────────────────────────────────
#  GYM
# ──────────────────────────────────────────────

class SesionGym(models.Model):
    RUTINAS = [
        ('A', 'Gym A — Pierna + Core'),
        ('B', 'Gym B — Pecho + Hombros + Tríceps'),
        ('C', 'Gym C — Espalda + Bíceps'),
        ('D', 'Gym D — Funcional + Pierna'),
        ('R', 'Descanso activo'),
    ]
    usuario    = models.ForeignKey(
        'Usuario', on_delete=models.CASCADE,
        null=True, blank=True, related_name='sesiones'
    )
    rutina     = models.CharField(max_length=1, choices=RUTINAS)
    # Qué rutina se hizo ese día: si luego se mueve a otro día, el historial no cambia
    rutina_ref = models.ForeignKey('Rutina', on_delete=models.SET_NULL, null=True, blank=True, related_name='sesiones')
    fecha      = models.DateField(default=timezone.localdate)
    completada = models.BooleanField(default=False)
    notas      = models.TextField(blank=True)

    class Meta:
        ordering    = ['-fecha']
        # Una sesión por rutina y día: el doble entreno son dos sesiones
        constraints = [models.UniqueConstraint(fields=['usuario', 'fecha', 'rutina_ref'], name='sesion_unica_por_rutina')]

    def __str__(self):
        return f"Gym {self.rutina} — {self.fecha}"


class EjercicioLog(models.Model):
    sesion     = models.ForeignKey(SesionGym, on_delete=models.CASCADE, related_name='ejercicios')
    nombre     = models.CharField(max_length=200)
    musculo    = models.CharField(max_length=100, blank=True, default='')
    series     = models.IntegerField(default=3)
    reps       = models.CharField(max_length=50)
    peso_kg    = models.FloatField(null=True, blank=True)
    notas      = models.TextField(blank=True)
    completado = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.nombre} — {self.peso_kg}kg"


# ──────────────────────────────────────────────
#  PROGRESO
# ──────────────────────────────────────────────

class PesoCorporal(models.Model):
    usuario = models.ForeignKey(
        'Usuario', on_delete=models.CASCADE,
        null=True, blank=True, related_name='pesos'
    )
    peso_kg = models.FloatField()
    fecha   = models.DateField(default=timezone.localdate)

    class Meta:
        ordering        = ['-fecha']
        unique_together = ['fecha', 'usuario']

    def __str__(self):
        return f"{self.peso_kg} kg — {self.fecha}"


# ──────────────────────────────────────────────
#  ALACENA
# ──────────────────────────────────────────────

class AlimentoAlacena(models.Model):
    usuario     = models.ForeignKey('Usuario', on_delete=models.CASCADE, related_name='alacena')
    nombre      = models.CharField(max_length=200)
    descripcion = models.CharField(max_length=300, blank=True)
    calorias    = models.IntegerField(default=0)
    proteina    = models.FloatField(default=0)
    carbos      = models.FloatField(default=0)
    grasas      = models.FloatField(default=0)
    veces_usado = models.IntegerField(default=0)
    creado_en   = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-veces_usado', '-creado_en']

    def __str__(self):
        return f"{self.nombre} — {self.calorias} kcal/porción ({self.usuario})"
    
import uuid

class SesionChat(models.Model):
    usuario   = models.ForeignKey('Usuario', on_delete=models.CASCADE, related_name='sesiones_chat')
    titulo    = models.CharField(max_length=200, blank=True)  # se genera del primer mensaje
    creado_en = models.DateTimeField(auto_now_add=True)
    activa    = models.BooleanField(default=True)

    class Meta:
        ordering = ['-creado_en']

    def __str__(self):
        return f"{self.usuario} — {self.titulo or 'Sin título'}"


class MensajeChat(models.Model):
    ROL_CHOICES = [('user', 'Usuario'), ('bruce', 'Bruce')]
    sesion    = models.ForeignKey(SesionChat, on_delete=models.CASCADE, related_name='mensajes')
    rol       = models.CharField(max_length=10, choices=ROL_CHOICES)
    contenido = models.TextField()
    # Lo que Bruce hizo en la app al responder (cambiar una comida, armar el plan…)
    acciones  = models.JSONField(default=list, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['creado_en']

    def __str__(self):
        return f"{self.rol}: {self.contenido[:50]}"
    
# ──────────────────────────────────────────────
#  RUTINAS PERSONALIZADAS POR DÍA
# ──────────────────────────────────────────────

class Rutina(models.Model):
    """Una rutina completa (el "paquete"): se asigna a uno o varios días de la semana.

    ejercicios: lista de { nombre, musculo, series, reps, peso, custom, color }
    """
    usuario     = models.ForeignKey('Usuario', on_delete=models.CASCADE, related_name='rutinas')
    nombre      = models.CharField(max_length=100)
    emoji       = models.CharField(max_length=10, default='💪')
    color       = models.CharField(max_length=7, default='#4ade80')  # hex
    ejercicios  = models.JSONField(default=list, blank=True)
    creado_en   = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['creado_en', 'id']

    def __str__(self):
        return f"{self.usuario} — {self.nombre}"


class RutinaDia(models.Model):
    """Una rutina asignada a un día de la semana. Un día puede tener varias
    (doble entreno) y un día sin filas es de descanso.
    dia_semana: 0=Lunes ... 6=Domingo (mismo criterio que usa el frontend)
    """
    usuario     = models.ForeignKey('Usuario', on_delete=models.CASCADE, related_name='rutinas_dia')
    dia_semana  = models.IntegerField()  # 0-6
    rutina      = models.ForeignKey(Rutina, on_delete=models.CASCADE, related_name='dias')
    orden       = models.PositiveSmallIntegerField(default=0)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering    = ['dia_semana', 'orden']
        constraints = [models.UniqueConstraint(fields=['usuario', 'dia_semana', 'rutina'], name='rutina_una_vez_por_dia')]

    def __str__(self):
        return f"{self.usuario} — Día {self.dia_semana}: {self.rutina}"


class EjercicioPersonalizado(models.Model):
    """Biblioteca de ejercicios de cada persona: la lista base (copiada al
    empezar) más los que crea. Todo se puede editar o borrar."""
    usuario  = models.ForeignKey('Usuario', on_delete=models.CASCADE, related_name='ejercicios_personalizados')
    nombre   = models.CharField(max_length=200)
    musculo  = models.CharField(max_length=100, default='Personalizado')
    series   = models.IntegerField(default=3)
    reps     = models.CharField(max_length=50, default='10')
    peso     = models.CharField(max_length=50, default='—')
    color    = models.CharField(max_length=7, blank=True, default='')  # hex; vacío = color del músculo
    custom   = models.BooleanField(default=True)   # False = vino en la lista base

    class Meta:
        ordering = ['nombre']

    def __str__(self):
        return f"{self.nombre} ({self.usuario})"


# ──────────────────────────────────────────────
#  PUSH NOTIFICATIONS
# ──────────────────────────────────────────────

class RegistroAgua(models.Model):
    usuario     = models.ForeignKey('Usuario', on_delete=models.CASCADE, related_name='registros_agua')
    fecha       = models.DateField()
    cantidad_ml = models.PositiveIntegerField()
    creado_en   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering            = ['-creado_en']
        indexes             = [models.Index(fields=['usuario', 'fecha'], name='agua_usuario_fecha')]
        verbose_name        = 'Registro de agua'
        verbose_name_plural = 'Registros de agua'

    def __str__(self):
        return f"{self.usuario} — {self.cantidad_ml}ml el {self.fecha}"


class PushSubscription(models.Model):
    usuario        = models.ForeignKey('Usuario', on_delete=models.CASCADE, related_name='push_subscriptions')
    endpoint       = models.TextField(unique=True)
    p256dh         = models.TextField()
    auth           = models.TextField()
    creado_en      = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name        = 'Suscripción push'
        verbose_name_plural = 'Suscripciones push'

    def __str__(self):
        return f"Push {self.usuario} — {self.endpoint[:60]}"

# ──────────────────────────────────────────────
#  LOGROS
# ──────────────────────────────────────────────

class LogroUsuario(models.Model):
    """Nivel alcanzado en cada logro. Nunca baja: lo ganado se queda."""
    usuario         = models.ForeignKey('Usuario', on_delete=models.CASCADE, related_name='logros')
    clave           = models.CharField(max_length=40)
    nivel           = models.PositiveSmallIntegerField(default=0)
    desbloqueado_en = models.DateTimeField()
    visto           = models.BooleanField(default=False)  # la celebración se muestra una sola vez

    class Meta:
        constraints = [models.UniqueConstraint(fields=['usuario', 'clave'], name='logro_unico_por_usuario')]

    def __str__(self):
        return f"{self.usuario} — {self.clave} nivel {self.nivel}"


# ──────────────────────────────────────────────
#  PLAN DEL DÍA (Bruce)
# ──────────────────────────────────────────────

class PlanDia(models.Model):
    """Comidas que Bruce propone para un día, según lo que falta de las metas.

    comidas: [{ momento, nombre, porcion, ingredientes: [{nombre, cantidad}],
                preparacion: [pasos], minutos, calorias, proteina, carbos,
                grasas, registrada }]
    """
    usuario       = models.ForeignKey('Usuario', on_delete=models.CASCADE, related_name='planes')
    fecha         = models.DateField()
    comidas       = models.JSONField(default=list)
    consejo       = models.TextField(blank=True)
    generaciones  = models.PositiveSmallIntegerField(default=0)  # límite diario de llamadas a la IA
    actualizado   = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['usuario', 'fecha'], name='plan_unico_por_dia')]

    def __str__(self):
        return f"Plan {self.usuario} — {self.fecha}"


class NotificacionEnviada(models.Model):
    """Registro de lo enviado: evita repetir, cuenta el máximo diario y le
    muestra a la IA sus últimos mensajes para que no se repita."""
    usuario   = models.ForeignKey('Usuario', on_delete=models.CASCADE, related_name='notificaciones')
    clave     = models.CharField(max_length=80)   # ej. "comida:almuerzo:2026-09-24"
    tipo      = models.CharField(max_length=20)
    titulo    = models.CharField(max_length=120)
    cuerpo    = models.CharField(max_length=300)
    enviada   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering    = ['-enviada']
        constraints = [models.UniqueConstraint(fields=['usuario', 'clave'], name='notificacion_unica')]
