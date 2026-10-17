// Allowlist check for links that come from the server (announcement
// "Take Action" buttons). Returns a safe href string, or null if the value
// is not an http(s) URL or a same-site absolute path.
export function safeHref(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || /[\u0000- \u007f-\u009f]/.test(v)) return null;

  if (v.startsWith("/")) {
    return v.startsWith("//") || v.startsWith("/\\") ? null : v;
  }

  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}
