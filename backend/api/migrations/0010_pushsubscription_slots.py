from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0009_add_musculo_to_ejerciciolog'),
    ]

    operations = [
        migrations.AddField(
            model_name='pushsubscription',
            name='slots_enviados',
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name='pushsubscription',
            name='slots_fecha',
            field=models.DateField(blank=True, null=True),
        ),
    ]
