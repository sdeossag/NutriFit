from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from . import estadisticas
from .models import Comida, EjercicioLog, PesoCorporal, RutinaDia, SesionGym

User = get_user_model()

# Martes: el lunes anterior es día de rutina y el domingo, de descanso
HOY = date(2026, 9, 22)


def en(fecha):
    """Fija el "hoy" del servidor para que las rachas no dependan del calendario."""
    return mock.patch('django.utils.timezone.localdate', return_value=fecha)


class Base(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('ana', 'ana@test.com', 'x', first_name='Ana')
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def sesion(self, fecha, completada=True):
        return SesionGym.objects.create(usuario=self.user, fecha=fecha, rutina='A', completada=completada)


class GuardarSesionTests(Base):
    def test_guardar_con_ejercicios_marca_completada(self):
        r = self.api.post('/api/sesiones/registrar/', {
            'fecha': '2026-09-22', 'rutina': 'B',
            'ejercicios': [{'nombre': 'Press banca', 'series': 4, 'reps': '8', 'peso_kg': 60}],
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        s = SesionGym.objects.get(usuario=self.user)
        self.assertTrue(s.completada)
        self.assertEqual(s.ejercicios.get().peso_kg, 60)

    def test_volver_a_guardar_reemplaza_lo_desmarcado(self):
        url = '/api/sesiones/registrar/'
        self.api.post(url, {'fecha': '2026-09-22', 'ejercicios': [{'nombre': 'A'}, {'nombre': 'B'}]}, format='json')
        self.api.post(url, {'fecha': '2026-09-22', 'ejercicios': [{'nombre': 'A'}]}, format='json')
        self.assertEqual(list(EjercicioLog.objects.values_list('nombre', flat=True)), ['A'])
        self.api.post(url, {'fecha': '2026-09-22', 'ejercicios': []}, format='json')
        self.assertFalse(SesionGym.objects.get().completada)

    def test_una_sola_sesion_por_dia(self):
        for _ in range(3):
            self.api.post('/api/sesiones/registrar/', {'fecha': '2026-09-22', 'ejercicios': [{'nombre': 'A'}]}, format='json')
        self.assertEqual(SesionGym.objects.count(), 1)

    def test_datos_invalidos_dan_400_no_500(self):
        casos = [
            {'fecha': 'ayer'},
            {'fecha': '2026-09-22', 'ejercicios': 'nada'},
            {'fecha': '2026-09-22', 'ejercicios': [{'series': 3}]},
            {'fecha': '2026-09-22', 'ejercicios': [{'nombre': 'A', 'peso_kg': 'mucho'}]},
            {'fecha': '2026-09-22', 'ejercicios': [{'nombre': 'A', 'series': -2}]},
        ]
        for datos in casos:
            r = self.api.post('/api/sesiones/registrar/', datos, format='json')
            self.assertEqual(r.status_code, 400, datos)
        self.assertEqual(SesionGym.objects.count(), 0)

    def test_log_ejercicio_sin_series_no_falla_y_completa(self):
        r = self.api.post('/api/ejercicios/log/', {'fecha': '2026-09-22', 'nombre': 'Remo', 'notas': 'lento'}, format='json')
        self.assertIn(r.status_code, (200, 201), r.data)
        log = EjercicioLog.objects.get()
        self.assertEqual((log.series, log.notas), (3, 'lento'))
        self.assertTrue(log.sesion.completada)


class RachaTests(Base):
    def test_hoy_sin_registrar_no_rompe_la_racha(self):
        self.sesion(HOY - timedelta(days=1))  # lunes
        self.assertEqual(estadisticas.racha_gym(self.user, HOY), 1)

    def test_domingo_de_descanso_no_rompe_la_racha(self):
        for dias in (1, 3, 4):  # lunes, sábado y viernes; el domingo se descansa
            self.sesion(HOY - timedelta(days=dias))
        self.assertEqual(estadisticas.racha_gym(self.user, HOY), 3)

    def test_dia_de_rutina_sin_ir_rompe_la_racha(self):
        self.sesion(HOY - timedelta(days=1))
        self.sesion(HOY - timedelta(days=4))  # falta el sábado
        self.assertEqual(estadisticas.racha_gym(self.user, HOY), 1)

    def test_descanso_personalizado(self):
        RutinaDia.objects.create(usuario=self.user, dia_semana=0, nombre='Libre', rutina_id='R')
        self.sesion(HOY - timedelta(days=3))  # sábado; lunes libre y domingo libre
        self.assertEqual(estadisticas.racha_gym(self.user, HOY), 1)

    def test_sesion_sin_completar_no_cuenta(self):
        self.sesion(HOY - timedelta(days=1), completada=False)
        self.assertEqual(estadisticas.racha_gym(self.user, HOY), 0)

    def test_racha_de_comida(self):
        for dias in (0, 1, 2):
            Comida.objects.create(usuario=self.user, nombre='x', fecha=HOY - timedelta(days=dias))
        Comida.objects.create(usuario=self.user, nombre='y', fecha=HOY)
        self.assertEqual(estadisticas.racha_comida(self.user, HOY), 3)


class ValidacionTests(Base):
    def test_peso_fuera_de_rango_o_fecha_invalida(self):
        self.assertEqual(self.api.post('/api/peso/', {'peso_kg': 5}, format='json').status_code, 400)
        self.assertEqual(self.api.post('/api/peso/', {'peso_kg': 70, 'fecha': 'hoy'}, format='json').status_code, 400)
        r = self.api.post('/api/peso/', {'peso_kg': 70.5, 'fecha': '2026-09-22'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        r = self.api.post('/api/peso/', {'peso_kg': 70.1, 'fecha': '2026-09-22'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(PesoCorporal.objects.get().peso_kg, 70.1)

    def test_comida_negativa(self):
        r = self.api.post('/api/comidas/', {'nombre': 'x', 'calorias': -100}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_comidas_con_fecha_invalida(self):
        self.assertEqual(self.api.get('/api/comidas/?fecha=mañana').status_code, 400)

    def test_rutina_dia_invalida(self):
        for datos in ({'dia_semana': 9}, {'dia_semana': 1, 'rutina_id': 'XYZ'}, {'dia_semana': 1, 'ejercicios': [{}]}):
            self.assertEqual(self.api.put('/api/rutinas-dia/', datos, format='json').status_code, 400, datos)

    def test_agua_invalida(self):
        self.assertEqual(self.api.post('/api/agua/', {'cantidad_ml': 'dos'}, format='json').status_code, 400)
        self.assertEqual(self.api.post('/api/agua/', {'cantidad_ml': 250, 'fecha': 'x'}, format='json').status_code, 400)


class MetasTests(Base):
    def test_metas_usan_el_peso_mas_reciente(self):
        u = self.user
        u.sexo, u.estatura_cm, u.peso_inicial_kg = 'M', 175, 90
        u.fecha_nacimiento, u.nivel_actividad = date(1995, 1, 1), 'moderado'
        u.objetivo, u.velocidad_objetivo = 'mantener', 'moderado'
        u.save()
        PesoCorporal.objects.create(usuario=u, peso_kg=80, fecha=date(2026, 9, 1))
        u.calcular_metas()
        self.assertEqual(u.meta_proteina, 160)  # 2 g/kg con 80 kg, no con 90


class ProgresoTests(Base):
    def test_logros_y_score_con_sesiones_reales(self):
        with en(HOY):
            for dias in range(1, 7):  # lunes a miércoles pasados... toda la semana menos el domingo
                if (HOY - timedelta(days=dias)).weekday() != 6:
                    self.sesion(HOY - timedelta(days=dias))
            SesionGym.objects.create(usuario=self.user, fecha=HOY - timedelta(days=20), rutina='R')  # sin completar
            r = self.api.get('/api/progreso-completo/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['desglose_score']['dias_planeados'], 6)
        self.assertEqual(r.data['racha_gym'], 5)
        self.assertNotIn('10_sesiones', [l['id'] for l in r.data['logros']])
        self.assertIn('primera_sesion', [l['id'] for l in r.data['logros']])

    def test_progreso_no_hace_una_consulta_por_dia(self):
        for dias in range(30):
            Comida.objects.create(usuario=self.user, nombre='x', calorias=500, fecha=HOY - timedelta(days=dias))
        with en(HOY), CaptureQueriesContext(connection) as q:
            r = self.api.get('/api/progreso-completo/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['dias'][-1]['calorias'], 500)
        self.assertLess(len(q), 15)
