import { colors } from "@/lib/theme";

const privacyTitle = "Privacy Policy";
const privacyDescription =
  "How WaryTools handles your data: PDF and image files are processed entirely in your browser and never uploaded. Learn what the URL shortener, analytics, advertising, and error tracking store, and how the site is secured.";

export const metadata = {
  title: privacyTitle,
  description: privacyDescription,
  alternates: { canonical: "/privacy" },
  openGraph: { title: `${privacyTitle} — WaryTools`, description: privacyDescription },
  twitter: { title: `${privacyTitle} — WaryTools`, description: privacyDescription },
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

export default function PrivacyPage() {
  return (
    <div>
      {/* Hero */}
      <section
        style={{
          textAlign: "center",
          padding: "64px 20px 40px",
          background: `radial-gradient(circle at 20% 0%, ${colors.primarySoft} 0%, transparent 55%), ${colors.surface}`,
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
          Privacy Policy
        </h1>
        <p style={{ fontSize: "13px", color: colors.textFaint, marginTop: "12px" }}>
          Last updated {LAST_UPDATED}
        </p>
      </section>

      {/* Full text */}
      <section style={{ maxWidth: "720px", margin: "0 auto", padding: "48px 20px 80px" }}>
        <Section id="pdf-image" title="PDF and image tools">
          <p style={{ marginBottom: "10px" }}>
            Every PDF and image tool (merge, split, compress, rotate, reorder, resize, convert)
            processes your file entirely inside your browser tab, using the pdf-lib and Canvas
            APIs. The file is read into memory, transformed, and handed back to you as a
            download — it is never sent to a WaryTools server or any third party.
          </p>
          <p>
            Closing or refreshing the tab discards everything. We have no record of what you
            processed, because the file never reached us in the first place.
          </p>
        </Section>

        <Section id="calculators" title="Calculators">
          <p>
            Age, percentage, GST, interest, unit conversion, and date-difference calculators run
            entirely client-side too. Whatever you type into them stays in your browser and is
            never transmitted anywhere.
          </p>
        </Section>

        <Section id="url-shortener" title="URL shortener">
          <p style={{ marginBottom: "10px" }}>
            This is the one tool that needs a server, because a short link only works if
            something remembers what it points to. When you shorten a URL, the destination URL,
            the generated short code, and a click count are stored in a Supabase database.
          </p>
          <p style={{ marginBottom: "10px" }}>
            Links you create are also saved to your browser&rsquo;s <code>localStorage</code> so
            they show up in your history if you come back — this is local to your device, not
            an account system, and clearing your browser storage clears it.
          </p>
          <p>
            We do not log who clicked a shortened link, their IP address, or any identifying
            information — only an aggregate click count on the link itself.
          </p>
        </Section>

        <Section id="error-tracking" title="Error tracking">
          <p>
            WaryTools uses Sentry to catch and report unexpected errors (e.g. a tool crashing
            partway through). When an error occurs, technical details — the error message, stack
            trace, and the page you were on — are sent to Sentry so it can be fixed. This is not
            used for tracking behavior or building a profile of you.
          </p>
        </Section>

        <Section id="analytics" title="Analytics (Google Analytics)">
          <p style={{ marginBottom: "10px" }}>
            WaryTools uses Google Analytics to understand how the site is used — which tools get
            visited, roughly where visitors are located (country/city level, derived from IP, not
            the IP itself), what device and browser they&rsquo;re using, and how they got here
            (search, direct link, referral). This runs by placing a cookie in your browser and
            sending that usage data to Google.
          </p>
          <p style={{ marginBottom: "10px" }}>
            We use this in aggregate, not to build a profile of any one visitor: it tells us
            which tools are worth improving, not who you are. Google may combine this data
            according to its own privacy policy, available at{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: colors.primary, textDecoration: "underline" }}
            >
              policies.google.com/privacy
            </a>
            .
          </p>
          <p>
            Your file contents, calculator inputs, and the URLs you shorten are never sent to
            Google Analytics — it only ever sees which page you&rsquo;re on, not what you do
            inside a tool.
          </p>
        </Section>

        <Section id="advertising" title="Advertising (Google AdSense)">
          <p style={{ marginBottom: "10px" }}>
            WaryTools shows ads served by Google AdSense to keep every tool free with no paywall
            or account requirement. AdSense sets its own cookies and may use device identifiers
            to select and measure ads, including ads personalized to your interests based on your
            browsing across sites that also use Google&rsquo;s advertising services.
          </p>
          <p style={{ marginBottom: "10px" }}>
            We don&rsquo;t control what AdSense collects beyond enabling it on our pages, and we
            never hand AdSense anything from inside a tool — no file, no calculator input, no
            shortened URL. Google&rsquo;s own policies govern how ad data is collected, used, and
            retained; see{" "}
            <a
              href="https://policies.google.com/technologies/ads"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: colors.primary, textDecoration: "underline" }}
            >
              How Google uses advertising cookies
            </a>
            .
          </p>
          <p>
            You can opt out of personalized advertising from Google at{" "}
            <a
              href="https://adssettings.google.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: colors.primary, textDecoration: "underline" }}
            >
              Google Ads Settings
            </a>
            , and the industry-wide{" "}
            <a
              href="https://optout.aboutads.info"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: colors.primary, textDecoration: "underline" }}
            >
              aboutads.info
            </a>{" "}
            opt-out covers other participating ad networks.
          </p>
        </Section>

        <Section id="cookies-choices" title="Cookies and your choices">
          <p style={{ marginBottom: "10px" }}>
            Analytics and advertising on WaryTools rely on cookies to function. You can block or
            delete cookies in your browser settings at any time — WaryTools&rsquo; tools
            themselves don&rsquo;t require cookies to work, since all processing happens locally,
            so blocking them won&rsquo;t break a PDF, image, or calculator tool. It may reduce ad
            relevance and stop analytics from counting your visit.
          </p>
          <p>
            Browser-level controls (tracking protection, &ldquo;Do Not Track&rdquo;, private
            browsing) and extensions that block third-party scripts will also reduce or eliminate
            what Analytics and AdSense can see.
          </p>
        </Section>

        <Section id="security" title="Security">
          <p style={{ marginBottom: "10px" }}>
            Every page on WaryTools is served over HTTPS with HSTS enforced, so your connection to
            the site is always encrypted and browsers are instructed to never fall back to plain
            HTTP. On top of that, we run a strict Content Security Policy and other security
            headers (frame-blocking, MIME-sniffing protection, strict referrer rules) designed to
            limit what a compromised or malicious script could do on the page.
          </p>
          <p style={{ marginBottom: "10px" }}>
            Because PDF, image, and calculator processing happens entirely on your device, the
            biggest category of risk in an online tool — your files sitting on someone else&rsquo;s
            server — doesn&rsquo;t apply here. There is no upload endpoint for those tools to
            secure, no file storage to breach, because the file never leaves your browser.
          </p>
          <p>
            The one piece of real backend state, the URL shortener&rsquo;s database, is
            access-controlled so it only accepts the exact, narrow operations the tool needs
            (creating a link, reading a redirect, incrementing a click count) — nothing broader.
            No system is unbreakable, and if we ever learn of a security issue that affects your
            data, we&rsquo;ll disclose it here.
          </p>
        </Section>

        <Section id="retention" title="Data retention">
          <p>
            Shortened URLs and their click counts are kept indefinitely so links keep working;
            there&rsquo;s currently no self-serve way to delete one. Analytics and advertising
            data is retained by Google under its own retention policies, not ours. Files, images,
            and calculator inputs are never stored in the first place, so there is nothing to
            retain or delete.
          </p>
        </Section>

        <Section id="changes" title="Changes to this policy">
          <p>
            If what WaryTools stores or how it processes data changes meaningfully, this page
            will be updated and the date at the top will reflect that.
          </p>
        </Section>
      </section>
    </div>
  );
}
