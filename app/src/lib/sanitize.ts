/**
 * Server-side HTML sanitizer using an allowlist approach.
 * No external dependencies required.
 *
 * Allowed tags: p, br, b, strong, i, em, u, s, ul, ol, li, h1-h6, blockquote, a
 * For <a> tags: only href attribute is allowed, and it must start with http:// or https://
 * All other tags, attributes, and event handlers are stripped.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "a",
]);

// Self-closing tags that don't need a closing tag
const VOID_TAGS = new Set(["br"]);

/**
 * Sanitize an HTML string by stripping disallowed tags and attributes.
 * Keeps only safe formatting tags and validated <a href="..."> links.
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== "string") return "";

  // Process the HTML by matching all tags
  // This regex matches opening tags, closing tags, and self-closing tags
  const result = html.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)\/?\s*>|<(!--|!\[CDATA\[)[\s\S]*?(?:-->|\]\]>)/gi,
    (match, tagName, attributes) => {
      // Strip HTML comments and CDATA sections
      if (!tagName) return "";

      const tag = tagName.toLowerCase();
      const isClosing = match.startsWith("</");

      // Strip disallowed tags entirely
      if (!ALLOWED_TAGS.has(tag)) {
        return "";
      }

      // For closing tags, no attributes needed
      if (isClosing) {
        return `</${tag}>`;
      }

      // For void/self-closing tags
      if (VOID_TAGS.has(tag)) {
        return `<${tag}>`;
      }

      // For <a> tags, only allow href attribute with http(s) URLs
      if (tag === "a" && attributes) {
        const hrefMatch = attributes.match(
          /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i
        );
        if (hrefMatch) {
          const href = (hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? "").trim();
          // Only allow http:// and https:// URLs (prevent javascript:, data:, etc.)
          if (href.startsWith("http://") || href.startsWith("https://")) {
            // Escape any quotes in the href to prevent attribute injection
            const safeHref = href
              .replace(/&/g, "&amp;")
              .replace(/"/g, "&quot;");
            return `<a href="${safeHref}">`;
          }
        }
        // No valid href found — render as plain <a> (effectively no link)
        return "<a>";
      }

      // For all other allowed tags, strip all attributes
      return `<${tag}>`;
    }
  );

  // Remove any remaining <script>, <style>, <iframe> content blocks that might
  // have been split across the regex (belt-and-suspenders)
  return result
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, "");
}
