FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ops.py agent.py ./
COPY ui ./ui
ENV PYTHONUNBUFFERED=1 WORKSPACE=/workspace
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8080/docs')"
CMD ["uvicorn", "ops:app", "--host", "0.0.0.0", "--port", "8080"]
