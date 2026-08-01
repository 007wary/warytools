# WaryTools

Free online tools for PDF editing, image processing, calculators, and URL shortening — built with Next.js. PDF and image tools run 100% in the browser (no uploads); the URL shortener uses Supabase for storage.

## Tools

- **PDF** — merge, split, compress, rotate, reorder pages
- **Image** — compress, resize, convert (PNG/JPG/WebP)
- **Calculators** — age, percentage, GST, interest, unit converter, date difference
- **URL Shortener** — shorten links and track clicks

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env example and fill in your Supabase project credentials (used by the URL shortener):

   ```bash
   cp .env.local.example .env.local
   ```

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `NEXT_PUBLIC_SITE_URL` | (Optional) canonical site URL used for `sitemap.xml`/`robots.txt`; defaults to `https://warytools.com` |

The URL shortener expects a Supabase table named `short_urls` with `id`, `short_code`, `long_url`, and `clicks` columns. **Row-level security is the only real access control** — the browser talks to Supabase directly with the public anon key, so RLS policies must enforce:

- `INSERT`: anon allowed, but only for the exact columns the app sets (`short_code`, `long_url`) — don't allow `id` or `clicks` to be set on insert.
- `SELECT`: anon allowed (needed for redirects and click-count refresh).
- `UPDATE`: anon allowed **only** on the `clicks` column, ideally via a Postgres function/trigger that increments rather than trusting a client-supplied value, to prevent visitors from setting `clicks` to an arbitrary number.
- `DELETE`: anon **not** allowed.

There's no application-level rate limiting on link creation — enforce it in Supabase (e.g. a rate-limit policy or Edge Function) if abuse becomes a problem.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — run ESLint

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
