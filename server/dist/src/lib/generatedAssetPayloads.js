"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGeneratedContentFilePayload = void 0;
const buildGeneratedContentFilePayload = ({ userId, provider, brandProfileId = null, conversationId = null, productInput, contentPack, reelScriptIncluded, }) => ({
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
exports.buildGeneratedContentFilePayload = buildGeneratedContentFilePayload;
