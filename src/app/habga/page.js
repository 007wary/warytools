import AdminClient from "./AdminClient";

// The newsletter dashboard, at a deliberately unguessable path.
//
// "/admin" is the first thing every scanner tries, so the odd name keeps this
// login form out of bulk credential-stuffing traffic entirely. That is
// obscurity, not security — the password, the timing-safe comparison and the
// rate limit are the actual controls — but it costs nothing and removes a lot
// of noise.
//
// noindex/nofollow AND excluded from the sitemap (see SITEMAP_EXCLUDED_ROUTES).
// It is deliberately NOT listed in robots.txt: that file is world-readable and
// scanners read it precisely to harvest interesting paths, so naming this route
// there would publish the very thing the path is chosen to keep quiet. The meta
// tag is what still binds if a crawler finds the URL some other way — a leaked
// screenshot, a referrer header.
//
// Rendering is dynamic rather than static so the shell is never cached at the
// edge. There is nothing secret in it — the page is a login form until the
// API says otherwise — but a cached admin shell is the kind of thing that
// quietly becomes wrong after a deploy.
export const metadata = {
  title: "Newsletter dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return <AdminClient />;
}
