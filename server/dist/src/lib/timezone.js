"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIstHour = exports.getIstDayOfWeek = exports.getIstDayWindow = exports.getIstMonthWindow = exports.addIstDays = exports.startOfIstDay = exports.formatIstTimestamp = exports.IST_TIME_ZONE = void 0;
exports.IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MINUTES = 5.5 * 60;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;
const toIstShiftedDate = (value) => new Date(value.getTime() + IST_OFFSET_MS);
const formatIstTimestamp = (value = new Date()) => new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: true,
    timeZone: exports.IST_TIME_ZONE,
}).format(value);
exports.formatIstTimestamp = formatIstTimestamp;
const startOfIstDay = (value) => {
    const istDate = toIstShiftedDate(value);
    return new Date(Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), istDate.getUTCDate()) -
        IST_OFFSET_MS);
};
exports.startOfIstDay = startOfIstDay;
const addIstDays = (value, days) => {
    const istDate = toIstShiftedDate(value);
    return new Date(Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), istDate.getUTCDate() + days) - IST_OFFSET_MS);
};
exports.addIstDays = addIstDays;
const getIstMonthWindow = (value = new Date()) => {
    const istDate = toIstShiftedDate(value);
    const start = new Date(Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), 1) - IST_OFFSET_MS);
    const end = new Date(Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth() + 1, 1) -
        IST_OFFSET_MS);
    return {
        start: start.toISOString(),
        end: end.toISOString(),
    };
};
exports.getIstMonthWindow = getIstMonthWindow;
const getIstDayWindow = (value = new Date()) => {
    const start = (0, exports.startOfIstDay)(value);
    const end = (0, exports.addIstDays)(start, 1);
    return {
        start: start.toISOString(),
        end: end.toISOString(),
    };
};
exports.getIstDayWindow = getIstDayWindow;
const getIstDayOfWeek = (value) => toIstShiftedDate(value).getUTCDay();
exports.getIstDayOfWeek = getIstDayOfWeek;
const getIstHour = (value) => toIstShiftedDate(value).getUTCHours();
exports.getIstHour = getIstHour;
