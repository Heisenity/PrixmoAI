export const IST_TIME_ZONE = 'Asia/Kolkata';

const IST_OFFSET_MINUTES = 5.5 * 60;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

const toIstShiftedDate = (value: Date) => new Date(value.getTime() + IST_OFFSET_MS);

export const formatIstTimestamp = (value = new Date()) =>
  new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: true,
    timeZone: IST_TIME_ZONE,
  }).format(value);

export const startOfIstDay = (value: Date) => {
  const istDate = toIstShiftedDate(value);

  return new Date(
    Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), istDate.getUTCDate()) -
      IST_OFFSET_MS
  );
};

export const addIstDays = (value: Date, days: number) => {
  const istDate = toIstShiftedDate(value);

  return new Date(
    Date.UTC(
      istDate.getUTCFullYear(),
      istDate.getUTCMonth(),
      istDate.getUTCDate() + days
    ) - IST_OFFSET_MS
  );
};

export const getIstMonthWindow = (value = new Date()) => {
  const istDate = toIstShiftedDate(value);

  const start = new Date(
    Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), 1) - IST_OFFSET_MS
  );
  const end = new Date(
    Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth() + 1, 1) -
      IST_OFFSET_MS
  );

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

export const getIstDayWindow = (value = new Date()) => {
  const start = startOfIstDay(value);
  const end = addIstDays(start, 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

export const getIstDayOfWeek = (value: Date) => toIstShiftedDate(value).getUTCDay();

export const getIstHour = (value: Date) => toIstShiftedDate(value).getUTCHours();
