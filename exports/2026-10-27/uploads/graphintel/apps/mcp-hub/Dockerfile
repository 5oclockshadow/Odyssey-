FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY hub.py servers.json ./
COPY repo /repo
ENV HUB_DATA=/data NPM_CONFIG_CACHE=/data/npm UV_CACHE_DIR=/data/uv PYTHONUNBUFFERED=1
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8765/healthz')"
CMD ["python", "hub.py"]
