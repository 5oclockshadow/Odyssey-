---
id: 3d-object
name: 3D object
description: Interactive three.js models and scenes that can be orbited and exported as GLB or OBJ.
outputs: html, glb, obj
---

# Skill: 3D object

Build 3D objects and small scenes that run in the browser, can be inspected from any angle, and export to standard model files.

## Questions to ask

1. What object or scene? Reference images help.
2. Style: a) realistic product render, b) stylized or low-poly, c) toy-like? [b]
3. What is it for: a website hero, a downloadable model, a product configurator? [an interactive viewer]
4. Motion: still, slow turntable, or an action such as opening or assembling? [slow turntable]
5. Colors and materials?
6. Export format? [GLB]

## Output

- `object.html`: a three.js scene (version pinned through an import map from a CDN) on a full-window canvas, with orbit controls, soft studio lighting (key, fill and rim, or an environment map), a ground shadow and an auto-framed camera.
- The model built in code from primitives and geometry operations (box, cylinder, lathe, extrude, tube), grouped and named by part (`body`, `lid`, `handle`), with named materials.
- An export button using `GLTFExporter` for GLB and `OBJExporter` for OBJ, downloading `object-name.glb`.
- A small options panel when the object is configurable (colors, parts on and off).

## Build steps

1. Break the object into parts and estimate real proportions in meters.
2. Build each part as its own mesh, positioned in a group whose origin sits at the base of the object.
3. Use `MeshStandardMaterial` or `MeshPhysicalMaterial` with roughness and metalness that match the real material.
4. Light and frame it, with ACES tone mapping and the sRGB output color space.
5. Add interaction and export.

## Design rules

- Get the silhouette and proportions right before adding detail.
- Bevel or round edges; perfectly sharp edges read as computer-generated.
- A small palette of materials; avoid fully saturated colors unless the style is stylized.
- Keep the model under about 200k triangles for smooth web performance.
- A neutral background, or the brand's; the ground shadow anchors the object.
- Handle window resizing, and cap the device pixel ratio at 2.

## Variations

Vary the style (realistic vs. stylized), the material palette or the presentation (studio vs. environment).

## Checklist

- [ ] Loads with no console errors; every import is pinned.
- [ ] The default view reads clearly as the object.
- [ ] Orbit controls and resizing work.
- [ ] Meshes and materials are named.
- [ ] The exported file opens in a standard viewer.
- [ ] Rotation stays smooth on a laptop.

## Example requests

- A stylized ceramic coffee mug on a saucer, matte glaze, slowly turning.
- A low-poly desk setup: monitor, keyboard, lamp and a potted plant.
- A product viewer for a backpack in three colorways.
