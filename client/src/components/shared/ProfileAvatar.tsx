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
  const candidateKey = avatarCandidates
    .filter((value): value is string => Boolean(value))
    .filter((value, index, array) => array.indexOf(value) === index)
    .join('\u0001');
  const candidates = useMemo(
    () => (candidateKey ? candidateKey.split('\u0001') : []),
    [candidateKey]
  );
  const [failedCandidates, setFailedCandidates] = useState<string[]>([]);

  useEffect(() => {
    setFailedCandidates((current) => {
      const next = current.filter((candidate) => candidates.includes(candidate));

      return next.length === current.length ? current : next;
    });
  }, [candidates]);

  const activeAvatar =
    candidates.find((candidate) => !failedCandidates.includes(candidate)) ?? null;

  return (
    <div className={className}>
      {activeAvatar ? (
        <img
          key={activeAvatar}
          src={activeAvatar}
          alt={fullName ? `${fullName} profile photo` : 'Workspace owner profile photo'}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => {
            setFailedCandidates((current) =>
              current.includes(activeAvatar) ? current : [...current, activeAvatar]
            );
          }}
        />
      ) : (
        <span className="profile-avatar__fallback" aria-hidden="true">
          <span className="profile-avatar__fallback-initials">
            {getProfileInitials(fullName)}
          </span>
        </span>
      )}
    </div>
  );
};
