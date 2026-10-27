# TESTER: every app's test dependencies, Node for JavaScript and Chromium for the pages, in one image. Build context is the repository root.
FROM mcr.microsoft.com/playwright/python:v1.49.1-noble
RUN apt-get update && apt-get install -y --no-install-recommends nodejs git rsync && rm -rf /var/lib/apt/lists/*
COPY apps/engine/requirements.txt /tmp/req/engine.txt
COPY apps/mcp-hub/requirements.txt /tmp/req/hub.txt
COPY apps/ops/requirements.txt /tmp/req/ops.txt
COPY apps/tester/requirements.txt /tmp/req/tester.txt
RUN python3 -m pip install --no-cache-dir --break-system-packages -r /tmp/req/engine.txt -r /tmp/req/hub.txt -r /tmp/req/ops.txt -r /tmp/req/tester.txt
WORKDIR /app/apps/tester
COPY apps/tester /app/apps/tester
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 TESTER_STATE=/state TESTER_REPO=/repo TESTER_WORK=/state/work PLAYWRIGHT_BROWSERS_PATH=/ms-playwright HOME=/tmp
USER 1000
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD python3 -c "import urllib.request as u; u.urlopen('http://localhost:8090/health', timeout=4)"
CMD ["python3", "-m", "uvicorn", "serve:app", "--host", "0.0.0.0", "--port", "8090"]
