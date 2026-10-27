---
name: workspace-ui
intro: What Krishna wants to see — a desktop-like console: tabbed consoles next to live system graphs, every view in movable panes. How the workspace works and how to add a view to it.
---
# Workspace UI

**The target** (Krishna's screenshot, 2026-10-27): tabbed terminals/consoles on one side, a live system monitor
(per-core CPU lines, memory/swap, network, disk) on the other — everything resizable, tabbable, poppable.
**How it works**: static/plugins/layout.js keeps a split tree (`{t:'split', dir, sizes, kids}` / `{t:'tabs', views,
active}`), saved in localStorage `cg_layout_v1`. Views are moved (not copied) into panes via `window.CGViews.mount`,
so each keeps state and its own refresh. Drag a tab to a pane edge = split; to the middle = join. Splitters drag or
arrow-key; double-click = equal. Pane menu: + add view, ⤢ maximize, ⧉ pop out (`/?solo=<id>`). Presets: Code,
Code + Graph, Ops, Console + System, Brain + Data. ⊞ toggles back to the classic single view. Phones: classic.
**Add a view**: `window.CGPlugins.register({id, title, refreshMs?, render(el)})` — render replaces content (or
re-attaches one persistent root), starts no timers, sizes from its container (ResizeObserver), uses theme vars.
CSS classes in plugins must be namespaced (the shell owns `.pane`, `.split`, `.tabs`).
