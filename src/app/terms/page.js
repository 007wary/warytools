import { colors } from "@/lib/theme";

export const metadata = {
  title: "Terms of Use — WaryTools",
  description:
    "The terms for using WaryTools' free PDF, image, calculator, and URL shortener tools.",
};

const LAST_UPDATED = "August 2, 2026";

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
        <p style={{ fontSize: "15px", color: colors.textMuted, maxWidth: "540px", margin: "0 auto" }}>
          Plain-language terms for using a free, browser-based toolset.
        </p>
        <p style={{ fontSize: "13px", color: colors.textFaint, marginTop: "12px" }}>
          Last updated {LAST_UPDATED}
        </p>
      </section>

      <section style={{ maxWidth: "720px", margin: "0 auto", padding: "56px 20px 80px" }}>
        <Section id="acceptance" title="1. Acceptance of terms">
          <p>
            By using WaryTools (warytools.com), you agree to these terms. If you don&rsquo;t
            agree, please don&rsquo;t use the site. We may update these terms occasionally; the
            date above reflects the latest revision.
          </p>
        </Section>

        <Section id="service" title="2. What WaryTools is">
          <p>
            WaryTools provides free PDF, image, and calculator tools that run entirely in your
            browser, plus a URL shortener backed by a small database. The service is provided
            as-is, free of charge, with no account required for the browser-based tools.
          </p>
        </Section>

        <Section id="acceptable-use" title="3. Acceptable use">
          <p style={{ marginBottom: "10px" }}>You agree not to use WaryTools to:</p>
          <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <li>Process or host content that is illegal, infringing, or that you don&rsquo;t have the right to use.</li>
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
            site, including data loss, calculation errors, or downtime. Because PDF and image
            processing happens locally in your browser, we have no visibility into and no
            control over your files — you&rsquo;re responsible for keeping your own backups.
          </p>
        </Section>

        <Section id="third-party" title="6. Third-party services">
          <p>
            The URL shortener relies on Supabase for storage, and error monitoring is handled by
            Sentry. Their own terms and privacy practices apply to the respective slice of the
            service they support — see the{" "}
            <a href="/privacy" style={{ color: colors.primary, textDecoration: "underline" }}>
              privacy policy
            </a>{" "}
            for what data reaches them.
          </p>
        </Section>

        <Section id="changes-to-service" title="7. Changes to the service">
          <p>
            Tools may be added, changed, or removed over time as WaryTools evolves. We&rsquo;ll
            try to avoid breaking changes to existing tools, but can&rsquo;t guarantee any
            specific tool or short link will remain available indefinitely.
          </p>
        </Section>

        <Section id="contact" title="8. Contact">
          <p>
            Questions about these terms can be directed through the contact details listed on
            the site.
          </p>
        </Section>
      </section>
    </div>
  );
}
