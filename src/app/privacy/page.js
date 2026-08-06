import { colors } from "@/lib/theme";
import JsonLd from "@/components/JsonLd";
import { jsonLdGraph, breadcrumbJsonLd, webPageJsonLd } from "@/lib/jsonLd";
import { pageMetadata } from "@/lib/pageMetadata";

const privacyTitle = "Privacy Policy";
// Trimmed to ~155 chars: the previous 220-char version was cut off mid-clause
// in search results, hiding the part that actually matters to readers.
const privacyDescription =
  "How WaryTools handles your data: nearly all files are processed in your browser and never uploaded. What we do and don't store, and the one tool that converts on a server.";

export const metadata = pageMetadata({
  title: privacyTitle,
  description: privacyDescription,
  path: "/privacy",
});

const LAST_UPDATED = "August 6, 2026";

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
      <JsonLd
        data={jsonLdGraph(
          // Plain WebPage: schema.org has no policy-document subtype, and
          // AboutPage/ContactPage would both misdescribe this.
          webPageJsonLd({
            name: `${privacyTitle} — WaryTools`,
            description: privacyDescription,
            href: "/privacy",
          }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "Privacy Policy", href: "/privacy" },
          ])
        )}
      />
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
          <p style={{ marginBottom: "10px" }}>
            Closing or refreshing the tab discards everything. We have no record of what you
            processed, because the file never reached us in the first place.
          </p>
          <p>
            <strong>One tool is an exception: PDF to Word.</strong> It is covered separately
            below.
          </p>
        </Section>

        <Section id="pdf-to-word" title="PDF to Word (the one tool that uploads)">
          <p style={{ marginBottom: "10px" }}>
            Converting a PDF into an editable Word document means rebuilding paragraphs,
            headings, and tables from text that a PDF stores only as characters placed at
            coordinates. That analysis is not something a browser can do, so this tool — and no
            other tool on the site — sends your file to a server we operate.
          </p>
          <p style={{ marginBottom: "10px" }}>
            What happens: your PDF is sent over an encrypted connection to our converter, which
            runs pdf2docx to produce the .docx, returns it to you, and deletes the file. The
            file is written to a temporary directory that is removed as soon as the conversion
            finishes, including when it fails. Nothing is kept after your download, and no copy
            is made anywhere else.
          </p>
          <p style={{ marginBottom: "10px" }}>
            What we do not do: we do not store your document, read it, index it, log its
            contents, log its filename, or pass it to any third party. Our converter logs record
            only whether a conversion succeeded or failed. To limit abuse of a shared server we
            keep a count of recent conversions against a one-way hash of your IP address — the
            hash cannot be reversed to an IP, and it is discarded after a day.
          </p>
          <p>
            The tool states all of this on the page before you choose a file. If a document is
            confidential enough that sending it to any server is unacceptable, use desktop
            software such as Word or LibreOffice, which convert locally.
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

        <Section id="contact-form" title="Contact form">
          <p style={{ marginBottom: "10px" }}>
            If you send us a message through the{" "}
            <a href="/contact" style={{ color: colors.primary, textDecoration: "underline" }}>
              contact form
            </a>
            , the name, email address, and message you type are sent to our server and delivered
            to our inbox by email through Resend, our email provider. Your email address is used
            only to reply to you.
          </p>
          <p>
            We do not store contact messages in a database, add you to a mailing list, or share
            what you send with anyone. To limit abuse we keep a count of recent submissions
            against a one-way hash of your IP address — the same method the other server-backed
            tools use, and the hash cannot be reversed to an IP.
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
            Because almost all PDF, image, and calculator processing happens entirely on your
            device, the biggest category of risk in an online tool — your files sitting on
            someone else&rsquo;s server — mostly doesn&rsquo;t apply here. For those tools there
            is no upload endpoint to secure and no file storage to breach, because the file
            never leaves your browser. The PDF to Word converter is the exception: it receives
            files, so it holds each one only for the length of the conversion, deletes it
            immediately afterwards, accepts requests only from this site, and stores nothing.
          </p>
          <p>
            The one piece of persistent backend state, the URL shortener&rsquo;s database, is
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
            data is retained by Google under its own retention policies, not ours. Messages sent
            through the contact form aren&rsquo;t stored in a database, but they do stay in our
            email inbox the way any email does — ask and we&rsquo;ll delete yours. Files, images,
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
