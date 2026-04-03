import { Eye, EyeOff, ImagePlus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ScheduledPost, SchedulerMediaType } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { MediaPreview } from './MediaPreview';
import { MediaThumbnail } from './MediaThumbnail';

const SCHEDULE_MIN_BUFFER_MS = 5_000;
const SCHEDULE_TIME_VALIDATION_MESSAGE = 'Please select a future date and time.';

const toDateTimeLocalValue = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

const getMinimumScheduleDateTimeValue = (nowMs: number) =>
  toDateTimeLocalValue(new Date(nowMs + SCHEDULE_MIN_BUFFER_MS).toISOString());

const isSchedulableDateTimeValue = (value: string, nowMs: number) => {
  const scheduledAtMs = new Date(value).getTime();

  return Number.isFinite(scheduledAtMs) && scheduledAtMs > nowMs + SCHEDULE_MIN_BUFFER_MS;
};

const isCompleteDateTimeLocalValue = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);

const getScheduleDateTimeValidationMessage = (value: string, nowMs: number) => {
  if (!value || !isCompleteDateTimeLocalValue(value)) {
    return SCHEDULE_TIME_VALIDATION_MESSAGE;
  }

  return isSchedulableDateTimeValue(value, nowMs)
    ? null
    : SCHEDULE_TIME_VALIDATION_MESSAGE;
};

const inferMediaTypeFromUrl = (value: string): SchedulerMediaType | null => {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (
    normalized.includes('.mp4') ||
    normalized.includes('.mov') ||
    normalized.includes('video/')
  ) {
    return 'video';
  }

  if (
    normalized.includes('.jpg') ||
    normalized.includes('.jpeg') ||
    normalized.includes('.png') ||
    normalized.includes('.webp') ||
    normalized.includes('image/')
  ) {
    return 'image';
  }

  return null;
};

type ScheduleModalProps = {
  post: ScheduledPost | null;
  isOpen: boolean;
  isSaving: boolean;
  isUploadingMedia: boolean;
  onClose: () => void;
  onSave: (input: {
    caption: string;
    mediaUrl: string;
    mediaType: SchedulerMediaType | null;
    scheduledFor: string;
  }) => Promise<void> | void;
  onUploadMedia: (file: File) => Promise<string>;
  onImportMediaUrl: (url: string) => Promise<{
    sourceImageUrl: string;
    mediaType: SchedulerMediaType;
  }>;
};

export const ScheduleModal = ({
  post,
  isOpen,
  isSaving,
  isUploadingMedia,
  onClose,
  onSave,
  onUploadMedia,
  onImportMediaUrl,
}: ScheduleModalProps) => {
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [mediaType, setMediaType] = useState<SchedulerMediaType | null>(null);
  const [scheduledFor, setScheduledFor] = useState('');
  const [mediaName, setMediaName] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [liveNow, setLiveNow] = useState(() => Date.now());

  useEffect(() => {
    if (!post || !isOpen) {
      return;
    }

    setCaption(post.caption || '');
    setMediaUrl(post.mediaUrl || '');
    setMediaUrlInput(post.mediaUrl || '');
    setMediaType(post.mediaType || null);
    setScheduledFor(toDateTimeLocalValue(post.scheduledFor));
    setMediaName(null);
    setIsPreviewOpen(false);
    setValidationError(null);
  }, [isOpen, post]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const interval = window.setInterval(() => {
      setLiveNow(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isOpen]);

  if (!post || !isOpen) {
    return null;
  }

  const minimumScheduleDateTime = getMinimumScheduleDateTimeValue(liveNow);
  const isScheduledTimeValid = isSchedulableDateTimeValue(scheduledFor, liveNow);
  const scheduledForValidationMessage = getScheduleDateTimeValidationMessage(
    scheduledFor,
    liveNow
  );

  const resolveMediaUrl = async () => {
    const normalized = mediaUrlInput.trim();

    if (!normalized) {
      setMediaUrl('');
      setMediaType(null);
      return {
        mediaUrl: '',
        mediaType: null as SchedulerMediaType | null,
      };
    }

    if (normalized.includes('/storage/v1/object/public/')) {
      const resolvedMediaType = mediaType ?? inferMediaTypeFromUrl(normalized);
      setMediaUrl(normalized);
      setMediaType(resolvedMediaType);
      return {
        mediaUrl: normalized,
        mediaType: resolvedMediaType,
      };
    }

    const uploaded = await onImportMediaUrl(normalized);
    setMediaUrl(uploaded.sourceImageUrl);
    setMediaUrlInput(uploaded.sourceImageUrl);
    setMediaType(uploaded.mediaType);
    setMediaName((current) => current || 'Imported from URL');
    return {
      mediaUrl: uploaded.sourceImageUrl,
      mediaType: uploaded.mediaType,
    };
  };

  return (
    <div className="generated-image-lightbox scheduler-channel-modal" role="dialog" aria-modal="true">
      <button
        type="button"
        className="generated-image-lightbox__backdrop"
        aria-label="Close edit scheduled post dialog"
        onClick={onClose}
      />
      <div className="generated-image-lightbox__panel scheduler-channel-modal__panel scheduler-edit-modal">
        <div className="scheduler-channel-modal__header">
          <div>
            <p className="section-eyebrow">Edit scheduled post</p>
            <h3>Update caption, media, or timing</h3>
          </div>
          <button
            type="button"
            className="generated-image-card__action"
            onClick={onClose}
            aria-label="Close edit scheduled post dialog"
          >
            <X size={16} />
          </button>
        </div>

        <form
          className="scheduler-edit-modal__form"
          onSubmit={async (event) => {
            event.preventDefault();
            setValidationError(null);

            if (!isSchedulableDateTimeValue(scheduledFor, Date.now())) {
              setValidationError(SCHEDULE_TIME_VALIDATION_MESSAGE);
              return;
            }

            const resolvedMedia = await resolveMediaUrl();
            await onSave({
              caption,
              mediaUrl: resolvedMedia.mediaUrl,
              mediaType: resolvedMedia.mediaType,
              scheduledFor: new Date(scheduledFor).toISOString(),
            });
          }}
        >
          <label className="field field--full">
            <span className="field__label">Caption</span>
            <textarea
              className="field__control field__control--textarea"
              rows={4}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
            />
          </label>

          <Input
            label="Scheduled for"
            type="datetime-local"
            value={scheduledFor}
            min={minimumScheduleDateTime}
            error={validationError || scheduledForValidationMessage}
            onChange={(event) => {
              const input = event.currentTarget;
              const nextValue = event.target.value;
              setScheduledFor(nextValue);
              setValidationError(getScheduleDateTimeValidationMessage(nextValue, Date.now()));
              if (isCompleteDateTimeLocalValue(nextValue)) {
                window.requestAnimationFrame(() => {
                  input.blur();
                });
              }
            }}
            onBlur={(event) => {
              setValidationError(
                getScheduleDateTimeValidationMessage(event.target.value, Date.now())
              );
            }}
          />

          <Input
            label="Media URL"
            value={mediaUrlInput}
            onChange={(event) => {
              setValidationError(null);
              setMediaName(null);
              setMediaUrlInput(event.target.value);
              setMediaUrl('');
              setMediaType(null);
              setIsPreviewOpen(false);
            }}
            onBlur={() => {
              void resolveMediaUrl().catch(() => {});
            }}
            placeholder="https://..."
          />

          <label className="field field--full generator-upload generator-upload--compact scheduler-upload">
            <span className="field__label">Replace media</span>
            <div className="generator-upload__copy">
              <ImagePlus size={18} />
              <div>
                <strong>
                  {isUploadingMedia ? 'Uploading media...' : 'Upload replacement media'}
                </strong>
                <span>JPG, PNG, WEBP, MP4, or MOV</span>
              </div>
            </div>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={async (event) => {
                const file = event.target.files?.[0];

                if (!file) {
                  return;
                }

                const nextMediaUrl = await onUploadMedia(file);
                setMediaUrl(nextMediaUrl);
                setMediaUrlInput(nextMediaUrl);
                setMediaType(file.type.startsWith('video/') ? 'video' : 'image');
                setMediaName(file.name);
                event.target.value = '';
              }}
            />
          </label>

          {mediaUrl && mediaType ? (
            <div className="scheduler-inline-media">
              <div className="scheduler-inline-media__summary">
                <MediaThumbnail
                  src={mediaUrl}
                  alt={post.caption || post.id}
                  mediaType={mediaType}
                  size="sm"
                />
                <div className="scheduler-inline-media__copy">
                  <strong>{mediaName || 'Attached media'}</strong>
                  <span>Preview the uploaded media inline before saving.</span>
                </div>
                <div className="scheduler-inline-media__actions">
                  <button
                    type="button"
                    className="queue-post-item__action"
                    onClick={() => setIsPreviewOpen((current) => !current)}
                  >
                    {isPreviewOpen ? <EyeOff size={15} /> : <Eye size={15} />}
                    <span>{isPreviewOpen ? 'Hide' : 'Preview'}</span>
                  </button>
                  <button
                    type="button"
                    className="queue-post-item__action queue-post-item__action--danger"
                    onClick={() => {
                      setMediaUrl('');
                      setMediaUrlInput('');
                      setMediaType(null);
                      setMediaName(null);
                      setIsPreviewOpen(false);
                    }}
                  >
                    <Trash2 size={15} />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
              <div
                className={`queue-post-item__preview ${
                  isPreviewOpen ? 'queue-post-item__preview--open' : ''
                }`}
              >
                <MediaPreview
                  src={mediaUrl}
                  alt={post.caption || post.id}
                  mediaType={mediaType}
                />
              </div>
            </div>
          ) : null}

          <div className="scheduler-edit-modal__actions">
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              type="submit"
              size="sm"
              className="scheduler-composer__submit"
              disabled={isSaving || !isScheduledTimeValid}
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
