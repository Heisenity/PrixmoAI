"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordProviderCircuitFailure = exports.recordProviderCircuitSuccess = exports.isProviderCircuitOpen = void 0;
const constants_1 = require("../config/constants");
const providerCircuits = new Map();
const getCircuitKey = (scope, provider) => `${scope}:${provider}`;
const getActiveCircuitState = (scope, provider) => {
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
const isProviderCircuitOpen = async (scope, provider) => {
    const currentState = getActiveCircuitState(scope, provider);
    return Boolean(currentState && currentState.openUntil > Date.now());
};
exports.isProviderCircuitOpen = isProviderCircuitOpen;
const recordProviderCircuitSuccess = async (scope, provider) => {
    providerCircuits.delete(getCircuitKey(scope, provider));
};
exports.recordProviderCircuitSuccess = recordProviderCircuitSuccess;
const recordProviderCircuitFailure = async (scope, provider) => {
    const key = getCircuitKey(scope, provider);
    const currentState = getActiveCircuitState(scope, provider);
    const failures = (currentState?.failures ?? 0) + 1;
    const nextState = {
        failures,
        expiresAt: Date.now() + constants_1.IMAGE_PROVIDER_OPEN_MS,
        openUntil: failures >= constants_1.IMAGE_PROVIDER_FAILURE_THRESHOLD
            ? Date.now() + constants_1.IMAGE_PROVIDER_OPEN_MS
            : currentState?.openUntil ?? 0,
    };
    providerCircuits.set(key, nextState);
};
exports.recordProviderCircuitFailure = recordProviderCircuitFailure;
