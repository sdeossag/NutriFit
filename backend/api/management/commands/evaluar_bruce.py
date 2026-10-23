"""Corre los escenarios de Bruce contra la IA real y los califica.

    python manage.py evaluar_bruce                 # todos
    python manage.py evaluar_bruce --solo frase    # o chat
    python manage.py evaluar_bruce --id chat_agua --id frase_decimales
    python manage.py evaluar_bruce --sin-juez      # solo reglas (más rápido)
    python manage.py evaluar_bruce --repeticiones 2

Cada escenario corre dentro de una transacción que se deshace al final: la base
de datos queda igual. Usa la API de Groq (GROQ_API_KEY), así que tarda y gasta
cuota del plan gratis; entre llamadas espera un poco para no chocar con el límite.
Los resultados quedan en backend/evals_resultados/<fecha>.json para comparar.
"""
import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from rest_framework.test import APIClient

from api.evals.escenarios import ESCENARIOS, HOY, PERFIL, REGLAS_BASE
from api.models import (
    Comida, EjercicioLog, MensajeChat, PesoCorporal, RegistroAgua, Rutina, RutinaDia,
    SesionChat, SesionGym, Usuario,
)

JUEZ = """Eres un evaluador estricto de un coach de nutrición y gym llamado Bruce (habla como parcero colombiano, directo).
Califica SOLO si la respuesta cumple cada criterio. Sé estricto con los datos: si inventa un número o contradice la situación, no cumple.

SITUACIÓN DE LA PERSONA:
{situacion}

{pedido}

RESPUESTA DE BRUCE:
\"\"\"{respuesta}\"\"\"

CRITERIOS:
{criterios}

Responde SOLO un JSON: {{"criterios": [{{"cumple": true|false, "razon": "máx 15 palabras"}}, ...]}} con un elemento por criterio, en el mismo orden."""


class Command(BaseCommand):
    help = 'Evalúa las respuestas de Bruce (chat y frase de Inicio) con escenarios fijos.'

    def add_arguments(self, parser):
        parser.add_argument('--solo', choices=['chat', 'frase'])
        parser.add_argument('--id', action='append', default=[])
        parser.add_argument('--sin-juez', action='store_true')
        parser.add_argument('--repeticiones', type=int, default=1)
        parser.add_argument('--pausa', type=float, default=12.0, help='segundos entre llamadas (límite de Groq)')

    def handle(self, *args, solo=None, id=None, sin_juez=False, repeticiones=1, pausa=12.0, **opts):
        # La consola de Windows no es UTF-8: sin esto, un carácter raro de la IA tumba la corrida
        for flujo in (sys.stdout, sys.stderr):
            if hasattr(flujo, 'reconfigure'):
                flujo.reconfigure(encoding='utf-8', errors='replace')
        if not settings.GROQ_API_KEY:
            self.stderr.write('Falta GROQ_API_KEY en el entorno.')
            return
        escenarios = [e for e in ESCENARIOS if (not solo or e['tipo'] == solo) and (not id or e['id'] in id)]
        resultados = []
        for e in escenarios:
            for rep in range(repeticiones):
                r = self.correr(e, sin_juez, pausa)
                r['repeticion'] = rep + 1
                resultados.append(r)
                marca = self.style.SUCCESS('PASA ') if r['pasa'] else self.style.ERROR('FALLA')
                self.stdout.write(f"{marca} {e['id']}" + (f' (rep {rep + 1})' if repeticiones > 1 else ''))
                for f in r['fallos']:
                    self.stdout.write(f'        - {f}')
                self.stdout.write(f"        «{r['respuesta'][:220].replace(chr(10), ' ')}»")

        total, pasan = len(resultados), sum(r['pasa'] for r in resultados)
        criterios = [c for r in resultados for c in r['criterios']]
        cumplen = sum(c['cumple'] for c in criterios)
        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING(
            f'Escenarios: {pasan}/{total} pasan · Criterios: {cumplen}/{len(criterios)} cumplen'))

        carpeta = Path(settings.BASE_DIR) / 'evals_resultados'
        carpeta.mkdir(exist_ok=True)
        archivo = carpeta / f'{datetime.now():%Y%m%d-%H%M%S}.json'
        archivo.write_text(json.dumps({
            'modelo_texto': settings.GROQ_MODEL_TEXTO,
            'escenarios': f'{pasan}/{total}', 'criterios': f'{cumplen}/{len(criterios)}',
            'resultados': resultados,
        }, ensure_ascii=False, indent=2), encoding='utf-8')
        self.stdout.write(f'Guardado en {archivo}')

    # ── Un escenario ──────────────────────────────────────────────────────

    def correr(self, e, sin_juez, pausa):
        hh, mm = map(int, e['hora'].split(':'))
        ahora = timezone.make_aware(datetime(HOY.year, HOY.month, HOY.day, hh, mm))
        with mock.patch('django.utils.timezone.now', return_value=ahora), transaction.atomic():
            user = self.preparar(e)
            comidas_antes = Comida.objects.filter(usuario=user).count()
            api = APIClient()
            api.force_authenticate(user)
            # El plan gratis de Groq limita los tokens por minuto: si Bruce responde con su
            # mensaje de "problema técnico", se espera y se reintenta (eso no mide calidad)
            for intento in range(3):
                try:
                    if e['tipo'] == 'frase':
                        respuesta, acciones = self.frase(api, user, e, hh), []
                    else:
                        respuesta, acciones = self.chat(api, user, e)
                except Exception as err:   # un fallo de la IA cuenta como respuesta fallida, no detiene la corrida
                    respuesta, acciones = f'[ERROR] {err}', []
                if not self.es_limite(respuesta) or intento == 2:
                    break
                self.stdout.write(f"        (límite de Groq en {e['id']}, espero 60 s)")
                time.sleep(60)
            ctx = {'acciones': acciones, 'comidas_nuevas': Comida.objects.filter(usuario=user).count() - comidas_antes}
            situacion = self.situacion(user, e)
            transaction.set_rollback(True)

        fallos = [m for regla in REGLAS_BASE + e.get('reglas', []) if (m := regla(respuesta, ctx))]
        criterios = []
        if not sin_juez and e.get('rubrica') and not respuesta.startswith('[ERROR]'):
            time.sleep(pausa)
            criterios = self.juzgar(e, situacion, respuesta)
            fallos += [f"juez: {c['criterio'][:70]} → {c['razon']}" for c in criterios if not c['cumple']]
        time.sleep(pausa)
        return {
            'id': e['id'], 'tipo': e['tipo'], 'respuesta': respuesta, 'acciones': [a.get('tipo') for a in acciones],
            'fallos': fallos, 'criterios': criterios,
            'pasa': not fallos and not respuesta.startswith('[ERROR]'),
        }

    @staticmethod
    def es_limite(respuesta):
        return respuesta.startswith('[ERROR]') or 'problema técnico' in respuesta or 'me quedé en blanco' in respuesta

    def preparar(self, e):
        user = Usuario.objects.create_user(f"eval_{e['id']}", f"{e['id']}@eval.test", 'x')
        Usuario.objects.filter(pk=user.pk).update(semana_creada=True)
        perfil = {**PERFIL, **e.get('perfil', {})}
        for campo, valor in perfil.items():
            if hasattr(user, campo):          # los campos que aún no existen (p. ej. lesiones) se ignoran
                setattr(user, campo, valor)
        user.save()
        PesoCorporal.objects.create(usuario=user, peso_kg=e.get('peso_kg', 70), fecha=HOY - timedelta(days=2))

        for dias, kcal, prot, carb, gras, nombre in e.get('comidas', []):
            Comida.objects.create(usuario=user, nombre=nombre, calorias=kcal, proteina=prot, carbos=carb,
                                  grasas=gras, fecha=HOY - timedelta(days=dias))
        for dias, ejercicios in e.get('sesiones', []):
            s = SesionGym.objects.create(usuario=user, fecha=HOY - timedelta(days=dias), rutina='A', completada=True)
            for nombre, series, reps, kg in ejercicios:
                EjercicioLog.objects.create(sesion=s, nombre=nombre, series=series, reps=reps, peso_kg=kg, completado=True)
        if e.get('fue_al_gym'):
            SesionGym.objects.get_or_create(usuario=user, fecha=HOY, rutina='A', defaults={'completada': True})
        if e.get('agua_ml'):
            RegistroAgua.objects.create(usuario=user, fecha=HOY, cantidad_ml=e['agua_ml'])

        # Semana: rutina el miércoles salvo que el escenario diga descanso
        rutina = Rutina.objects.create(usuario=user, nombre='Pecho/Hombros',
                                       ejercicios=[{'nombre': 'Chest press máquina', 'series': 3, 'reps': '10', 'peso': '45 kg'}])
        if e.get('rutina_hoy', True):
            RutinaDia.objects.create(usuario=user, dia_semana=HOY.weekday(), rutina=rutina)
        RutinaDia.objects.create(usuario=user, dia_semana=0, rutina=rutina)

        if e.get('otra_sesion'):
            vieja = SesionChat.objects.create(usuario=user, titulo='charla anterior')
            for rol, texto in e['otra_sesion']:
                MensajeChat.objects.create(sesion=vieja, rol=rol, contenido=texto)
        try:   # Fase 2: memoria de Bruce (si el modelo ya existe)
            from api.models import MemoriaBruce
            for texto in e.get('memorias', []):
                MemoriaBruce.objects.create(usuario=user, texto=texto)
        except ImportError:
            pass
        return user

    def frase(self, api, user, e, hora):
        # Lo mismo que manda la pantalla de Inicio
        hoy = Comida.objects.filter(usuario=user, fecha=HOY)
        payload = {
            'calorias_hoy': sum(c.calorias for c in hoy),
            'meta_calorias': user.meta_calorias,
            'proteina_hoy': round(sum(c.proteina for c in hoy), 1),
            'meta_proteina': user.meta_proteina,
            'carbos_hoy': round(sum(c.carbos for c in hoy), 1),
            'meta_carbos': user.meta_carbos,
            'es_dia_gym': e.get('rutina_hoy', True),
            'fue_al_gym': bool(e.get('fue_al_gym')),
            'hora': hora,
            'racha_gym': 0, 'racha_comida': 0,
            'nombre_usuario': user.first_name,
            'objetivo': user.objetivo,
        }
        r = api.post('/api/bruce/frase/', payload, format='json')
        return r.data.get('frase', f'[ERROR] HTTP {r.status_code}')

    def chat(self, api, user, e):
        sesion = SesionChat.objects.create(usuario=user)
        r = api.post(f'/api/chat/{sesion.id}/mensaje/', {'mensaje': e['mensaje']}, format='json')
        if r.status_code != 201:
            return f'[ERROR] HTTP {r.status_code}', []
        bruce = r.data['mensaje_bruce']
        return bruce['contenido'], bruce.get('acciones') or []

    def situacion(self, user, e):
        hoy = Comida.objects.filter(usuario=user, fecha=HOY)
        kcal, prot = sum(c.calorias for c in hoy), round(sum(c.proteina for c in hoy))
        lineas = [
            f"Fecha: miércoles {HOY:%d/%m}, son las {e['hora']}.",
            f"Perfil: {user.first_name}, hombre de 19 años, {user.estatura_cm} cm, {e.get('peso_kg', 70)} kg, objetivo {user.objetivo}.",
            f"Metas diarias: {user.meta_calorias} kcal, {user.meta_proteina} g proteína.",
            f"Hoy lleva: {kcal} kcal y {prot} g de proteína.",
            f"Le gusta: {', '.join(user.alimentos_gustados)}. No le gusta: {', '.join(user.alimentos_no_gustados) or 'nada'}.",
            f"Restricciones: {', '.join(user.restricciones_dieta) or 'ninguna'}. Alergias: {', '.join(user.alergias) or 'ninguna'}.",
            f"Hoy {'tiene rutina de gym' if e.get('rutina_hoy', True) else 'es día de descanso'}"
            f"{' y ya entrenó' if e.get('fue_al_gym') else ''}.",
        ]
        if e.get('perfil', {}).get('lesiones'):
            lineas.append(f"Lesión registrada en su perfil: {e['perfil']['lesiones']}")
        if e.get('agua_ml'):
            lineas.append(f"Agua hoy: {e['agua_ml']} ml.")
        for dias, kcal_d, prot_d, *_ in e.get('comidas', []):
            if dias:
                lineas.append(f"Hace {dias} día(s) comió {kcal_d} kcal y {prot_d} g de proteína.")
        for dias, ejercicios in e.get('sesiones', []):
            lineas.append(f"Hace {dias} día(s) entrenó: " + '; '.join(f'{n} {s}x{r} {kg} kg' for n, s, r, kg in ejercicios))
        if e.get('otra_sesion'):
            lineas.append('En otra conversación anterior dijo: ' + ' / '.join(t for rol, t in e['otra_sesion'] if rol == 'user'))
        return '\n'.join(lineas)

    def juzgar(self, e, situacion, respuesta):
        from api.views import _extraer_json, _groq_chat
        pedido = ('Le pidieron la frase corta de la pantalla de Inicio.' if e['tipo'] == 'frase'
                  else f"La persona escribió: \"{e['mensaje']}\"")
        prompt = JUEZ.format(situacion=situacion, pedido=pedido, respuesta=respuesta,
                             criterios='\n'.join(f'{i + 1}. {c}' for i, c in enumerate(e['rubrica'])))
        payload = {'model': settings.GROQ_MODEL_TEXTO, 'messages': [{'role': 'user', 'content': prompt}],
                   'max_tokens': 900, 'temperature': 0, 'reasoning_effort': 'default'}
        for intento in range(3):
            try:
                datos = _extraer_json(_groq_chat(payload, timeout=40))
                notas = datos['criterios']
                return [{'criterio': c, 'cumple': bool(n.get('cumple')), 'razon': str(n.get('razon', ''))}
                        for c, n in zip(e['rubrica'], notas)]
            except Exception as err:
                if intento == 2:
                    return [{'criterio': 'juez', 'cumple': False, 'razon': f'el juez falló: {str(err)[:80]}'}]
                time.sleep(10)
