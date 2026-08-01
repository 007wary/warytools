import Link from "next/link";

export default function NotFound() {
  return (
    <section style={{ maxWidth: "600px", margin: "0 auto", padding: "80px 20px 100px", textAlign: "center" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#111827", marginBottom: "12px" }}>
        Page not found
      </h1>
      <p style={{ fontSize: "15px", color: "#6b7280", marginBottom: "24px" }}>
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <Link href="/" style={{ fontSize: "15px", color: "#2563eb", textDecoration: "none" }}>
        Back to home
      </Link>
    </section>
  );
}
