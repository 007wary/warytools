import { colors } from "@/lib/theme";
import JsonLd from "@/components/JsonLd";
import { jsonLdGraph, breadcrumbJsonLd, webPageJsonLd } from "@/lib/jsonLd";
import { pageMetadata } from "@/lib/pageMetadata";

const termsTitle = "Terms of Use";
const termsDescription =
  "The terms for using WaryTools' free PDF, image, calculator, document converter, and URL shortener tools.";

export const metadata = pageMetadata({
  title: termsTitle,
  description: termsDescription,
  path: "/terms",
});

const LAST_UPDATED = "August 11, 2026";

function Section({ id, title, children }) {
  return (
    <section id={id} style={{ marginBottom: "40px", scrollMarginTop: "84px" }}>
      <h2 style={{ fontSize: "18px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        {title}
      </h2>
      <div style={{ fontSize: "14.5px", color: colors.textSecondary, lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div>
      <JsonLd
        data={jsonLdGraph(
          webPageJsonLd({
            name: `${termsTitle} — WaryTools`,
            description: termsDescription,
            href: "/terms",
          }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "Terms of Use", href: "/terms" },
          ])
        )}
      />
      <section
        style={{
          textAlign: "center",
          padding: "64px 20px 40px",
          background: `radial-gradient(circle at 80% 0%, ${colors.primarySoft} 0%, transparent 55%), ${colors.surface}`,
        }}
      >
        <h1
          style={{
            fontSize: "clamp(26px, 4.5vw, 38px)",
            fontWeight: 700,
            color: colors.text,
            marginBottom: "14px",
          }}
        >
          Terms of Use
        </h1>
        <p style={{ fontSize: "13px", color: colors.textFaint, marginTop: "12px" }}>
          Last updated {LAST_UPDATED}
        </p>
      </section>

      <section style={{ maxWidth: "720px", margin: "0 auto", padding: "56px 20px 80px" }}>
        <Section id="acceptance" title="1. Acceptance of terms">
          <p>
            By using WaryTools (wary.tools), you agree to these terms. If you don&rsquo;t
            agree, please don&rsquo;t use the site. We may update these terms occasionally; the
            date above reflects the latest revision.
          </p>
        </Section>

        <Section id="service" title="2. What WaryTools is">
          <p>
            {/* Previously described the site as browser-only plus a shortener,
                which stopped being true when the document converters shipped.
                A terms page that under-describes the service is the wrong place
                to be out of date — section 8's ownership claim leans on it. */}
            WaryTools provides free PDF, image, and calculator tools, nearly all of which run
            entirely in your browser, plus a URL shortener backed by a small database. Four
            tools — PDF to Word, Word to PDF, PowerPoint to PDF, and Excel to PDF — send your
            file to a server we operate, because those conversions need a layout engine no
            browser has; each says so on its own page, and the{" "}
            <a href="/privacy" style={{ color: colors.primary, textDecoration: "underline" }}>
              privacy policy
            </a>{" "}
            sets out exactly what happens to the file. The service is provided as-is, free of
            charge, with no account required.
          </p>
        </Section>

        <Section id="acceptable-use" title="3. Acceptable use">
          <p style={{ marginBottom: "10px" }}>You agree not to use WaryTools to:</p>
          <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <li>Process or host content that is illegal, infringing, or that you don&rsquo;t have the right to use.</li>
            {/* The list predates the converters and covered only the shortener as
                a way to put content near our infrastructure. Uploading a file to
                a converter is the other way, and wasn't addressed at all. */}
            <li>Upload content you don&rsquo;t have the right to convert to the document converters.</li>
            <li>Use the URL shortener to create links to malware, phishing pages, or other harmful content.</li>
            <li>Attempt to disrupt, overload, or gain unauthorized access to the site or its infrastructure.</li>
            <li>Scrape or abuse the service in a way that degrades it for other users.</li>
          </ul>
          <p style={{ marginTop: "10px" }}>
            We reserve the right to disable short links that violate these terms.
          </p>
        </Section>

        <Section id="no-warranty" title="4. No warranty">
          <p>
            WaryTools is provided &ldquo;as is&rdquo; without warranties of any kind, express or
            implied. We do our best to keep tools accurate and reliable, but we don&rsquo;t
            guarantee the site will be error-free, uninterrupted, or fit for any particular
            purpose. For anything important — legal documents, financial calculations, critical
            files — double-check the output yourself.
          </p>
        </Section>

        <Section id="liability" title="5. Limitation of liability">
          <p>
            To the fullest extent permitted by law, WaryTools and its operator are not liable
            for any indirect, incidental, or consequential damages arising from your use of the
            site, including data loss, calculation errors, or downtime. Because nearly all PDF and
            image processing happens locally in your browser, we have no visibility into and no
            control over your files — you&rsquo;re responsible for keeping your own backups, and
            for keeping the original of anything you convert.
          </p>
        </Section>

        <Section id="third-party" title="6. Third-party services">
          <p>
            {/* Listed four providers; the privacy page discloses Resend as well,
                and the contact form genuinely routes through it. Terms naming a
                narrower set than the privacy policy is the wrong direction for
                the two documents to disagree in. */}
            The URL shortener relies on Supabase for storage, the document converters run on
            servers we operate, messages sent through the contact form are delivered by Resend,
            and error monitoring is handled by Sentry. WaryTools also uses Google Analytics to
            understand site usage and Google AdSense to serve ads that keep the tools free. Each
            of these third parties has its
            own terms and privacy practices that apply to the slice of the service they support —
            see the{" "}
            <a href="/privacy" style={{ color: colors.primary, textDecoration: "underline" }}>
              privacy policy
            </a>{" "}
            for what data reaches them and how to opt out of analytics or ad personalization.
          </p>
        </Section>

        <Section id="advertising" title="7. Advertising">
          <p>
            WaryTools is free to use and is supported in part by ads served through Google
            AdSense. Ads are placed around tools, not inside them, and are never inserted into a
            file, image, or document you process. By using the site, you agree to the presence of
            these ads; using an ad blocker doesn&rsquo;t affect your ability to use any tool.
          </p>
        </Section>

        <Section id="ip" title="8. Your content and ownership">
          <p>
            {/* The ownership promise was previously grounded entirely in "never
                reach our servers", which is false for the four converters — so
                for exactly the tools where a file DOES reach us, the clause
                asserting we claim no rights rested on a premise that didn't
                hold. The right fix is to keep the promise and stop deriving it
                from a mechanism that has exceptions: we claim no rights either
                way, and for most tools there is additionally no copy to claim. */}
            You retain full ownership of anything you process with WaryTools. We claim no rights
            over your files, images, or calculator inputs, and never use them for any purpose
            beyond performing the operation you asked for. For nearly every tool this is
            absolute by construction — the data never reaches our servers, so there is no copy
            to claim and no way for us to access it. For the four document converters, your file
            reaches our converter, is converted, and is deleted immediately; we claim no rights
            over it and keep no copy. For the URL shortener, you&rsquo;re responsible for the
            destination URLs you create short links for, and must have the right to link to that
            content (see &ldquo;Acceptable use&rdquo; above).
          </p>
        </Section>

        <Section id="changes-to-service" title="9. Changes to the service">
          <p>
            Tools may be added, changed, or removed over time as WaryTools evolves. We&rsquo;ll
            try to avoid breaking changes to existing tools, but can&rsquo;t guarantee any
            specific tool or short link will remain available indefinitely.
          </p>
        </Section>

        <Section id="termination" title="10. Suspension and termination">
          <p>
            We may block, rate-limit, or restrict access for any use that violates these terms —
            including abusive traffic, scraping, or short links created for malicious purposes —
            without prior notice. Since there are no accounts, this applies at the level of
            access to the site or specific links, not a user record.
          </p>
        </Section>

        <Section id="governing-law" title="11. Governing law">
          <p>
            These terms are governed by the laws of India, without regard to conflict-of-law
            principles. Any dispute arising from use of WaryTools will be subject to the
            jurisdiction of the courts located in India.
          </p>
        </Section>

        <Section id="contact" title="12. Contact">
          <p>
            {/* Pointed vaguely at "contact details listed on the site" — there is
                a real contact form, and a terms page telling someone to go hunting
                for a way to raise a dispute is the wrong kind of friction. */}
            Questions about these terms can be sent through the{" "}
            <a href="/contact" style={{ color: colors.primary, textDecoration: "underline" }}>
              contact form
            </a>
            .
          </p>
        </Section>
      </section>
    </div>
  );
}
