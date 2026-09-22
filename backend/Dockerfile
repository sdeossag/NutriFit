# Imagen del backend para Koyeb (instancia Free: 512 MB RAM, 0.1 vCPU)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Sin DATABASE_URL cae en SQLite; collectstatic no toca la base de datos
RUN python manage.py collectstatic --noinput

EXPOSE 8000

# Migraciones al arrancar (en build no hay acceso a Neon).
# timeout 120: el cron llama a Groq por cada suscripción y con 0.1 vCPU puede tardar.
CMD python manage.py migrate --noinput && \
    exec gunicorn nutrifit.wsgi:application \
        --bind 0.0.0.0:${PORT:-8000} \
        --workers 2 --threads 4 --timeout 120 \
        --access-logfile -
