import { EyeOff, Database, Bug, Cookie } from "lucide-react";
import { colors, categoryColors } from "@/lib/theme";

export const metadata = {
  title: "Privacy Policy — WaryTools",
  description:
    "How WaryTools handles your data: PDF and image files are processed entirely in your browser and never uploaded. Learn what the URL shortener and error tracking store.",
};

const LAST_UPDATED = "August 2, 2026";

const highlights = [
  {
    icon: EyeOff,
    title: "Your files never leave your device",
    body: "PDF and image tools run entirely in your browser tab using pdf-lib and canvas.",
    accent: categoryColors.pdf,
  },
  {
    icon: Database,
    title: "One exception: the URL shortener",
    body: "Shortening a link stores that URL in a database so the short link can redirect.",
    accent: categoryColors["url-shortener"],
  },
  {
    icon: Bug,
    title: "Crash reports, not you",
    body: "Sentry captures error details when something breaks, to help fix it faster.",
    accent: categoryColors.calculators,
  },
  {
    icon: Cookie,
    title: "No ad trackers",
    body: "No advertising cookies, no third-party trackers, no behavioral profiling.",
    accent: categoryColors.image,
  },
];

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
        <p style={{ fontSize: "15px", color: colors.textMuted, maxWidth: "540px", margin: "0 auto" }}>
          Short version: your files stay on your device. Here&rsquo;s the full picture.
        </p>
        <p style={{ fontSize: "13px", color: colors.textFaint, marginTop: "12px" }}>
          Last updated {LAST_UPDATED}
        </p>
      </section>

      {/* Highlight cards */}
      <section style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 20px 56px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
          }}
        >
          {highlights.map(({ icon: Icon, title, body, accent }) => (
            <div
              key={title}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: "14px",
                padding: "20px",
                backgroundColor: colors.surface,
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "10px",
                  backgroundColor: accent.bg,
                  color: accent.text,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "14px",
                }}
              >
                <Icon size={19} />
              </div>
              <div style={{ fontWeight: 600, fontSize: "14.5px", color: colors.text, marginBottom: "6px" }}>
                {title}
              </div>
              <div style={{ fontSize: "13px", color: colors.textMuted, lineHeight: 1.55 }}>{body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Full text */}
      <section style={{ maxWidth: "720px", margin: "0 auto", padding: "0 20px 80px" }}>
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

        <Section id="no-accounts" title="No accounts, no ad tracking">
          <p>
            WaryTools has no user accounts, no login, and no advertising or analytics trackers.
            We don&rsquo;t sell data, because we don&rsquo;t collect the kind of data that would
            be worth selling.
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
