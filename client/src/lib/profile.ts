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

const AVATAR_METADATA_KEYS = [
  'avatar_url',
  'picture',
  'picture_url',
  'profile_image_url',
  'photo_url',
  'photoURL',
  'image',
  'avatar',
];

const isMetadataRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const collectProfileMetadataSources = (
  metadata:
    | Record<string, unknown>
    | Array<Record<string, unknown> | null | undefined>
    | null
    | undefined
) => {
  const sources = Array.isArray(metadata) ? metadata : [metadata];
  const records: Record<string, unknown>[] = [];

  sources.forEach((source) => {
    if (!isMetadataRecord(source)) {
      return;
    }

    records.push(source);

    ['identity_data', 'user_metadata', 'raw_user_meta_data', 'profile'].forEach(
      (nestedKey) => {
        const nested = source[nestedKey];

        if (isMetadataRecord(nested)) {
          records.push(nested);
        }
      }
    );

    if (Array.isArray(source.identities)) {
      source.identities.forEach((identity) => {
        if (!isMetadataRecord(identity)) {
          return;
        }

        if (isMetadataRecord(identity.identity_data)) {
          records.push(identity.identity_data);
        }
      });
    }
  });

  return records;
};

export const getAvatarCandidates = (
  primaryAvatarUrl: string | null | undefined,
  metadata:
    | Record<string, unknown>
    | Array<Record<string, unknown> | null | undefined>
    | null
    | undefined
) => {
  const metadataSources = collectProfileMetadataSources(metadata);
  const candidates = [
    primaryAvatarUrl,
    ...metadataSources.map((source) =>
      readProfileMetadataString(source, AVATAR_METADATA_KEYS)
    ),
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
