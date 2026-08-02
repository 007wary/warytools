import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#111827",
          backgroundImage:
            "radial-gradient(circle at 15% 10%, rgba(37,99,235,0.35) 0%, transparent 45%), radial-gradient(circle at 85% 0%, rgba(124,58,237,0.3) 0%, transparent 45%)",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 108,
            height: 108,
            borderRadius: 28,
            background: "linear-gradient(135deg, #2563eb, #7c3aed)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 36,
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#ffffff",
              fontSize: 46,
              fontWeight: 700,
              letterSpacing: -1,
            }}
          >
            WT
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            color: "#ffffff",
          }}
        >
          Wary
          <span style={{ color: "#93c5fd" }}>Tools</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "#9ca3af",
            marginTop: 20,
          }}
        >
          Free PDF, image & calculator tools — right in your browser
        </div>
      </div>
    ),
    { ...size }
  );
}
