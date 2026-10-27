FROM python:3.12-alpine
RUN apk add --no-cache docker-cli curl && adduser -D app && mkdir /work && chown app /work
USER app
COPY mcp_server.py /app/mcp_server.py
WORKDIR /app
CMD ["python", "mcp_server.py"]
