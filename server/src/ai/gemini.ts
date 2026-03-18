type BrandProfileContext = {
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

type GenerateCaptionParams = {
  prompt: string;
  type: string | null;
  tone: string | null;
  platform: string | null;
  brandProfile: BrandProfileContext | null;
};

type GeminiPart = {
  text: string;
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[];
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const buildCaptionPrompt = ({
  prompt,
  type,
  tone,
  platform,
  brandProfile,
}: GenerateCaptionParams) => {
  const brandDetails = brandProfile
    ? [
        `Brand name: ${brandProfile.fullName ?? 'N/A'}`,
        `Username: ${brandProfile.username ?? 'N/A'}`,
      ].join('\n')
    : 'No saved brand profile available.';

  return [
    'You are a social media caption generator.',
    'Create a single polished caption based on the following request.',
    'Return only the final caption text.',
    '',
    brandDetails,
    `Prompt: ${prompt}`,
    `Content type: ${type ?? 'general'}`,
    `Tone: ${tone ?? 'not specified'}`,
    `Platform: ${platform ?? 'not specified'}`,
  ].join('\n');
};

export const generateCaption = async (
  params: GenerateCaptionParams
): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: buildCaptionPrompt(params),
              },
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Caption generation request failed');
  }

  const data = (await response.json()) as GeminiResponse;
  const caption = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .join('\n')
    .trim();

  if (!caption) {
    throw new Error('Caption generator returned an empty response');
  }

  return caption;
};
