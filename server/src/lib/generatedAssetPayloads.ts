import type {
  GeneratedContentPack,
  ProductInput,
} from '../types';

type BuildGeneratedContentFilePayloadInput = {
  userId: string;
  provider: string;
  brandProfileId?: string | null;
  conversationId?: string | null;
  productInput: ProductInput;
  contentPack: GeneratedContentPack;
  reelScriptIncluded: boolean;
};

export const buildGeneratedContentFilePayload = ({
  userId,
  provider,
  brandProfileId = null,
  conversationId = null,
  productInput,
  contentPack,
  reelScriptIncluded,
}: BuildGeneratedContentFilePayloadInput) => ({
  assetType: 'generated-content',
  generatedAt: new Date().toISOString(),
  userId,
  provider,
  brandProfileId,
  conversationId,
  reelScriptIncluded,
  input: {
    brandName: productInput.brandName ?? null,
    useBrandName: productInput.useBrandName ?? false,
    productName: productInput.productName,
    productDescription: productInput.productDescription ?? null,
    productImageUrl: productInput.productImageUrl ?? null,
    platform: productInput.platform ?? null,
    goal: productInput.goal ?? null,
    tone: productInput.tone ?? null,
    audience: productInput.audience ?? null,
    keywords: productInput.keywords ?? [],
  },
  output: contentPack,
});
