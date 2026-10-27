FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .

ENV TESTER_TARGET_MODE=sandbox \
    TESTER_REPO=/work/repo \
    TESTER_PROPOSALS=/work/proposals

EXPOSE 8090
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8090"]
