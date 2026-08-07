import ExcelToPdfClient from "./ExcelToPdfClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Excel to PDF Converter — Free, No Sign-Up";
// Like the other three converters, this description cannot claim the file stays
// in the browser, so the privacy line is replaced with the honest one. What it
// leads with instead is the thing that actually differentiates this tool:
// columns that fit. "Without cutting off columns" is close to how people
// describe the problem when they go looking for a converter.
const description =
  "Convert Excel to PDF online, free and without sign-up or watermarks. Fits all your columns on the page instead of cutting them off.";
const appName = "Excel to PDF";
const href = "/pdf/excel-to-pdf";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "Why do my columns get cut off in other converters?",
    answer:
      "Because a spreadsheet has no page. A Word file has a page size and a PowerPoint file has a slide size, but a sheet is an unbounded grid — so something has to decide where to cut it into pages, and most converters just use Excel's own default: portrait paper at 100% scale, with anything too wide sliced onto separate pages. That's how a 12-column budget becomes a four-page PDF with the last few columns stranded on their own sheet, without the row labels that made them mean anything. This tool defaults to fitting every column across the page width instead, and lets you change it before converting.",
  },
  {
    question: "Is my spreadsheet uploaded to convert it?",
    answer:
      "Yes. This, PDF to Word, Word to PDF, and PowerPoint to PDF are the only four tools on WaryTools that upload anything. Rendering a workbook to PDF means running a spreadsheet layout engine — column widths, merged cells, number formats, conditional formatting, charts, print ranges — which a browser cannot do. Your file is sent to our converter over an encrypted connection, converted, and deleted immediately. It is never stored, logged, or shared. If a workbook is confidential, Excel and LibreOffice both export PDFs locally.",
  },
  {
    question: "What do the page setup options do?",
    answer:
      "Column fitting decides how the sheet's width is handled. 'Fit all columns' (the default) shrinks the sheet just enough that every column fits the page width, and lets long sheets continue over as many pages as the rows need — this is what most people mean by 'make it fit'. 'Fit to one page' squeezes an entire sheet onto a single page, which is right for a small summary table and unreadable for a large one. 'Use Excel's setup' keeps whatever print area, scaling, and page breaks you already saved in the workbook. Orientation defaults to automatic, which means landscape — spreadsheets are usually wider than they are tall.",
  },
  {
    question: "Will my formulas and charts come through?",
    answer:
      "Yes. Formulas are converted as their calculated results, which is what printing a spreadsheet has always done — a PDF shows the value in the cell, not the formula behind it. Charts, conditional formatting, cell colours, borders, and number formats (currency, dates, percentages) are all preserved. What doesn't come through is anything interactive: filters, slicers, pivot table controls, and comments are not part of a printed page.",
  },
  {
    question: "Will the PDF look exactly like my spreadsheet?",
    answer:
      "Very close. The converter runs LibreOffice Calc, which reads Excel files natively. The thing most likely to shift is fonts — if your workbook uses a font the converter doesn't have, it substitutes the closest match, and because a substitute can be slightly wider, that can change how many columns fit a page. Standard fonts like Calibri, Arial, and Times New Roman are all handled. It's also worth knowing the PDF reflects your sheet's print view, so hidden rows and columns stay hidden.",
  },
  {
    question: "Which file types can I convert?",
    answer:
      ".xlsx, the format Excel has used since 2007, plus older .xls files, macro-enabled .xlsm workbooks, and OpenDocument .ods files from LibreOffice or Google Sheets. Macros in a .xlsm are never run — they live in a part of the file the PDF export doesn't touch.",
  },
  {
    question: "Can I convert a CSV file?",
    answer:
      "No, and that's deliberate rather than an oversight. A CSV holds values and nothing else — no column widths, no fonts, no cell formatting, no page setup. Any PDF made from one would be invented by us rather than converted from what you saw, and it would look nothing like the file you opened in Excel. Open the CSV in Excel, save it as .xlsx, and convert that instead — then the layout in the PDF is the one you chose.",
  },
  {
    question: "What about .xlsb binary workbooks?",
    answer:
      "Not supported, for a specific reason. A .xlsb looks like a .xlsx from the outside, but its sheet data is in a binary format that LibreOffice reads only partially — it often produces a PDF with blank or truncated sheets. Handing back a file that looks converted but is missing data is worse than refusing it, so the tool refuses it and tells you to save as .xlsx first.",
  },
  {
    question: "Does it add a watermark?",
    answer:
      "No. The PDF you download is your spreadsheet and nothing else. There is no watermark, no footer, and no branding added anywhere.",
  },
  {
    question: "Are there any limits?",
    answer:
      "Workbooks up to 20 MB, and a few conversions per person every ten minutes. The limits exist because conversion runs on a shared server rather than your own device. 20 MB goes a long way for a spreadsheet — a workbook is mostly numbers and text, which compress to almost nothing, so files that hit the limit are usually carrying several large data sheets or embedded images.",
  },
  {
    question: "Can you convert a PDF back into Excel?",
    answer:
      "Not at the moment, and for the same reason PDF to PowerPoint isn't offered. A PDF page has no concept of a cell, a row, or a formula — it has text at coordinates. Reconstructing a spreadsheet from that means guessing where the table boundaries were, and the guess is wrong often enough that you'd have to check every cell, which is more work than retyping. We'd rather not ship it than ship something that produces a .xlsx you can't trust.",
  },
  {
    question: "Do I need to sign up or pay?",
    answer:
      "No. There is no account, no watermark on the output, and no charge.",
  },
];

export default function ExcelToPdfPage() {
  const category = categories.find((c) => c.slug === "pdf");

  return (
    <section style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
          toolSoftwareAppJsonLd({ name: appName, description, href, categorySlug: "pdf" }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "PDF Tools", href: "/pdf" },
            { name: appName, href },
          ]),
          faqJsonLd(faqs)
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Excel to PDF Converter
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Turn a spreadsheet into a PDF with every column on the page.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Useful when you need to send a report to someone without Excel, attach figures to an
        application, or print a sheet without it splitting across pages. The usual complaint about
        this conversion is columns getting cut off — a spreadsheet has no page size of its own, so
        most converters fall back to portrait paper and slice anything too wide. This one fits your
        columns to the page by default, and you can change the fitting, orientation, and sheet
        selection before converting. Accepts .xlsx, .xls, .xlsm, and .ods. Like the other document
        converters, this tool sends your file to our server, because laying out a spreadsheet is not
        something a browser can do; the file is deleted the moment it&apos;s converted.
      </p>

      <ExcelToPdfClient />

      <FaqSection items={faqs} />
      <RelatedTools
        currentHref={href}
        categorySlug="pdf"
        categoryLabel="PDF tools"
        hubHref="/pdf"
        tools={category.tools}
      />
    </section>
  );
}
