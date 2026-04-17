type CancellableRequestLike = {
  once: (event: 'aborted', listener: () => void) => unknown;
  off: (event: 'aborted', listener: () => void) => unknown;
};

type CancellableResponseLike = {
  writableEnded: boolean;
  once: (event: 'close', listener: () => void) => unknown;
  off: (event: 'close', listener: () => void) => unknown;
};

const DEFAULT_REQUEST_CANCELLED_MESSAGE = 'Request cancelled by user.';

export class RequestCancelledError extends Error {
  constructor(message = DEFAULT_REQUEST_CANCELLED_MESSAGE) {
    super(message);
    this.name = 'RequestCancelledError';
  }
}

export const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

export const isRequestCancelledError = (error: unknown): boolean =>
  error instanceof RequestCancelledError;

export const throwIfRequestCancelled = (
  signal?: AbortSignal,
  message = DEFAULT_REQUEST_CANCELLED_MESSAGE
) => {
  if (signal?.aborted) {
    throw new RequestCancelledError(message);
  }
};

export const createRequestCancellation = (
  req: CancellableRequestLike,
  res: CancellableResponseLike
) => {
  const controller = new AbortController();

  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  const handleAborted = () => {
    abort();
  };

  const handleClosed = () => {
    if (!res.writableEnded) {
      abort();
    }
  };

  req.once('aborted', handleAborted);
  res.once('close', handleClosed);

  return {
    signal: controller.signal,
    cleanup: () => {
      req.off('aborted', handleAborted);
      res.off('close', handleClosed);
    },
  };
};
