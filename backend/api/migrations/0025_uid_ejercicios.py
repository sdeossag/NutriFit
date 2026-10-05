import uuid

from django.db import migrations, models


def asignar_uids(apps, schema_editor):
    """Da un uid a cada ejercicio de las rutinas y enlaza los registros
    anteriores por nombre con el ejercicio de su rutina (una sola vez)."""
    Rutina = apps.get_model('api', 'Rutina')
    EjercicioLog = apps.get_model('api', 'EjercicioLog')

    uids = {}  # rutina_id → {nombre en minúsculas: uid}
    rutinas = list(Rutina.objects.only('id', 'ejercicios'))
    for r in rutinas:
        mapa = {}
        for e in r.ejercicios or []:
            if isinstance(e, dict):
                e['uid'] = uuid.uuid4().hex[:12]
                mapa.setdefault(str(e.get('nombre', '')).lower(), e['uid'])
        uids[r.id] = mapa
    Rutina.objects.bulk_update(rutinas, ['ejercicios'], batch_size=200)

    logs = list(EjercicioLog.objects.filter(sesion__rutina_ref__isnull=False)
                .only('id', 'nombre', 'sesion__rutina_ref_id').select_related('sesion'))
    enlazados = []
    for log in logs:
        uid = uids.get(log.sesion.rutina_ref_id, {}).get(log.nombre.lower())
        if uid:
            log.ejercicio_uid = uid
            enlazados.append(log)
    EjercicioLog.objects.bulk_update(enlazados, ['ejercicio_uid'], batch_size=500)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0024_series_detalle'),
    ]

    operations = [
        migrations.AddField(
            model_name='ejerciciolog',
            name='ejercicio_uid',
            field=models.CharField(blank=True, default='', max_length=16),
        ),
        migrations.RunPython(asignar_uids, migrations.RunPython.noop),
    ]
