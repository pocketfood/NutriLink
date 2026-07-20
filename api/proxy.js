export const config = {
  runtime: 'nodejs',
};

import { Readable } from 'node:stream';

const ALLOWED_ORIGIN =
  process.env.NODE_ENV === 'production'
    ? process.env.APP_ORIGIN || 'https://app.example'
    : '*';

const defaultAllowedHostEntries = [
  'platform.twitter.com',
  'platform.x.com',
  'publish.twitter.com',
  'publish.x.com',
  'syndication.twitter.com',
  'syndication.x.com',
  'cdn.syndication.twimg.com',
  'pbs.twimg.com',
  'video.twimg.com',
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
  'sys.4chan.org',
  'files.catbox.moe',
  'demo.unified-streaming.com',
  '*.cloudfront.net',
  '*.9cache.com',
  '9gag.com',
  'www.9gag.com',
  '*.4cdn.org',
  'cdn.discordapp.com',
  'media.discordapp.net',
  '*.discordapp.com',
  '*.discordapp.net',
  '*.castr.com',
  '*.akamaihd.net',
];

const HTML_REDIRECT_HOSTS = new Set(['sys.4chan.org']);

const configuredAllowedHostEntries = [
  process.env.AUDIO_PROXY_ALLOWED_HOSTS,
  process.env.MEDIA_PROXY_ALLOWED_HOSTS,
]
  .filter(Boolean)
  .join(',')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

const allowedHostEntries = [...defaultAllowedHostEntries, ...configuredAllowedHostEntries]
  .map((host) => {
    if (/^https?:\/\//i.test(host)) {
      try {
        return new URL(host).host;
      } catch {
        return host;
      }
    }
    return host;
  });

const ALLOWED_WILDCARD_SUFFIXES = [];
const ALLOWED_HOSTS = new Set();

allowedHostEntries.forEach((host) => {
  if (host.startsWith('*.') && host.length > 2) {
    ALLOWED_WILDCARD_SUFFIXES.push(host.slice(1).toLowerCase());
  } else {
    ALLOWED_HOSTS.add(host.toLowerCase());
  }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
  ...(ALLOWED_ORIGIN === '*'
    ? {}
    : { 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' }),
};

function applyCors(res) {
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
}

function getTargetUrl(req) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  return requestUrl.searchParams.get('url');
}

function getDownloadFilename(req) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  if (requestUrl.searchParams.get('download') !== '1') return null;

  const requestedFilename = requestUrl.searchParams.get('filename') || 'nutrilink-download';
  const safeFilename = requestedFilename
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((character) => character.charCodeAt(0) < 32 ? '_' : character)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .slice(0, 140);

  return safeFilename || 'nutrilink-download';
}

function decodeHtmlAttribute(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/gi, '/');
}

function getHtmlRedirectTarget(html, baseUrl) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const metaTag of metaTags) {
    if (!/http-equiv\s*=\s*["']?refresh\b/i.test(metaTag)) continue;

    const contentMatch = metaTag.match(/content\s*=\s*["']([^"']+)["']/i);
    const refreshUrl = contentMatch?.[1]?.match(/\burl\s*=\s*["']?([^\s"']+)/i)?.[1];
    if (!refreshUrl) continue;

    try {
      return new URL(decodeHtmlAttribute(refreshUrl), baseUrl);
    } catch {
      return null;
    }
  }

  const canonicalMatch = html.match(
    /<link\b[^>]*rel\s*=\s*["'][^"']*\bcanonical\b[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/i
  );
  if (!canonicalMatch?.[1]) return null;

  try {
    return new URL(decodeHtmlAttribute(canonicalMatch[1]), baseUrl);
  } catch {
    return null;
  }
}

function isHtmlRedirectResponse(targetUrl, upstream) {
  const contentType = upstream.headers.get('content-type') || '';
  return HTML_REDIRECT_HOSTS.has(targetUrl.hostname.toLowerCase()) && /text\/html/i.test(contentType);
}

function isAllowedHost(targetUrl) {
  if (!ALLOWED_HOSTS.size && !ALLOWED_WILDCARD_SUFFIXES.length) {
    return process.env.NODE_ENV !== 'production';
  }
  const host = targetUrl.host.toLowerCase();
  const hostname = targetUrl.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host) || ALLOWED_HOSTS.has(hostname)) return true;
  return ALLOWED_WILDCARD_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function normalizeUpstreamUrl(targetUrl) {
  if (targetUrl.hostname.toLowerCase() !== 'stream-fastly.castr.com') return targetUrl;

  const normalized = new URL(targetUrl.toString());
  normalized.hostname = 'stream-akamai.castr.com';
  return normalized;
}

function isHlsPlaylistUrl(value) {
  return /\.m3u8?$/i.test(value.pathname);
}

function isHlsPlaylistResponse(targetUrl, upstream) {
  const contentType = upstream.headers.get('content-type') || '';
  return isHlsPlaylistUrl(targetUrl) || /mpegurl|vnd\.apple\.mpegurl/i.test(contentType);
}

function toProxiedUrl(value, baseUrl) {
  if (!value || /^(?:data|blob|about):/i.test(value)) return value;
  try {
    const absoluteUrl = new URL(value, baseUrl).toString();
    return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
  } catch {
    return value;
  }
}

function rewriteHlsPlaylist(playlist, baseUrl) {
  return playlist
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || (trimmed.startsWith('#') && !/URI="/i.test(trimmed))) return line;

      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (match, uri) => `URI="${toProxiedUrl(uri, baseUrl)}"`);
      }

      return toProxiedUrl(trimmed, baseUrl);
    })
    .join('\n');
}

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const target = getTargetUrl(req);
  const downloadFilename = getDownloadFilename(req);
  if (!target) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.status(400).json({ error: 'Invalid url parameter' });
    return;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    res.status(400).json({ error: 'Unsupported protocol' });
    return;
  }

  let upstreamUrl = normalizeUpstreamUrl(parsed);

  if (!isAllowedHost(upstreamUrl)) {
    res.status(403).json({ error: 'Proxy host not allowed' });
    return;
  }

  const upstreamHeaders = {
    Accept: '*/*',
    'User-Agent':
      req.headers['user-agent'] ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  };
  if (req.headers.range) upstreamHeaders.Range = req.headers.range;

  try {
    const fetchUpstream = (targetUrl) => fetch(targetUrl.toString(), {
      method: req.method,
      headers: upstreamHeaders,
      redirect: 'follow',
    });

    let upstream = await fetchUpstream(upstreamUrl);
    let upstreamResponseUrl = new URL(upstream.url || upstreamUrl.toString());
    let upstreamText = null;

    if (req.method !== 'HEAD' && upstream.ok && isHtmlRedirectResponse(upstreamResponseUrl, upstream)) {
      upstreamText = await upstream.text();
      const redirectTarget = getHtmlRedirectTarget(upstreamText, upstreamResponseUrl);

      if (redirectTarget) {
        if (!['http:', 'https:'].includes(redirectTarget.protocol) || !isAllowedHost(redirectTarget)) {
          res.status(403).json({ error: 'Redirect target host not allowed' });
          return;
        }

        upstreamUrl = redirectTarget;
        upstream = await fetchUpstream(upstreamUrl);
        upstreamResponseUrl = new URL(upstream.url || upstreamUrl.toString());
        upstreamText = null;
      }
    }

    const shouldRewriteHls = req.method !== 'HEAD' && upstream.ok && isHlsPlaylistResponse(upstreamResponseUrl, upstream);

    const passthroughHeaders = [
      'content-type',
      'content-range',
      'accept-ranges',
      'content-disposition',
      'cache-control',
      'etag',
      'last-modified',
    ];

    passthroughHeaders.forEach((header) => {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    });

    if (downloadFilename) {
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    }

    res.status(upstream.status);

    if (req.method === 'HEAD') {
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.setHeader('content-length', contentLength);
      res.end();
      return;
    }

    if (upstreamText !== null) {
      res.setHeader('content-length', Buffer.byteLength(upstreamText));
      res.end(upstreamText);
      return;
    }

    if (shouldRewriteHls) {
      const rewrittenPlaylist = rewriteHlsPlaylist(await upstream.text(), upstreamResponseUrl.toString());
      res.setHeader('content-type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('content-length', Buffer.byteLength(rewrittenPlaylist));
      res.end(rewrittenPlaylist);
      return;
    }

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('content-length', contentLength);

    if (!upstream.body) {
      res.status(502).json({ error: 'Upstream response missing body' });
      return;
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch {
    res.status(502).json({ error: 'Upstream fetch failed' });
  }
}
