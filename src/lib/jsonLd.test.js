import { describe, expect, it } from "vitest";
import {
  blogJsonLd,
  blogPostingJsonLd,
  breadcrumbJsonLd,
  collectionPageJsonLd,
  faqJsonLd,
  howToJsonLd,
  jsonLdGraph,
  organizationJsonLd,
  toolSoftwareAppJsonLd,
  webPageJsonLd,
  websiteJsonLd,
} from "./jsonLd";
import { SITE_URL } from "./siteUrl";

// This module is read by Google and by nothing else, which is precisely why it
// needs tests: every failure mode is invisible on the site. A broken @id
// reference, a relative URL where an absolute one is required, or a node that
// quietly stops being emitted all render exactly the same page.
//
// The property worth protecting above all is GRAPH CONNECTIVITY. Nodes refer
// to each other by @id (`publisher`, `isPartOf`, `about`, `author`), and a
// reference to an @id that no node in the graph defines is an orphan: still
// valid JSON-LD, still passes a syntax check, and tells a crawler nothing
// about the relationship it was written to express.

/** Collects every `@id` a node defines, and every `@id` it references. */
function collectIds(value, defined = new Set(), referenced = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectIds(entry, defined, referenced);
    return { defined, referenced };
  }
  if (!value || typeof value !== "object") return { defined, referenced };

  const keys = Object.keys(value);
  // A node that carries an @id alongside other content DEFINES it; an object
  // whose only key is @id is a pure reference to something defined elsewhere.
  if (value["@id"]) {
    if (keys.length === 1) referenced.add(value["@id"]);
    else defined.add(value["@id"]);
  }

  for (const key of keys) {
    if (key === "@id") continue;
    collectIds(value[key], defined, referenced);
  }
  return { defined, referenced };
}

/** Every string value anywhere in the node, for absolute-URL checks. */
function allStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => allStrings(v, out));
  }
  return out;
}

describe("organizationJsonLd", () => {
  it("declares a stable @id other nodes can point at", () => {
    expect(organizationJsonLd()["@id"]).toBe(`${SITE_URL}/#organization`);
  });

  it("uses a raster logo, because Google ignores SVG in the logo field", () => {
    const logo = organizationJsonLd().logo;
    expect(logo).toMatch(/\.(png|jpg|gif)$/);
    expect(logo).toBe(`${SITE_URL}/icon-512.png`);
  });
});

describe("websiteJsonLd", () => {
  it("points its publisher at the Organization node", () => {
    expect(websiteJsonLd().publisher).toEqual({ "@id": `${SITE_URL}/#organization` });
  });

  it("declares a SearchAction whose query-input names the target's placeholder", () => {
    const action = websiteJsonLd().potentialAction;
    // The placeholder in `target` and the name in `query-input` must be the
    // same token, or the sitelinks searchbox silently never appears.
    const placeholder = action.target.match(/\{(\w+)\}/)[1];
    expect(action["query-input"]).toBe(`required name=${placeholder}`);
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers positions from 1 and makes every item absolute", () => {
    const crumbs = breadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "PDF", href: "/pdf" },
      { name: "Merge", href: "/pdf/merge" },
    ]);

    expect(crumbs.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    // Position 0 is invalid in a BreadcrumbList and Google drops the whole
    // breadcrumb rather than reporting it.
    expect(crumbs.itemListElement[0].item).toBe(SITE_URL);
    expect(crumbs.itemListElement[2].item).toBe(`${SITE_URL}/pdf/merge`);
  });

  it("handles an empty trail without producing a malformed list", () => {
    expect(breadcrumbJsonLd([]).itemListElement).toEqual([]);
  });
});

describe("toolSoftwareAppJsonLd", () => {
  const base = {
    name: "Merge PDF",
    description: "Combine PDFs in your browser.",
    href: "/pdf/merge",
    categorySlug: "pdf",
  };

  it("ties the tool back to both the Organization and the WebSite", () => {
    const node = toolSoftwareAppJsonLd(base);
    // Without these the SoftwareApplication is an orphan in the graph: valid,
    // but nothing tells a crawler the tool and the publisher are one entity.
    expect(node.publisher).toEqual({ "@id": `${SITE_URL}/#organization` });
    expect(node.isPartOf).toEqual({ "@id": `${SITE_URL}/#website` });
  });

  it("maps each category slug to a schema.org applicationCategory", () => {
    const categoryFor = (slug) =>
      toolSoftwareAppJsonLd({ ...base, categorySlug: slug }).applicationCategory;

    expect(categoryFor("pdf")).toBe("Productivity");
    expect(categoryFor("image")).toBe("MultimediaApplication");
    expect(categoryFor("calculators")).toBe("UtilitiesApplication");
    expect(categoryFor("url-shortener")).toBe("UtilitiesApplication");
  });

  it("falls back to a valid category for an unknown slug", () => {
    // A new category added to tools.js must not emit an undefined category,
    // which would invalidate the node rather than degrade it.
    expect(toolSoftwareAppJsonLd({ ...base, categorySlug: "quantum" }).applicationCategory).toBe(
      "UtilitiesApplication"
    );
  });

  it("declares the tool as free", () => {
    expect(toolSoftwareAppJsonLd(base).offers).toEqual({
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    });
  });

  it("scopes its @id to the tool's own URL", () => {
    // Two tools sharing an @id would collapse into one node in the graph.
    const merge = toolSoftwareAppJsonLd(base)["@id"];
    const split = toolSoftwareAppJsonLd({ ...base, href: "/pdf/split" })["@id"];
    expect(merge).not.toBe(split);
    expect(merge).toBe(`${SITE_URL}/pdf/merge#software`);
  });
});

describe("collectionPageJsonLd", () => {
  const tools = [
    { title: "Merge PDF", href: "/pdf/merge" },
    { title: "Split PDF", href: "/pdf/split" },
  ];

  it("reports numberOfItems matching the list it emits", () => {
    const node = collectionPageJsonLd({
      name: "PDF tools",
      description: "All PDF tools.",
      href: "/pdf",
      tools,
    });

    // A count that disagrees with the list is the kind of inconsistency that
    // gets structured data ignored wholesale.
    expect(node.mainEntity.numberOfItems).toBe(2);
    expect(node.mainEntity.itemListElement).toHaveLength(2);
    expect(node.mainEntity.itemListElement.map((i) => i.position)).toEqual([1, 2]);
  });

  it("makes every listed tool URL absolute", () => {
    const node = collectionPageJsonLd({ name: "PDF", description: "d", href: "/pdf", tools });
    expect(node.mainEntity.itemListElement[1].url).toBe(`${SITE_URL}/pdf/split`);
  });

  it("stays consistent for an empty hub", () => {
    const node = collectionPageJsonLd({ name: "PDF", description: "d", href: "/pdf", tools: [] });
    expect(node.mainEntity.numberOfItems).toBe(0);
    expect(node.mainEntity.itemListElement).toEqual([]);
  });
});

describe("webPageJsonLd", () => {
  it("defaults to WebPage and takes a specific subtype when given one", () => {
    const args = { name: "About", description: "d", href: "/about" };
    expect(webPageJsonLd(args)["@type"]).toBe("WebPage");
    expect(webPageJsonLd({ ...args, type: "AboutPage" })["@type"]).toBe("AboutPage");
  });

  it("links back to the website and the organization", () => {
    const node = webPageJsonLd({ name: "About", description: "d", href: "/about" });
    expect(node.isPartOf).toEqual({ "@id": `${SITE_URL}/#website` });
    expect(node.about).toEqual({ "@id": `${SITE_URL}/#organization` });
  });
});

describe("howToJsonLd", () => {
  const steps = [
    { name: "Upload", text: "Choose your PDFs." },
    { name: "Order", text: "Drag them into order." },
    { name: "Merge", text: "Download the result." },
  ];

  it("numbers steps from 1 in the order given", () => {
    const node = howToJsonLd({ name: "How to merge PDFs", steps, href: "/pdf/merge" });
    expect(node.step.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(node.step.map((s) => s.name)).toEqual(["Upload", "Order", "Merge"]);
  });

  it("anchors every step at the on-page section", () => {
    // Google requires HowTo content to be visible to the user, not markup-only.
    // The #how-to anchor is what demonstrates markup and page are the same.
    const node = howToJsonLd({ name: "n", steps, href: "/pdf/merge" });
    for (const step of node.step) {
      expect(step.url).toBe(`${SITE_URL}/pdf/merge#how-to`);
    }
  });

  it("claims no time or cost it cannot substantiate", () => {
    // A fabricated "PT2M" for work bounded by the user's file size and device
    // is the category of thing that earns a manual action, not a rich result.
    const node = howToJsonLd({ name: "n", steps, href: "/pdf/merge" });
    expect(node).not.toHaveProperty("totalTime");
    expect(node).not.toHaveProperty("estimatedCost");
    expect(node).not.toHaveProperty("supply");
  });
});

describe("blogPostingJsonLd", () => {
  const post = {
    title: "How to merge PDFs",
    description: "A guide.",
    href: "/blog/merge-pdfs",
    datePublished: "2026-08-01",
  };

  it("falls back to the published date when a post has never been updated", () => {
    // The tempting default is the build time, which tells Google every post
    // changed on every deploy — the signal that gets dateModified distrusted.
    const node = blogPostingJsonLd(post);
    expect(node.dateModified).toBe("2026-08-01");
  });

  it("uses the declared modified date when there is one", () => {
    const node = blogPostingJsonLd({ ...post, dateModified: "2026-08-10" });
    expect(node.dateModified).toBe("2026-08-10");
  });

  it("omits image entirely when the post has no cover", () => {
    // Pointing every post at the shared OG card would put the same picture on
    // every article, which Google's guidance treats as worse than none.
    expect(blogPostingJsonLd(post)).not.toHaveProperty("image");
  });

  it("emits image when the post declares its own cover", () => {
    const node = blogPostingJsonLd({ ...post, image: `${SITE_URL}/blog/merge.jpg` });
    expect(node.image).toBe(`${SITE_URL}/blog/merge.jpg`);
  });

  it("attributes the post to the Organization, not an invented person", () => {
    expect(blogPostingJsonLd(post).author).toEqual({ "@id": `${SITE_URL}/#organization` });
  });

  it("omits optional fields rather than emitting empty ones", () => {
    // `keywords: ""` and `articleSection: undefined` are both worse than
    // absent — they assert a value the post does not have.
    const node = blogPostingJsonLd({ ...post, keywords: [] });
    expect(node).not.toHaveProperty("keywords");
    expect(node).not.toHaveProperty("articleSection");
  });

  it("joins keywords and carries the section when present", () => {
    const node = blogPostingJsonLd({ ...post, keywords: ["pdf", "merge"], section: "Guides" });
    expect(node.keywords).toBe("pdf, merge");
    expect(node.articleSection).toBe("Guides");
  });

  it("declares mainEntityOfPage so the canonical URL is unambiguous", () => {
    const node = blogPostingJsonLd(post);
    expect(node.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": `${SITE_URL}/blog/merge-pdfs`,
    });
  });

  it("is part of the blog node the index defines", () => {
    expect(blogPostingJsonLd(post).isPartOf).toEqual({ "@id": `${SITE_URL}/#blog` });
  });
});

describe("blogJsonLd", () => {
  it("defines the #blog node that every post's isPartOf points at", () => {
    const node = blogJsonLd({ name: "Blog", description: "d", href: "/blog", posts: [] });

    // This is the connection that keeps posts from being orphaned articles.
    expect(node["@id"]).toBe(`${SITE_URL}/#blog`);
    expect(blogPostingJsonLd({ title: "t", description: "d", href: "/blog/x", datePublished: "2026-01-01" }).isPartOf["@id"]).toBe(node["@id"]);
  });

  it("gives each listed post the same @id its own page emits", () => {
    const posts = [{ title: "A post", href: "/blog/a-post", datePublished: "2026-08-01" }];
    const index = blogJsonLd({ name: "Blog", description: "d", href: "/blog", posts });
    const standalone = blogPostingJsonLd({
      title: "A post",
      description: "d",
      href: "/blog/a-post",
      datePublished: "2026-08-01",
    });

    // Two different @ids for one article would be two nodes describing the
    // same page, which is exactly the duplication the graph exists to avoid.
    expect(index.blogPost[0]["@id"]).toBe(standalone["@id"]);
  });
});

describe("faqJsonLd", () => {
  it("wraps each pair as a Question with an accepted Answer", () => {
    const node = faqJsonLd([{ question: "Is it free?", answer: "Yes." }]);

    expect(node["@type"]).toBe("FAQPage");
    expect(node.mainEntity[0].name).toBe("Is it free?");
    expect(node.mainEntity[0].acceptedAnswer).toEqual({ "@type": "Answer", text: "Yes." });
  });
});

describe("jsonLdGraph", () => {
  it("wraps nodes in a @graph under the schema.org context", () => {
    const graph = jsonLdGraph(organizationJsonLd(), websiteJsonLd());
    expect(graph["@context"]).toBe("https://schema.org");
    expect(graph["@graph"]).toHaveLength(2);
  });

  it("drops falsy nodes so a conditional builder can return null", () => {
    // Pages compose their graph inline, e.g. `post.cover && imageNode()`.
    // A null in the array would be an invalid node rather than an absent one.
    const graph = jsonLdGraph(organizationJsonLd(), null, undefined, false);
    expect(graph["@graph"]).toHaveLength(1);
  });

  it("produces an empty graph rather than throwing when given nothing", () => {
    expect(jsonLdGraph()["@graph"]).toEqual([]);
  });
});

describe("graph integrity", () => {
  // The checks that matter most, run against a graph shaped like the ones the
  // real pages emit.
  const toolGraph = jsonLdGraph(
    organizationJsonLd(),
    websiteJsonLd(),
    toolSoftwareAppJsonLd({
      name: "Merge PDF",
      description: "d",
      href: "/pdf/merge",
      categorySlug: "pdf",
    }),
    breadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Merge", href: "/pdf/merge" },
    ]),
    howToJsonLd({
      name: "How to merge PDFs",
      steps: [{ name: "Upload", text: "Choose files." }],
      href: "/pdf/merge",
    })
  );

  const blogGraph = jsonLdGraph(
    organizationJsonLd(),
    websiteJsonLd(),
    blogJsonLd({
      name: "Blog",
      description: "d",
      href: "/blog",
      posts: [{ title: "A post", href: "/blog/a-post", datePublished: "2026-08-01" }],
    }),
    blogPostingJsonLd({
      title: "A post",
      description: "d",
      href: "/blog/a-post",
      datePublished: "2026-08-01",
    })
  );

  it("leaves no @id reference dangling in a tool page's graph", () => {
    const { defined, referenced } = collectIds(toolGraph);
    const dangling = [...referenced].filter((id) => !defined.has(id));
    expect(dangling).toEqual([]);
  });

  it("leaves no @id reference dangling in a blog page's graph", () => {
    const { defined, referenced } = collectIds(blogGraph);
    const dangling = [...referenced].filter((id) => !defined.has(id));
    expect(dangling).toEqual([]);
  });

  it("emits only absolute URLs, never a root-relative path", () => {
    // A relative URL in JSON-LD resolves against whatever the crawler decides
    // the base is, which is not necessarily the canonical origin.
    for (const graph of [toolGraph, blogGraph]) {
      for (const value of allStrings(graph)) {
        if (value.startsWith("/")) {
          throw new Error(`relative URL in JSON-LD: ${value}`);
        }
      }
    }
  });

  it("gives every node in the graph an explicit @type", () => {
    for (const node of [...toolGraph["@graph"], ...blogGraph["@graph"]]) {
      expect(node["@type"]).toBeTruthy();
    }
  });

  it("never repeats an @id between two distinct nodes of one graph", () => {
    for (const graph of [toolGraph, blogGraph]) {
      const ids = graph["@graph"].map((n) => n["@id"]).filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
