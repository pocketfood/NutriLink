const POSTER_TIMEOUT_MS = 9000;
const AUDIO_PATTERN = /\.(?:mp3|m4a|aac|wav|ogg|flac)(?:[?#]|$)/i;
const HLS_PATTERN = /\.m3u8?(?:[?#]|$)/i;

function getPosterSourceUrl(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('/api/proxy?url=')) return value;
  if (value.startsWith('blob:') || value.startsWith('data:')) return value;
  if (!/^https?:/i.test(value)) return value;

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (
      typeof window !== 'undefined' &&
      parsed.origin === window.location.origin
    ) {
      return value;
    }
    if (hostname === 'public.blob.vercel-storage.com' || hostname.endsWith('.public.blob.vercel-storage.com')) {
      return value;
    }
  } catch {
    return value;
  }

  return `/api/proxy?url=${encodeURIComponent(value)}`;
}

function waitForVideoEvent(video, eventName, errorMessage) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(errorMessage));
    }, POSTER_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, handleEvent);
      video.removeEventListener('error', handleError);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(errorMessage));
    };

    video.addEventListener(eventName, handleEvent, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => reject(reader.error || new Error('Unable to read video poster.'));
    reader.readAsDataURL(blob);
  });
}

export async function createVideoPoster(value) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (!value || AUDIO_PATTERN.test(value) || HLS_PATTERN.test(value)) return null;

  const sourceUrl = getPosterSourceUrl(value);
  if (!sourceUrl) return null;

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = sourceUrl;

  try {
    const metadataReady = waitForVideoEvent(video, 'loadedmetadata', 'Video poster metadata could not be loaded.');
    video.load();
    await metadataReady;

    if (!video.videoWidth || !video.videoHeight) return null;

    if (Number.isFinite(video.duration) && video.duration > 0.1) {
      const seekReady = waitForVideoEvent(video, 'seeked', 'Video poster frame could not be loaded.');
      video.currentTime = Math.min(0.1, video.duration / 2);
      await seekReady;
    } else if (video.readyState < 2) {
      const frameReady = waitForVideoEvent(video, 'loadeddata', 'Video poster frame could not be loaded.');
      await frameReady;
    }

    const maxDimension = 1280;
    const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const posterBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Unable to create video poster.'))),
        'image/jpeg',
        0.82
      );
    });

    return readBlobAsDataUrl(posterBlob);
  } catch {
    return null;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}
