FROM python:3.12-slim
RUN useradd -u 1000 -m agent
WORKDIR /app/apps/engine
COPY apps/engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . /app
RUN chown -R root:root /app && chmod -R a-w /app          # the agent can read its source and cannot write it
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 THRESHOLD_STATE=/state THRESHOLD_ROOT=/app
USER agent
EXPOSE 8000
CMD ["uvicorn", "serve:app", "--host", "0.0.0.0", "--port", "8000"]
