import { categories } from "@/lib/tools";

export const dynamic = "force-static";

// Generated from the tool registry (src/lib/tools.js) so it can never drift
// from the site's actual tools, mirroring sitemap.js/robots.js.
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://warytools.com";

  const sections = categories
    .map((category) => {
      const lines = category.tools.map(
        (tool) => `- [${tool.title}](${baseUrl}${tool.href}): ${tool.description}`
      );
      return `## ${category.label}\n\n${lines.join("\n")}`;
    })
    .join("\n\n");

  const body = `# WaryTools

> WaryTools is a free web toolbox of PDF, image, calculator, and URL-shortener
> utilities. Most tools run entirely client-side in the browser — files are
> processed locally via WebAssembly/canvas and never uploaded to a server —
> so they're fast, private, and free with no sign-up.

${sections}

## Notes

- PDF and image tools process files entirely in the browser; no file content is
  uploaded to a server.
- The URL shortener is the one feature with server-side state (Supabase).
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
