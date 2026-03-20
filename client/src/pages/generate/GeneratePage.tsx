import { useState } from 'react';
import { BackgroundSelector } from '../../components/generate/BackgroundSelector';
import { CaptionList } from '../../components/generate/CaptionList';
import { GeneratedImage } from '../../components/generate/GeneratedImage';
import { HashtagDisplay } from '../../components/generate/HashtagDisplay';
import { ProductUploadForm } from '../../components/generate/ProductUploadForm';
import { ReelScript } from '../../components/generate/ReelScript';
import { RegenerateButton } from '../../components/generate/RegenerateButton';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Card } from '../../components/ui/card';
import {
  CONTENT_GOAL_OPTIONS,
  CONTENT_PLATFORM_OPTIONS,
  CONTENT_TONE_OPTIONS,
} from '../../lib/constants';
import { splitKeywords } from '../../lib/utils';
import { useContent } from '../../hooks/useContent';
import { useImages } from '../../hooks/useImages';

export const GeneratePage = () => {
  const content = useContent();
  const images = useImages();
  const [keywordInput, setKeywordInput] = useState(
    'streetwear, hoodie, minimal fashion'
  );
  const [contentForm, setContentForm] = useState({
    productName: 'Minimal Black Oversized Hoodie',
    productDescription:
      'A soft premium cotton oversized hoodie for everyday streetwear looks.',
    platform: 'Instagram',
    goal: 'Drive product discovery and clicks',
    tone: 'Trendy and persuasive',
    audience: 'College students and young professionals',
  });
  const [imageForm, setImageForm] = useState({
    productName: 'Black Oversized Hoodie',
    productDescription: 'Premium cotton hoodie',
    backgroundStyle: 'Clean studio background',
    sourceImageUrl: '',
  });

  const submitContent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await content.generate({
      ...contentForm,
      keywords: splitKeywords(keywordInput),
    });
  };

  const submitImage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await images.generate({
      ...imageForm,
      width: 768,
      height: 768,
      sourceImageUrl: imageForm.sourceImageUrl || undefined,
    });
  };

  return (
    <div className="page-stack">
      <div className="generate-grid">
        <div className="page-stack">
          <ProductUploadForm
            eyebrow="Content engine"
            title="Generate caption systems"
            description="The copy flow stays restrained: briefing in, three captions out, plus hashtags and a reel script."
            submitLabel="Generate content"
            busy={content.isGenerating}
            onSubmit={submitContent}
            footer={
              content.activeContent ? (
                <RegenerateButton
                  disabled={content.isGenerating}
                  onClick={() => {
                    void content.generate({
                      ...contentForm,
                      keywords: splitKeywords(keywordInput),
                    });
                  }}
                />
              ) : null
            }
          >
            <Input
              label="Product name"
              value={contentForm.productName}
              onChange={(event) =>
                setContentForm((current) => ({
                  ...current,
                  productName: event.target.value,
                }))
              }
              required
            />
            <label className="field">
              <span className="field__label">Product description</span>
              <textarea
                className="field__control field__control--textarea"
                value={contentForm.productDescription}
                onChange={(event) =>
                  setContentForm((current) => ({
                    ...current,
                    productDescription: event.target.value,
                  }))
                }
                rows={4}
              />
            </label>
            <Select
              label="Platform"
              value={contentForm.platform}
              onChange={(event) =>
                setContentForm((current) => ({
                  ...current,
                  platform: event.target.value,
                }))
              }
            >
              {CONTENT_PLATFORM_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </Select>
            <Select
              label="Goal"
              value={contentForm.goal}
              onChange={(event) =>
                setContentForm((current) => ({
                  ...current,
                  goal: event.target.value,
                }))
              }
            >
              {CONTENT_GOAL_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </Select>
            <Select
              label="Tone"
              value={contentForm.tone}
              onChange={(event) =>
                setContentForm((current) => ({
                  ...current,
                  tone: event.target.value,
                }))
              }
            >
              {CONTENT_TONE_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </Select>
            <Input
              label="Audience"
              value={contentForm.audience}
              onChange={(event) =>
                setContentForm((current) => ({
                  ...current,
                  audience: event.target.value,
                }))
              }
            />
            <label className="field field--full">
              <span className="field__label">Keywords</span>
              <input
                className="field__control"
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                placeholder="comma separated"
              />
            </label>
          </ProductUploadForm>

          <ProductUploadForm
            eyebrow="Image engine"
            title="Generate product visuals"
            description="Pixazo is primary right now, AIMLAPI is standing by as fallback. The UI keeps that complexity out of the way."
            submitLabel="Generate image"
            busy={images.isGenerating}
            onSubmit={submitImage}
            footer={
              images.activeImage ? (
                <RegenerateButton
                  disabled={images.isGenerating}
                  onClick={() => {
                    void images.generate({
                      ...imageForm,
                      width: 768,
                      height: 768,
                      sourceImageUrl: imageForm.sourceImageUrl || undefined,
                    });
                  }}
                />
              ) : null
            }
          >
            <Input
              label="Product name"
              value={imageForm.productName}
              onChange={(event) =>
                setImageForm((current) => ({
                  ...current,
                  productName: event.target.value,
                }))
              }
              required
            />
            <Input
              label="Product description"
              value={imageForm.productDescription}
              onChange={(event) =>
                setImageForm((current) => ({
                  ...current,
                  productDescription: event.target.value,
                }))
              }
            />
            <label className="field field--full">
              <span className="field__label">Background style</span>
              <BackgroundSelector
                value={imageForm.backgroundStyle}
                onChange={(value) =>
                  setImageForm((current) => ({
                    ...current,
                    backgroundStyle: value,
                  }))
                }
              />
            </label>
            <label className="field field--full">
              <span className="field__label">Optional source image URL</span>
              <input
                className="field__control"
                value={imageForm.sourceImageUrl}
                onChange={(event) =>
                  setImageForm((current) => ({
                    ...current,
                    sourceImageUrl: event.target.value,
                  }))
                }
                placeholder="https://..."
              />
            </label>
          </ProductUploadForm>
        </div>

        <div className="page-stack">
          <Card className="generate-preview">
            <div className="generate-preview__header">
              <div>
                <p className="section-eyebrow">Live output</p>
                <h3>Generation studio</h3>
              </div>
            </div>

            {content.isGenerating || images.isGenerating ? (
              <div className="generate-preview__loading">
                <LoadingSpinner
                  label={content.isGenerating ? 'Generating copy' : 'Generating image'}
                />
              </div>
            ) : null}

            <ErrorMessage message={content.error || images.error} />

            {content.activeContent ? (
              <div className="page-stack">
                <CaptionList captions={content.activeContent.captions} />
                <HashtagDisplay hashtags={content.activeContent.hashtags} />
                <ReelScript script={content.activeContent.reelScript} />
              </div>
            ) : (
              <EmptyState
                title="No active copy pack"
                description="Generate content from the left panel and the polished output will appear here."
              />
            )}

            {images.activeImage ? (
              <GeneratedImage image={images.activeImage} />
            ) : (
              <EmptyState
                title="No active image"
                description="Run the image generator and the latest visual will show up here with a direct preview."
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
