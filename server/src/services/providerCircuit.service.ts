import {
  IMAGE_PROVIDER_FAILURE_THRESHOLD,
  IMAGE_PROVIDER_OPEN_MS,
} from '../config/constants';

type ProviderCircuitState = {
  failures: number;
  expiresAt: number;
  openUntil: number;
};

const providerCircuits = new Map<string, ProviderCircuitState>();

const getCircuitKey = (scope: string, provider: string) => `${scope}:${provider}`;

const getActiveCircuitState = (scope: string, provider: string) => {
  const key = getCircuitKey(scope, provider);
  const currentState = providerCircuits.get(key);

  if (!currentState) {
    return null;
  }

  if (currentState.expiresAt <= Date.now()) {
    providerCircuits.delete(key);
    return null;
  }

  return currentState;
};

export const isProviderCircuitOpen = async (
  scope: string,
  provider: string
) => {
  const currentState = getActiveCircuitState(scope, provider);

  return Boolean(currentState && currentState.openUntil > Date.now());
};

export const recordProviderCircuitSuccess = async (
  scope: string,
  provider: string
) => {
  providerCircuits.delete(getCircuitKey(scope, provider));
};

export const recordProviderCircuitFailure = async (
  scope: string,
  provider: string
) => {
  const key = getCircuitKey(scope, provider);
  const currentState = getActiveCircuitState(scope, provider);
  const failures = (currentState?.failures ?? 0) + 1;
  const nextState: ProviderCircuitState = {
    failures,
    expiresAt: Date.now() + IMAGE_PROVIDER_OPEN_MS,
    openUntil:
      failures >= IMAGE_PROVIDER_FAILURE_THRESHOLD
        ? Date.now() + IMAGE_PROVIDER_OPEN_MS
        : currentState?.openUntil ?? 0,
  };

  providerCircuits.set(key, nextState);
};
