const ALREADY_PLAYFUL_PATTERN =
  /bestie|low-key|vibe check|plot twist|ghosting|booked and busy|not passing the vibe check|main character|soft launch|chaos/i;

const cleanMessage = (message: string) => message.trim().replace(/\s+/g, ' ');

const stripTrailingPeriod = (message: string) => message.replace(/[.!?]+$/, '');

const lowerFirst = (message: string) =>
  message ? `${message.charAt(0).toLowerCase()}${message.slice(1)}` : message;

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

const toValidationMessage = (message: string) =>
  `Tiny reality check: ${lowerFirst(stripTrailingPeriod(message))}, then we're golden.`;

export const getPlayfulErrorMessage = (message?: string | null) => {
  if (!message) {
    return null;
  }

  const normalized = cleanMessage(message);

  if (!normalized) {
    return null;
  }

  if (ALREADY_PLAYFUL_PATTERN.test(normalized)) {
    return normalized;
  }

  const lower = normalized.toLowerCase();
  const retrySeconds = extractRetrySeconds(normalized);

  if (/request cancelled by user|cancelled by user|job cancellation requested/i.test(lower)) {
    return 'Okay, we hit the brakes. Nothing weird happened, and you can jump back in whenever.';
  }

  if (
    /unable to reach|failed to fetch|networkerror|load failed|server at .*api/i.test(lower)
  ) {
    return 'PrixmoAI and the server are doing long-distance right now. Give it a quick refresh and let’s run that back.';
  }

  if (/unauthorized|sign in again|session|auth token|login required/i.test(lower)) {
    return 'Your session quietly logged off for emotional support. Sign in again and we’re back.';
  }

  if (
    /too many|429|requests per minute|retry-after|rate limit|limit exceeded/i.test(lower)
  ) {
    return retrySeconds
      ? `You’re cooking a little too fast right now. Give it ${retrySeconds}s, then run it back.`
      : 'You’re moving like the app owes you money. Tiny pause, then go again.';
  }

  if (/timed out|taking longer than expected|took too long|timeout/i.test(lower)) {
    return 'This one is moving like it missed the group chat. Give it a sec and try again.';
  }

  if (
    /high demand|temporarily unavailable|service unavailable|503|provider unavailable|try again in a moment/i.test(
      lower
    )
  ) {
    return 'The AI squad is booked and busy for a sec. Try again in a moment and we’ll sneak you back in.';
  }

  if (/conversation.*no longer available|conversation not found|thread/i.test(lower)) {
    return 'That chat dipped out of the room. Open another thread or start a fresh one.';
  }

  if (/image-to-image|reference image/i.test(lower)) {
    return 'Your reference image is giving unsupported side-quest energy right now. Try again in a bit, or remove it and go text-only.';
  }

  if (/brief is too long|prompt is too long|maximum|too_big/i.test(lower)) {
    return 'That prompt is a bit too long right now. Shorten it a little and we’re good to go.';
  }

  if (/not found|no longer available|expired|start again|selection has expired/i.test(lower)) {
    return 'That item pulled a disappearing act. Refresh once or start fresh and we’ll keep it moving.';
  }

  if (
    /supabase env is missing|client supabase env is missing|set supabase_url|keys are missing|not configured/i.test(
      lower
    )
  ) {
    return 'Dev mode plot twist: the app is missing a config key. Add the env vars and we’re back in business.';
  }

  if (/already have an active .* subscription|already unlocked that plan/i.test(lower)) {
    return 'Bestie, you already unlocked that plan. No double-dipping needed.';
  }

  if (/no paid subscription found to cancel/i.test(lower)) {
    return 'Plot twist: there isn’t a paid plan here to cancel.';
  }

  if (/no razorpay subscription id available to sync/i.test(lower)) {
    return 'We couldn’t find the billing breadcrumb for that sync. Refresh once and give it another shot.';
  }

  if (/meta|facebook|instagram|oauth|page selection|reconnect/i.test(lower)) {
    return 'Meta is being a little mysterious right now. Start that connection again and we’ll line the dots back up.';
  }

  if (/only jpg, png, webp, mp4, and mov/i.test(lower)) {
    return 'That upload is not passing the vibe check. JPG, PNG, WEBP, MP4, and MOV are the invited guests.';
  }

  if (/too_big|too large|exceeds|file size|payload too large/i.test(lower)) {
    return 'That file rolled in built like a final boss. Trim it down a bit and try again.';
  }

  if (
    /invalid media url|unable to download media|no preview available|upload payload is not a valid media data url/i.test(
      lower
    )
  ) {
    return 'That media link is being shady right now. Try another file or URL and we’ll behave.';
  }

  if (/uploaded media is empty|did not return an image|invalid image url|unsupported image url/i.test(lower)) {
    return 'That file came through with zero aura. Try another one and let’s keep it cute.';
  }

  if (/failed to read media file|failed to read image file/i.test(lower)) {
    return 'That file refused to wake up for us. Re-upload it and we’ll try again.';
  }

  if (/enter your email/i.test(lower)) {
    return 'Tiny reality check: drop your email in first so we know where to send the magic.';
  }

  if (/password/i.test(lower) && /enter|reset|confirm|match|invalid/i.test(lower)) {
    return 'Tiny reality check: the password step needs a little more love before we keep going.';
  }

  if (/add a product or offer name/i.test(lower)) {
    return 'Tiny reality check: give your product or offer a name first so we know what we’re hyping.';
  }

  if (/add image or video media before scheduling/i.test(lower)) {
    return 'Tiny reality check: we need the media first before we schedule that masterpiece.';
  }

  if (
    /valid profile|profile url|valid .* url|add a valid profile id|choose the facebook page|at least one field is required/i.test(
      lower
    )
  ) {
    return toValidationMessage(normalized);
  }

  if (
    /invalid |use a valid|please enter a valid|add a valid|only pending or scheduled posts can be|missing/i.test(
      lower
    )
  ) {
    return toValidationMessage(normalized);
  }

  if (/failed to load|could not load|couldn’t load|failed to fetch|load image history|load content history/i.test(lower)) {
    return 'That screen is being a little dramatic right now. Give it another refresh and we’ll try again.';
  }

  if (/failed to save|failed to update|failed to rename|failed to create|failed to start/i.test(lower)) {
    return 'That save move didn’t stick the landing. Hit it once more and we’ll run it back.';
  }

  if (/failed to delete/i.test(lower)) {
    return 'That delete move got stage fright. Try once more and it should behave.';
  }

  if (/failed to upload|failed to import|failed to resolve|failed to prepare that media asset/i.test(lower)) {
    return 'That media move got messy for a sec. Try again and we’ll keep it tidy this time.';
  }

  if (/failed to sign in|failed to create account|failed to reset|failed to resend/i.test(lower)) {
    return 'That login move had a tiny plot twist. Give it another go and we’ll sort it.';
  }

  if (/failed to generate|generate issue|provider did not return valid json|unexpected format/i.test(lower)) {
    return 'The AI had a brief dramatic moment and sent chaos instead of content. Try again and we’ll ask nicer.';
  }

  return 'Tiny plot twist. That move didn’t land, but the app is still on your side. Try again in a sec.';
};

export const getPlayfulErrorTitle = (title?: string | null, message?: string | null) => {
  const normalizedTitle = title ? cleanMessage(title) : '';

  if (!normalizedTitle) {
    return 'Tiny plot twist';
  }

  if (ALREADY_PLAYFUL_PATTERN.test(normalizedTitle)) {
    return normalizedTitle;
  }

  if (/something went wrong|action failed|error|issue/i.test(normalizedTitle.toLowerCase())) {
    return 'Tiny plot twist';
  }

  if (/couldn.?t load|failed to load/i.test(normalizedTitle.toLowerCase())) {
    return 'Loading had a tiny meltdown';
  }

  if (message && /request cancelled by user|cancelled by user/i.test(message.toLowerCase())) {
    return 'Brake tap moment';
  }

  return normalizedTitle;
};
