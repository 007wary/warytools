import AdminClient from "./AdminClient";

// The newsletter dashboard.
//
// noindex/nofollow AND excluded from the sitemap (see SITEMAP_EXCLUDED_ROUTES)
// AND disallowed in robots.txt. Three guards rather than one because they fail
// differently: the sitemap exclusion stops us advertising it, robots asks
// crawlers not to fetch it, and the meta tag is the only one that still binds
// if a crawler finds the URL some other way — a link, a leaked screenshot, a
// referrer header. None of them is access control; the session cookie is.
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
