# hourino brand mark

**"Filled Day":** one calendar day with hours poured in. The fill line doubles
as a smile, so the face is something you notice on a second look, not the
first. Brief and rationale: `modules/40_personality-archetype.md`.

## Files

| Asset | Where | Notes |
|---|---|---|
| React mark | `apps/web/src/components/logo.tsx` (`<LogoMark />`) | Uses `--brand-*` tokens + `--border` shadow |
| Favicon (vector) | `apps/web/public/favicon.svg` | Hex copy of the same geometry; shadow lightens under `prefers-color-scheme: dark` |
| Favicon (raster) | `apps/web/public/favicon.ico` | 16 (hand-hinted variant) / 32 / 48 |
| App icons | `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Mark on a powder-blue full bleed; the maskable version sits inside the 80% safe zone |
| Manifest | `apps/web/public/manifest.webmanifest` | |

The geometry lives in both `logo.tsx` and `favicon.svg`, so change them
together and re-render the PNGs.

## Rules

- **Colors are fixed in both themes.** The mark is a printed sticker:
  `--brand-ink` (espresso `#432F2E`), `--brand-blue` (powder `#c3DAE8`) and
  `--brand-paper`. Only the hard shadow follows `--border`, like
  `shadow-brutal`. Never recolor the mark with `--primary`/`--accent`, because
  those flip in dark mode.
- **Minimum size:** 16px only through the hinted `favicon.ico` frame. In UI,
  use `size-8` (32px) or larger.
- **Lockup:** mark + lowercase `hourino` in Space Grotesk bold, `gap-2`,
  mark ≈ 1.5× the cap height (`size-9` next to `text-2xl`).
- **Don't:** rotate it, add a stroke or glow, put it on a busy image, or draw
  a mouth, limbs or other extra features onto the face.
