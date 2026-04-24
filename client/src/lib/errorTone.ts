const cleanMessage = (message: string) => message.trim().replace(/\s+/g, ' ');

const extractRetrySeconds = (message: string) => {
  const patterns = [
    /(?:wait|give it)\s+(\d+)\s*s/i,
    /(\d+)\s*seconds?/i,
    /retry(?:-after)?[^0-9]*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (!match) {
      continue;
    }

    const seconds = Number(match[1]);

    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds;
    }
  }

  return null;
};

export const getPlayfulErrorCode = (message?: string | null) => {
  if (!message) {
    return null;
  }

  const normalized = cleanMessage(message).toLowerCase();

  if (!normalized) {
    return null;
  }

  if (/username exists|username already exists|username is already taken/i.test(normalized)) {
    return 'PRX-VAL-409';
  }

  if (
    /unable to reach|failed to fetch|networkerror|load failed|server at .*api/i.test(
      normalized
    )
  ) {
    return 'PRX-NET-001';
  }

  if (/unauthorized|sign in again|session|auth token|login required/i.test(normalized)) {
    return 'PRX-AUTH-401';
  }

  if (
    /too many|429|requests per minute|retry-after|rate limit|limit exceeded/i.test(
      normalized
    )
  ) {
    return 'PRX-RATE-429';
  }

  if (/timed out|taking longer than expected|took too long|timeout/i.test(normalized)) {
    return 'PRX-TIME-408';
  }

  if (
    /high demand|temporarily unavailable|service unavailable|503|provider unavailable|try again in a moment/i.test(
      normalized
    )
  ) {
    return 'PRX-AI-503';
  }

  if (/only jpg, png, webp, mp4, and mov|only jpg, png, and webp/i.test(normalized)) {
    return 'PRX-UPLD-415';
  }

  if (/too_big|too large|exceeds|file size|payload too large/i.test(normalized)) {
    return 'PRX-UPLD-413';
  }

  if (
    /valid profile|profile url|valid .* url|add a valid profile id|choose the facebook page|at least one field is required/i.test(
      normalized
    )
  ) {
    return 'PRX-VAL-400';
  }

  if (
    /invalid |use a valid|please enter a valid|add a valid|only pending or scheduled posts can be|missing/i.test(
      normalized
    )
  ) {
    return 'PRX-VAL-422';
  }

  if (
    /failed to save|failed to update|failed to rename|failed to create|failed to start/i.test(
      normalized
    )
  ) {
    return 'PRX-SAVE-500';
  }

  if (
    /failed to upload|failed to import|failed to resolve|failed to prepare that media asset/i.test(
      normalized
    )
  ) {
    return 'PRX-UPLD-500';
  }

  if (/failed to generate|generate issue|provider did not return valid json|unexpected format/i.test(normalized)) {
    return 'PRX-AI-422';
  }

  if (/failed to load|could not load|couldn’t load/i.test(normalized)) {
    return 'PRX-LOAD-500';
  }

  return 'PRX-GEN-500';
};

export const getPlayfulErrorMessage = (message?: string | null) => {
  if (!message) {
    return null;
  }

  const normalized = cleanMessage(message);

  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();
  const retrySeconds = extractRetrySeconds(normalized);

  if (/request cancelled by user|cancelled by user|job cancellation requested/i.test(lower)) {
    return 'Request cancelled.';
  }

  if (
    /unable to reach|failed to fetch|networkerror|load failed|server at .*api/i.test(lower)
  ) {
    return 'Unable to reach the server. Please refresh and try again.';
  }

  if (/unauthorized|sign in again|session|auth token|login required/i.test(lower)) {
    return 'Your session ended. Sign in again.';
  }

  if (
    /too many|429|requests per minute|retry-after|rate limit|limit exceeded/i.test(lower)
  ) {
    return retrySeconds
      ? `Too many requests. Wait ${retrySeconds}s and try again.`
      : 'Too many requests. Please wait a moment and try again.';
  }

  if (/timed out|taking longer than expected|took too long|timeout/i.test(lower)) {
    return 'This request timed out. Please try again.';
  }

  if (
    /high demand|temporarily unavailable|service unavailable|503|provider unavailable|try again in a moment/i.test(
      lower
    )
  ) {
    return 'AI is temporarily unavailable. Please try again in a moment.';
  }

  if (/conversation.*no longer available|conversation not found|thread/i.test(lower)) {
    return 'This conversation is no longer available. Start a new one.';
  }

  if (/image-to-image|reference image/i.test(lower)) {
    return 'Reference image support is unavailable right now. Try again without it or use another image.';
  }

  if (/brief is too long|prompt is too long|maximum|too_big/i.test(lower)) {
    return 'This prompt is too long. Shorten it and try again.';
  }

  if (/not found|no longer available|expired|start again|selection has expired/i.test(lower)) {
    return 'This item is no longer available. Refresh and try again.';
  }

  if (
    /supabase env is missing|client supabase env is missing|set supabase_url|keys are missing|not configured/i.test(
      lower
    )
  ) {
    return 'A required app configuration key is missing.';
  }

  if (/already have an active .* subscription|already unlocked that plan/i.test(lower)) {
    return 'This plan is already active on your account.';
  }

  if (/no paid subscription found to cancel/i.test(lower)) {
    return 'There is no paid subscription to cancel.';
  }

  if (/no razorpay subscription id available to sync/i.test(lower)) {
    return 'No billing subscription was found to sync. Refresh and try again.';
  }

  if (/meta|facebook|instagram|oauth|page selection|reconnect/i.test(lower)) {
    return 'The Meta connection needs to be reconnected. Please try again.';
  }

  if (/only jpg, png, webp, mp4, and mov/i.test(lower)) {
    return 'Only JPG, PNG, WEBP, MP4, and MOV files are supported.';
  }

  if (/too_big|too large|exceeds|file size|payload too large/i.test(lower)) {
    return 'This file is too large. Reduce the size and try again.';
  }

  if (
    /invalid media url|unable to download media|no preview available|upload payload is not a valid media data url/i.test(
      lower
    )
  ) {
    return 'This media link is invalid. Try another file or URL.';
  }

  if (/uploaded media is empty|did not return an image|invalid image url|unsupported image url/i.test(lower)) {
    return 'This uploaded file could not be used. Try another one.';
  }

  if (/failed to read media file|failed to read image file/i.test(lower)) {
    return 'Failed to read this file. Re-upload it and try again.';
  }

  if (
    /failed to load|could not load|couldn’t load|failed to fetch|load image history|load content history/i.test(
      lower
    )
  ) {
    return 'Unable to load this screen. Please refresh and try again.';
  }

  if (
    /failed to save|failed to update|failed to rename|failed to create|failed to start/i.test(
      lower
    )
  ) {
    return 'Failed to save. Please try again.';
  }

  if (/failed to delete/i.test(lower)) {
    return 'Failed to delete. Please try again.';
  }

  if (
    /failed to upload|failed to import|failed to resolve|failed to prepare that media asset/i.test(
      lower
    )
  ) {
    return 'Failed to upload media. Please try again.';
  }

  if (/failed to sign in|failed to create account|failed to reset|failed to resend/i.test(lower)) {
    return 'Authentication failed. Please try again.';
  }

  if (/failed to generate|generate issue|provider did not return valid json|unexpected format/i.test(lower)) {
    return 'Failed to generate content right now. Please try again.';
  }

  return normalized;
};

export const getPlayfulErrorTitle = (title?: string | null, message?: string | null) => {
  const normalizedTitle = title ? cleanMessage(title) : '';

  if (normalizedTitle) {
    if (/something went wrong|action failed|error|issue/i.test(normalizedTitle.toLowerCase())) {
      return 'Something went wrong';
    }

    if (/couldn.?t load|failed to load/i.test(normalizedTitle.toLowerCase())) {
      return 'Unable to load';
    }

    return normalizedTitle;
  }

  if (message && /request cancelled by user|cancelled by user/i.test(message.toLowerCase())) {
    return 'Request cancelled';
  }

  if (message && /failed to load|could not load|couldn’t load/i.test(message.toLowerCase())) {
    return 'Unable to load';
  }

  return 'Something went wrong';
};
