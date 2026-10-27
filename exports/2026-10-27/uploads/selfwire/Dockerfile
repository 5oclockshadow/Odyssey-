# SelfWire — self-extending DSPy agent + Workbench (chat, live codebase CRUD,
# test-gated self-improvement). Python 3.13 is required by osiiso.
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# git: the workbench's checkpoint/commit/rollback moat is built on it.
# build-essential: for any dependency that needs to compile a wheel.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential git \
    && rm -rf /var/lib/apt/lists/* \
    # the repo is usually bind-mounted from the host (see docker-compose.yml),
    # owned by a different uid; let git operate on it
    && git config --system --add safe.directory '*'

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY selfwire/ ./selfwire/
COPY tests/ ./tests/
COPY skills/ ./skills/
COPY docs/ ./docs/
COPY pyproject.toml README.md CHANGELOG.md demo.py build_dist.py ./

# non-root runtime user
RUN useradd --create-home --uid 10001 selfwire \
    && mkdir -p /app/runtime_state /app/reports \
    && chown -R selfwire:selfwire /app
USER selfwire

# 8765: workbench dashboard + API; 8800: the agent's own MCP server
EXPOSE 8765 8800

ENV RAPTOR_REDIS_URL=redis://redis:6379/0 \
    SELFWIRE_ENABLE_PHOENIX=0

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import selfwire.workbench" || exit 1

# Binding 0.0.0.0 inside the container: the CLI refuses to start without
# SELFWIRE_WORKBENCH_TOKEN, by design.
CMD ["python", "-m", "selfwire.workbench", "--root", "/app", "--host", "0.0.0.0", "--port", "8765"]
