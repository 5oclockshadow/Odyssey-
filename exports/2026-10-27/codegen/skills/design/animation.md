---
id: animation
name: Animation
description: Timed motion pieces in HTML, such as launch clips, explainers, logo reveals and hero loops.
outputs: html, video
---

# Skill: Animation

Make short motion pieces that play in the browser and can be rendered to video frame by frame.

## Questions to ask

1. What is it for: a) social clip, b) product explainer, c) logo reveal, d) website hero loop?
2. Length? [15 seconds]
3. Aspect ratio? a) 16:9 at 1920×1080, b) 9:16 at 1080×1920, c) 1:1 at 1080×1080 [a]
4. Script or key messages, in order?
5. Pace: calm, punchy or playful? [punchy]
6. Sound? [none; music or voice-over gets added later]

## Output

- `animation.html`: a fixed-size stage (for example 1920×1080) scaled to fit the window.
- One timeline clock drives everything: each element's state is a pure function of time in milliseconds, so the piece can be paused, scrubbed and rendered frame by frame.
- Controls: play/pause, a scrubber with the current time, restart; Space toggles playback. The URL parameter `?clean` hides the controls for recording.
- `window.seek(ms)` and `window.duration` are exposed so the app can render frames to video.
- A scene list at the top of the script (name, start, duration) so timing is easy to change.
- Under `prefers-reduced-motion`, show a static key frame with the controls.

## Build steps

1. Write the storyboard as the scene list, with timings and on-screen text.
2. Lay out each key frame as a still.
3. Animate between key frames with easing, using `requestAnimationFrame`, transforms and opacity.
4. Check pacing: text stays on screen long enough to read twice (about 200 ms per word, 1.5 s minimum).
5. End on a held frame, or loop seamlessly if requested.

## Design rules

- Every movement either directs attention or explains a change.
- Ease out for entrances, ease in for exits, ease in-out for moves. Linear only for continuous motion.
- 200–500 ms for interface-scale moves; 600–1200 ms for scene changes.
- Stagger related elements by 40–80 ms.
- One focal movement at a time.
- Large type: at least 48 px on a 1920×1080 stage.
- Carry elements across scenes by moving them rather than cutting, wherever possible.
- Animate transform and opacity; avoid properties that trigger layout.

## Variations

Vary the pace (calm vs. punchy), the transitions (cuts vs. continuous moves) or the type treatment. When the brief is open, offer options as storyboards of three or four key frames before animating in full.

## Checklist

- [ ] Duration and aspect ratio match the brief.
- [ ] Seeking to any time shows the right frame, with no state carried over from earlier frames.
- [ ] Every line of text stays up long enough to read.
- [ ] Controls work, and `?clean` hides them.
- [ ] A reduced-motion fallback exists.
- [ ] Playback is smooth on a typical laptop.

## Example requests

- A 15-second launch clip for a note-taking app's new search feature, 16:9.
- A 5-second logo reveal for a bakery called Crumb & Co.
- A 30-second explainer showing a parcel's trip from warehouse to doorstep.
