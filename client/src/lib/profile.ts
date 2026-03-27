export const readProfileMetadataString = (
  metadata: Record<string, unknown> | null | undefined,
  keys: string[]
) => {
  if (!metadata) {
    return null;
  }

  for (const key of keys) {
    const value = metadata[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

export const getAvatarCandidates = (
  primaryAvatarUrl: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined
) => {
  const candidates = [
    primaryAvatarUrl,
    readProfileMetadataString(metadata, ['avatar_url']),
    readProfileMetadataString(metadata, ['picture']),
    readProfileMetadataString(metadata, ['picture_url']),
    readProfileMetadataString(metadata, ['profile_image_url']),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
};

export const getProfileInitials = (fullName?: string | null) => {
  const normalized = (fullName || '').trim();

  if (!normalized) {
    return 'P';
  }

  const initials = normalized
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return initials || 'P';
};
