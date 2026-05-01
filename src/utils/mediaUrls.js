export function isHlsUrl(value) {
  if (!value || typeof value !== 'string') return false;

  try {
    const parsed = new URL(value, 'https://nutrilink.local');
    const proxiedUrl = parsed.pathname === '/api/proxy' ? parsed.searchParams.get('url') : null;
    if (proxiedUrl && proxiedUrl !== value) return isHlsUrl(proxiedUrl);
    return /\.m3u8$/i.test(parsed.pathname);
  } catch {
    return /\.m3u8(?:[?#]|$)/i.test(value);
  }
}
