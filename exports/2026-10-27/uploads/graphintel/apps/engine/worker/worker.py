"""A sub-agent's worker. Stdlib only. Watches its sources and prints one JSON line per new item; the engine's fleet.harvest reads them."""
import json
import os
import time
import urllib.request

import parsers

ID, EVERY, SRC, seen = os.environ["SUB_ID"], int(os.environ.get("SUB_EVERY", "900")), json.loads(os.environ.get("SUB_SOURCES", "[]")), set()


def emit(**kw):
    print(json.dumps({"sub": ID, "ts": time.time(), **kw}), flush=True)


while True:
    for s in SRC:
        try:
            req = urllib.request.Request(s["url"], headers={"user-agent": "threshold-sub/1.0"})
            items = (parsers.trends if s["kind"] == "trends" else parsers.rss)(urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace"))
            for it in items[: int(s.get("limit", 10))]:
                k = (s["id"], it["link"] or it["title"])
                if k not in seen:
                    seen.add(k)
                    emit(kind="item", source=s["id"], label=s.get("label", ""), **it)
        except Exception as ex:
            emit(kind="error", source=s["id"], message=str(ex)[:200])
    emit(kind="beat", seen=len(seen))
    time.sleep(EVERY)
