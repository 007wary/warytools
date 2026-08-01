"use client";

import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import ToolCard from "@/components/ToolCard";
import { categories, allTools } from "@/lib/tools";
import { colors, categoryColors } from "@/lib/theme";

export default function HomePage() {
  const [query, setQuery] = useState("");

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;

    return categories
      .map((category) => ({
        ...category,
        tools: category.tools.filter(
          (tool) =>
            tool.title.toLowerCase().includes(q) ||
            tool.description.toLowerCase().includes(q)
        ),
      }))
      .filter((category) => category.tools.length > 0);
  }, [query]);

  return (
    <div>
      {/* Hero */}
      <section
        style={{
          textAlign: "center",
          padding: "72px 20px 48px",
          background:
            `radial-gradient(circle at 20% 0%, ${colors.primarySoft} 0%, transparent 55%), radial-gradient(circle at 80% 10%, ${categoryColors.image.bg} 0%, transparent 55%), ${colors.surface}`,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            fontWeight: 600,
            color: colors.primary,
            backgroundColor: colors.primarySoft,
            border: `1px solid ${colors.primarySoftBorder}`,
            borderRadius: "999px",
            padding: "6px 14px",
            marginBottom: "20px",
          }}
        >
          <Sparkles size={14} />
          100% free · Runs entirely in your browser
        </div>

        <h1
          style={{
            fontSize: "clamp(28px, 5vw, 44px)",
            fontWeight: 700,
            color: colors.text,
            marginBottom: "16px",
            lineHeight: 1.15,
          }}
        >
          Free Online Tools,
          <br />
          <span
            style={{
              background: `linear-gradient(135deg, ${colors.primary}, ${categoryColors.image.text})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            All in One Place
          </span>
        </h1>

        <p
          style={{
            fontSize: "16px",
            color: colors.textMuted,
            maxWidth: "560px",
            margin: "0 auto 32px",
            lineHeight: 1.6,
          }}
        >
          PDF, image, and calculator tools that run entirely in your browser. No uploads, no
          sign-up, no waiting. {allTools.length} tools and counting.
        </p>

        <div style={{ maxWidth: "480px", margin: "0 auto", position: "relative" }}>
          <Search
            size={18}
            style={{
              position: "absolute",
              left: "16px",
              top: "50%",
              transform: "translateY(-50%)",
              color: colors.textFaint,
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools… e.g. merge, resize, GST"
            style={{
              width: "100%",
              padding: "13px 16px 13px 46px",
              fontSize: "15px",
              borderRadius: "12px",
              border: `1px solid ${colors.borderInput}`,
              outline: "none",
              boxShadow: "var(--shadow-subtle)",
            }}
          />
        </div>
      </section>

      {/* Tool grid grouped by category */}
      <section
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "20px 20px 80px",
        }}
      >
        {filteredCategories.length === 0 && (
          <p style={{ textAlign: "center", color: colors.textMuted, padding: "40px 0" }}>
            No tools match &ldquo;{query}&rdquo;.
          </p>
        )}

        {filteredCategories.map((category) => (
          <div key={category.slug} style={{ marginBottom: "48px" }}>
            <h2
              style={{
                fontSize: "19px",
                fontWeight: 600,
                color: colors.text,
                marginBottom: "16px",
              }}
            >
              {category.label}
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "16px",
              }}
            >
              {category.tools.map((tool) => (
                <ToolCard
                  key={tool.slug}
                  title={tool.title}
                  description={tool.description}
                  href={tool.href}
                  icon={tool.icon}
                  category={category.slug}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
