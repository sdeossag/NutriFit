from django.contrib import admin
from .models import Comida, SesionGym, EjercicioLog, PesoCorporal

@admin.register(Comida)
class ComidaAdmin(admin.ModelAdmin):
    list_display  = ['nombre', 'calorias', 'proteina', 'fecha']
    list_filter   = ['fecha']

@admin.register(SesionGym)
class SesionGymAdmin(admin.ModelAdmin):
    list_display = ['rutina', 'fecha', 'completada']

@admin.register(EjercicioLog)
class EjercicioLogAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'peso_kg', 'sesion']

@admin.register(PesoCorporal)
class PesoCorporalAdmin(admin.ModelAdmin):
    list_display = ['peso_kg', 'fecha']