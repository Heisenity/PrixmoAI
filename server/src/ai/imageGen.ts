import dotenv from 'dotenv';
import type { GenerateImageInput } from '../schemas/image.schema';

dotenv.config();

export type GeneratedImageResult = {
  imageUrl: string;
  provider: 'disabled';
  promptUsed: string;
};

const buildImagePrompt = (input: GenerateImageInput): string => {
  if (input.prompt) {
    return input.prompt.trim();
  }

  const parts = [
    `Create a polished ecommerce product image for ${input.productName}.`,
    input.productDescription
      ? `Product details: ${input.productDescription}.`
      : null,
    input.backgroundStyle
      ? `Background style: ${input.backgroundStyle}.`
      : 'Background style: clean studio lighting with modern premium aesthetics.',
    'Keep the product in focus and make the final image social-media ready.',
  ];

  return parts.filter(Boolean).join(' ');
};

export const generateProductImage = async (
  input: GenerateImageInput
): Promise<GeneratedImageResult> => {
  const promptUsed = buildImagePrompt(input);

  throw new Error(
    `Image generation is currently disabled. Generated prompt was: ${promptUsed}`
  );
};
