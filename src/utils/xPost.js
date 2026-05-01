const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);

export function getXPostId(value) {
  if (!value || typeof value !== 'string') return null;

  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase();
    if (!X_HOSTS.has(host)) return null;

    const parts = parsed.pathname.split('/').filter(Boolean);
    const statusIndex = parts.findIndex((part) => part === 'status' || part === 'statuses');
    const id = statusIndex >= 0 ? parts[statusIndex + 1] : null;

    return /^\d+$/.test(id || '') ? id : null;
  } catch {
    return null;
  }
}

export function isXPostUrl(value) {
  return Boolean(getXPostId(value));
}

export function getCanonicalXPostUrl(value) {
  const id = getXPostId(value);
  return id ? `https://x.com/i/web/status/${id}` : value;
}

export async function resolveXVideo(value) {
  const res = await fetch('/api/resolve-x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: value }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      data.details?.message ||
      data.details?.detail ||
      data.details?.errors?.[0]?.detail ||
      data.details?.errors?.[0]?.message ||
      data.errors?.[0]?.detail ||
      data.errors?.[0]?.message;
    const status = data.status || res.status;
    const title = data.details?.title ? ` ${data.details.title}` : '';
    const suffix = detail ? `: ${detail}` : '';
    throw new Error(`${data.error || 'Unable to resolve X/Twitter video'} (${status}${title})${suffix}`);
  }

  return data;
}
