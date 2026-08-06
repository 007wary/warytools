import { categories, allTools } from "@/lib/tools";
import { SITE_URL } from "@/lib/siteUrl";

export const dynamic = "force-static";

// Generated from the tool registry (src/lib/tools.js) so it can never drift
// from the site's actual tools, mirroring sitemap.js/robots.js.
export async function GET() {
  const baseUrl = SITE_URL;
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
> uploaded to a server. The exceptions are the three document converters — PDF
> to Word, Word to PDF, and PowerPoint to PDF — which convert server-side
> because a browser has no layout engine for those directions. Every tool is
> free and requires no account or sign-up.

${toolSections}

## Site

- [Home](${link("/")}): Full tool directory and search.
- [About](${link("/about")}): Why WaryTools exists and how it works.
- [Privacy](${link("/privacy")}): What is (and isn't) collected — relevant since nearly all tools never leave the browser.
- [Terms](${link("/terms")}): Terms of use.
- [Contact](${link("/contact")}): Get in touch via a contact form — bug reports, tool suggestions, questions.

## Notes

- The URL shortener is the only tool with persistent server-side state (Supabase); it stores the short code, destination URL, and a click count.
- PDF to Word sends the file to a pdf2docx converter we run, which returns the .docx and deletes the file immediately. Nothing is stored.
- Word to PDF sends the file to a LibreOffice converter we run, which returns the PDF and deletes the file immediately. Nothing is stored. It accepts .docx, .doc, .odt, and .rtf.
- PowerPoint to PDF sends the file to a separate LibreOffice Impress converter we run, which returns the PDF (one page per slide) and deletes the file immediately. Nothing is stored. It accepts .pptx, .ppt, .ppsx, and .odp. The reverse direction, PDF to PowerPoint, is deliberately not offered: a PDF page has no concept of a slide or a text placeholder, so the output would be either uneditable full-page images or overlapping text boxes.
- The contact form posts the sender's name, email, and message to our server and delivers them by email. Nothing is stored in a database.
- All other tools have no backend: no file, image, or calculator input is ever transmitted off the user's device.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
