#!/usr/bin/env bash
set -euo pipefail; cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
python3 -m venv .venv 2>/dev/null; . .venv/bin/activate
pip install -q -r requirements.txt
exec python3 -m tendergraph
