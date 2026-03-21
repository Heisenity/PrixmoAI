import { buttonClassName } from '../ui/button';
import { ProviderLogo } from './ProviderLogo';

type AuthProvider = 'google' | 'github' | 'facebook';

export const AuthProviderButton = ({
  provider,
  label,
  busyLabel,
  busy,
  disabled,
  onClick,
}: {
  provider: AuthProvider;
  label: string;
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    className={buttonClassName('secondary', 'lg', 'auth-provider-button')}
    disabled={disabled || busy}
    onClick={onClick}
  >
    <ProviderLogo
      provider={provider}
      className="auth-provider-button__icon"
    />
    <span>{busy ? busyLabel || `Connecting ${label}...` : label}</span>
  </button>
);
