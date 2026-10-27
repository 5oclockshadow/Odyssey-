"""Data pumps. Sources (RSS, Atom, Google Trends) live in signals.py; this loop asks them what is due. A link is queued once, ever."""
import asyncio
import logging

import parsers
import signals

log = logging.getLogger("feeds")
parse = parsers.rss


async def watch_forever(cfg: dict, put, store):
    signals.CFG = cfg
    while True:
        try:
            await signals.pump(put, store)
        except Exception:
            log.exception("watch cycle failed")
        await asyncio.sleep(30)
