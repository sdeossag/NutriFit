import django.db.models.deletion
from django.db import migrations, models

# Copia fija de la semana por defecto de api/rutinas.py al momento de esta migración
from api.rutinas import RUTINAS_POR_DEFECTO, SEMANA_POR_DEFECTO


def a_varias_por_dia(apps, schema_editor):
    """Pasa del formato "una fila por día" a "una fila por rutina asignada".

    Quien ya tenía días guardados veía los días faltantes con la rutina por
    defecto: esos días se completan con ella para que nada cambie. Luego se
    borran las filas de descanso (un día sin filas ahora es descanso) y se
    marca la semana como creada.
    """
    Usuario   = apps.get_model('api', 'Usuario')
    Rutina    = apps.get_model('api', 'Rutina')
    RutinaDia = apps.get_model('api', 'RutinaDia')

    for user_id in RutinaDia.objects.values_list('usuario_id', flat=True).distinct():
        tiene = set(RutinaDia.objects.filter(usuario_id=user_id).values_list('dia_semana', flat=True))
        for dia in range(7):
            clave = SEMANA_POR_DEFECTO[dia]
            if dia in tiene or clave is None:
                continue
            base = next(r for r in RUTINAS_POR_DEFECTO if r['clave'] == clave)
            rutina = Rutina.objects.filter(usuario_id=user_id, nombre=base['nombre']).first() or Rutina.objects.create(
                usuario_id=user_id, nombre=base['nombre'], emoji=base['emoji'],
                color=base['color'], ejercicios=base['ejercicios'],
            )
            RutinaDia.objects.create(usuario_id=user_id, dia_semana=dia, rutina=rutina)
        Usuario.objects.filter(pk=user_id).update(semana_creada=True)

    RutinaDia.objects.filter(rutina__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0013_rutinas_como_paquete'),
    ]

    operations = [
        migrations.AddField(
            model_name='usuario',
            name='semana_creada',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='rutinadia',
            name='orden',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.RunPython(a_varias_por_dia, migrations.RunPython.noop),
        migrations.AlterUniqueTogether(name='rutinadia', unique_together=set()),
        migrations.AlterField(
            model_name='rutinadia',
            name='rutina',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='dias', to='api.rutina'),
        ),
        migrations.AlterModelOptions(name='rutinadia', options={'ordering': ['dia_semana', 'orden']}),
        migrations.AddConstraint(
            model_name='rutinadia',
            constraint=models.UniqueConstraint(fields=('usuario', 'dia_semana', 'rutina'), name='rutina_una_vez_por_dia'),
        ),
        migrations.RemoveConstraint(model_name='sesiongym', name='sesion_unica_por_dia'),
        migrations.AddConstraint(
            model_name='sesiongym',
            constraint=models.UniqueConstraint(fields=('usuario', 'fecha', 'rutina_ref'), name='sesion_unica_por_rutina'),
        ),
    ]
