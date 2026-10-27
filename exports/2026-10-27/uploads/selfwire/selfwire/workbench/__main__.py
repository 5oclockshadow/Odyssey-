"""
python -m selfwire.workbench [--root DIR] [--host 127.0.0.1] [--port 8765]

Serves the Workbench for one repo. Because this server can edit files and
run code on the machine:

  * a random access token is generated for every run unless you pass one
    (--token / SELFWIRE_WORKBENCH_TOKEN); the printed URL carries it;
  * --no-token turns that off, and is only accepted on a loopback address;
  * only Host/Origin values that are loopback (or listed with --allow-host)
    are served, which blocks DNS-rebinding attacks from web pages.

On /api/restart the process re-execs itself with the same arguments; the
token travels in the environment, not argv, so it never shows in `ps`.
"""

from __future__ import annotations

import argparse
import ipaddress
import os
import secrets
import sys
from pathlib import Path
from typing import Optional

TOKEN_ENV = "SELFWIRE_WORKBENCH_TOKEN"


def _is_loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="selfwire-workbench",
                                description="SelfWire Workbench: chat, live codebase CRUD, test-gated self-improvement.")
    p.add_argument("--root", default=os.getcwd(), help="repo to serve (default: current directory)")
    p.add_argument("--host", default=os.environ.get("SELFWIRE_WORKBENCH_HOST", "127.0.0.1"))
    p.add_argument("--port", type=int, default=int(os.environ.get("SELFWIRE_WORKBENCH_PORT", "8765")))
    p.add_argument("--token", default=None, help=f"access token (default: ${TOKEN_ENV}, else a random one per run)")
    p.add_argument("--no-token", action="store_true", help="loopback only: no token (any local process can drive the API)")
    p.add_argument("--allow-host", action="append", default=[], metavar="HOST",
                   help="extra Host/Origin name to accept besides loopback (repeatable), e.g. a LAN hostname")
    p.add_argument("--test-timeout", type=float, default=900.0)
    p.add_argument("--log-level", default="info")
    return p


def main(argv: Optional[list[str]] = None) -> int:
    raw = list(sys.argv[1:] if argv is None else argv)
    args = build_parser().parse_args(raw)
    loopback = _is_loopback(args.host)
    if args.no_token and not loopback:
        print(f"refusing to bind {args.host} without a token: this server can edit files and run code. "
              "Drop --no-token (a token is generated for you) or bind 127.0.0.1.", file=sys.stderr)
        return 2
    token = None if args.no_token else (args.token or os.environ.get(TOKEN_ENV) or secrets.token_urlsafe(24))
    if token:
        # survives the /api/restart re-exec without appearing in argv
        os.environ[TOKEN_ENV] = token
    restart_args = []
    skip_next = False
    for item in raw:  # never put the token itself into the re-exec argv
        if skip_next:
            skip_next = False
            continue
        if item == "--token":
            skip_next = True
            continue
        if item.startswith("--token="):
            continue
        restart_args.append(item)

    import uvicorn

    from .. import __version__
    from .core import Workbench
    from .server import create_app

    allowed_hosts = list(args.allow_host)
    if not loopback and args.host not in ("0.0.0.0", "::"):
        allowed_hosts.append(args.host)

    root = Path(args.root).resolve()
    wb = Workbench(root, test_timeout=args.test_timeout)
    app = create_app(wb, token=token, restart_argv=["-m", "selfwire.workbench", *restart_args], allowed_hosts=allowed_hosts)
    shown_host = "127.0.0.1" if args.host in ("0.0.0.0", "::") else args.host
    url = f"http://{shown_host}:{args.port}/" + (f"?token={token}" if token else "")
    print(f"SelfWire Workbench {__version__} serving {root}\n  open: {url}", flush=True)
    uvicorn.run(app, host=args.host, port=args.port, log_level=args.log_level)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
