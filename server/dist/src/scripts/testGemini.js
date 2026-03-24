"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const gemini_1 = require("../ai/gemini");
const sampleBrandProfile = {
    id: 'sample-brand-profile',
    userId: 'sample-user',
    fullName: 'PrixmoAI',
    phoneNumber: '+91 98765 43210',
    username: 'prixmoai',
    avatarUrl: null,
    industry: 'Fashion',
    targetAudience: 'Young adults shopping online',
    brandVoice: 'Modern, confident, and friendly',
    description: 'An AI-first fashion brand that helps people create stylish social media content fast.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};
const sampleProductInput = {
    productName: 'Minimal Black Oversized Hoodie',
    productDescription: 'A soft premium cotton oversized hoodie for everyday streetwear looks.',
    platform: 'Instagram',
    goal: 'Drive product discovery and clicks',
    tone: 'Trendy and persuasive',
    audience: 'College students and young professionals',
    keywords: ['streetwear', 'hoodie', 'minimal fashion'],
};
const main = async () => {
    console.log('Testing Gemini content generation...');
    const contentPack = await (0, gemini_1.generateContentPack)(sampleBrandProfile, sampleProductInput);
    console.log(JSON.stringify(contentPack, null, 2));
};
main().catch((error) => {
    console.error('Gemini test failed:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
