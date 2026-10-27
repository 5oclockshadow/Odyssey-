"""Seed dependency check for a real host: `python scripts/check_env.py` before first start.
Refuses to pass when a secret is missing or still a placeholder. It reads names only and never prints a value."""
import os
import sys

REQUIRED = ["ANTHROPIC_API_KEY", "SESSION_SECRET", "HUB_TOKEN", "REDIS_PASSWORD"]
PLACEHOLDERS = {"", "changeme", "change-me", "password", "secret", "test"}


def main() -> int:
    bad = [k for k in REQUIRED if os.environ.get(k, "").strip().lower() in PLACEHOLDERS]
    if not (os.environ.get("OWNER_PASSWORD_HASH") or os.environ.get("OWNER_PASSWORD")):
        bad.append("OWNER_PASSWORD_HASH (or OWNER_PASSWORD)")
    elif os.environ.get("OWNER_PASSWORD") and not os.environ.get("OWNER_PASSWORD_HASH"):
        print("note: OWNER_PASSWORD is plain text in the environment; prefer OWNER_PASSWORD_HASH (scrypt).")
    for k in bad:
        print(f"missing or placeholder: {k}", file=sys.stderr)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
