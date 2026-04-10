FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application
COPY . .

# Non-root user
RUN useradd -m kgra && chown -R kgra:kgra /app
USER kgra

EXPOSE 8000 8001

CMD ["uvicorn", "kgra.src.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
