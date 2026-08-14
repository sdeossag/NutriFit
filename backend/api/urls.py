from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    # ───────────────────────── AUTH ─────────────────────────
    path('auth/google/',                views.google_login,         name='auth-google'),
    path('auth/apple/',                 views.apple_login,          name='auth-apple'),

    # JWT
    path('auth/token/refresh/',         TokenRefreshView.as_view(), name='token-refresh'),
    path('auth/logout/',                views.logout,               name='auth-logout'),

    # Perfil
    path('auth/perfil/',                views.mi_perfil,            name='perfil'),
    path('auth/perfil/update/',         views.actualizar_perfil,    name='perfil-update'),
    path('auth/perfil/metas/',          views.actualizar_metas,     name='perfil-metas'),
    path('auth/perfil/objetivo/',       views.actualizar_objetivo,  name='perfil-objetivo'),

    # ────────────────────── ONBOARDING ──────────────────────
    path('onboarding/',                 views.completar_onboarding, name='onboarding'),
    path('onboarding/plan/',            views.generar_plan_groq,    name='onboarding-plan'),

    # ───────────────────────── HOME ─────────────────────────
    path('resumen/',                    views.resumen_hoy,          name='resumen-hoy'),

    # ───────────────────────── FOOD ─────────────────────────
    path('comidas/',                    views.comidas,              name='comidas'),
    path('comidas/<int:pk>/',           views.comida_detalle,       name='comida-detalle'),
    path('analizar-foto/',              views.analizar_foto,        name='analizar-foto'),

    # ─────────────────────── ALACENA ────────────────────────
    path('alacena/',                    views.alacena,              name='alacena'),
    path('alacena/<int:pk>/',           views.alacena_detalle,      name='alacena-detalle'),
    path('alacena/<int:pk>/usar/',      views.alacena_usar,         name='alacena-usar'),
    path('analizar-etiqueta/',          views.analizar_etiqueta,    name='analizar-etiqueta'),

    # ───────────────────────── GYM ──────────────────────────
    path('sesiones/',                   views.sesiones_semana,      name='sesiones-semana'),
    path('sesiones/hoy/',               views.sesion_de_hoy,        name='sesion-de-hoy'),
    path('sesiones/fecha/<str:fecha>/', views.sesion_por_fecha,     name='sesion-por-fecha'),
    path('sesiones/registrar/',         views.registrar_sesion,     name='registrar-sesion'),
    path('ejercicios/log/',             views.log_ejercicio,        name='log-ejercicio'),
    path('rutinas-dia/',                views.rutinas_dia,            name='rutinas-dia'),
    path('ejercicios-personalizados/',  views.ejercicios_personalizados, name='ejercicios-personalizados'),

    # ─────────────────────── PROGRESS ───────────────────────
    path('progreso/',                   views.progreso_semanal,     name='progreso-semanal'),
    path('progreso-completo/',          views.progreso_completo,    name='progreso-completo'),
    path('peso/',                       views.registrar_peso,       name='registrar-peso'),
    path('ejercicios/historial/', views.historial_ejercicios, name='ejercicios-historial'),

    # ───────────────────────── BRUCE ────────────────────────
    path('bruce/frase/',                views.bruce_frase,          name='bruce-frase'),

    # ───────────────────────── CHAT ─────────────────────────
    path('chat/',                       views.sesiones_chat,        name='chat-sesiones'),
    path('chat/<int:pk>/',              views.sesion_chat_detalle,  name='chat-detalle'),
    path('chat/<int:pk>/mensaje/',      views.bruce_chat,           name='chat-mensaje'),

    # ───────────────────────── AGUA ─────────────────────────
    path('agua/',                          views.agua,               name='agua'),
    path('agua/<int:pk>/',                 views.agua_detalle,       name='agua-detalle'),

    # ─────────────────── PUSH NOTIFICATIONS ─────────────────
    path('push/subscribe/',             views.push_suscribir,       name='push-subscribe'),
    path('push/unsubscribe/',           views.push_desuscribir,     name='push-unsubscribe'),
    path('push/estado/',                views.push_estado,          name='push-estado'),
    path('push/check/',                 views.push_check,           name='push-check'),
    path('push/cron/',                  views.cron_notificaciones,  name='push-cron'),

    # ─────────────────── HEALTH CHECK ────────────────────────
    path('health/',                     views.health,               name='health'),
]