export const config = {
  runtime: 'nodejs',
};

const BLOB_BASE_URL = 'https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com/videos';
const DEFAULT_TITLE = 'NutriLink';

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

function getFirstId(value = '') {
  return String(value)
    .split(/[,/]/)
    .map((part) => part.trim())
    .filter(Boolean)[0] || '';
}

function isPublicBlobUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'public.blob.vercel-storage.com' || hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

function isRawXUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(host);
  } catch {
    return false;
  }
}

function getPlayableUrl(value, origin) {
  try {
    const absoluteUrl = new URL(value, origin).toString();
    if (isPublicBlobUrl(absoluteUrl)) return absoluteUrl;
    return `${origin}/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
  } catch {
    return null;
  }
}

async function getVideoMetadata(id) {
  try {
    const response = await fetch(`${BLOB_BASE_URL}/${encodeURIComponent(id)}.json`);
    if (!response.ok) return null;

    const payload = await response.json();
    const firstVideo = Array.isArray(payload?.videos) ? payload.videos.find(Boolean) : null;
    return firstVideo ? { ...firstVideo, type: firstVideo.type || payload.type } : payload;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const origin = getOrigin(req);
  const requestUrl = new URL(req.url, origin);
  const id = getFirstId(requestUrl.searchParams.get('id') || '');
  const metadata = id ? await getVideoMetadata(id) : null;
  const rawVideoUrl = metadata?.videoUrl || metadata?.url;
  const videoUrl = rawVideoUrl && !isRawXUrl(rawVideoUrl) ? getPlayableUrl(rawVideoUrl, origin) : null;

  if (!videoUrl) return res.status(404).send('Video not found');

  const title = escapeHtml(metadata?.filename || DEFAULT_TITLE);
  const poster = metadata?.poster ? escapeHtml(metadata.poster) : '';
  const posterAttribute = poster ? ` poster="${poster}"` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body{margin:0;background:#000;min-height:100%;overflow:hidden}video{display:block;width:100vw;height:100vh;object-fit:contain}</style></head><body><video autoplay muted loop playsinline controls${posterAttribute}><source src="${escapeHtml(videoUrl)}" type="video/webm"></video></body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  return res.status(200).send(req.method === 'HEAD' ? '' : html);
}
