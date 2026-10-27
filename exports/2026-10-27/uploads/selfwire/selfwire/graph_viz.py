"""
graph_viz.py — renders the ToolGraph (3D spatial layout + time-stamped edges,
Hebbian weights, Q-table) as a single self-contained neon dark-mode HTML page.

Deliberately dependency-free (no CDN fetch for three.js or similar) so the
page works fully offline and can't silently go blank if a CDN is
unreachable: it's a small hand-rolled 3D->2D projection with mouse-drag
rotation, drawn on a <canvas>, styled with the same neon-on-near-black
palette as reporter.py's context report.
"""

from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Optional

from .graph_store import ToolGraph


def render_graph_html(graph: ToolGraph, out_path: Optional[str] = None, title: str = "SelfWire tool graph") -> Path:
    snap = graph.snapshot()
    data = {
        "nodes": [
            {
                "id": n["id"],
                "x": n.get("x", 0.0), "y": n.get("y", 0.0), "z": n.get("z", 0.0),
                "source": n.get("source", "unknown"), "calls": n.get("calls", 0),
            }
            for n in snap.nodes
        ],
        "edges": [
            {"source": e["source"], "target": e["target"], "weight": e["weight"], "ticks": e["ticks"]}
            for e in snap.edges
        ],
    }
    data_json = json.dumps(data)
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{html.escape(title)}</title>
<style>
  :root {{ --bg:#05070a; --neon:#39ff88; --neon2:#00e5ff; --neon3:#ff2ec4; --muted:#6d8a80; }}
  html,body {{ margin:0; height:100%; background:var(--bg); overflow:hidden; font-family: ui-monospace, "SF Mono", Menlo, monospace; }}
  #hud {{ position:fixed; top:12px; left:12px; color:var(--neon); text-shadow:0 0 6px var(--neon); font-size:13px; z-index:2; }}
  #hud .muted {{ color:var(--muted); text-shadow:none; }}
  canvas {{ display:block; cursor:grab; }}
  canvas:active {{ cursor:grabbing; }}
</style>
</head>
<body>
<div id="hud">
  <div>{html.escape(title)}</div>
  <div class="muted" id="stats"></div>
  <div class="muted">drag to rotate · scroll to zoom</div>
</div>
<canvas id="c"></canvas>
<script id="graph-data" type="application/json">{data_json}</script>
<script>
const DATA = JSON.parse(document.getElementById('graph-data').textContent);
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W, H;
function resize() {{ W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }}
window.addEventListener('resize', resize); resize();

document.getElementById('stats').textContent =
  DATA.nodes.length + ' tools · ' + DATA.edges.length + ' hebbian edges';

let rotX = 0.4, rotY = 0.6, zoom = 260, dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('mousedown', e => {{ dragging = true; lastX = e.clientX; lastY = e.clientY; }});
window.addEventListener('mouseup', () => dragging = false);
window.addEventListener('mousemove', e => {{
  if (!dragging) return;
  rotY += (e.clientX - lastX) * 0.01;
  rotX += (e.clientY - lastY) * 0.01;
  lastX = e.clientX; lastY = e.clientY;
}});
canvas.addEventListener('wheel', e => {{ zoom = Math.max(40, zoom - e.deltaY * 0.2); e.preventDefault(); }}, {{passive:false}});

function project(x, y, z) {{
  // center coords roughly around 0
  let cy = Math.cos(rotY), sy = Math.sin(rotY);
  let cx = Math.cos(rotX), sx = Math.sin(rotX);
  let x1 = x * cy - z * sy;
  let z1 = x * sy + z * cy;
  let y1 = y * cx - z1 * sx;
  let z2 = y * sx + z1 * cx;
  const scale = zoom / (zoom * 0.02 + z2 + 3);
  return [W / 2 + x1 * zoom * scale * 0.5, H / 2 + y1 * zoom * scale * 0.5, z2];
}}

function colorForSource(src) {{
  if (src && src.startsWith('mcp:')) return '#00e5ff';
  if (src === 'exec') return '#ff2ec4';
  if (src === 'own_server') return '#ffd23f';
  return '#39ff88';
}}

function frame() {{
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, W, H);

  const projected = {{}};
  for (const n of DATA.nodes) projected[n.id] = project(n.x * 4, n.y * 4, n.z * 4);

  // edges (hebbian weight -> line alpha/width)
  for (const e of DATA.edges) {{
    const a = projected[e.source], b = projected[e.target];
    if (!a || !b) continue;
    const w = Math.max(0.05, e.weight);
    ctx.strokeStyle = `rgba(57,255,136,${{Math.min(1, w).toFixed(2)}})`;
    ctx.lineWidth = 0.5 + w * 2.5;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }}

  // nodes
  for (const n of DATA.nodes) {{
    const p = projected[n.id];
    if (!p) continue;
    const r = 4 + Math.min(10, Math.sqrt(n.calls || 0));
    const col = colorForSource(n.source);
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14;
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#d8f5e3';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(n.id, p[0] + r + 4, p[1] + 3);
  }}
  requestAnimationFrame(frame);
}}
requestAnimationFrame(frame);
</script>
</body>
</html>"""
    path = Path(out_path) if out_path else (Path(__file__).resolve().parent.parent / "reports" / "graph_view.html")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(page, encoding="utf-8")
    return path
