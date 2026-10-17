// Allowlist-based validation for user-supplied links (e.g. announcement
// "Take Action" buttons). A blocklist such as "does not start with
// javascript:" is bypassable ("java\tscript:", leading control characters),
// so we only accept what we explicitly recognise:
//   - absolute http:// or https:// URLs
//   - same-site relative paths that start with a single "/"
const MAX_URL_LENGTH = 2048;

function sanitizeActionUrl(input) {
  if (input === undefined || input === null) return { ok: true, value: "" };
  if (typeof input !== "string") return { ok: false, error: "Action URL must be a string" };

  const value = input.trim();
  if (value === "") return { ok: true, value: "" };
  if (value.length > MAX_URL_LENGTH) return { ok: false, error: "Action URL is too long" };

  // No whitespace or control characters anywhere inside the URL.
  if (/[\u0000- \u007f-\u009f]/.test(value)) {
    return { ok: false, error: "Action URL contains invalid characters" };
  }

  // Same-site relative path ("/patients"), but not protocol-relative ("//evil.com") or "/\evil.com".
  if (value.startsWith("/")) {
    if (value.startsWith("//") || value.startsWith("/\\")) {
      return { ok: false, error: "Action URL must be an http(s) link or a path on this site" };
    }
    return { ok: true, value };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "Action URL must be an http(s) link or a path on this site" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Action URL must use http or https" };
  }

  return { ok: true, value };
}

module.exports = { sanitizeActionUrl };
