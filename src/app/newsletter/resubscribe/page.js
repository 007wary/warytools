import * as Sentry from "@sentry/nextjs";
import { isNewsletterDbConfigured, newsletterDb } from "@/lib/newsletterDb";
import { TokenError, TokenPurpose, verifyToken } from "@/lib/newsletterToken";
import NewsletterResult from "../NewsletterResult";

// The landing page for the "yes, resubscribe me" link.
//
// This is the only confirmation step left on the site, and it exists for one
// narrow reason: an unsubscribe is a deliberate decision by the address owner,
// so a form submission by anyone else must not reverse it. Clicking this link
// is the proof that the person acting controls the inbox.
//
// Unlike the unsubscribe page, acting on GET here is a real (if small) risk —
// a link-scanning mail client could resubscribe someone who never clicked. It
// is accepted for the same reason the unsubscribe page accepts the mirror
// risk, but the balance is different and worth stating: the token expires in
// three days, it only ever returns someone to a list they were previously on,
// and every email they would then receive carries a one-click unsubscribe. A
// confirmation button here would also break for the many clients that render
// a plain link better than a form.
export const metadata = {
  title: "Resubscribe",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const FAILURE_COPY = {
  [TokenError.EXPIRED]: {
    title: "That link has expired",
    body: "Resubscribe links are good for three days. Enter your address on the blog again and we'll send a fresh one.",
    action: { href: "/blog", label: "Back to the blog" },
  },
  default: {
    title: "That link doesn't look right",
    body: "It may have been copied incompletely, or truncated by your email client. Try clicking it again from the original email, or enter your address on the blog.",
    action: { href: "/blog", label: "Back to the blog" },
  },
};

export default async function ResubscribePage({ searchParams }) {
  const params = await searchParams;
  const token = typeof params?.token === "string" ? params.token : null;

  // The purpose is checked here, so an unsubscribe token already sitting in
  // someone's inbox cannot be replayed against this route to put them back on
  // the list.
  const verified = verifyToken(token, TokenPurpose.RESUBSCRIBE);

  if (!verified.ok) {
    const copy = FAILURE_COPY[verified.reason] || FAILURE_COPY.default;
    return <NewsletterResult ok={false} {...copy} />;
  }

  try {
    if (!isNewsletterDbConfigured()) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    }

    const { error } = await newsletterDb().rpc("resubscribe_newsletter", {
      p_email: verified.email,
    });

    if (error) throw error;
  } catch (error) {
    Sentry.captureException(error);

    return (
      <NewsletterResult
        ok={false}
        title="Something went wrong"
        body="We couldn't resubscribe you just now. Please try that link again in a few minutes."
        action={{ href: "/blog", label: "Back to the blog" }}
      />
    );
  }

  // Same page whether a row changed or not, for the same reason as the other
  // landing pages: distinguishing them would disclose whether the address is
  // known to us.
  return (
    <NewsletterResult
      ok
      title="You're subscribed again"
      body="Welcome back — we'll email you whenever a new guide or tool goes live. Every email has a one-click unsubscribe if you change your mind."
      action={{ href: "/blog", label: "Read the blog" }}
    />
  );
}
