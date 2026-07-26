"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthorizedCronHeader = void 0;
const crypto_1 = require("crypto");
const constants_1 = require("../config/constants");
const hashSecret = (value) => (0, crypto_1.createHash)('sha256').update(value).digest();
const isAuthorizedCronHeader = (authorizationHeader, expectedSecret = constants_1.CRON_SECRET) => {
    const [scheme, token] = (authorizationHeader || '').split(/\s+/, 2);
    if (scheme !== 'Bearer' || !token || !expectedSecret) {
        return false;
    }
    return (0, crypto_1.timingSafeEqual)(hashSecret(token), hashSecret(expectedSecret));
};
exports.isAuthorizedCronHeader = isAuthorizedCronHeader;
