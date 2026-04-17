export const IST_TIME_ZONE = 'Asia/Kolkata';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const IST_LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const getBrowserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || IST_TIME_ZONE;
  } catch {
    return IST_TIME_ZONE;
  }
};

export const isIndiaUserTimeZone = () => getBrowserTimeZone() === IST_TIME_ZONE;

export const getUserFacingTimeZone = () =>
  isIndiaUserTimeZone() ? IST_TIME_ZONE : getBrowserTimeZone();

const toBrowserLocalDateTimeLocalValue = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '';
  }

  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

const parseBrowserLocalDateTimeLocalValue = (value: string) => {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

export const toIstDateTimeLocalValue = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '';
  }

  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
};

export const parseIstDateTimeLocalValue = (value: string) => {
  const match = IST_LOCAL_DATE_TIME_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;

  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute)
    ) - IST_OFFSET_MS
  );
};

export const toIsoStringFromIstDateTimeLocalValue = (value: string) => {
  const date = parseIstDateTimeLocalValue(value);

  return date ? date.toISOString() : value;
};

export const toDisplayDateTimeLocalValue = (value: string | Date) =>
  isIndiaUserTimeZone()
    ? toIstDateTimeLocalValue(value)
    : toBrowserLocalDateTimeLocalValue(value);

export const parseDisplayDateTimeLocalValue = (value: string) =>
  isIndiaUserTimeZone()
    ? parseIstDateTimeLocalValue(value)
    : parseBrowserLocalDateTimeLocalValue(value);

export const toIsoStringFromDisplayDateTimeLocalValue = (value: string) => {
  const date = parseDisplayDateTimeLocalValue(value);

  return date ? date.toISOString() : value;
};
