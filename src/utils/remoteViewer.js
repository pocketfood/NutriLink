const VIEWER_HOSTS = new Set(['vnc.htb-cloud.com']);

function isSupportedViewerHost(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && VIEWER_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function getRemoteViewerUrl(value) {
  if (!value || !isSupportedViewerHost(value)) return null;

  try {
    const parsed = new URL(value);
    const viewerHost = parsed.searchParams.get('host') || '';
    const password = parsed.searchParams.get('password') || '';
    const isViewerPath = parsed.pathname === '/index.php';
    const isVncTarget = /^proxy-[a-z0-9-]+\.htb-cloud\.com\/bird\/(?:rdp\/)?[^/]+$/i.test(viewerHost);

    if (!isViewerPath || !password || !isVncTarget) return null;

    parsed.searchParams.set('view_only', 'true');
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isRemoteViewerUrl(value) {
  return Boolean(getRemoteViewerUrl(value));
}
