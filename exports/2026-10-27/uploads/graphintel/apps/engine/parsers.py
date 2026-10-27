"""Stdlib-only feed parsers. The engine and every sub-agent's worker image use this one file."""
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus


def _t(el) -> str:
    return el.tag.rsplit("}", 1)[-1]


def rss(text: str) -> list[dict]:
    """RSS 2.0, RSS 1.0 (RDF) and Atom: any item or entry with a title and a link."""
    out = []
    for el in ET.fromstring(text).iter():
        if _t(el) not in ("item", "entry"):
            continue
        title = link = ""
        for ch in el:
            if _t(ch) == "title":
                title = (ch.text or "").strip()
            elif _t(ch) == "link":
                link = (ch.text or "").strip() or ch.get("href", "")
        if title and link:
            out.append({"title": title, "link": link})
    return out


def trends(text: str) -> list[dict]:
    """Google Trends 'trending now' RSS: the search term, its approximate traffic, and the news stories attached to it."""
    out = []
    for it in ET.fromstring(text).iter():
        if _t(it) != "item":
            continue
        d = {"title": "", "link": "", "traffic": "", "news": []}
        for ch in it:
            t = _t(ch)
            if t == "title":
                d["title"] = (ch.text or "").strip()
            elif t == "link":
                d["link"] = (ch.text or "").strip()
            elif t == "approx_traffic":
                d["traffic"] = (ch.text or "").strip()
            elif t == "news_item":
                d["news"] += [(x.text or "").strip() for x in ch if _t(x) == "news_item_title"]
        if d["title"]:
            d["link"] = d["link"] or "https://www.google.com/search?q=" + quote_plus(d["title"])
            out.append(d)
    return out
