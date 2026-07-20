export const config = {
  runtime: 'nodejs',
};

const BLOB_BASE_URL = 'https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com/videos';
const DEFAULT_TITLE = 'NutriLink';
const DEFAULT_DESCRIPTION = 'Stream and share videos instantly.';

function getOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  return `${protocol}://${host}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFirstId(pathValue = '') {
  return String(pathValue)
    .split(/[,/]/)
    .map((part) => part.trim())
    .filter(Boolean)[0] || '';
}

function normalizeMetadata(payload) {
  if (!payload) return null;
  const firstVideo = Array.isArray(payload.videos) ? payload.videos.find(Boolean) : null;
  return firstVideo ? { ...firstVideo, type: firstVideo.type || payload.type } : payload;
}

function isRawXUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(host);
  } catch {
    return false;
  }
}

function toAbsoluteUrl(value, origin) {
  if (!value) return null;
  try {
    return new URL(value, origin).toString();
  } catch {
    return null;
  }
}

function isPublicBlobUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'public.blob.vercel-storage.com' || hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

function getVideoPreviewUrl(value, origin) {
  const absoluteUrl = toAbsoluteUrl(value, origin);
  if (!absoluteUrl || isPublicBlobUrl(absoluteUrl)) return absoluteUrl;

  try {
    const parsed = new URL(absoluteUrl);
    if (parsed.origin === origin && parsed.pathname === '/api/proxy') return absoluteUrl;
    return toAbsoluteUrl(`/api/proxy?url=${encodeURIComponent(absoluteUrl)}`, origin);
  } catch {
    return null;
  }
}

function getVideoMimeType(value) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    if (/\.webm$/.test(pathname)) return 'video/webm';
    if (/\.mov$/.test(pathname)) return 'video/quicktime';
    if (/\.m3u8?$/.test(pathname)) return 'application/vnd.apple.mpegurl';
  } catch {
    // Use the broadly supported MP4 type when the source has no recognizable extension.
  }

  return 'video/mp4';
}

async function getVideoMetadata(id) {
  if (!id) return null;
  try {
    const res = await fetch(`${BLOB_BASE_URL}/${encodeURIComponent(id)}.json`);
    if (!res.ok) return null;
    return normalizeMetadata(await res.json());
  } catch {
    return null;
  }
}

async function getIndexHtml(origin) {
  try {
    const res = await fetch(`${origin}/`, { redirect: 'follow' });
    if (res.ok) return res.text();
  } catch {
    // Fall through to the dev-friendly fallback shell.
  }

  return `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><link rel="icon" href="/favicon/favicon.ico" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>NutriLink</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`;
}

function buildMetaTags({ title, description, image, pageUrl, videoUrl, videoType, videoWidth, videoHeight }) {
  const tags = [
    ['meta', 'property', 'og:site_name', 'NutriLink'],
    ['meta', 'property', 'og:type', videoUrl ? 'video.other' : 'website'],
    ['meta', 'property', 'og:title', title],
    ['meta', 'property', 'og:description', description],
    ['meta', 'property', 'og:url', pageUrl],
    ['meta', 'property', 'og:image', image],
    ['meta', 'property', 'og:image:secure_url', image],
    ['meta', 'name', 'twitter:card', image ? 'summary_large_image' : 'summary'],
    ['meta', 'name', 'twitter:title', title],
    ['meta', 'name', 'twitter:description', description],
    ['meta', 'name', 'twitter:image', image],
  ];

  if (videoUrl) {
    tags.push(
      ['meta', 'property', 'og:video', videoUrl],
      ['meta', 'property', 'og:video:url', videoUrl],
      ['meta', 'property', 'og:video:secure_url', videoUrl],
      ['meta', 'property', 'og:video:type', videoType],
      ['meta', 'name', 'twitter:player:stream', videoUrl],
      ['meta', 'name', 'twitter:player:stream:content_type', videoType]
    );

    if (videoWidth) tags.push(['meta', 'property', 'og:video:width', videoWidth]);
    if (videoHeight) tags.push(['meta', 'property', 'og:video:height', videoHeight]);
  }

  return tags
    .filter((tag) => tag[3])
    .map(([tagName, attrName, attrValue, content]) =>
      `<${tagName} ${attrName}="${escapeHtml(attrValue)}" content="${escapeHtml(content)}" />`
    )
    .join('\n    ');
}

function injectMeta(html, metaTags, title) {
  const cleaned = html
    .replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(/\s*<meta\s+(?:property|name)="(?:og|twitter):[^>]*>\s*/gi, '\n');

  return cleaned.replace(/<head>/i, `<head>\n    ${metaTags}`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const origin = getOrigin(req);
  const requestUrl = new URL(req.url, origin);
  const route = requestUrl.searchParams.get('route') === 'm' ? 'm' : 'v';
  const id = getFirstId(requestUrl.searchParams.get('id') || '');
  const pageUrl = toAbsoluteUrl(id ? `/${route}/${id}` : '/', origin);
  const metadata = await getVideoMetadata(id);
  const title = metadata?.filename || DEFAULT_TITLE;
  const description = metadata?.userDescription || metadata?.description || DEFAULT_DESCRIPTION;
  const image = toAbsoluteUrl(metadata?.poster || '/nutrilink-logo.png', origin);
  const rawVideoUrl = metadata?.videoUrl || metadata?.url;
  const videoUrl = rawVideoUrl && !isRawXUrl(rawVideoUrl) ? getVideoPreviewUrl(rawVideoUrl, origin) : null;
  const videoType = rawVideoUrl ? getVideoMimeType(rawVideoUrl) : null;
  const videoWidth = metadata?.width != null && Number.isFinite(Number(metadata.width)) ? Number(metadata.width) : null;
  const videoHeight = metadata?.height != null && Number.isFinite(Number(metadata.height)) ? Number(metadata.height) : null;
  const indexHtml = await getIndexHtml(origin);
  const metaTags = buildMetaTags({ title, description, image, pageUrl, videoUrl, videoType, videoWidth, videoHeight });
  const html = injectMeta(indexHtml, metaTags, title);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  return res.status(200).send(req.method === 'HEAD' ? '' : html);
}
