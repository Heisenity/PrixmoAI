import { buttonClassName } from '../ui/button';
import { ProviderLogo } from './ProviderLogo';

type AuthProvider = 'google' | 'github' | 'facebook';

export const AuthProviderButton = ({
  provider,
  label,
  busyLabel,
  busy,
  disabled,
  className,
  onClick,
}: {
  provider: AuthProvider;
  label: string;
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    className={buttonClassName('secondary', 'lg', `auth-provider-button ${className ?? ''}`)}
    disabled={disabled || busy}
    onClick={onClick}
  >
    <ProviderLogo
      provider={provider}
      className="auth-provider-button__icon"
    />
    <span className="auth-provider-button__label">
      {busy ? busyLabel || `Connecting ${label}...` : label}
    </span>
  </button>
);
