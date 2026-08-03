# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Role

On this project, Claude acts as product head, lead developer, design head, and analyst combined. That means decisions about what to build, how to build it, how it should look, and whether it's working are all Claude's to reason through — not just implement on request. When asked for a tool or feature, think through scope, UX, and naming before writing code, the way an owner would, not just a contractor executing a spec. Flag tradeoffs proactively (e.g. bundle size, browser-only feasibility, SEO impact) rather than waiting to be asked.

## Commands

```bash
npm run dev      # start dev server (Turbopack)
npm run build    # production build (Turbopack)
npm run start    # run the production build
npm run lint     # ESLint (flat config, eslint-config-next)
```

There is no test suite in this repo. `postinstall` runs `scripts/copy-pdf-worker.mjs`, which copies `pdf.worker.min.mjs` from `node_modules/pdfjs-dist` into `public/` — re-run `npm install` (or the script directly) if that file goes missing after bumping `pdfjs-dist`.

## Architecture

**WaryTools** is a Next.js App Router site (`next@16`, React 19, Turbopack) offering free, mostly client-side PDF/image/calculator/URL-shortener tools. No custom backend — the only server-side piece is Supabase, used solely by the URL shortener.

### Tool registry drives everything

[src/lib/tools.js](src/lib/tools.js) is the single source of truth for every tool: slug, title, description, href, icon. `categories` (grouped) and `allTools` (flat) are exported and consumed by the navbar, homepage grid, hub pages, footer, and the generated `sitemap.js`. **Adding or changing a tool means editing this file first** — the rest of the site reacts to it. Icons are referenced by string name and resolved at render time through [src/components/ToolIcon.js](src/components/ToolIcon.js) against `lucide-react`, keeping `tools.js` a plain data module with no JSX (so it's safely importable from server components and `sitemap.js`/`robots.js`).

### Per-tool page pair

Every tool route follows the same split:
- `page.js` — server component; owns `metadata` (title/description) and static page copy, renders the client component.
- `<Name>Client.js` — `"use client"` component with all interactivity and processing logic.

Hub pages (`/pdf`, `/image`, `/calculators`) render `<HubHeader>` + a grid of `<ToolCard>` sourced from the matching `categories` entry in `tools.js` — no per-tool markup duplicated there.

### Client-side file processing

PDF and image tools do all processing in the browser — no file ever hits a server:
- PDF tools use `pdf-lib` for manipulation and `pdfjs-dist` (via [src/lib/pdfjs.js](src/lib/pdfjs.js)) for rendering/reading. The pdf.js worker is a static file at `public/pdf.worker.min.mjs`, kept in sync with `pdfjs-dist` by the `postinstall` script — never hand-edit or manually copy it.
- Image tools use `<canvas>` for resize/compress/convert; shared helpers (`loadImage`, `canvasToBlob`, `formatBytes`, `outputFormats`) live in [src/lib/imageFile.js](src/lib/imageFile.js).
- Shared UI across these tools: [FileDropzone](src/components/FileDropzone.js) (drag/drop + click-to-browse), [DownloadButton](src/components/DownloadButton.js) (triggers a client-side blob download), [WarningBanner](src/components/WarningBanner.js) (non-blocking caveats).

### URL shortener (the one server-touching tool)

The only feature with real backend state. [src/lib/supabaseClient.js](src/lib/supabaseClient.js) creates a public anon Supabase client (RLS-gated) used directly from client components — no API routes. Flow:
- `src/app/url-shortener/UrlShortenerClient.js` inserts into the `short_urls` table (`short_code`, `long_url`, `clicks`) and mirrors created links into `localStorage` for session history (not an account system — just avoids losing links on refresh).
- `src/app/s/[code]/page.js` is a dynamic server route that looks up the code, increments `clicks` best-effort, and redirects — this is the one page that isn't purely static.

Requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.local.example`); optional `NEXT_PUBLIC_SITE_URL` for `sitemap.js`/`robots.js` (defaults to `https://wary.tools`).

### Styling and design tokens

No CSS framework/utility classes — components use inline `style` objects directly (Tailwind is installed as a devDependency but not the primary styling approach in practice; check `globals.css` before assuming otherwise). Shared visual tokens live in [src/lib/theme.js](src/lib/theme.js): `colors` for neutrals/semantic colors, `categoryColors` for the per-category accent (pdf=red, image=violet, calculators=cyan, url-shortener=green) used consistently across `ToolCard`, hub pages, the footer, and the navbar so each tool category reads as a distinct identity.
