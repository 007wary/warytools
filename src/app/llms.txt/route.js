import { categories, allTools } from "@/lib/tools";

export const dynamic = "force-static";

// Generated from the tool registry (src/lib/tools.js) so it can never drift
// from the site's actual tools, mirroring sitemap.js/robots.js.
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://warytools.com";
  const link = (href) => `${baseUrl}${href}`;

  const toolSections = categories
    .map((category) => {
      const isSingleTool = category.tools.length === 1 && category.hubHref === category.tools[0].href;
      const lines = [
        ...(isSingleTool
          ? []
          : [`- [${category.label} hub](${link(category.hubHref)}): Browse all ${category.tools.length} tools in this category.`]),
        ...category.tools.map(
          (tool) => `- [${tool.title}](${link(tool.href)}): ${tool.description}`
        ),
      ];
      return `## ${category.label}\n\n${lines.join("\n")}`;
    })
    .join("\n\n");

  const body = `# WaryTools

> Free, browser-based PDF, image, calculator, and URL-shortener tools —
> ${allTools.length} tools total. PDF and image tools run entirely
> client-side (pdf-lib, canvas): files are processed on-device and never
> uploaded to a server. Every tool is free, has no ads, and requires no
> account or sign-up.

${toolSections}

## Site

- [Home](${link("/")}): Full tool directory and search.
- [About](${link("/about")}): Why WaryTools exists and how it works.
- [Privacy](${link("/privacy")}): What is (and isn't) collected — relevant since PDF/image tools never leave the browser.
- [Terms](${link("/terms")}): Terms of use.
- [Contact](${link("/contact")}): Get in touch.

## Notes

- The URL shortener is the only tool with server-side state (Supabase); it stores the short code, destination URL, and a click count.
- All other tools have no backend: no file, image, or calculator input is ever transmitted off the user's device.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
