import { categories, allTools } from "@/lib/tools";

export default function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://warytools.com";

  const staticRoutes = [
    "",
    "/about",
    "/privacy",
    "/terms",
    ...categories.map((category) => category.hubHref),
  ];
  const toolRoutes = allTools.map((tool) => tool.href);

  const routes = [...new Set([...staticRoutes, ...toolRoutes])];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
  }));
}
