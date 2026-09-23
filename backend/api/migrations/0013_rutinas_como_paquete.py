import json

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

# Colores que usaba la app según la letra de la rutina
COLOR_POR_LETRA = {'A': '#4ade80', 'B': '#60a5fa', 'C': '#a78bfa', 'D': '#fb923c'}


def dias_a_rutinas(apps, schema_editor):
    """Convierte cada día guardado en una Rutina reutilizable.

    Si dos días tenían exactamente la misma rutina (mismo nombre, emoji y
    ejercicios), quedan apuntando al mismo paquete. Los días marcados como
    descanso o sin ejercicios quedan sin rutina. Las sesiones pasadas se
    enlazan con la rutina que tenía su día de la semana, para que el
    historial se siga viendo igual.
    """
    Rutina    = apps.get_model('api', 'Rutina')
    RutinaDia = apps.get_model('api', 'RutinaDia')
    SesionGym = apps.get_model('api', 'SesionGym')

    creadas = {}
    for dia in RutinaDia.objects.order_by('usuario_id', 'dia_semana'):
        if dia.rutina_id == 'R' or not dia.ejercicios:
            continue
        clave = (dia.usuario_id, dia.nombre, dia.emoji, json.dumps(dia.ejercicios, sort_keys=True))
        if clave not in creadas:
            creadas[clave] = Rutina.objects.create(
                usuario_id=dia.usuario_id,
                nombre=(dia.nombre or 'Rutina')[:100],
                emoji=dia.emoji or '💪',
                color=COLOR_POR_LETRA.get(dia.rutina_id, '#4ade80'),
                ejercicios=dia.ejercicios,
            )
        dia.rutina_nueva = creadas[clave]
        dia.save(update_fields=['rutina_nueva'])

    for sesion in SesionGym.objects.filter(completada=True, rutina_ref__isnull=True):
        dia = RutinaDia.objects.filter(
            usuario_id=sesion.usuario_id, dia_semana=sesion.fecha.weekday(),
        ).first()
        if dia and dia.rutina_nueva_id:
            sesion.rutina_ref_id = dia.rutina_nueva_id
            sesion.save(update_fields=['rutina_ref'])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0012_indices_y_sesion_unica'),
    ]

    operations = [
        migrations.CreateModel(
            name='Rutina',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=100)),
                ('emoji', models.CharField(default='💪', max_length=10)),
                ('color', models.CharField(default='#4ade80', max_length=7)),
                ('ejercicios', models.JSONField(blank=True, default=list)),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
                ('actualizado', models.DateTimeField(auto_now=True)),
                ('usuario', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rutinas', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['creado_en', 'id'],
            },
        ),
        # Temporal: el campo viejo "rutina_id" (texto) ocupa el nombre de columna
        # que usaría la nueva llave "rutina"; se crea con otro nombre y se renombra al final.
        migrations.AddField(
            model_name='rutinadia',
            name='rutina_nueva',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='api.rutina'),
        ),
        migrations.AddField(
            model_name='sesiongym',
            name='rutina_ref',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sesiones', to='api.rutina'),
        ),
        migrations.RunPython(dias_a_rutinas, migrations.RunPython.noop),
        migrations.RemoveField(model_name='rutinadia', name='ejercicios'),
        migrations.RemoveField(model_name='rutinadia', name='emoji'),
        migrations.RemoveField(model_name='rutinadia', name='nombre'),
        migrations.RemoveField(model_name='rutinadia', name='rutina_id'),
        migrations.RenameField(model_name='rutinadia', old_name='rutina_nueva', new_name='rutina'),
        migrations.AlterField(
            model_name='rutinadia',
            name='rutina',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='dias', to='api.rutina'),
        ),
    ]
