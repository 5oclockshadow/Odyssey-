---
name: usage-demo-movie
description: Script and record a product usage demo movie with Playwright - 1920x1080 video of the real app being used (visible cursor, click ripples, paced typing, captions, title cards), long waits (LLM generations, builds) trimmed with ffmpeg, stitched to MP4. Use when asked to "record a demo", "make a usage video/movie", "screen-record the app end to end", "show it working in a video", or to produce a ~N-minute walkthrough MP4 of a web app.
---

# Recording a usage demo movie (Playwright + ffmpeg)

Worked example: `/opt/Krishna/codegen-v3/demo/record_demo.py`. It records Codegen v3 end to end with real router generations.

## Principles
- **Real usage only.** Drive the live app; never fake screens or results. When a step takes minutes (an LLM generation), let it run and *trim the wait* afterwards. Say on screen that it was trimmed, and how long it really took.
- **Dry-run the risky parts first.** Run the same prompts through the API, then check the produced app headless for console errors. If they fail, fix the prompt or the product, then record. Codegen's runtime judge (`runcheck/runcheck.py`) does this check automatically inside Loop mode.
- **Pace for a human:** about 0.2 s cursor glides, 16–45 ms per key, 2.5–5 s holds on each view, and one caption per idea.

## Steps
1. **Write the scenario as a list of beats.** Each beat has a view, the action, the caption and the hold time. Aim for 2.5–3.5 min after trimming. The Codegen beats were:
   1. Title card.
   2. Data view.
   3. Graph view: search, centre, click a node, open it in the editor.
   4. Brain view.
   5. App A: new session → model → Loop → paced prompt → Send → wait (cut) → full-screen preview for 14 s.
   6. App B: open the owner's source file → attach → new session → Loop → prompt → wait (cut) → preview for 15 s.
   7. Brain again.
   8. End card.
2. **Set up the context** at 1920×1080 with video, in a clean state:
   ```python
   b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--autoplay-policy=no-user-gesture-required"])
   ctx = await b.new_context(viewport={"width":1920,"height":1080}, record_video_dir="demo/raw", record_video_size={"width":1920,"height":1080})
   await ctx.add_init_script("if (window === window.top) { localStorage.setItem('cg_theme','dark'); localStorage.removeItem('cg_session'); }")
   ```
   - SwiftShader ANGLE lets three.js/WebGL render headless.
   - The `window === window.top` guard keeps init scripts out of sandboxed iframes; without it they throw console errors.
3. **Inject the overlay** with `page.evaluate(OVERLAY_JS)`. Re-inject after every navigation (the helper `cap()` does this). It provides:
   - an SVG cursor that follows `mousemove`
   - click ripples on `mousedown`
   - `window.__cap(html)`, a bottom caption bar
   - `window.__title(h, subs)`, a full-screen title card

   Headless Playwright draws no cursor of its own, so always move with `page.mouse.move(x, y, steps=18)` before clicking.
4. **Type like a person:** `keyboard.type(text[:140], delay=16)`. Then append the rest as a "paste" (set `value` and dispatch `input`), so long prompts don't eat a minute of video.
5. **Mark long waits:** poll a page predicate (for example the loop log contains `done:`) and record `{from: start+4, to: end-2}` in a cut list. Keep about 4 s at the start and 2 s at the end so viewers see the work begin and finish. Afterwards, caption the real duration ("generated in 3.2 min, the wait is trimmed").
6. **Trim and stitch** with ffmpeg: re-encode each kept span, then concat:
   ```bash
   ffmpeg -ss A -to B -i raw.webm -vf scale=1920:1080,fps=30 -c:v libx264 -crf 20 -pix_fmt yuv420p -an partN.mp4
   ffmpeg -f concat -safe 0 -i parts.txt -c copy -movflags +faststart codegen-demo.mp4
   ```
   - Re-encoding each part avoids keyframe-boundary glitches from `-c copy` cuts on webm.
   - `yuv420p` + `faststart` play everywhere (browsers, Telegram, QuickTime).
7. **Verify the output.** Use `ffprobe` for duration and size (1920x1080). Extract frames at the key moments and look at them:
   ```bash
   for t in 5 30 60 90 120 150; do ffmpeg -v error -ss $t -i codegen-demo.mp4 -frames:v 1 frame_$t.png; done
   ```
   Check the page errors the script collected (`pageerror`). A demo with silent JS errors is not done.
8. **Deliver** to the project's `demo/codegen-demo.mp4`, a copy in `~/artifacts/`, and the generated apps as runnable folders. Report the raw versus final duration and the cut list (`demo/segments.json`).

## Gotchas
- `record_video_dir` writes one `.webm` per page; it finalises only on `ctx.close()`. Keep the whole demo in **one page** and navigate (`goto`) instead of opening tabs.
- Playwright's Chromium has no H.264 decoder for some sources. Prefer VP9/WebM media in demo apps (for example Wikimedia Commons transcodes). Test `video.canPlayType` and a real `play()` first.
- Full-screen previews read best: `goto` the app URL for 10–15 s, then go back. The app's localStorage state comes back.
- Don't leave secrets or tokens on screen. Data tables showing counts are fine; env panels are not.
- Thor's display for watching live is `:1` (`DISPLAY=:1 firefox --new-tab URL`). Recording is headless and needs no display.
