export default function robots() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://wary.tools";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/s/", "/api/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
