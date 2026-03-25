import { generateContentPack } from '../ai/gemini';
import type { BrandProfile, ProductInput } from '../types';

const sampleBrandProfile: BrandProfile = {
  id: 'sample-brand-profile',
  userId: 'sample-user',
  brandName: 'PrixmoAI',
  fullName: 'PrixmoAI',
  phoneNumber: '+91 98765 43210',
  username: 'prixmoai',
  avatarUrl: null,
  industry: 'Education technology',
  targetAudience: 'Busy founders and small business teams',
  brandVoice: 'Modern, confident, and practical',
  description:
    'An AI workspace that helps businesses create polished marketing content quickly.',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const sampleProductInput: ProductInput = {
  brandName: 'PrixmoAI',
  useBrandName: true,
  productName: 'AI onboarding workshop',
  productDescription:
    'A live training session that helps small teams learn how to use AI tools in daily operations.',
  platform: 'LinkedIn',
  goal: 'Build brand recall',
  tone: 'Refined and modern',
  audience: 'Operations leads and business owners',
  keywords: ['AI training', 'team productivity', 'workflow automation'],
};

const main = async () => {
  console.log('Testing Gemini content generation...');

  const contentPack = await generateContentPack(
    sampleBrandProfile,
    sampleProductInput
  );

  console.log(JSON.stringify(contentPack, null, 2));
};

main().catch((error: unknown) => {
  console.error('Gemini test failed:');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
