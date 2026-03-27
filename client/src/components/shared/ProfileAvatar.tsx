import { useEffect, useMemo, useState } from 'react';
import { getProfileInitials } from '../../lib/profile';

type ProfileAvatarProps = {
  avatarCandidates: Array<string | null | undefined>;
  fullName?: string | null;
  className: string;
};

export const ProfileAvatar = ({
  avatarCandidates,
  fullName,
  className,
}: ProfileAvatarProps) => {
  const candidates = useMemo(
    () =>
      [...new Set(avatarCandidates.filter((value): value is string => Boolean(value)))],
    [avatarCandidates]
  );
  const [avatarIndex, setAvatarIndex] = useState(0);

  useEffect(() => {
    setAvatarIndex(0);
  }, [candidates]);

  const activeAvatar = candidates[avatarIndex];

  return (
    <div className={className}>
      {activeAvatar ? (
        <img
          src={activeAvatar}
          alt={fullName || 'Workspace owner'}
          onError={() => {
            setAvatarIndex((current) => current + 1);
          }}
        />
      ) : (
        <span>{getProfileInitials(fullName)}</span>
      )}
    </div>
  );
};
