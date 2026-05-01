function normalizeDescriptionText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function isSameDescription(left, right) {
  const normalizedLeft = normalizeDescriptionText(left);
  const normalizedRight = normalizeDescriptionText(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function getTwitterPostText(item) {
  if (!item) return '';
  return item.sourceDescription || item.tweetText || item.description || item.userDescription || '';
}

export function getUserDisplayDescription(item, isTwitter) {
  if (!item) return '';
  if (!isTwitter) return item.userDescription ?? item.description ?? '';

  const sourceText = item.sourceDescription || item.tweetText || '';
  const explicitUserDescription = item.userDescription;

  if (explicitUserDescription == null) {
    const fallbackDescription = item.description || '';
    return sourceText && !isSameDescription(fallbackDescription, sourceText) ? fallbackDescription : '';
  }

  if (!explicitUserDescription) return '';
  if (!sourceText) return '';
  return isSameDescription(explicitUserDescription, sourceText) ? '' : explicitUserDescription;
}
