import Link from "next/link";
import { colors } from "@/lib/theme";

// Without this the 404 inherits the root layout's title, description, and
// `canonical: "/"` — so a missing page renders as "WaryTools — Free Online
// PDF, Image & Calculator Tools", marked index,follow, claiming to be the
// homepage. That is the textbook soft-404 that gets error pages indexed.
// Next still sends a real 404 status; this just stops the metadata lying.
export const metadata = {
  title: "Page Not Found",
  description: "The page you're looking for doesn't exist or may have been moved.",
  robots: { index: false, follow: true },
  alternates: { canonical: null },
};

export default function NotFound() {
  return (
    <section style={{ maxWidth: "600px", margin: "0 auto", padding: "80px 20px 100px", textAlign: "center" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Page not found
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "24px" }}>
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <Link href="/" style={{ fontSize: "15px", color: colors.primary, textDecoration: "none" }}>
        Back to home
      </Link>
    </section>
  );
}
