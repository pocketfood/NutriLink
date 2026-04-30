export const config = {
  runtime: 'nodejs',
};

const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);

function getRequestUrl(req) {
  return new URL(req.url, `http://${req.headers.host}`);
}

function getXPostId(value) {
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

function removeScripts(html) {
  return String(html || '').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const requestUrl = getRequestUrl(req);
  const inputUrl = requestUrl.searchParams.get('url');
  const postId = getXPostId(inputUrl);

  if (!postId) {
    res.status(400).json({ error: 'Invalid X post URL' });
    return;
  }

  const canonicalUrl = `https://x.com/i/web/status/${postId}`;
  const upstreamUrl = new URL('https://publish.x.com/oembed');
  upstreamUrl.searchParams.set('url', canonicalUrl);
  upstreamUrl.searchParams.set('widget_type', 'video');
  upstreamUrl.searchParams.set('dnt', 'true');
  upstreamUrl.searchParams.set('omit_script', 'true');

  try {
    const upstream = await fetch(upstreamUrl, { redirect: 'follow' });
    const data = await upstream.json();

    if (!upstream.ok || !data?.html) {
      res.status(upstream.status || 502).json({ error: 'Unable to load X video embed' });
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({
      html: removeScripts(data.html),
      width: data.width ?? null,
      height: data.height ?? null,
      provider: data.provider_name ?? 'X',
    });
  } catch {
    res.status(502).json({ error: 'Unable to load X video embed' });
  }
}
