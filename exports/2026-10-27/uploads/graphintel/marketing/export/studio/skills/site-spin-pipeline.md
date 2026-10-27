# Skill: site spin pipeline

## Use when
A user gives a business name and a brief and wants N candidate sites (4 to 100) that differ in structure, not just colour.

## Inputs
name, brief (one paragraph of facts), n, mode (template examples or imagine at runtime).

## Steps
1. Plan N specs. In template mode: structure = i mod 12, look = i mod 8, motion = i mod 4, palette and font rotated with a seed. In imagine mode: see runtime-imagine.md.
2. Write copy per spec from the brief (template mode: one batched call per 6 to 8 specs, JSON array back; verify count and types).
3. Build each page with the kit (design-kit.md). Thumbnails freeze motion; the open view runs it.
4. Show tiles; the user opens one; menus and chat refine it (style-agent-chat.md).
5. Export the chosen one (export-chosen-site.md).

## Rules
- Two specs may never share structure and look at the same time within one run.
- Copy comes only from the brief. Reject any figure (currency, percentage) not present in the brief text.
- Status is always visible: "Imagined x of y", "Written x of y, z failed", with a Stop that keeps finished work.
- Failed tiles show the reason and retry on click.

## Verify
All N tiles reach done or failed; no tile stays pending; a sample of 4 opens and navigates; the status line's counts add up to N.
