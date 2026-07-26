"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthorizedCronHeader = void 0;
const crypto_1 = require("crypto");
const constants_1 = require("../config/constants");
const hashSecret = (value) => (0, crypto_1.createHash)('sha256').update(value).digest();
const isAuthorizedCronHeader = (authorizationHeader, expectedSecret = constants_1.CRON_SECRET) => {
    const [scheme, token] = (authorizationHeader || '').split(/\s+/, 2);
    const normalizedToken = token?.trim();
    const normalizedExpectedSecret = expectedSecret.trim();
    if (scheme !== 'Bearer' || !normalizedToken || !normalizedExpectedSecret) {
        return false;
    }
    return (0, crypto_1.timingSafeEqual)(hashSecret(normalizedToken), hashSecret(normalizedExpectedSecret));
};
exports.isAuthorizedCronHeader = isAuthorizedCronHeader;
