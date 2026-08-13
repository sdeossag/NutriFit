from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0006_ejerciciopersonalizado_rutinadia'),
    ]

    operations = [
        migrations.CreateModel(
            name='PushSubscription',
            fields=[
                ('id',           models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('endpoint',     models.TextField(unique=True)),
                ('p256dh',       models.TextField()),
                ('auth',         models.TextField()),
                ('ultima_notif', models.DateField(blank=True, null=True)),
                ('creado_en',    models.DateTimeField(auto_now_add=True)),
                ('usuario',      models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='push_subscriptions',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name':        'Suscripción push',
                'verbose_name_plural': 'Suscripciones push',
            },
        ),
    ]
