/**
 * Fetch a template's Logo URL for embedding in a PDF. Only PNG and JPEG are
 * supported (that's what the PDF renderer can draw). Any failure (bad URL,
 * private host, timeout, too large, wrong type) returns null so the PDF still
 * renders, just without the logo.
 */

export interface LogoImage {
  data: Buffer;
  format: "png" | "jpg";
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5000;

function sniffFormat(buf: Buffer): "png" | "jpg" | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  return null;
}

// Don't let a template make the server fetch from itself or the private network.
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h.includes(":")) {
    return h === "::1" || h === "::" || /^f[cd]/.test(h) || h.startsWith("fe80") || h.startsWith("::ffff:");
  }
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export async function loadLogoImage(url: string | null | undefined): Promise<LogoImage | null> {
  if (!url) return null;
  const trimmed = url.trim();
  try {
    if (trimmed.startsWith("data:")) {
      const m = trimmed.match(/^data:image\/(png|jpe?g);base64,([a-z0-9+/=\s]+)$/i);
      if (!m) return null;
      const data = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
      if (data.length > MAX_LOGO_BYTES) return null;
      const format = sniffFormat(data);
      return format ? { data, format } : null;
    }

    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (isPrivateHost(parsed.hostname)) return null;

    const res = await fetch(parsed, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: { Accept: "image/png,image/jpeg" },
    });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > MAX_LOGO_BYTES) return null;
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > MAX_LOGO_BYTES) return null;
    const format = sniffFormat(data);
    return format ? { data, format } : null;
  } catch {
    return null;
  }
}
