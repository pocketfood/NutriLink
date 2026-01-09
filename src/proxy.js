export const config = {
  runtime: 'nodejs',
};

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range,Content-Type');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Length,Content-Range,Accept-Ranges,Content-Type'
  );
};

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;
  const targetUrl = Array.isArray(url) ? url[0] : url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url' });
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid url' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Invalid protocol' });
  }

  if (BLOCKED_HOSTNAMES.has(parsed.hostname)) {
    return res.status(400).json({ error: 'Blocked host' });
  }

  try {
    const headers = {};
    if (req.headers.range) {
      headers.range = req.headers.range;
    }

    const upstream = await fetch(parsed.toString(), {
      headers,
      redirect: 'follow',
    });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    const passthroughHeaders = [
      'content-type',
      'content-range',
      'accept-ranges',
      'cache-control',
      'etag',
      'last-modified',
    ];

    passthroughHeaders.forEach((name) => {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    });

    res.setHeader('content-length', buffer.length);
    return res.status(upstream.status).send(buffer);
  } catch (err) {
    console.error('Proxy fetch error:', err);
    return res.status(502).json({ error: 'Failed to fetch media' });
  }
}
