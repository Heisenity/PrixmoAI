import assert from 'node:assert/strict';
import test from 'node:test';
import { getHealthPayload } from '../lib/health';
import { isAuthorizedCronHeader } from '../lib/cronAuth';
import { handleProcessScheduledPosts } from '../routes/internal.routes';

const createMockResponse = () => {
  let statusCode = 200;
  let payload: unknown = null;

  return {
    res: {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(value: unknown) {
        payload = value;
        return this;
      },
    },
    result: () => ({ statusCode, payload }),
  };
};

test('health endpoint payload is safe and healthy', async () => {
  const payload = getHealthPayload();

  assert.equal(payload.status, 'healthy');
  assert.equal(payload.service, 'prixmoai-backend');
  assert.equal(typeof payload.timestamp, 'string');
  assert.equal('environment' in payload, false);
});

test('cron authorization rejects missing and incorrect secrets', () => {
  assert.equal(isAuthorizedCronHeader(undefined, 'expected-secret'), false);
  assert.equal(isAuthorizedCronHeader('Bearer wrong-secret', 'expected-secret'), false);
  assert.equal(isAuthorizedCronHeader('Basic expected-secret', 'expected-secret'), false);
});

test('cron authorization accepts the correct bearer secret', () => {
  assert.equal(isAuthorizedCronHeader('Bearer expected-secret', 'expected-secret'), true);
  assert.equal(isAuthorizedCronHeader('Bearer expected-secret', ' expected-secret\n'), true);
});

test('internal scheduler endpoint rejects missing credentials', async () => {
  let processed = false;
  const mock = createMockResponse();

  await handleProcessScheduledPosts({
    header: () => undefined,
    originalUrl: '/api/internal/process-scheduled-posts',
    ip: '127.0.0.1',
  }, mock.res, {
    isAuthorized: (header) => isAuthorizedCronHeader(header, 'expected-secret'),
    processScheduledPosts: async () => {
      processed = true;
      return { checked: 0, claimed: 0, recovered: 0, durationMs: 0 };
    },
  });
  const { statusCode, payload } = mock.result() as {
    statusCode: number;
    payload: Record<string, unknown>;
  };

  assert.equal(statusCode, 401);
  assert.equal(payload.success, false);
  assert.equal(payload.message, 'Unauthorized');
  assert.equal(processed, false);
});

test('internal scheduler endpoint rejects an incorrect secret', async () => {
  let processed = false;
  const mock = createMockResponse();

  await handleProcessScheduledPosts({
    header: () => 'Bearer wrong-secret',
    originalUrl: '/api/internal/process-scheduled-posts',
    ip: '127.0.0.1',
  }, mock.res, {
    isAuthorized: (header) => isAuthorizedCronHeader(header, 'expected-secret'),
    processScheduledPosts: async () => {
      processed = true;
      return { checked: 0, claimed: 0, recovered: 0, durationMs: 0 };
    },
  });
  const { statusCode } = mock.result();

  assert.equal(statusCode, 401);
  assert.equal(processed, false);
});

test('internal scheduler endpoint accepts the correct secret without leaking it', async () => {
  const mock = createMockResponse();

  await handleProcessScheduledPosts({
    header: () => 'Bearer expected-secret',
    originalUrl: '/api/internal/process-scheduled-posts',
    ip: '127.0.0.1',
  }, mock.res, {
    isAuthorized: (header) => isAuthorizedCronHeader(header, 'expected-secret'),
    processScheduledPosts: async () => ({
      checked: 1,
      claimed: 1,
      recovered: 0,
      durationMs: 2,
    }),
  });
  const { statusCode, payload: responsePayload } = mock.result();
  const text = JSON.stringify(responsePayload);
  const payload = JSON.parse(text) as Record<string, unknown>;

  assert.equal(statusCode, 200);
  assert.equal(payload.success, true);
  assert.equal(text.includes('expected-secret'), false);
});
