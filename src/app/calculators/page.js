import Link from "next/link";
import ToolCard from "@/components/ToolCard";
import HubHeader from "@/components/HubHeader";
import JsonLd from "@/components/JsonLd";
import { categories } from "@/lib/tools";
import { jsonLdGraph, collectionPageJsonLd, breadcrumbJsonLd } from "@/lib/jsonLd";
import { categoryColors, colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Free Online Calculators — Age, Percentage, GST, EMI";
const description =
  "Free online calculators for age, percentage, GST, EMI, simple and compound interest, unit conversion, and days between dates. Instant results, no sign-up.";

export const metadata = pageMetadata({ title, description, path: "/calculators" });

export default function CalculatorsHubPage() {
  const category = categories.find((c) => c.slug === "calculators");

  return (
    <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
          collectionPageJsonLd({ name: title, description, href: "/calculators", tools: category.tools }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "Calculators", href: "/calculators" },
          ])
        )}
      />
      {/* The description says "no sign-up, no clutter" and deliberately not
          "no ads" — the site runs AdSense; see the homepage description and
          lib/adsense.js. "No clutter" remains honest: it describes the tools
          themselves, which carry no interstitials or upsells. */}
      <HubHeader
        categorySlug="calculators"
        icon={category.icon}
        title="Free Online Calculators"
        description="Quick, free calculators for everyday math — no sign-up, no clutter."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        {category.tools.map((tool) => (
          <ToolCard
            key={tool.slug}
            title={tool.title}
            description={tool.description}
            href={tool.href}
            icon={tool.icon}
            category="calculators"
            headingLevel="h2"
          />
        ))}
      </div>

      {/* The hub was a header plus a grid of links and nothing else — roughly
          the thinnest page shape there is, and it competes for "free online
          calculators" against pages carrying real copy. This says what the set
          covers and links each tool in prose, which is a second internal link
          to every calculator with descriptive anchor text. */}
      <section style={{ marginTop: "48px", maxWidth: "760px" }}>
        <h2 style={{ fontSize: "19px", fontWeight: 600, color: colors.text, marginBottom: "16px" }}>
          Everyday calculators that just work
        </h2>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, marginBottom: "14px" }}>
          Every calculator here runs entirely in your browser and updates the moment you change an
          input — there is no calculate button, no sign-up, and nothing you enter is sent to a
          server. That matters most
          on the money tools: the figures you put into the{" "}
          <HubLink href="/calculators/emi">EMI calculator</HubLink> or the{" "}
          <HubLink href="/calculators/gst">GST calculator</HubLink> never leave your device.
        </p>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, marginBottom: "14px" }}>
          For money and tax, work out loan instalments and total interest with the EMI calculator,
          add or remove GST at the Indian slabs, or compare savings growth with the{" "}
          <HubLink href="/calculators/interest">simple and compound interest calculator</HubLink>.
          The <HubLink href="/calculators/percentage">percentage calculator</HubLink> covers
          discounts, scores, and percentage change.
        </p>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, margin: 0 }}>
          For dates and measurements, the{" "}
          <HubLink href="/calculators/age">age calculator</HubLink> gives an exact age from a date
          of birth, the{" "}
          <HubLink href="/calculators/date-difference">date difference calculator</HubLink> counts
          calendar and business days between two dates, and the{" "}
          <HubLink href="/calculators/unit-converter">unit converter</HubLink> handles length,
          weight, and temperature. Each result has its own link, so a calculation can be bookmarked
          or shared.
        </p>
      </section>
    </section>
  );
}

function HubLink({ href, children }) {
  return (
    <Link href={href} style={{ color: categoryColors.calculators.text, textDecoration: "underline" }}>
      {children}
    </Link>
  );
}
