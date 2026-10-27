---
name: ui-plugin-contract
intro: The exact contract between the console shell and static/plugins/*.js + app/plugins/*.py, and the four bugs that broke it. Read before adding or editing any tab. UI is priority 1.
---
# UI plugin contract (learned 2026-10-27)

**Backend**: `app/plugins/<name>.py` exposes `router = APIRouter(prefix="/api/v3/<name>")`. It is
auto-loaded at start. Import only `app.plugin_api`. A broken plugin is logged and skipped.

**Frontend**: `static/plugins/<name>.js` calls
`window.CGPlugins.register({id, title, refreshMs?, render(el)})`. Use `P.api`, `P.el`, `P.toast`, `P.ago`.

**The host re-calls `render(el)` every `refreshMs`.** So `render` must:
- **replace** content (`el.replaceChildren(...)`) and never append (board.js stacked a table per tick);
- **not** start its own `setInterval` (board.js stacked one per tick, so load grew without bound);
- be cheap and idempotent. Inject CSS once, keyed by an id.

No `refreshMs` means `render` runs on each tab open. Clear and rebuild, and skip work while `el.hidden`
(connectome kept a 3D loop and a 1 s poll running on hidden tabs).

**Boot order**: the shell publishes `window.CG` before plugins load, and the plugin loader waits for
it. "CG() is undefined" means an old build, or a plugin injected too early.

**Look**: theme tokens only (`var(--panel) --ink --line --acc --m`). No `white`, no `alert()`, `confirm()` or
`prompt()`. Use `P.toast(msg, true)` for errors. It must work at 400 px: grids collapse, and nothing is
wider than `calc(100vw - 20px)`.

**/preview** serves with `Access-Control-Allow-Origin: *`, because srcdoc iframes re-fetch their page.

## Done = 
Opens with zero console errors on desktop and phone width, survives 2 min open without growing
request rate, and every number on it comes from a real endpoint.
