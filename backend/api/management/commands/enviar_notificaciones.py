"""Revisa y envía las notificaciones que tocan ahora.

En el servidor corre cada 10 minutos (servicio "notificaciones" del
docker-compose). Con --cada N se queda corriendo y repite cada N segundos.
"""
import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from api.notificaciones import revisar_todos


class Command(BaseCommand):
    help = 'Envía las notificaciones push que tocan ahora'

    def add_arguments(self, parser):
        parser.add_argument('--cada', type=int, default=0, help='Repetir cada N segundos (0 = una vez)')

    def handle(self, *args, cada=0, **opciones):
        while True:
            try:
                enviadas = revisar_todos()
                self.stdout.write(f'notificaciones enviadas: {enviadas}')
            except Exception as e:  # un error no debe tumbar el proceso
                self.stderr.write(f'error revisando notificaciones: {e}')
            if not cada:
                break
            close_old_connections()
            time.sleep(cada)
