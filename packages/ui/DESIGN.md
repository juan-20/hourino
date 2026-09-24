# Hourino Design System — Balanced Riso-Neobrutalism

This document is the source of truth for how `@hourino/ui` looks and behaves. Read it before adding a component or a screen. The tokens live in `src/styles/globals.css`; this file explains *why* they're set the way they are and *how* to use them correctly.

## Why this direction

Brand colors: `#432F2E` (espresso brown) and `#c3DAE8` (powder blue) — a classic riso-print duotone pair (an ink color + a pastel spot color), contrast ≈ 8.6:1 (WCAG AAA). The brief was "young and alternative, but simple and direct" — pulling from Neobrutalism, riso print, terracotta, and an editorial sensibility, executed with restraint rather than maximalism. Landing-page tropes (heroes, marquees, bento grids) don't apply here — hourino is a dense, daily-use SaaS tool, not a marketing site.

**The rule that resolves the tension**: personality lives in color, texture, and type. Structure stays calm enough for repeated daily use. Concretely: the dashboard and any future dense data view (time entries, reports) stay quiet and scannable; navigation, buttons, empty states, and auth screens carry the personality.

## Color

All tokens are in oklch, verified against real WCAG contrast math (not eyeballed) — see the comment block at the top of `globals.css` for the conversion approach. Full contrast matrix (light mode; dark mode independently verified against its own background):

| Pair | Ratio | Passes |
|---|---|---|
| foreground / background | 16.2:1 | AAA |
| primary / background | 11.6:1 | AAA |
| primary-foreground / primary | 11.4:1 | AAA |
| accent-foreground / accent | 8.6:1 | AAA |
| muted-foreground / background | 6.7:1 | AAA |
| border / background (non-text, 3:1 min) | 5.7:1 | pass |
| ring / background (non-text, 3:1 min) | 3.3:1 | pass |
| destructive / background | 4.8:1 | AA |
| success / background | 4.9:1 | AA |

Rules:
- **`--primary` (espresso) and `--accent` (powder blue) are flat fills — no gradients.** In dark mode the *emphasis flips*: powder blue carries primary actions (it reads far better on a dark background than the very dark espresso brown would), and espresso becomes a subtle accent-surface tint. This isn't a naive lightness inversion — every dark-mode pairing was independently contrast-checked.
- **`--background`/`--card` are a warm off-white "paper" tone, never pure white**, and dark mode uses a warm near-black "paper," never pure black. This is what makes the duotone read as printed-on-stock rather than floating on a generic app canvas.
- **`--border` (ink brown) and `--ring` (saturated blue) are deliberately different hues.** Every bordered surface already has a visible resting border, so focus needs a hue shift, not just a thicker line, to stay unambiguous — this satisfies WCAG 2.4.11 (Focus Appearance) by construction, not by afterthought.
- **`--success` is a new token** (there was no success/positive color before this system) — use it instead of any raw `green-*` Tailwind class. Pair status colors with an icon or text label, never color alone.
- **`--chart-1..5`** span the brand duotone plus three riso-adjacent spot colors (mustard/terracotta, plum, and the success green) for future report charts. Chart fills are decorative-contrast, not text-contrast — always pair with a legend/label, never rely on hue alone to carry meaning (color-vision-deficient users).
- **`--category-<key>` / `--category-<key>-foreground`** (`powder` default, `espresso`, `ochre`, `terracotta`, `moss`, `teal`, `plum`, `rose`) are user-assignable category colors, rendered as the chip *behind a duration* — so unlike chart fills they are **text-contrast** pairs: light-mode riso tints with same-hue ink text (8.1–11.4:1), dark-mode deep inks with light text (6.8–7.7:1). The fill sits close to the page in light mode (~1.4:1), so a category chip always carries `border-2 border-border`, and it always shows the category name somewhere nearby (tooltip/legend), never hue alone. Keys are stored as a Postgres enum (`CATEGORY_COLORS` in `packages/db/src/schema/categories.ts`) — adding one means a new enum value plus both token pairs here. Use as `bg-category-ochre text-category-ochre-foreground`.
- **`--brand-ink` / `--brand-blue` / `--brand-paper`** are for the logo mark only (`<LogoMark />` in `apps/web/src/components/logo.tsx`). Unlike every other token they are **deliberately not redefined under `.dark`**: the mark is a printed sticker and keeps its colors in both themes, and only its hard shadow follows `--border`. Don't use them for UI surfaces. Mark usage rules live in `docs/brand/README.md`.
- Never introduce a raw Tailwind color-scale class (`text-red-500`, `bg-green-500`, `text-indigo-600`, etc.) anywhere in the app. Every color decision routes through a semantic token so a future rebrand only touches `globals.css`.

## Shape & structure (the neobrutalist half)

- **Border**: `border-2 border-border` (2px) on bounded interactive/elevated surfaces — buttons (`default`/`destructive`/`outline`/`secondary`; `ghost`/`link` stay borderless), inputs, cards, popovers, dialogs, dropdown/select content, badges, switches. Not every element needs a border — flat/text-like variants (ghost buttons, link buttons) stay borderless on purpose; this is the "Balanced" intensity, not "Bold."
- **Radius**: `--radius` is tightened to `0.375rem` (crisp, not sharp-zero, not soft-pill). Use `rounded-sm`/`rounded-md`/`rounded-lg` as before — the scale already picks up the new base value. Don't introduce `rounded-full` anywhere except legitimate cases (avatars, switches/pills).
- **Shadow**: three hard, zero-blur offset shadows in the `@theme inline` block — `shadow-brutal-sm` (2px), `shadow-brutal` (4px), `shadow-brutal-lg` (6px), all tinted to `--border` so they auto-adapt between light/dark. Never use a soft blurred `shadow-md`/`shadow-lg`.
- **Tactile press**: on `:active`, a pressable element's shadow collapses and it translates toward it (`active:translate-x-[2px] active:translate-y-[2px] active:shadow-none`), simulating a physical push. Always paired with `transition-[transform,box-shadow] motion-reduce:transition-none` — see Motion below for why that pairing is mandatory, not optional. Buttons that open a popup (`aria-haspopup`) skip the press-translate so it doesn't visually fight the open menu/dialog.
- **Density rule**: dense/scrolling surfaces (the time-entries table, the dashboard) stay restrained — a plain `border-2 border-border` outline is enough; don't add heavy shadows or grain to every row/cell.

## Texture: the `.grain` utility

A static feTurbulence noise layer (`globals.css`, near the bottom), applied via `class="grain"`.

- **Allowed**: auth screens, empty states, one-off marketing/decorative wrappers. In `apps/web` today: the outer wrapper of each auth screen (sign-in/up, forgot/reset password) and the landing/success pages.
- **Forbidden**: scrolling tables/lists, the dashboard shell, anything rendered per-row. It's cheap (a static background-image on an absolutely-positioned pseudo-element, no scroll-driven repaint), but it's still a decorative signal that has no business on dense data.
- **Accessibility**: opacity is capped low (6% light / 8% dark) specifically so it never drops a text/background pair below its measured contrast ratio, and it auto-hides under `@media (prefers-contrast: more)`. Never place `.grain` directly behind a scrolling text block — only behind whitespace/background regions.

## Typography

- `font-sans` = **Space Grotesk** (self-hosted via `@fontsource-variable/space-grotesk`) for headings, UI, and body copy — replacing the previous `Inter Variable` reference, which was never actually loaded (no `@font-face`/package existed for it before this system).
- `font-mono` = **Space Mono** (`@fontsource/space-mono`) for **all durations, timers, and timestamps.** This isn't just aesthetic: monospace digits are inherently tabular, which satisfies the Web Interface Guidelines' `tabular-nums` requirement for numeric columns without extra CSS. Use `font-mono tabular-nums` together for any time display.
- One family for body copy too (no third typeface) — keeps the "one system per project" discipline applied to type, not just components.

## Motion

- Animate only `transform`/`opacity` (never `top`/`left`/`width`/`height`).
- Every transition above trivial uses Tailwind's built-in `motion-reduce:transition-none` variant. This is not "disable the animation" — the state change (e.g. the tactile press's shadow-none + translate) must still happen instantly under `prefers-reduced-motion`; only the *animated interpolation* is removed. A control that does nothing under reduced motion is a bug, not a feature.
- `forced-colors` (Windows High Contrast): `box-shadow` is stripped by the browser under `forced-colors: active` per spec — that's fine here, because the `border-2 border-border` is the real structural signal and remains visible (rendered in system colors). Nothing in this system depends on shadow-only affordances.

## Accessibility checklist (condensed from the Web Interface Guidelines + this system's own guardrails)

- Every focusable control has a visible `focus-visible:` ring using `ring-ring`, distinct from the resting `border-border`.
- Status/validation states pair color with text or an icon — never color alone (`text-destructive` + an actual error message, not just a red border).
- Touch targets ≥ 24×24 CSS px, even for compact icon buttons in the header/nav.
- Labels are associated with their control (`htmlFor`/`id`), inputs get correct `type`/`autocomplete`, errors are inline and near the field they describe.
- Async UI updates use `aria-live="polite"`.
- Numeric/time columns use `font-mono` (tabular by construction).
- Dark mode is a first-class, independently-verified palette, not an inversion filter.

## Adding new primitives

New components come from the `shadcn` MCP/CLI (`bunx shadcn add ...`), never hand-rolled from scratch — then restyled to match this document (border/radius/shadow language above) before merging. Keep `packages/ui` as the single design system for this repo; don't introduce a second component library.
