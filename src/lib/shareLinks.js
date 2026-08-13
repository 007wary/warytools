// Share-intent URLs for the blog post share row.
//
// Pure string building, kept out of the component so the encoding rules are
// testable — every one of these is a query string carrying a URL and a title,
// and getting the encoding wrong truncates the shared text at the first `&`
// or `#` rather than failing visibly.

/**
 * Builds the share targets for one post.
 *
 * `text` is deliberately the post TITLE and not the description. A share
 * intent renders the text next to the link preview, which already carries the
 * description via og:description — so passing the description duplicates it,
 * and on WhatsApp (where the preview is small) pushes the actual link out of
 * the first visible line.
 *
 * Every URL is built with URLSearchParams rather than by concatenating
 * `encodeURIComponent` calls. The two differ on exactly the characters that
 * appear in real titles: a `+` in a hand-encoded query is read as a space by
 * most receivers, and an `&` in a title splits the parameter in half. Post
 * titles here contain apostrophes, em dashes and colons routinely.
 */
export function shareTargets({ url, title }) {
  const query = (params) => new URLSearchParams(params).toString();

  return [
    {
      id: "whatsapp",
      label: "WhatsApp",
      // api.whatsapp.com/send rather than the wa.me short form: wa.me is
      // designed around a phone number and redirects awkwardly on desktop,
      // whereas /send with only a `text` parameter opens the contact picker
      // on both mobile and WhatsApp Web.
      //
      // WhatsApp shows no separate link preview for the text parameter — it
      // previews whatever URL it finds INSIDE the text. So the URL has to be
      // part of the message body, not a separate field.
      href: `https://api.whatsapp.com/send?${query({ text: `${title} ${url}` })}`,
    },
    {
      id: "x",
      label: "X",
      // Still twitter.com/intent/tweet. x.com/intent/tweet works too, but the
      // twitter.com host has been stable across the rename and redirects
      // correctly, while the newer paths have moved more than once.
      href: `https://twitter.com/intent/tweet?${query({ text: title, url })}`,
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      // LinkedIn deliberately ignores any title/summary parameters now — it
      // reads og:title and og:description from the page itself. Passing them
      // is not harmful but is dead weight, so only the URL is sent.
      href: `https://www.linkedin.com/sharing/share-offsite/?${query({ url })}`,
    },
    {
      id: "facebook",
      label: "Facebook",
      // Same as LinkedIn: Facebook dropped the `quote` parameter, and the
      // preview is built entirely from the page's OG tags.
      href: `https://www.facebook.com/sharer/sharer.php?${query({ u: url })}`,
    },
  ];
}

/**
 * The payload handed to navigator.share().
 *
 * `title` and `text` are BOTH set, and deliberately to different things.
 * Receiving apps pick inconsistently between them — some read only `text`,
 * some concatenate both — so setting `text` to the title as well would make
 * those apps show the title twice. `text` carries the description instead,
 * which reads correctly whichever field an app chooses.
 */
export function nativeSharePayload({ url, title, description }) {
  return { title, text: description, url };
}
