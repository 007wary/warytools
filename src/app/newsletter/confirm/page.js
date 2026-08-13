import { createClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { TokenError, TokenPurpose, verifyToken } from "@/lib/newsletterToken";
import NewsletterResult from "../NewsletterResult";

// The landing page for the confirmation link in the double opt-in email.
//
// A server component that does the work during the render, rather than a
// client page that fetches: the visitor arrives from a mail client, and a page
// that flashes a spinner before confirming is a page that appears broken on a
// slow connection. There is nothing interactive here once it resolves.
//
// noindex, and excluded from the sitemap in sitemapRoutes.js. Without both, the
// crawlable artefact of this feature is a page reading "this link is invalid",
// indexed as a wary.tools search result.
export const metadata = {
  title: "Confirm your subscription",
  robots: { index: false, follow: false },
};

// Never prerendered or cached: the answer depends entirely on a token in the
// query string, and a cached "confirmed" page served to the next visitor would
// be both wrong and confusing.
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

// Copy per failure mode. An expired link and a forged one need different
// responses from the visitor — one should subscribe again, the other has
// nothing to fix — and a single "invalid link" message leaves the first person
// stuck with no idea that retrying would work.
const FAILURE_COPY = {
  [TokenError.EXPIRED]: {
    title: "That link has expired",
    body: "Confirmation links are good for three days. Subscribe again and we'll send you a fresh one.",
    action: { href: "/blog", label: "Back to the blog" },
  },
  default: {
    title: "That link doesn't look right",
    body: "It may have been copied incompletely, or truncated by your email client. Try clicking it again from the original email, or subscribe once more.",
    action: { href: "/blog", label: "Back to the blog" },
  },
};

export default async function ConfirmPage({ searchParams }) {
  // A promise in Next 15+, so it must be awaited before use.
  const params = await searchParams;
  const token = typeof params?.token === "string" ? params.token : null;

  const verified = verifyToken(token, TokenPurpose.CONFIRM);

  if (!verified.ok) {
    const copy = FAILURE_COPY[verified.reason] || FAILURE_COPY.default;
    return <NewsletterResult ok={false} {...copy} />;
  }

  try {
    const { error } = await supabase.rpc("confirm_newsletter_subscription", {
      p_email: verified.email,
    });

    if (error) throw error;
  } catch (error) {
    Sentry.captureException(error);

    return (
      <NewsletterResult
        ok={false}
        title="Something went wrong"
        // The link is still good — the token has three days and this failure
        // is ours, not theirs — so the instruction is to retry rather than to
        // start over.
        body="We couldn't confirm your subscription just now. Please try that link again in a few minutes."
        action={{ href: "/blog", label: "Back to the blog" }}
      />
    );
  }

  // Deliberately the same page whether the RPC changed a row or not. A token
  // for an address with no row is a link from a subscription that was since
  // removed; saying "you were never subscribed" would confirm to whoever holds
  // the link that the address is absent from the list.
  return (
    <NewsletterResult
      ok
      title="You're subscribed"
      body="Thanks — we'll email you whenever a new guide or tool goes live. Usually once or twice a month, and every email has a one-click unsubscribe."
      action={{ href: "/blog", label: "Read the blog" }}
    />
  );
}
