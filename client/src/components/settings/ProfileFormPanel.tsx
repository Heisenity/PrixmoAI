import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ErrorMessage } from '../shared/ErrorMessage';
import { Card } from '../ui/card';
import type { BrandProfile, SaveProfileInput } from '../../types';

type ProfileFormPanelProps = {
  profile: BrandProfile | null;
  heading: string;
  subheading: string;
  submitLabel: string;
  onSubmit: (input: SaveProfileInput) => Promise<void>;
};

export const ProfileFormPanel = ({
  profile,
  heading,
  subheading,
  submitLabel,
  onSubmit,
}: ProfileFormPanelProps) => {
  const [form, setForm] = useState<SaveProfileInput>({
    fullName: profile?.fullName || '',
    username: profile?.username || '',
    industry: profile?.industry || '',
    targetAudience: profile?.targetAudience || '',
    brandVoice: profile?.brandVoice || '',
    description: profile?.description || '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (key: keyof SaveProfileInput, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      await onSubmit(form);
      setSuccess('Brand profile saved successfully.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card glow className="profile-panel">
      <div className="profile-panel__header">
        <p className="section-eyebrow">Brand memory</p>
        <h2>{heading}</h2>
        <p>{subheading}</p>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <Input
          label="Full name"
          value={form.fullName || ''}
          onChange={(event) => updateField('fullName', event.target.value)}
          required
        />
        <Input
          label="Username"
          value={form.username || ''}
          onChange={(event) => updateField('username', event.target.value)}
        />
        <Input
          label="Industry"
          value={form.industry || ''}
          onChange={(event) => updateField('industry', event.target.value)}
        />
        <Input
          label="Target audience"
          value={form.targetAudience || ''}
          onChange={(event) => updateField('targetAudience', event.target.value)}
        />
        <Input
          label="Brand voice"
          value={form.brandVoice || ''}
          onChange={(event) => updateField('brandVoice', event.target.value)}
        />
        <label className="field field--full">
          <span className="field__label">Brand description</span>
          <textarea
            className="field__control field__control--textarea"
            value={form.description || ''}
            onChange={(event) => updateField('description', event.target.value)}
            rows={5}
          />
        </label>

        <ErrorMessage message={error} />
        {success ? <div className="message">{success}</div> : null}

        <div className="field field--full">
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
};
