from django.db import migrations, models


def fusionar_sesiones_duplicadas(apps, schema_editor):
    """Deja una sola sesión por usuario y día antes de exigir que sea única.

    Se conserva la más reciente; recibe los ejercicios de las otras que no
    tenga (por nombre) y queda completada si alguna lo estaba. No se pierde
    ningún ejercicio registrado.
    """
    SesionGym    = apps.get_model('api', 'SesionGym')
    EjercicioLog = apps.get_model('api', 'EjercicioLog')

    duplicadas = (
        SesionGym.objects.values('usuario_id', 'fecha')
        .annotate(n=models.Count('id')).filter(n__gt=1)
    )
    for grupo in duplicadas:
        sesiones = list(
            SesionGym.objects.filter(usuario_id=grupo['usuario_id'], fecha=grupo['fecha']).order_by('-id')
        )
        principal, sobrantes = sesiones[0], sesiones[1:]
        nombres = set(EjercicioLog.objects.filter(sesion=principal).values_list('nombre', flat=True))
        for s in sobrantes:
            for log in EjercicioLog.objects.filter(sesion=s):
                if log.nombre not in nombres:
                    log.sesion = principal
                    log.save(update_fields=['sesion'])
                    nombres.add(log.nombre)
            if s.completada:
                principal.completada = True
            s.delete()
        principal.save(update_fields=['completada'])


def marcar_sesiones_con_ejercicios(apps, schema_editor):
    """La app nunca marcaba las sesiones como completadas: se corrige el
    historial dando por hecha toda sesión que tenga ejercicios registrados."""
    SesionGym = apps.get_model('api', 'SesionGym')
    SesionGym.objects.filter(completada=False, ejercicios__isnull=False).update(completada=True)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0011_usuario_avatar_data'),
    ]

    operations = [
        migrations.RunPython(fusionar_sesiones_duplicadas, migrations.RunPython.noop),
        migrations.RunPython(marcar_sesiones_con_ejercicios, migrations.RunPython.noop),
        migrations.AddIndex(
            model_name='comida',
            index=models.Index(fields=['usuario', 'fecha'], name='comida_usuario_fecha'),
        ),
        migrations.AddIndex(
            model_name='registroagua',
            index=models.Index(fields=['usuario', 'fecha'], name='agua_usuario_fecha'),
        ),
        migrations.AddConstraint(
            model_name='sesiongym',
            constraint=models.UniqueConstraint(fields=('usuario', 'fecha'), name='sesion_unica_por_dia'),
        ),
    ]
