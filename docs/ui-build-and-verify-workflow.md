# How the hourino landing hero was built and verified with Claude Code

This page covers the tools used to design, build, and check the landing-page hero, and how to add the same flow to your own Claude Code setup. It explains which parts are **skills**, which are **MCP servers**, and which are **built into Claude Code**. Those three install differently.

## 1. What was actually used

| Step | Tool | Kind | Where it comes from |
|---|---|---|---|
| Asking about requirements before coding (audience, layout, i18n, demo behavior) | Plan mode + `AskUserQuestion` | Built into Claude Code | Nothing to install. Press `Shift+Tab` to enter plan mode, or just ask Claude to plan first |
| Design rules (hero stack limits, no fake screenshots, dark mode, reduced motion, em-dash ban, pre-flight checklist) | `design-taste-frontend` | **Skill** | [`Leonxlnx/taste-skill`](https://github.com/Leonxlnx/taste-skill) |
| Brand rules (tokens, borders, brutal shadows, grain, fonts) | `packages/ui/DESIGN.md` + `CLAUDE.md` | Project docs | Already in this repo |
| Up-to-date library docs (Paraglide JS setup) | Context7 | MCP server | Configured in your Claude account/settings |
| Opening the page, clicking, keyboard testing, reading the accessibility tree, screenshots, viewport/mobile emulation | `chrome-devtools` | **MCP server** (not a skill) | Bundled with the **ECC** plugin (`chrome-devtools-mcp`) |
| Accessibility / best-practices / SEO audit | Lighthouse, run through `chrome-devtools` | MCP tool | Same as above |
| Lint, format, type-check | Biome (Ultracite), `tsc` | Project CLI | Already in this repo (`bun run check`, `bun run check-types`) |
| Guardrails that ask for facts before creating files / running destructive commands | GateGuard and config-protection hooks | **Hooks** | ECC plugin (`hook_profile: standard`) |

Two notes, for accuracy:

- **`web-design-guidelines`** (Vercel's UI review skill) is installed, and the plan named it for a final review. In the end it **was not run**. The Lighthouse accessibility audit and manual keyboard / screen-reader checks covered that ground instead. Add it to your flow if you want a line-by-line guideline review (see step 4 below).
- The browser checks were **run by hand, once, during the session**. They are **not saved as a test file**, so nothing re-runs them automatically. Section 4 shows how to turn them into a repeatable test.

## 2. What the browser check covered

Everything below ran through the `chrome-devtools` MCP against `bun run dev:web` (http://localhost:3001):

1. **Layout at two sizes:** screenshots at 1280×800 and 375×812 (mobile + touch emulation), in both light and dark themes.
2. **Measured, not eyeballed:** a small script counted the headline's rendered lines (the taste skill allows at most 2 on desktop), checked for horizontal scroll, and confirmed the CTA sits above the fold.
3. **i18n:** switched EN ↔ pt-BR through the real menu, then confirmed `document.title`, `<html lang>`, month names, and that the choice is saved in `localStorage`.
4. **Interaction:** selected a day, used quick-add, toggled filters, and checked that the totals changed as expected.
5. **Keyboard:** arrow keys move focus within the calendar grid, Enter selects, and there is exactly one Tab stop (roving tabindex).
6. **Accessibility tree snapshot:** checked accessible names ("terça-feira, 22 de setembro, hoje: 8 horas"), `pressed` states, and disabled future days.
7. **Lighthouse:** Accessibility 100. It caught one real issue (visible text not included in the accessible name of the day buttons), which was fixed and re-audited.
8. **Regression:** `/login` still shows the app header, so the marketing/app layout split did not break other routes.

## 3. Install it on your machine

### The ECC plugin (gives you `chrome-devtools` MCP + hooks + extra QA skills)

In Claude Code:

```text
/plugin marketplace add https://github.com/affaan-m/ECC.git
/plugin install ecc@ecc
```

This is what `~/.claude/settings.json` ends up with (`enabledPlugins: { "ecc@ecc": true }`). The plugin bundles:

```json
{ "mcpServers": { "chrome-devtools": { "command": "npx", "args": ["-y", "chrome-devtools-mcp@latest"] } } }
```

**Only want the browser tool, without the rest of ECC?** Add the MCP server directly:

```bash
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest
```

You need Chrome installed and Node available on your PATH.

### The skills

Both were installed with the open `skills` CLI, which records them in `~/.agents/.skill-lock.json`:

```bash
npx skills add Leonxlnx/taste-skill            # design-taste-frontend
npx skills add vercel-labs/agent-skills        # includes web-design-guidelines (pick it when prompted)
```

Skills in `~/.claude/skills/` apply to every project. To share them with a team, install them at project scope instead; this repo already does that for other skills, see `skills-lock.json` and `.claude/skills/`. That way teammates get the same skills when they clone the repo.

Check they loaded: start Claude Code and run `/skills`, or just ask "which skills do you have?".

## 4. Add it to your existing workflow

Pick the level of automation you want:

### Level 1: ask for it

Say this in your prompt:

> Build X. Before coding, grill me on the requirements in plan mode. Use `design-taste-frontend` and our `DESIGN.md`. When done, verify in the browser with chrome-devtools (desktop + mobile, light + dark, keyboard, Lighthouse accessibility) and run `web-design-guidelines` on the changed files.

### Level 2: write it down once, so Claude always does it

Add a section like this to your project's `CLAUDE.md`. Claude reads it at the start of every session:

```markdown
## UI change checklist
For any change under apps/web:
1. Plan first; ask clarifying questions for anything user-facing.
2. Load `design-taste-frontend`; follow packages/ui/DESIGN.md tokens.
3. After implementing, verify with the chrome-devtools MCP against `bun run dev:web`:
   screenshots at 1280x800 and 375x812, light and dark; keyboard pass; Lighthouse accessibility = 100;
   check that no other route regressed.
4. Run the `web-design-guidelines` skill on changed files.
5. `bun run check-types` and Biome on changed files must be clean.
```

Or package it as a **project skill** so anyone can invoke it with `/ui-verify`. Create `.claude/skills/ui-verify/SKILL.md`:

```markdown
---
name: ui-verify
description: Verify a web UI change in a real browser (layout, themes, i18n, keyboard, Lighthouse a11y). Use after changing anything in apps/web.
---
1. Make sure `bun run dev:web` is running (port 3001); start it in the background if not.
2. With the chrome-devtools MCP: open the changed route; screenshot at 1280x800 and 375x812 (mobile,touch), in light and dark
   (set localStorage "vite-ui-theme" via initScript and reload).
3. Evaluate a script to measure: headline line count, horizontal overflow, CTA bottom < viewport height.
4. take_snapshot and check accessible names, pressed/disabled states; Tab + arrow keys through interactive widgets.
5. If the page is translated, switch locale (localStorage "PARAGLIDE_LOCALE") and repeat steps 2 and 4.
6. Run lighthouse_audit (desktop); accessibility must be 100. Fix anything the change introduced and re-run.
7. Visit one unrelated route to confirm nothing regressed.
8. Report findings as a short list with screenshots of anything wrong.
```

### Level 3: make it run without Claude (CI)

The browser checks above are one-off. To make them permanent, turn them into a Playwright test plus an axe accessibility scan, and run it in CI:

```bash
bun add -D @playwright/test @axe-core/playwright
bunx playwright install chromium
```

```ts
// apps/web/e2e/landing.spec.ts (sketch)
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("landing hero: a11y, CTA above the fold, demo works", async ({ page }) => {
	await page.goto("/");
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
	const cta = page.getByRole("link", { name: /start tracking/i });
	await expect(cta).toBeInViewport();
	await page.getByRole("button", { name: /add 30 minutes of work/i }).click();
	await expect(page.getByText(/month total/i)).toBeVisible();
});
```

ECC also ships skills that help write and maintain these tests: `ecc:e2e-testing` (Playwright patterns), `ecc:browser-qa`, and the `ecc:e2e-runner` agent. Ask Claude to "use e2e-testing to turn the ui-verify checklist into Playwright specs".

## 5. Quick reference

| I want to… | Use |
|---|---|
| Get pushback on requirements before code is written | Plan mode (`Shift+Tab`) and ask to be "grilled" |
| Keep generated UI from looking generic | `design-taste-frontend` skill + your own DESIGN.md |
| Have Claude click through the real page | `chrome-devtools` MCP (via ECC or `claude mcp add`) |
| Accessibility score | Lighthouse through `chrome-devtools` (`lighthouse_audit`) |
| Line-by-line UI guideline review | `web-design-guidelines` skill |
| Repeatable tests in CI | Playwright + `@axe-core/playwright` (with `ecc:e2e-testing` to help write them) |
