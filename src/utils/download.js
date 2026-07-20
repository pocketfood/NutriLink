function getBrowserOrigin() {
  return typeof window !== 'undefined' ? window.location.origin : 'https://nutrilink.local';
}

export function sanitizeDownloadFilename(value, fallback = 'nutrilink-video.mp4') {
  const safeValue = String(value || '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((character) => character.charCodeAt(0) < 32 ? '_' : character)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .slice(0, 140);

  return safeValue || fallback;
}

export function buildDownloadRequestUrl(url, filename) {
  if (!url) return null;

  const safeFilename = sanitizeDownloadFilename(filename);

  try {
    const parsed = new URL(url, getBrowserOrigin());
    if (parsed.pathname === '/api/proxy') {
      parsed.searchParams.set('download', '1');
      parsed.searchParams.set('filename', safeFilename);
      return `${parsed.pathname}?${parsed.searchParams.toString()}`;
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

export function triggerDownload(url, filename) {
  const requestUrl = buildDownloadRequestUrl(url, filename);
  if (!requestUrl || typeof document === 'undefined') return false;

  const link = document.createElement('a');
  link.href = requestUrl;
  link.download = sanitizeDownloadFilename(filename);
  link.rel = 'noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}
