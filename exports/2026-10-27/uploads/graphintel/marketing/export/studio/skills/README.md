# Style Studio skills

Six skills, one file each. Each describes one capability of the Studio: when to use it, the inputs, the steps, the rules it enforces and how to verify it. They are written so another agent or person can apply the skill without reading the Studio's code.

| Skill | What it does |
| --- | --- |
| site-spin-pipeline.md | Prompt in, N sample sites out, each a different structure |
| runtime-imagine.md | Invent directions, copy and a signature widget at runtime, in small verified calls |
| design-kit.md | The 12 structures, 8 looks, 4 motion styles and palette rules in studio-kit.js |
| style-agent-chat.md | The right-hand agent: refine an open site by prompt or menu |
| untrusted-html-sandbox.md | Running and checking model-written HTML safely |
| export-chosen-site.md | Export the picked site as one self-contained file |

Shared constraints: the brief is the only source of facts; no invented numbers, customers or claims; no placeholders; model replies are capped at roughly 3 KB here, so every call asks for one small piece and verifies it.
