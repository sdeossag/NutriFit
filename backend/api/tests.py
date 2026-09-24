from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from . import estadisticas
from .models import Comida, EjercicioLog, PesoCorporal, PlanDia, Rutina, RutinaDia, SesionGym

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

    def semana_de_prueba(self):
        """Lunes a sábado con rutina (natación martes, jueves y sábado), domingo libre."""
        from .rutinas import RUTINAS_POR_DEFECTO, SEMANA_POR_DEFECTO
        ids = {}
        for r in RUTINAS_POR_DEFECTO:
            ids[r['clave']] = self.api.post('/api/rutinas/', {k: r[k] for k in ('nombre', 'emoji', 'color', 'ejercicios')}, format='json').data['id']
        semana = {str(d): [ids[c]] if c else [] for d, c in enumerate(SEMANA_POR_DEFECTO)}
        return self.api.put('/api/rutinas/semana/', {'semana': semana}, format='json').data['semana']


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
    def test_cuenta_nueva_empieza_con_la_semana_vacia(self):
        r = self.api.get('/api/rutinas/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['rutinas'], [])
        self.assertEqual(set(map(tuple, r.data['semana'].values())), {()})
        self.user.refresh_from_db()
        self.assertTrue(self.user.semana_creada)

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
        semana = self.semana_de_prueba()
        natacion = semana['1'][0]
        r = self.api.delete(f'/api/rutinas/{natacion}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['semana']['1'], [])
        self.assertIn(1, estadisticas.dias_descanso(self.user))

    def test_sesion_recuerda_su_rutina_aunque_se_mueva(self):
        semana = self.semana_de_prueba()
        pecho = semana['0'][0]
        self.api.post('/api/sesiones/registrar/', {'fecha': '2026-09-21', 'rutina_ref': pecho,
                                                   'ejercicios': [{'nombre': 'Pec fly'}]}, format='json')
        self.api.put('/api/rutinas/semana/', {'semana': {'0': []}}, format='json')
        self.assertEqual(SesionGym.objects.get().rutina_ref_id, pecho)

    def test_resumen_sabe_si_hoy_es_descanso_segun_el_plan(self):
        with en(HOY):  # martes
            self.semana_de_prueba()
            self.assertFalse(self.api.get('/api/resumen/').data['es_dia_descanso'])
            self.api.put('/api/rutinas/semana/', {'semana': {'1': None}}, format='json')
            self.assertTrue(self.api.get('/api/resumen/').data['es_dia_descanso'])


class DobleEntrenoTests(Base):
    def test_dos_rutinas_el_mismo_dia_y_una_sesion_por_cada_una(self):
        semana = self.semana_de_prueba()
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


class PlanDiaTests(Base):
    def setUp(self):
        super().setUp()
        u = self.user
        u.meta_calorias, u.meta_proteina, u.meta_carbos, u.meta_grasas = 2000, 150, 200, 60
        u.restricciones_dieta, u.alimentos_no_gustados = ['vegetariano'], ['Brócoli']
        u.save()

    def comida_ia(self, momento, nombre, ingredientes, cal=500, p=30, c=60, g=15):
        return {'momento': momento, 'nombre': nombre, 'ingredientes': [{'nombre': i, 'cantidad': '100 g'} for i in ingredientes],
                'preparacion': ['Cocinar'], 'minutos': 10, 'calorias': cal, 'proteina': p, 'carbos': c, 'grasas': g}

    def test_verificacion_de_restricciones(self):
        from .plan import violaciones
        perfil = {'restricciones': ['vegetariano', 'sin_lacteos', 'sin_gluten'], 'no_gustan': ['Brócoli']}
        self.assertTrue(violaciones(self.comida_ia('cena', 'Arroz con pollo', ['arroz']), perfil))
        self.assertTrue(violaciones(self.comida_ia('cena', 'Tortilla', ['huevos', 'queso campesino']), perfil))
        self.assertTrue(violaciones(self.comida_ia('cena', 'Bowl', ['brocoli al vapor']), perfil))
        self.assertTrue(violaciones(self.comida_ia('cena', 'Tostadas', ['pan integral']), perfil))
        self.assertEqual(violaciones(self.comida_ia('desayuno', 'Avena', ['leche de almendras', 'panela', 'fresas']), perfil), [])

    def test_genera_y_reintenta_si_se_cuela_algo_prohibido(self):
        respuestas = iter([
            {'comidas': [self.comida_ia('almuerzo', 'Pollo asado', ['pechuga de pollo']),
                         self.comida_ia('cena', 'Lentejas', ['lentejas', 'arroz'])], 'consejo': 'Dale.'},
            {'comidas': [self.comida_ia('almuerzo', 'Garbanzos guisados', ['garbanzos', 'papa'], cal=999)]},
            {'comidas': []},  # segunda pasada de ajuste: sin cambios
        ])
        with en(HOY), mock.patch('api.plan.momentos_restantes', return_value=['almuerzo', 'cena']), \
                mock.patch('api.plan._pedir_a_la_ia', side_effect=lambda prompt: next(respuestas)) as ia:
            r = self.api.post('/api/plan/', {'fecha': HOY.isoformat()}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(ia.call_count, 3)
        nombres = [c['nombre'] for c in r.data['plan']['comidas']]
        self.assertEqual(nombres, ['Garbanzos guisados', 'Lentejas'])        # en orden del día
        self.assertEqual(r.data['plan']['comidas'][0]['calorias'], 495)     # 4·30 + 4·60 + 9·15, no 999
        self.assertIn('Pechuga de pollo', ia.call_args_list[1].args[0].replace('pechuga', 'Pechuga'))

    def test_reparto_segun_lo_que_falta(self):
        from .plan import objetivos_por_momento
        Comida.objects.create(usuario=self.user, nombre='x', calorias=800, proteina=50, fecha=HOY)
        from .plan import restante_del_dia
        restante = restante_del_dia(self.user, HOY)
        self.assertEqual((restante['calorias'], restante['proteina']), (1200, 100))
        obj = objetivos_por_momento(restante, ['almuerzo', 'cena'])
        self.assertAlmostEqual(sum(o['calorias'] for o in obj.values()), 1200, delta=2)
        self.assertGreater(obj['almuerzo']['calorias'], obj['cena']['calorias'])

    def test_registrar_una_comida_del_plan(self):
        PlanDia.objects.create(usuario=self.user, fecha=HOY, comidas=[
            {'momento': 'cena', 'nombre': 'Lentejas', 'porcion': '1 plato', 'calorias': 495,
             'proteina': 30, 'carbos': 60, 'grasas': 15, 'registrada': False},
        ])
        with en(HOY):
            r = self.api.post('/api/plan/registrar/', {'fecha': HOY.isoformat(), 'indice': 0}, format='json')
            self.assertEqual(r.status_code, 201, r.data)
            self.assertTrue(r.data['plan']['comidas'][0]['registrada'])
            self.assertEqual(Comida.objects.get(usuario=self.user).calorias, 495)
            again = self.api.post('/api/plan/registrar/', {'fecha': HOY.isoformat(), 'indice': 0}, format='json')
        self.assertEqual(again.status_code, 400)

    def test_tarde_en_la_noche_sugiere_planear_manana(self):
        with en(HOY), mock.patch('api.plan.momentos_restantes', return_value=[]):
            r = self.api.post('/api/plan/', {'fecha': HOY.isoformat()}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('mañana', r.data['error'])

    def test_no_se_planea_el_pasado(self):
        with en(HOY):
            r = self.api.get('/api/plan/?fecha=2026-01-01')
        self.assertEqual(r.status_code, 400)

    def test_segunda_pasada_ajusta_comidas_cortas_de_proteina(self):
        def ing(nombre, cal, p):
            return {'nombre': nombre, 'cantidad': '100 g', 'calorias': cal, 'proteina': p, 'carbos': 10, 'grasas': 5}
        corta   = {'momento': 'cena', 'nombre': 'Arepa con queso', 'ingredientes': [ing('arepa', 250, 5)], 'preparacion': []}
        mejor   = {'momento': 'cena', 'nombre': 'Arepa con huevos', 'ingredientes': [ing('arepa', 250, 5), ing('huevos', 300, 30)], 'preparacion': []}
        respuestas = iter([{'comidas': [corta]}, {'comidas': [mejor]}])
        with en(HOY), mock.patch('api.plan.momentos_restantes', return_value=['cena']),                 mock.patch('api.plan._pedir_a_la_ia', side_effect=lambda prompt: next(respuestas)) as ia:
            r = self.api.post('/api/plan/', {'fecha': HOY.isoformat()}, format='json')
        self.assertEqual(ia.call_count, 2)
        cena = r.data['plan']['comidas'][0]
        self.assertEqual((cena['nombre'], cena['proteina'], cena['calorias']), ('Arepa con huevos', 35.0, 310))  # calorías según macros

    def test_de_noche_la_cena_tiene_tope_realista(self):
        from .plan import objetivos_por_momento
        obj = objetivos_por_momento({'calorias': 2000, 'proteina': 150, 'carbos': 200, 'grasas': 60}, ['cena'], {'calorias': 2000})
        self.assertEqual(obj['cena']['calorias'], 900)   # 2000 × (30% + 15%)
        self.assertEqual(obj['cena']['proteina'], 68)    # proporcional al recorte


class PreferenciasTests(Base):
    def test_actualizar_y_validar_preferencias(self):
        r = self.api.patch('/api/auth/perfil/preferencias/', {
            'alimentos_gustados': ['Maní', 'Pollo', 'pollo', ' '], 'alergias': ['maní'],
            'restricciones_dieta': ['sin_vegetales'],
        }, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        # Sin repetidos ni vacíos, y lo que es alergia sale de "me gusta"
        self.assertEqual(r.data['alimentos_gustados'], ['Pollo'])
        self.assertEqual(r.data['restricciones_dieta'], ['sin_vegetales'])
        mala = self.api.patch('/api/auth/perfil/preferencias/', {'restricciones_dieta': ['keto']}, format='json')
        self.assertEqual(mala.status_code, 400)


class VerificacionTests(Base):
    def verificar(self, restricciones=(), alergias=(), no_gustan=(), nombre='Plato', ingredientes=(), preparacion=()):
        from .plan import violaciones
        comida = {'nombre': nombre, 'ingredientes': [{'nombre': i} for i in ingredientes], 'preparacion': list(preparacion)}
        return violaciones(comida, {'restricciones': list(restricciones), 'alergias': list(alergias), 'no_gustan': list(no_gustan)})

    def test_sin_vegetales(self):
        r = ['sin_vegetales']
        self.assertTrue(self.verificar(r, nombre='Ensalada César'))
        self.assertTrue(self.verificar(r, ingredientes=['brócoli al vapor']))
        self.assertTrue(self.verificar(r, ingredientes=['verduras salteadas']))
        # Frutas, legumbres y verduras escondidas sí
        self.assertEqual(self.verificar(r, nombre='Sopa de lentejas', ingredientes=['lentejas', 'zanahoria', 'cebolla']), [])
        self.assertEqual(self.verificar(r, nombre='Crema de ahuyama', ingredientes=['crema de espinaca licuada']), [])
        self.assertEqual(self.verificar(r, nombre='Fríjoles con arroz', ingredientes=['fríjoles', 'hogao', 'tomate']), [])
        self.assertEqual(self.verificar(r, nombre='Bowl de frutas', ingredientes=['mango', 'fresas', 'banano']), [])

    def test_alergia_no_tiene_excepciones(self):
        # "Mantequilla de maní" pasa para sin lácteos, pero nunca para alergia al maní
        self.assertEqual(self.verificar(['sin_lacteos'], ingredientes=['mantequilla de maní']), [])
        self.assertTrue(self.verificar(alergias=['Maní'], ingredientes=['mantequilla de maní']))
        self.assertTrue(self.verificar(alergias=['Mariscos'], ingredientes=['arroz con camarones']))
        # También en la preparación
        self.assertTrue(self.verificar(alergias=['Ajonjolí'], preparacion=['Espolvorear ajonjolí tostado']))

    def test_vegetal_ya_no_salta_otras_restricciones(self):
        # Antes "vegetal" era excepción global: "pollo con vegetales" se colaba en vegetariano
        self.assertTrue(self.verificar(['vegetariano'], ingredientes=['pollo con vegetales']))


class FotoPlanTests(Base):
    def setUp(self):
        super().setUp()
        self.plan = PlanDia.objects.create(usuario=self.user, fecha=HOY, comidas=[{
            'momento': 'almuerzo', 'nombre': 'Arroz con huevo', 'porcion': '1 plato',
            'ingredientes': [
                {'nombre': 'Arroz', 'cantidad': '150 g', 'calorias': 195, 'proteina': 4, 'carbos': 42, 'grasas': 0.5},
                {'nombre': 'Huevo', 'cantidad': '2 unidades', 'calorias': 140, 'proteina': 12, 'carbos': 1, 'grasas': 10},
            ],
            'calorias': 335, 'proteina': 16, 'carbos': 43, 'grasas': 10.5, 'registrada': False,
        }])

    def test_la_foto_ajusta_la_porcion_y_luego_se_registra(self):
        ia = {'coincide': True, 'observacion': 'Más arroz, un solo huevo',
              'factores': [{'nombre': 'Arroz', 'factor': 1.5}, {'nombre': 'huevo', 'factor': 0.5}],
              'extras': [{'nombre': 'Aguacate', 'cantidad': '50 g', 'calorias': 80, 'proteina': 1, 'carbos': 4, 'grasas': 7}]}
        with en(HOY), mock.patch('api.plan._analizar_foto_ia', return_value=ia):
            r = self.api.post('/api/plan/foto/', {'fecha': HOY.isoformat(), 'indice': 0, 'imagen': 'xxx'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        # arroz 4×1.5 + huevo 12×0.5 + aguacate 1
        self.assertEqual(r.data['proteina'], 13.0)
        self.assertEqual(r.data['antes']['calorias'], 335)
        self.assertFalse(PlanDia.objects.get().comidas[0]['registrada'])  # la foto no guarda nada

        with en(HOY):
            reg = self.api.post('/api/plan/registrar/', {'fecha': HOY.isoformat(), 'indice': 0, 'ajuste': {
                'calorias': r.data['calorias'], 'proteina': r.data['proteina'], 'carbos': r.data['carbos'],
                'grasas': r.data['grasas'], 'nota': 'más arroz, un huevo'}}, format='json')
        self.assertEqual(reg.status_code, 201, reg.data)
        comida = Comida.objects.get(usuario=self.user)
        self.assertEqual(comida.proteina, 13.0)
        self.assertIn('más arroz', comida.descripcion)

    def test_foto_de_otro_plato(self):
        with en(HOY), mock.patch('api.plan._analizar_foto_ia', return_value={'coincide': False, 'observacion': 'Es una pizza'}):
            r = self.api.post('/api/plan/foto/', {'fecha': HOY.isoformat(), 'indice': 0, 'imagen': 'xxx'}, format='json')
        self.assertFalse(r.data['coincide'])

    def test_conflicto_si_cambian_las_preferencias(self):
        self.user.alergias = ['huevo']
        self.user.save()
        with en(HOY):
            r = self.api.get(f'/api/plan/?fecha={HOY.isoformat()}')
        self.assertEqual(r.data['conflictos'], ['Arroz con huevo'])

    def test_mismo_plato_aunque_la_ia_sea_muy_estricta(self):
        # Falta un ingrediente menor (huevo) pero el arroz, lo principal, está
        ia = {'coincide': False, 'factores': [{'nombre': 'Arroz', 'factor': 1}, {'nombre': 'Huevo', 'factor': 0}]}
        with en(HOY), mock.patch('api.plan._analizar_foto_ia', return_value=ia):
            r = self.api.post('/api/plan/foto/', {'fecha': HOY.isoformat(), 'indice': 0, 'imagen': 'xxx'}, format='json')
        self.assertTrue(r.data['coincide'])

    def test_no_se_registra_lo_de_manana(self):
        PlanDia.objects.create(usuario=self.user, fecha=HOY + timedelta(days=1), comidas=self.plan.comidas)
        with en(HOY):
            r = self.api.post('/api/plan/registrar/', {'fecha': (HOY + timedelta(days=1)).isoformat(), 'indice': 0}, format='json')
            f = self.api.post('/api/plan/foto/', {'fecha': (HOY + timedelta(days=1)).isoformat(), 'indice': 0, 'imagen': 'x'}, format='json')
        self.assertEqual((r.status_code, f.status_code), (400, 400))
        self.assertFalse(Comida.objects.exists())


class NotificacionesTests(Base):
    def setUp(self):
        super().setUp()
        from .models import PushSubscription
        u = self.user
        u.meta_calorias, u.meta_proteina = 2000, 150
        u.save()
        self.sub = PushSubscription.objects.create(usuario=u, endpoint='https://push.example/1', p256dh='k', auth='a')

    def a_las(self, h, m=5, dia=HOY):
        from datetime import datetime
        from django.utils import timezone as tz
        return tz.make_aware(datetime(dia.year, dia.month, dia.day, h, m))

    def tipos(self, ahora):
        from .notificaciones import pendientes
        return [(t, titulo) for t, _, titulo, *_ in pendientes(self.user, ahora)]

    def test_comida_con_el_plato_del_plan_y_no_si_ya_la_registro(self):
        PlanDia.objects.create(usuario=self.user, fecha=HOY, comidas=[
            {'momento': 'almuerzo', 'nombre': 'Guiso de lentejas', 'calorias': 670, 'proteina': 40, 'registrada': False}])
        self.assertIn(('comida', 'Almuerzo · Guiso de lentejas'), self.tipos(self.a_las(12, 35)))
        plan = PlanDia.objects.get()
        plan.comidas[0]['registrada'] = True
        plan.save()
        self.assertNotIn('comida', [t for t, _ in self.tipos(self.a_las(12, 35))])

    def test_no_recuerda_comer_si_ya_va_al_dia(self):
        Comida.objects.create(usuario=self.user, nombre='x', calorias=1200, fecha=HOY)  # 60% > 55%
        self.assertNotIn('comida', [t for t, _ in self.tipos(self.a_las(12, 35))])

    def test_gym_solo_si_hay_rutina_y_no_ha_ido(self):
        self.semana_de_prueba()                # martes: natación
        self.assertIn(('gym', 'Hoy toca Natación'), self.tipos(self.a_las(18, 5)))
        self.sesion(HOY)
        self.assertNotIn('gym', [t for t, _ in self.tipos(self.a_las(18, 5))])
        # Domingo es descanso: nada de gym
        self.assertNotIn('gym', [t for t, _ in self.tipos(self.a_las(18, 5, HOY + timedelta(days=5)))])

    def test_agua_solo_si_va_atrasado(self):
        self.assertIn('agua', [t for t, _ in self.tipos(self.a_las(13, 5))])
        from .models import RegistroAgua
        RegistroAgua.objects.create(usuario=self.user, fecha=HOY, cantidad_ml=1200)
        self.assertNotIn('agua', [t for t, _ in self.tipos(self.a_las(13, 5))])

    def test_horario_silencioso_y_maximo_diario(self):
        self.assertEqual(self.tipos(self.a_las(23, 0)), [])
        self.user.ajustes_notif = {'maximo_dia': 1, 'agua': {'horas': ['12:30']}}
        self.user.save()
        self.assertEqual(len(self.tipos(self.a_las(12, 35))), 1)

    def test_revision_no_repite_y_usa_respaldo_si_falla_la_ia(self):
        from .notificaciones import revisar_todos
        from .models import NotificacionEnviada
        with mock.patch('api.notificaciones._send_push', return_value=True) as envio, \
                mock.patch('api.views._groq_chat', side_effect=Exception('sin IA')):
            primera = revisar_todos(self.a_las(13, 5))
            segunda = revisar_todos(self.a_las(13, 10))
        self.assertGreaterEqual(primera, 1)
        self.assertEqual(segunda, 0)
        carga = envio.call_args.args[1]
        self.assertEqual((carga['tag'], carga['destino']), ('nf-agua', 'agua'))
        self.assertIn('L', NotificacionEnviada.objects.get(tipo='agua').cuerpo)  # texto de respaldo útil

    def test_ajustes_validados_y_combinados(self):
        r = self.api.patch('/api/notificaciones/ajustes/', {'gym': {'hora': '19:15'}, 'agua': {'activo': False}}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data['gym']['hora'], r.data['gym']['activo'], r.data['agua']['activo']), ('19:15', True, False))
        self.assertEqual(self.api.patch('/api/notificaciones/ajustes/', {'gym': {'hora': '25:00'}}, format='json').status_code, 400)

    def test_desuscribir_solo_este_dispositivo(self):
        from .models import PushSubscription
        PushSubscription.objects.create(usuario=self.user, endpoint='https://push.example/2', p256dh='k', auth='a')
        self.api.delete('/api/push/unsubscribe/', {'endpoint': 'https://push.example/1'}, format='json')
        self.assertEqual(list(PushSubscription.objects.values_list('endpoint', flat=True)), ['https://push.example/2'])

    def test_cron_manual_exige_la_clave_en_el_encabezado(self):
        with self.settings(CRON_SECRET='s3creto'):
            self.assertEqual(self.client.post('/api/push/cron/?key=s3creto').status_code, 403)
            with mock.patch('api.notificaciones.revisar_todos', return_value=0):
                self.assertEqual(self.client.post('/api/push/cron/', HTTP_X_CRON_KEY='s3creto').status_code, 200)


class BibliotecaTests(Base):
    def test_lista_base_sin_pesos_y_una_sola_vez(self):
        r = self.api.get('/api/ejercicios/')
        self.assertGreater(len(r.data), 30)
        self.assertTrue(all(e['peso'] == '—' and not e['custom'] for e in r.data))
        self.assertEqual(len(self.api.get('/api/ejercicios/').data), len(r.data))

    def test_editar_actualiza_rutinas_e_historial(self):
        self.api.get('/api/ejercicios/')
        banca = next(e for e in self.api.get('/api/ejercicios/').data if e['nombre'] == 'Press banca plano')
        # Una rutina lo usa con las series de la biblioteca y otra con series propias
        a = self.api.post('/api/rutinas/', {'nombre': 'A', 'ejercicios': [{'nombre': 'Press banca plano', 'musculo': 'Pecho', 'series': 4, 'reps': '8'}]}, format='json').data
        b = self.api.post('/api/rutinas/', {'nombre': 'B', 'ejercicios': [{'nombre': 'press banca plano', 'musculo': 'Pecho', 'series': 5, 'reps': '5'}]}, format='json').data
        s = self.sesion(HOY)
        EjercicioLog.objects.create(sesion=s, nombre='Press banca plano', reps='8', peso_kg=60)

        r = self.api.patch(f"/api/ejercicios/{banca['id']}/", {'nombre': 'Press de banca', 'series': 3}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(sorted(r.data['rutinas_actualizadas']), ['A', 'B'])
        ra, rb = Rutina.objects.get(id=a['id']).ejercicios[0], Rutina.objects.get(id=b['id']).ejercicios[0]
        self.assertEqual((ra['nombre'], ra['series']), ('Press de banca', 3))   # tenía el valor de la biblioteca
        self.assertEqual((rb['nombre'], rb['series']), ('Press de banca', 5))   # su ajuste propio se respeta
        self.assertEqual(EjercicioLog.objects.get().nombre, 'Press de banca')   # el historial no se parte

    def test_no_dos_con_el_mismo_nombre_y_borrar_avisa_donde_se_usa(self):
        self.api.get('/api/ejercicios/')
        self.assertEqual(self.api.post('/api/ejercicios/', {'nombre': 'sentadilla'}, format='json').status_code, 400)
        nuevo = self.api.post('/api/ejercicios/', {'nombre': 'Hip thrust con banda', 'musculo': 'Piernas', 'color': '#f472b6'}, format='json').data
        self.api.post('/api/rutinas/', {'nombre': 'Glúteo', 'ejercicios': [{'nombre': 'Hip thrust con banda'}]}, format='json')
        r = self.api.delete(f"/api/ejercicios/{nuevo['id']}/")
        self.assertEqual(r.data['usado_en'], ['Glúteo'])
        self.assertEqual(Rutina.objects.get().ejercicios[0]['nombre'], 'Hip thrust con banda')  # la rutina lo conserva


class GenerarRutinaTests(Base):
    def test_bruce_arma_la_semana(self):
        ia = {
            'rutinas': [
                {'clave': 'A', 'nombre': 'Torso', 'emoji': '💪', 'ejercicios': [
                    {'nombre': 'press banca plano', 'musculo': 'Pecho', 'series': 4, 'reps': '8', 'peso': 'moderado'},
                    {'nombre': 'Remo invertido', 'musculo': 'Espalda alta', 'series': 3, 'reps': '10'}]},
                {'clave': 'B', 'nombre': 'Pierna', 'emoji': '🦵', 'ejercicios': [{'nombre': 'Sentadilla', 'musculo': 'Piernas', 'series': 4, 'reps': '8'}]},
            ],
            'semana': {'0': 'A', '2': 'B', '4': 'A', '5': 'Z'},
            'explicacion': 'Torso y pierna alternados.',
        }
        with mock.patch('api.rutinas._pedir_rutina_ia', return_value=ia):
            r = self.api.post('/api/rutinas/generar/', {'dias': [0, 2, 4], 'minutos': 45, 'lugar': 'gym', 'nivel': 'principiante'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        semana = r.data['semana']
        self.assertEqual(semana['0'], semana['4'])                 # la misma rutina A dos días
        self.assertEqual(semana['1'], [])                          # lo no elegido queda de descanso
        torso = next(x for x in r.data['rutinas'] if x['nombre'] == 'Torso')
        self.assertEqual(torso['ejercicios'][0]['nombre'], 'Press banca plano')   # nombre exacto de la biblioteca
        self.assertEqual(torso['ejercicios'][1]['musculo'], 'Core')               # músculo inválido corregido
        nombres = {e['nombre'] for e in self.api.get('/api/ejercicios/').data}
        self.assertIn('Remo invertido', nombres)                   # lo nuevo entra a la biblioteca
        self.assertEqual(r.data['explicacion'], 'Torso y pierna alternados.')

    def test_datos_invalidos(self):
        self.assertEqual(self.api.post('/api/rutinas/generar/', {'dias': []}, format='json').status_code, 400)
        self.assertEqual(self.api.post('/api/rutinas/generar/', {'dias': [1], 'minutos': 20}, format='json').status_code, 400)


class ChatPlanTests(Base):
    """Bruce cambia el plan desde el chat con las mismas reglas que la pantalla."""
    comida_ia = PlanDiaTests.comida_ia

    def setUp(self):
        super().setUp()
        self.user.meta_calorias, self.user.meta_proteina, self.user.meta_carbos, self.user.meta_grasas = 2000, 150, 200, 60
        self.user.save()
        from .models import SesionChat
        self.chat = SesionChat.objects.create(usuario=self.user)
        PlanDia.objects.create(usuario=self.user, fecha=HOY, comidas=[
            {'momento': 'cena', 'nombre': 'Lentejas', 'porcion': '1 plato', 'calorias': 495,
             'proteina': 30, 'carbos': 60, 'grasas': 15, 'registrada': False},
        ])

    def herramienta(self, nombre, args):
        import json
        return {'content': '', 'tool_calls': [{'id': 'c1', 'type': 'function',
                'function': {'name': nombre, 'arguments': json.dumps(args)}}]}

    def test_cambia_la_cena_desde_el_chat_y_se_puede_deshacer(self):
        ia_chat = iter([self.herramienta('cambiar_comida', {'dia': 'hoy', 'momento': 'cena', 'pedido': 'algo con huevo'}),
                        {'content': 'Listo: cena de huevos rancheros, 495 kcal.'}])
        pedidos = []

        def ia_plan(prompt):
            pedidos.append(prompt)
            return {'comidas': [self.comida_ia('cena', 'Huevos rancheros', ['huevos', 'frijoles'])]}

        with en(HOY), mock.patch('api.views._groq_mensaje', side_effect=lambda payload: next(ia_chat)) as chat, \
                mock.patch('api.plan._pedir_a_la_ia', side_effect=ia_plan):
            r = self.api.post(f'/api/chat/{self.chat.id}/mensaje/', {'mensaje': 'cámbiame la cena por algo con huevo'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['mensaje_bruce']['contenido'], 'Listo: cena de huevos rancheros, 495 kcal.')
        accion = r.data['mensaje_bruce']['acciones'][0]
        self.assertEqual((accion['tipo'], accion['indice'], accion['antes']), ('comida_cambiada', 0, 'Lentejas'))
        self.assertEqual(accion['comida']['nombre'], 'Huevos rancheros')
        self.assertIn('algo con huevo', pedidos[0])
        # La IA recibió el resultado de la herramienta en la segunda vuelta
        self.assertEqual(chat.call_args_list[1].args[0]['messages'][-1]['role'], 'tool')

        with en(HOY):
            d = self.api.post('/api/plan/deshacer/', {'fecha': HOY.isoformat(), 'indice': 0}, format='json')
            self.assertEqual(d.status_code, 200, d.data)
            self.assertEqual(d.data['plan']['comidas'][0]['nombre'], 'Lentejas')
            otra = self.api.post('/api/plan/deshacer/', {'fecha': HOY.isoformat(), 'indice': 0}, format='json')
        self.assertEqual(otra.status_code, 400)

    def test_error_de_la_herramienta_llega_a_la_ia_sin_accion(self):
        ia_chat = iter([self.herramienta('cambiar_comida', {'dia': 'manana', 'momento': 'cena'}),
                        {'content': 'Mañana no tienes plan todavía, ¿te lo armo?'}])
        with en(HOY), mock.patch('api.views._groq_mensaje', side_effect=lambda payload: next(ia_chat)) as chat:
            r = self.api.post(f'/api/chat/{self.chat.id}/mensaje/', {'mensaje': 'cambia la cena de mañana'}, format='json')
        self.assertEqual(r.data['mensaje_bruce']['acciones'], [])
        self.assertIn('No hay plan', chat.call_args_list[1].args[0]['messages'][-1]['content'])

    def test_si_la_ia_se_cae_despues_del_cambio_igual_se_guarda_la_accion(self):
        llamadas = iter([self.herramienta('cambiar_comida', {'dia': 'hoy', 'momento': 'cena'})])

        def ia_chat(payload):
            try:
                return next(llamadas)
            except StopIteration:
                raise ConnectionError('se cayó')

        with en(HOY), mock.patch('api.views._groq_mensaje', side_effect=ia_chat), \
                mock.patch('api.plan._pedir_a_la_ia', return_value={'comidas': [self.comida_ia('cena', 'Arepa con huevo', ['arepa', 'huevos'])]}):
            r = self.api.post(f'/api/chat/{self.chat.id}/mensaje/', {'mensaje': 'otra cena'}, format='json')
        self.assertEqual(len(r.data['mensaje_bruce']['acciones']), 1)
        self.assertIn('Arepa con huevo', r.data['mensaje_bruce']['contenido'])
