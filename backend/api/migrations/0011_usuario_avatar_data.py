from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0010_pushsubscription_slots'),
    ]

    operations = [
        migrations.AddField(
            model_name='usuario',
            name='avatar_data',
            field=models.TextField(blank=True),
        ),
    ]
