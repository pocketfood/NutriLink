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
];

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

function isAllowedHost(targetUrl) {
  if (!ALLOWED_HOSTS.size && !ALLOWED_WILDCARD_SUFFIXES.length) {
    return process.env.NODE_ENV !== 'production';
  }
  const host = targetUrl.host.toLowerCase();
  const hostname = targetUrl.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host) || ALLOWED_HOSTS.has(hostname)) return true;
  return ALLOWED_WILDCARD_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
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

  if (!isAllowedHost(parsed)) {
    res.status(403).json({ error: 'Proxy host not allowed' });
    return;
  }

  const upstreamHeaders = {};
  if (req.headers.range) upstreamHeaders.Range = req.headers.range;

  try {
    const upstream = await fetch(parsed.toString(), {
      method: req.method,
      headers: upstreamHeaders,
      redirect: 'follow',
    });

    res.status(upstream.status);

    const passthroughHeaders = [
      'content-type',
      'content-length',
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

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    if (!upstream.body) {
      res.status(502).json({ error: 'Upstream response missing body' });
      return;
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch {
    res.status(502).json({ error: 'Upstream fetch failed' });
  }
}
