from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone

import uuid


# ──────────────────────────────────────────────
#  USUARIO (AUTH_USER_MODEL)
# ──────────────────────────────────────────────

class Usuario(AbstractUser):
    """
    Usuario personalizado.
    settings.py tiene AUTH_USER_MODEL = 'api.Usuario'
    """
    avatar     = models.ImageField(upload_to='avatars/', null=True, blank=True)
    avatar_url = models.URLField(blank=True)
    bio        = models.CharField(max_length=160, blank=True)
    idioma     = models.CharField(max_length=5, default='es')

    # ── Metas nutricionales (se calculan en el onboarding, editables después) ──
    meta_calorias = models.IntegerField(default=0)
    meta_proteina = models.IntegerField(default=0)
    meta_carbos   = models.IntegerField(default=0)
    meta_grasas   = models.IntegerField(default=0)

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
    # ej: ["vegetariano", "sin_gluten", "sin_lacteos", "sin_cerdo", "halal"]

    # ── Control de flujo ──────────────────────────────────────────────────────
    onboarding_completo = models.BooleanField(default=False)

    class Meta:
        verbose_name        = 'Usuario'
        verbose_name_plural = 'Usuarios'

    def get_avatar(self):
        if self.avatar:
            return self.avatar.url
        if self.avatar_url:
            return self.avatar_url
        return None

    def get_edad(self):
        if not self.fecha_nacimiento:
            return None
        hoy  = timezone.localdate()
        edad = hoy.year - self.fecha_nacimiento.year
        if (hoy.month, hoy.day) < (self.fecha_nacimiento.month, self.fecha_nacimiento.day):
            edad -= 1
        return edad

    def calcular_tdee(self):
        """
        Calcula el TDEE usando Harris-Benedict revisado (Mifflin-St Jeor).
        Devuelve None si faltan datos.
        """
        edad    = self.get_edad()
        peso    = self.peso_inicial_kg
        estatura = self.estatura_cm

        if not all([edad, peso, estatura, self.sexo, self.nivel_actividad]):
            return None

        if self.sexo == 'M':
            tmb = 10 * peso + 6.25 * estatura - 5 * edad + 5
        else:
            tmb = 10 * peso + 6.25 * estatura - 5 * edad - 161

        factores = {
            'sedentario': 1.2,
            'ligero':     1.375,
            'moderado':   1.55,
            'activo':     1.725,
            'muy_activo': 1.9,
        }
        return round(tmb * factores.get(self.nivel_actividad, 1.55))

    def calcular_metas(self):
        """
        Calcula y guarda las metas nutricionales según TDEE + objetivo.
        Llama a este método al finalizar el onboarding.
        """
        tdee = self.calcular_tdee()
        if not tdee:
            return

        ajuste = {
            ('perder',   'suave'):    -250,
            ('perder',   'moderado'): -500,
            ('perder',   'agresivo'): -750,
            ('mantener', 'suave'):    0,
            ('mantener', 'moderado'): 0,
            ('mantener', 'agresivo'): 0,
            ('ganar',    'suave'):    250,
            ('ganar',    'moderado'): 400,
            ('ganar',    'agresivo'): 500,
        }.get((self.objetivo, self.velocidad_objetivo), 0)

        calorias = tdee + ajuste

        # Macros: proteína alta (2g/kg), grasas 25%, resto carbos
        peso = self.peso_inicial_kg or 70
        proteina = round(peso * 2)
        grasas   = round(calorias * 0.25 / 9)
        carbos   = round((calorias - proteina * 4 - grasas * 9) / 4)

        self.meta_calorias = calorias
        self.meta_proteina = proteina
        self.meta_carbos   = max(carbos, 50)   # mínimo 50g
        self.meta_grasas   = grasas
        self.onboarding_completo = True
        self.save(update_fields=[
            'meta_calorias', 'meta_proteina', 'meta_carbos', 'meta_grasas',
            'onboarding_completo',
        ])

    def __str__(self):
        return self.email or self.username


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
    fecha      = models.DateField(default=timezone.localdate)
    completada = models.BooleanField(default=False)
    notas      = models.TextField(blank=True)

    class Meta:
        ordering = ['-fecha']

    def __str__(self):
        return f"Gym {self.rutina} — {self.fecha}"


class EjercicioLog(models.Model):
    sesion     = models.ForeignKey(SesionGym, on_delete=models.CASCADE, related_name='ejercicios')
    nombre     = models.CharField(max_length=200)
    series     = models.IntegerField(default=3)
    reps       = models.CharField(max_length=50)
    peso_kg    = models.FloatField(null=True, blank=True)
    notas      = models.TextField(blank=True)   # ← agregar esto
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
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['creado_en']

    def __str__(self):
        return f"{self.rol}: {self.contenido[:50]}"
    
# ──────────────────────────────────────────────
#  RUTINAS PERSONALIZADAS POR DÍA
# ──────────────────────────────────────────────

class RutinaDia(models.Model):
    """
    Rutina de gym personalizada por usuario y día de la semana.
    dia_semana: 0=Lunes ... 6=Domingo (mismo criterio que usa el frontend)
    ejercicios: lista de objetos { nombre, series, reps, peso, musculo, custom, color }
    """
    usuario     = models.ForeignKey('Usuario', on_delete=models.CASCADE, related_name='rutinas_dia')
    dia_semana  = models.IntegerField()  # 0-6
    nombre      = models.CharField(max_length=100)
    rutina_id   = models.CharField(max_length=1, default='A')  # A/B/C/D/R — para el color del calendario
    emoji       = models.CharField(max_length=10, default='💪')
    ejercicios  = models.JSONField(default=list, blank=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering        = ['dia_semana']
        unique_together  = ['usuario', 'dia_semana']

    def __str__(self):
        return f"{self.usuario} — Día {self.dia_semana}: {self.nombre}"


class EjercicioPersonalizado(models.Model):
    """Ejercicios creados por el usuario para el pool, con color libre."""
    usuario  = models.ForeignKey('Usuario', on_delete=models.CASCADE, related_name='ejercicios_personalizados')
    nombre   = models.CharField(max_length=200)
    musculo  = models.CharField(max_length=100, default='Personalizado')
    series   = models.IntegerField(default=3)
    reps     = models.CharField(max_length=50, default='10')
    peso     = models.CharField(max_length=50, default='—')
    color    = models.CharField(max_length=7, default='#4ade80')  # hex

    class Meta:
        ordering = ['nombre']

    def __str__(self):
        return f"{self.nombre} ({self.usuario})"