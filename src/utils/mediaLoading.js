export function getBufferedPercent(media) {
  if (!media || !media.buffered || media.buffered.length === 0) return null;

  const duration = media.duration;
  if (!Number.isFinite(duration) || duration <= 0) return null;

  let bufferedEnd = 0;
  const currentTime = Number.isFinite(media.currentTime) ? media.currentTime : 0;

  for (let index = 0; index < media.buffered.length; index += 1) {
    const start = media.buffered.start(index);
    const end = media.buffered.end(index);
    if (currentTime >= start && currentTime <= end) {
      bufferedEnd = Math.max(bufferedEnd, end);
    } else if (end > bufferedEnd) {
      bufferedEnd = end;
    }
  }

  return Math.min(100, Math.max(0, (bufferedEnd / duration) * 100));
}

export function nextMediaLoadState(media, options = {}) {
  const bufferedPercent = getBufferedPercent(media);
  return {
    isLoading: Boolean(options.isLoading),
    label: options.label || 'Loading',
    loadedPercent: bufferedPercent ?? options.loadedPercent ?? null,
  };
}
