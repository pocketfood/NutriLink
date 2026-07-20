export const config = {
  runtime: 'nodejs',
};

const BLOB_BASE_URL = 'https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com/videos';
const VIEWER_HOST_PATTERN = /^proxy-[a-z0-9-]+\.htb-cloud\.com\/bird\/(?:rdp\/)?[^/]+$/i;

function getFirstId(value = '') {
  return String(value)
    .split(/[,/]+/)
    .map((part) => part.trim())
    .filter(Boolean)[0] || '';
}

function getViewerWebSocketUrl(value) {
  try {
    const viewerUrl = new URL(value);
    if (viewerUrl.protocol !== 'https:' || viewerUrl.hostname.toLowerCase() !== 'vnc.htb-cloud.com') return null;
    if (viewerUrl.pathname !== '/index.php' || !viewerUrl.searchParams.get('password')) return null;

    const viewerHost = viewerUrl.searchParams.get('host') || '';
    if (!VIEWER_HOST_PATTERN.test(viewerHost)) return null;
    return `wss://${viewerHost}`;
  } catch {
    return null;
  }
}

async function getMetadata(id) {
  try {
    const response = await fetch(`${BLOB_BASE_URL}/${encodeURIComponent(id)}.json`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function checkWebSocket(url) {
  return new Promise((resolve) => {
    let settled = false;
    let socket;
    let messageTimeout;
    const timeout = setTimeout(() => finish(false), 4000);

    const finish = (active) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(messageTimeout);
      try {
        socket?.close();
      } catch {
        // The connection may already be closed.
      }
      resolve(active);
    };

    try {
      socket = new WebSocket(url, ['binary']);
      socket.addEventListener('open', () => {
        messageTimeout = setTimeout(() => finish(false), 3000);
      });
      socket.addEventListener('message', () => finish(true));
      socket.addEventListener('error', () => finish(false));
      socket.addEventListener('close', () => finish(false));
    } catch {
      finish(false);
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = getFirstId(req.query?.id || new URL(req.url, 'https://nutrilink.local').searchParams.get('id') || '');
  const metadata = id ? await getMetadata(id) : null;
  const sourceUrl = metadata?.type === 'remote-viewer' ? metadata.url : null;
  const webSocketUrl = sourceUrl ? getViewerWebSocketUrl(sourceUrl) : null;
  const active = webSocketUrl ? await checkWebSocket(webSocketUrl) : false;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ active });
}
