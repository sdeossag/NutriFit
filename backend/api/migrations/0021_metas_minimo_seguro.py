"""Recalcula las metas de quien quedó por debajo del mínimo seguro con la
fórmula anterior (déficit fijo de hasta 750 kcal, sin piso). A nadie más se le
tocan las metas: pudo haberlas ajustado a mano."""
from django.db import migrations

MINIMO = {'M': 1500, 'F': 1200}


def subir_metas_peligrosas(apps, schema_editor):
    Usuario = apps.get_model('api', 'Usuario')
    ids = [
        u.pk for u in Usuario.objects.filter(onboarding_completo=True).only('pk', 'sexo', 'meta_calorias')
        if u.meta_calorias and u.meta_calorias < MINIMO.get(u.sexo, 1200)
    ]
    if not ids:
        return
    # El cálculo vive en el modelo real; solo se llega aquí si hay a quién corregir
    from api.models import Usuario as UsuarioActual
    for u in UsuarioActual.objects.filter(pk__in=ids):
        if u.calculo_metas():
            u.calcular_metas()
        else:
            # Faltan datos para recalcular: al menos el piso
            u.meta_calorias = MINIMO.get(u.sexo, 1200)
            u.save(update_fields=['meta_calorias'])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0020_acciones_chat'),
    ]

    operations = [
        migrations.RunPython(subir_metas_peligrosas, migrations.RunPython.noop),
    ]
