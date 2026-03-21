import { Sparkles, WandSparkles, ImagePlus } from 'lucide-react';
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

  const recentContent = content.history?.items.slice(0, 3) ?? [];
  const recentImages = images.history?.items.slice(0, 3) ?? [];
  const totalContent = content.history?.total ?? 0;
  const totalImages = images.history?.total ?? 0;

  return (
    <div className="page-stack">
      <Card className="app-hero-card">
        <div className="app-hero-card__copy">
          <p className="section-eyebrow">Creative pipeline</p>
          <h2>Generate copy packs and product visuals from one shared brief.</h2>
          <p>
            Build the caption, hashtag, reel, and image flow in one pass, then use the
            strongest output immediately across the rest of the workspace.
          </p>
        </div>
        <div className="app-hero-card__stats">
          <div className="app-hero-card__metric">
            <span>Content packs</span>
            <strong>{totalContent}</strong>
            <small>Generated so far</small>
          </div>
          <div className="app-hero-card__metric">
            <span>Images</span>
            <strong>{totalImages}</strong>
            <small>Latest visual history</small>
          </div>
          <div className="app-hero-card__metric">
            <span>Workspace mode</span>
            <strong>{content.activeContent || images.activeImage ? 'Live' : 'Ready'}</strong>
            <small>Waiting for your next brief</small>
          </div>
        </div>
      </Card>

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

          <Card className="dashboard-panel activity-panel">
            <div className="dashboard-panel__header">
              <div>
                <p className="section-eyebrow">Recent generation activity</p>
                <h3>What is already available in this workspace</h3>
              </div>
            </div>
            <div className="activity-panel__grid">
              <div className="activity-panel__column">
                <div className="activity-panel__heading">
                  <Sparkles size={16} />
                  <strong>Content history</strong>
                </div>
                {recentContent.length ? (
                  <div className="stack-list">
                    {recentContent.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="stack-list__item stack-list__item--interactive"
                        onClick={() => content.setActiveContent(item)}
                      >
                        <strong>{item.productName}</strong>
                        <span>{item.platform || 'Unspecified platform'}</span>
                        <small>{item.captions.length} captions ready</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No content history yet"
                    description="Generate your first caption pack and it will appear here for quick reuse."
                  />
                )}
              </div>

              <div className="activity-panel__column">
                <div className="activity-panel__heading">
                  <ImagePlus size={16} />
                  <strong>Image history</strong>
                </div>
                {recentImages.length ? (
                  <div className="image-strip">
                    {recentImages.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="image-strip__item"
                        onClick={() => images.setActiveImage(item)}
                      >
                        <img src={item.generatedImageUrl} alt={item.backgroundStyle || item.id} />
                        <span>{item.provider || 'image'}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No images generated yet"
                    description="Once you create product visuals, the latest image set will appear here."
                  />
                )}
              </div>
            </div>
          </Card>
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

          <Card className="dashboard-panel output-note-panel">
            <div className="dashboard-panel__header">
              <div>
                <p className="section-eyebrow">Operational notes</p>
                <h3>What this page is optimised for</h3>
              </div>
            </div>
            <div className="stack-list">
              <div className="stack-list__item">
                <strong>Fast input</strong>
                <span>Brief once, then reuse the active content pack and image directly across the app.</span>
              </div>
              <div className="stack-list__item">
                <strong>Memory alignment</strong>
                <span>Your onboarding profile still shapes the tone, audience fit, and content framing here.</span>
              </div>
              <div className="stack-list__item">
                <strong>Best next step</strong>
                <span>After generation, move straight into Scheduler or Billing depending on your workflow stage.</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
