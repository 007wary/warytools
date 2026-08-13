import { createClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { TokenPurpose, verifyToken } from "@/lib/newsletterToken";
import NewsletterResult from "../NewsletterResult";

// The landing page for the unsubscribe link in every announcement.
//
// It unsubscribes on load. No confirmation step, no "are you sure?", no
// "tell us why" survey — the link says one click and it means it. A
// confirmation button here would also break under mail clients and security
// scanners that pre-fetch links, where the GET fires without a person behind
// it; making the GET itself the action is the honest reading of what the
// subscriber asked for, and the RPC is idempotent so a pre-fetch followed by a
// real click is harmless.
//
// The counterargument — that a scanner pre-fetch could unsubscribe someone who
// never clicked — is real but strictly better than the alternative. A wrongly
// unsubscribed reader can resubscribe in two clicks; a reader who cannot
// unsubscribe reports us as spam, and enough of those take the sending domain
// down with them, contact form included.
export const metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

export default async function UnsubscribePage({ searchParams }) {
  const params = await searchParams;
  const token = typeof params?.token === "string" ? params.token : null;

  const verified = verifyToken(token, TokenPurpose.UNSUBSCRIBE);

  if (!verified.ok) {
    return (
      <NewsletterResult
        ok={false}
        title="That link doesn't look right"
        // No expiry case here: unsubscribe tokens never expire, deliberately,
        // so the only ways to reach this are truncation or tampering.
        body="It may have been copied incompletely, or truncated by your email client. Try clicking it again from the original email — or reply to any of our emails and we'll remove you by hand."
        action={{ href: "/contact", label: "Contact us" }}
      />
    );
  }

  try {
    const { error } = await supabase.rpc("unsubscribe_newsletter", {
      p_email: verified.email,
    });

    if (error) throw error;
  } catch (error) {
    Sentry.captureException(error);

    return (
      <NewsletterResult
        ok={false}
        title="Something went wrong"
        // The offer of a manual removal is not filler. A failing unsubscribe
        // with no alternative is exactly when a person reaches for the spam
        // button instead.
        body="We couldn't process that just now. Please try the link again in a few minutes, or contact us and we'll remove you by hand."
        action={{ href: "/contact", label: "Contact us" }}
      />
    );
  }

  // Same page whether a row changed or not: unsubscribing twice, or with a
  // token for an address already removed, is a success from the reader's point
  // of view — they wanted to not receive email, and they will not.
  return (
    <NewsletterResult
      ok
      title="You've been unsubscribed"
      body="You won't get any more newsletter emails from us. The tools stay free and open — no account needed, nothing to cancel."
      action={{ href: "/", label: "Back to WaryTools" }}
    />
  );
}
