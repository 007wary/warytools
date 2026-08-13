import { buildRssFeed } from "@/lib/blogFeed";
import { getAllPosts } from "@/lib/blogPosts";
import { SITE_URL } from "@/lib/siteUrl";

// Static: posts only change when the repo does, so the feed is generated once
// per build rather than per request.
export const dynamic = "force-static";

export async function GET() {
  const body = buildRssFeed({ siteUrl: SITE_URL, posts: getAllPosts() });

  return new Response(body, {
    headers: {
      // `application/rss+xml` rather than `text/xml`: it is the registered
      // type, and it is what makes a browser's reader extension offer to
      // subscribe instead of rendering the raw markup.
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
