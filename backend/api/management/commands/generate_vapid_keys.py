from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Genera claves VAPID para Web Push. Agrega la salida a tu archivo .env'

    def handle(self, *args, **kwargs):
        try:
            from cryptography.hazmat.primitives.asymmetric import ec
            from cryptography.hazmat.primitives.serialization import (
                Encoding, PublicFormat, PrivateFormat, NoEncryption,
            )
            import base64

            key = ec.generate_private_key(ec.SECP256R1())

            private_pem = key.private_bytes(
                Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()
            ).decode().strip().replace('\n', '\\n')

            pub_bytes   = key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
            public_b64  = base64.urlsafe_b64encode(pub_bytes).rstrip(b'=').decode()

            self.stdout.write(self.style.SUCCESS('\nAgrega estas líneas a tu .env:\n'))
            self.stdout.write(f'VAPID_PUBLIC_KEY="{public_b64}"')
            self.stdout.write(f'VAPID_PRIVATE_KEY="{private_pem}"')
            self.stdout.write('VAPID_CLAIM_EMAIL="tu@email.com"')
            self.stdout.write(self.style.SUCCESS('\nY esta al .env del frontend:\n'))
            self.stdout.write(f'VITE_VAPID_PUBLIC_KEY="{public_b64}"')

        except ImportError:
            self.stdout.write(self.style.ERROR(
                'Falta la dependencia cryptography. Corre: pip install pywebpush'
            ))
