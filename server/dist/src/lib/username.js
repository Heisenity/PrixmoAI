"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmailLocalPart = exports.isValidNormalizedUsername = exports.normalizeUsername = void 0;
const USERNAME_MAX_LENGTH = 30;
const normalizeUsername = (value) => value
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9._]/g, '')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, USERNAME_MAX_LENGTH);
exports.normalizeUsername = normalizeUsername;
const isValidNormalizedUsername = (value) => /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/.test(value);
exports.isValidNormalizedUsername = isValidNormalizedUsername;
const getEmailLocalPart = (email) => (email ?? '').split('@')[0]?.trim() ?? '';
exports.getEmailLocalPart = getEmailLocalPart;
