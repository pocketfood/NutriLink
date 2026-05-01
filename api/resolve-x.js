export const config = {
  runtime: 'nodejs',
};

const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);

function sendJson(res, status, body) {
  res.status(status).json(body);
}

function getRequestBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function parseXStatusUrl(value) {
  if (!value || typeof value !== 'string') return null;

  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!X_HOSTS.has(parsed.hostname.toLowerCase())) return null;

    const parts = parsed.pathname.split('/').filter(Boolean);
    const statusIndex = parts.findIndex((part) => part === 'status' || part === 'statuses');
    const tweetId = statusIndex >= 0 ? parts[statusIndex + 1] : null;

    if (!/^\d+$/.test(tweetId || '')) return null;
    return { tweetId, sourceUrl: parsed.toString() };
  } catch {
    return null;
  }
}

function getBestMp4Variant(media) {
  const variants = Array.isArray(media?.variants) ? media.variants : [];
  const mp4Variants = variants
    .filter((variant) => {
      const contentType = String(variant.content_type || '').toLowerCase();
      const url = String(variant.url || '');
      return url && (contentType === 'video/mp4' || /\.mp4(\?|#|$)/i.test(url));
    })
    .sort((a, b) => {
      const aBitRate = Number(a.bit_rate || a.bitrate || 0);
      const bBitRate = Number(b.bit_rate || b.bitrate || 0);
      return bBitRate - aBitRate;
    });

  return mp4Variants[0] || null;
}

function findBestVideoMedia(tweet, includes) {
  const attachedMediaKeys = new Set(tweet?.attachments?.media_keys || []);
  const mediaItems = Array.isArray(includes?.media) ? includes.media : [];

  return mediaItems
    .filter((media) => {
      const isAttached = !attachedMediaKeys.size || attachedMediaKeys.has(media.media_key);
      return isAttached && (media.type === 'video' || media.type === 'animated_gif');
    })
    .map((media) => ({ media, variant: getBestMp4Variant(media) }))
    .filter(({ variant }) => variant?.url)
    .sort((a, b) => {
      const aBitRate = Number(a.variant.bit_rate || a.variant.bitrate || 0);
      const bBitRate = Number(b.variant.bit_rate || b.variant.bitrate || 0);
      return bBitRate - aBitRate;
    })[0] || null;
}

function getXErrorTitle(details) {
  if (typeof details?.title === 'string') return details.title;
  if (Array.isArray(details?.errors)) {
    return details.errors.find((error) => typeof error?.title === 'string')?.title || null;
  }
  return null;
}

function getXErrorType(details) {
  if (typeof details?.type === 'string') return details.type;
  if (Array.isArray(details?.errors)) {
    return details.errors.find((error) => typeof error?.type === 'string')?.type || null;
  }
  return null;
}

function getSafeXErrorMessage(status, title, type) {
  const safeTitle = String(title || '');
  const safeType = String(type || '');

  if (status === 402 || /credits/i.test(safeTitle) || /credits/i.test(safeType)) {
    return 'X API credits are unavailable for this app right now.';
  }
  if (status === 401) return 'X API authentication failed.';
  if (status === 403) return 'X API access is not allowed for this request.';
  if (status === 404) return 'The X/Twitter post could not be found.';
  if (status === 429) return 'X API rate limit reached. Please try again later.';
  if (status >= 500) return 'X API is unavailable right now. Please try again later.';
  return 'X API could not resolve this post.';
}

function sanitizeXApiError(details, status) {
  const title = getXErrorTitle(details);
  const type = getXErrorType(details);

  return {
    title,
    type,
    message: getSafeXErrorMessage(status, title, type),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { url } = getRequestBody(req);
  const parsedPost = parseXStatusUrl(url);
  if (!parsedPost) {
    return sendJson(res, 400, {
      error: 'Missing or invalid X/Twitter status URL',
      details: 'Expected a status URL from x.com, twitter.com, or mobile.twitter.com.',
    });
  }

  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) {
    return sendJson(res, 500, {
      error: 'X video resolver is not configured on the server',
    });
  }

  const params = new URLSearchParams({
    expansions: 'attachments.media_keys,author_id',
    'tweet.fields': 'attachments,possibly_sensitive,text',
    'media.fields': 'duration_ms,height,media_key,preview_image_url,type,url,variants,width',
    'user.fields': 'name,profile_image_url,username',
  });

  const apiUrl = `https://api.x.com/2/tweets/${parsedPost.tweetId}?${params.toString()}`;

  let upstream;
  let details;
  try {
    upstream = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    });
    details = await upstream.json().catch(() => null);
  } catch (err) {
    return sendJson(res, 502, {
      error: 'Failed to reach the X API',
      details: {
        message: err instanceof Error ? err.message : 'Unknown network error',
      },
    });
  }

  if (!upstream.ok) {
    return sendJson(res, upstream.status, {
      error: 'X API request failed',
      status: upstream.status,
      details: sanitizeXApiError(details, upstream.status),
    });
  }

  const tweet = details?.data;
  if (!tweet) {
    return sendJson(res, 404, {
      error: 'X post not found',
      details: sanitizeXApiError(details, 404),
    });
  }

  const bestVideo = findBestVideoMedia(tweet, details?.includes);
  if (!bestVideo) {
    return sendJson(res, 404, {
      error: 'No video was found on this X/Twitter post',
      details: {
        message: 'This X/Twitter post does not include a playable video.',
      },
    });
  }

  const author = Array.isArray(details?.includes?.users)
    ? details.includes.users.find((user) => user.id === tweet.author_id) || details.includes.users[0]
    : null;

  return sendJson(res, 200, {
    type: 'twitter',
    source: 'x',
    sourceUrl: parsedPost.sourceUrl,
    tweetId: parsedPost.tweetId,
    videoUrl: bestVideo.variant.url,
    poster: bestVideo.media.preview_image_url || bestVideo.media.url || null,
    width: bestVideo.media.width || null,
    height: bestVideo.media.height || null,
    durationMs: bestVideo.media.duration_ms || null,
    username: author?.username || null,
    name: author?.name || null,
    profileImage: author?.profile_image_url || null,
    description: tweet.text || '',
    possiblySensitive: Boolean(tweet.possibly_sensitive),
  });
}
