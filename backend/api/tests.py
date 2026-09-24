from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from . import estadisticas
from .models import Comida, EjercicioLog, PesoCorporal, Rutina, RutinaDia, SesionGym

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
        # Semana propia: entrena miércoles a sábado; lunes y domingo libres
        r = Rutina.objects.create(usuario=self.user, nombre='Full', ejercicios=[{'nombre': 'x'}])
        for d in (2, 3, 4, 5):
            RutinaDia.objects.create(usuario=self.user, dia_semana=d, rutina=r)
        self.user.semana_creada = True
        self.user.save()
        self.sesion(HOY - timedelta(days=3))  # sábado
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
        for datos in ({'dia_semana': 9}, {'dia_semana': 1, 'ejercicios': 'x'}, {'dia_semana': 1, 'ejercicios': [{}]}):
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


class RutinasTests(Base):
    def test_cuenta_nueva_recibe_la_semana_por_defecto(self):
        r = self.api.get('/api/rutinas/')
        self.assertEqual(r.status_code, 200)
        nombres = {x['nombre'] for x in r.data['rutinas']}
        self.assertEqual(nombres, {'Pecho/Hombros', 'Natación', 'Espalda/Brazos'})
        semana = r.data['semana']
        self.assertEqual(semana['6'], [])                    # domingo de descanso
        self.assertEqual(semana['1'], semana['3'])           # la natación es el mismo paquete
        # Pedirla otra vez no duplica nada
        self.api.get('/api/rutinas/')
        self.assertEqual(Rutina.objects.count(), 3)

    def test_mover_una_rutina_completa_de_martes_a_jueves(self):
        brazo = self.api.post('/api/rutinas/', {'nombre': 'Brazo', 'color': '#f472b6', 'ejercicios': [{'nombre': 'Curl'}]}, format='json').data
        self.api.put('/api/rutinas/semana/', {'semana': {'1': [brazo['id']]}}, format='json')
        r = self.api.put('/api/rutinas/semana/', {'semana': {'1': [], '3': [brazo['id']]}}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['semana']['1'], [])
        self.assertEqual(r.data['semana']['3'], [brazo['id']])
        self.assertEqual(RutinaDia.objects.get(usuario=self.user, dia_semana=3).rutina.ejercicios[0]['nombre'], 'Curl')

    def test_cambiar_color_y_validaciones(self):
        rid = self.api.post('/api/rutinas/', {'nombre': 'Pierna', 'ejercicios': []}, format='json').data['id']
        r = self.api.patch(f'/api/rutinas/{rid}/', {'color': '#F472B6'}, format='json')
        self.assertEqual(r.data['color'], '#f472b6')
        self.assertEqual(self.api.patch(f'/api/rutinas/{rid}/', {'color': 'rosa'}, format='json').status_code, 400)
        self.assertEqual(self.api.patch(f'/api/rutinas/{rid}/', {'nombre': '  '}, format='json').status_code, 400)
        self.assertEqual(self.api.post('/api/rutinas/', {'nombre': 'X', 'ejercicios': [{'series': 2}]}, format='json').status_code, 400)

    def test_no_se_puede_usar_la_rutina_de_otra_persona(self):
        otro = User.objects.create_user('beto', 'b@test.com', 'x')
        ajena = Rutina.objects.create(usuario=otro, nombre='Ajena')
        self.assertEqual(self.api.put('/api/rutinas/semana/', {'semana': {'0': [ajena.id]}}, format='json').status_code, 400)
        self.assertEqual(self.api.patch(f'/api/rutinas/{ajena.id}/', {'nombre': 'Mía'}, format='json').status_code, 404)

    def test_borrar_rutina_deja_los_dias_de_descanso(self):
        semana = self.api.get('/api/rutinas/').data['semana']
        natacion = semana['1'][0]
        r = self.api.delete(f'/api/rutinas/{natacion}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['semana']['1'], [])
        self.assertIn(1, estadisticas.dias_descanso(self.user))

    def test_sesion_recuerda_su_rutina_aunque_se_mueva(self):
        semana = self.api.get('/api/rutinas/').data['semana']
        pecho = semana['0'][0]
        self.api.post('/api/sesiones/registrar/', {'fecha': '2026-09-21', 'rutina_ref': pecho,
                                                   'ejercicios': [{'nombre': 'Pec fly'}]}, format='json')
        self.api.put('/api/rutinas/semana/', {'semana': {'0': []}}, format='json')
        self.assertEqual(SesionGym.objects.get().rutina_ref_id, pecho)

    def test_resumen_sabe_si_hoy_es_descanso_segun_el_plan(self):
        with en(HOY):  # martes
            self.api.get('/api/rutinas/')
            self.assertFalse(self.api.get('/api/resumen/').data['es_dia_descanso'])
            self.api.put('/api/rutinas/semana/', {'semana': {'1': None}}, format='json')
            self.assertTrue(self.api.get('/api/resumen/').data['es_dia_descanso'])


class DobleEntrenoTests(Base):
    def test_dos_rutinas_el_mismo_dia_y_una_sesion_por_cada_una(self):
        semana = self.api.get('/api/rutinas/').data['semana']
        pecho, natacion = semana['0'][0], semana['1'][0]
        r = self.api.put('/api/rutinas/semana/', {'semana': {'0': [natacion, pecho]}}, format='json')
        self.assertEqual(r.data['semana']['0'], [natacion, pecho])  # respeta el orden

        for rid, ex in ((natacion, 'Natación libre'), (pecho, 'Pec fly')):
            self.api.post('/api/sesiones/registrar/', {'fecha': '2026-09-21', 'rutina_ref': rid,
                                                       'ejercicios': [{'nombre': ex}]}, format='json')
        self.assertEqual(SesionGym.objects.filter(fecha='2026-09-21').count(), 2)
        dia = self.api.get('/api/sesiones/fecha/2026-09-21/').data
        self.assertTrue(dia['completada'])
        self.assertEqual({e['nombre'] for e in dia['ejercicios']}, {'Natación libre', 'Pec fly'})
        # El doble entreno cuenta como un día en la racha
        self.assertEqual(estadisticas.racha_gym(self.user, date(2026, 9, 22)), 1)

    def test_maximo_tres_por_dia(self):
        ids = [self.api.post('/api/rutinas/', {'nombre': f'R{i}', 'ejercicios': []}, format='json').data['id'] for i in range(4)]
        r = self.api.put('/api/rutinas/semana/', {'semana': {'2': ids}}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_semana_toda_de_descanso_no_se_vuelve_a_llenar(self):
        self.api.get('/api/rutinas/')
        self.api.put('/api/rutinas/semana/', {'semana': {str(d): [] for d in range(7)}}, format='json')
        self.assertEqual(set(map(tuple, self.api.get('/api/rutinas/').data['semana'].values())), {()})


class LogrosTests(Base):
    def logro(self, clave):
        with en(HOY):
            datos = self.api.get('/api/logros/').data
        return next(l for l in datos['logros'] if l['clave'] == clave), datos

    def test_sin_datos_todo_en_cero_y_con_meta_siguiente(self):
        l, datos = self.logro('sesiones')
        self.assertEqual((l['nivel'], l['valor'], l['siguiente']), (0, 0, 1))
        self.assertEqual(datos['nuevos'], 0)

    def test_primera_sesion_desbloquea_bronce_y_se_celebra_una_vez(self):
        self.sesion(HOY - timedelta(days=1))
        l, datos = self.logro('sesiones')
        self.assertEqual((l['nivel'], l['nivel_nombre'], l['siguiente']), (1, 'Bronce', 10))
        self.assertTrue(l['nuevo'])
        self.assertEqual(datos['logros'][0]['clave'], 'sesiones')  # lo nuevo va primero
        self.api.post('/api/logros/vistos/')
        self.assertFalse(self.logro('sesiones')[0]['nuevo'])

    def test_record_personal(self):
        for dias, peso in ((10, 40), (7, 40), (3, 45), (1, 50)):
            s = self.sesion(HOY - timedelta(days=dias))
            EjercicioLog.objects.create(sesion=s, nombre='Press banca', reps='8', peso_kg=peso)
        self.assertEqual(self.logro('records')[0]['valor'], 2)  # 45 y 50 superaron el máximo previo

    def test_el_nivel_ganado_no_se_pierde(self):
        self.user.meta_proteina = 100
        self.user.save()
        Comida.objects.create(usuario=self.user, nombre='pollo', proteina=120, fecha=HOY - timedelta(days=1))
        self.assertEqual(self.logro('proteina')[0]['nivel'], 1)
        self.user.meta_proteina = 300  # sube la meta: ese día ya no cuenta
        self.user.save()
        l = self.logro('proteina')[0]
        self.assertEqual((l['valor'], l['nivel']), (0, 1))

    def test_mejor_racha_de_gym_con_descanso(self):
        for dias in (1, 3, 4, 5):  # lun, sáb, vie, jue — el domingo es descanso
            self.sesion(HOY - timedelta(days=dias))
        self.assertEqual(self.logro('racha_gym')[0]['valor'], 4)

    def test_singular_cuando_la_meta_es_uno(self):
        l = self.logro('records')[0]
        self.assertEqual((l['descripcion'], l['unidad']), ('1 récord personal', 'récord'))
