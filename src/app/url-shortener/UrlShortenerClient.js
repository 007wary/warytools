"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { colors } from "@/lib/theme";

const STORAGE_KEY = "warytools_short_links";
const MAX_URL_LENGTH = 2048;

function isValidUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) {
    return false;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  // Block shortening our own /s/ links — prevents redirect chains/loops
  // and stops the shortener being used to obscure other short links.
  if (url.origin === window.location.origin && url.pathname.startsWith("/s/")) {
    return false;
  }

  return true;
}

export default function UrlShortenerClient() {
  const [longUrl, setLongUrl] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  // Links created in this session, persisted to localStorage so a refresh
  // doesn't lose them (but this is still just local session history, not
  // a synced account — see the note in page.js). Read once via the lazy
  // initializer rather than in an effect, avoiding an extra render.
  const [links, setLinks] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [copiedCode, setCopiedCode] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  }, [links]);

  async function handleShorten() {
    setError("");

    if (!isValidUrl(longUrl)) {
      setError("Please enter a valid URL, including http:// or https://.");
      return;
    }

    setIsWorking(true);

    try {
      const res = await fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: longUrl }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Could not shorten this URL. Please try again.");
        return;
      }

      setLinks((prev) => [
        { shortCode: body.shortCode, longUrl: body.longUrl, clicks: 0, createdAt: new Date().toISOString() },
        ...prev,
      ]);
      setLongUrl("");
    } catch (err) {
      console.error(err);
      setError("Could not shorten this URL. Please try again.");
    } finally {
      setIsWorking(false);
    }
  }

  async function refreshClickCounts() {
    if (links.length === 0) return;

    const codes = links.map((l) => l.shortCode);
    const { data, error: fetchError } = await supabase
      .from("short_urls")
      .select("short_code, clicks")
      .in("short_code", codes);

    if (fetchError) {
      console.error(fetchError);
      return;
    }

    const clicksByCode = Object.fromEntries(data.map((row) => [row.short_code, row.clicks]));
    setLinks((prev) => prev.map((l) => ({ ...l, clicks: clicksByCode[l.shortCode] ?? l.clicks })));
  }

  function handleCopy(shortCode) {
    const shortUrl = `${window.location.origin}/s/${shortCode}`;
    navigator.clipboard.writeText(shortUrl);
    setCopiedCode(shortCode);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
        <input
          type="url"
          value={longUrl}
          onChange={(e) => setLongUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleShorten()}
          placeholder="https://example.com/a-very-long-url"
          style={inputStyle}
        />
        <button
          onClick={handleShorten}
          disabled={isWorking}
          style={{
            backgroundColor: isWorking ? colors.primaryDisabled : colors.primary,
            color: colors.primaryContrast,
            border: "none",
            borderRadius: "8px",
            padding: "10px 20px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: isWorking ? "not-allowed" : "pointer",
          }}
        >
          {isWorking ? "Shortening…" : "Shorten"}
        </button>
      </div>

      {error && <p style={{ color: colors.danger, fontSize: "14px", marginBottom: "16px" }}>{error}</p>}

      {links.length > 0 && (
        <div style={{ marginTop: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, color: colors.text }}>
              Links from this session
            </h2>
            <button onClick={refreshClickCounts} style={smallButtonStyle}>
              Refresh click counts
            </button>
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {links.map((link) => (
              <li
                key={link.shortCode}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: colors.primary }}>
                      /s/{link.shortCode}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: colors.textMuted,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}
                    >
                      {link.longUrl}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "13px", color: colors.textFaint }}>
                      {link.clicks} click{link.clicks === 1 ? "" : "s"}
                    </span>
                    <button onClick={() => handleCopy(link.shortCode)} style={smallButtonStyle}>
                      {copiedCode === link.shortCode ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  flex: 1,
  minWidth: "260px",
  padding: "10px 14px",
  fontSize: "14px",
  border: `1px solid ${colors.borderInput}`,
  borderRadius: "8px",
  color: colors.textSecondary,
};

const smallButtonStyle = {
  background: "none",
  border: `1px solid ${colors.border}`,
  borderRadius: "6px",
  padding: "5px 12px",
  fontSize: "13px",
  color: colors.textSecondary,
  cursor: "pointer",
};
