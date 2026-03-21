import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ErrorMessage } from '../shared/ErrorMessage';
import { Card } from '../ui/card';
import type { BrandProfile, SaveProfileInput } from '../../types';

type ProfileFormPanelProps = {
  profile: BrandProfile | null;
  defaults?: Partial<SaveProfileInput>;
  heading: string;
  subheading: string;
  submitLabel: string;
  onSubmit: (input: SaveProfileInput) => Promise<void>;
};

export const ProfileFormPanel = ({
  profile,
  defaults,
  heading,
  subheading,
  submitLabel,
  onSubmit,
}: ProfileFormPanelProps) => {
  const [form, setForm] = useState<SaveProfileInput>({
    fullName: profile?.fullName || defaults?.fullName || '',
    phoneNumber: profile?.phoneNumber || defaults?.phoneNumber || '',
    username: profile?.username || defaults?.username || '',
    industry: profile?.industry || defaults?.industry || '',
    targetAudience: profile?.targetAudience || defaults?.targetAudience || '',
    brandVoice: profile?.brandVoice || defaults?.brandVoice || '',
    description: profile?.description || defaults?.description || '',
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
      const payload: SaveProfileInput = {
        fullName: form.fullName.trim(),
        phoneNumber: form.phoneNumber?.trim(),
        ...(form.username?.trim() ? { username: form.username.trim() } : {}),
        ...(form.industry?.trim() ? { industry: form.industry.trim() } : {}),
        ...(form.targetAudience?.trim()
          ? { targetAudience: form.targetAudience.trim() }
          : {}),
        ...(form.brandVoice?.trim() ? { brandVoice: form.brandVoice.trim() } : {}),
        ...(form.description?.trim() ? { description: form.description.trim() } : {}),
      };

      await onSubmit(payload);
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
          placeholder="Sayantan Sen"
          required
        />
        <Input
          label="Phone number"
          type="tel"
          value={form.phoneNumber || ''}
          onChange={(event) => updateField('phoneNumber', event.target.value)}
          placeholder="+91 98765 43210"
          hint="Required to finish account setup and keep your workspace recoverable."
          required
        />
        <Input
          label="Username"
          value={form.username || ''}
          onChange={(event) => updateField('username', event.target.value)}
          placeholder="@prixmoai"
        />
        <Input
          label="Industry"
          value={form.industry || ''}
          onChange={(event) => updateField('industry', event.target.value)}
          placeholder="Fashion, Beauty, Food, Fitness..."
        />
        <Input
          label="Target audience"
          value={form.targetAudience || ''}
          onChange={(event) => updateField('targetAudience', event.target.value)}
          placeholder="Young professionals, boutique shoppers, local customers"
        />
        <Input
          label="Brand voice"
          value={form.brandVoice || ''}
          onChange={(event) => updateField('brandVoice', event.target.value)}
          placeholder="Minimal, warm, premium, witty..."
        />
        <label className="field field--full">
          <span className="field__label">Brand description</span>
          <textarea
            className="field__control field__control--textarea"
            value={form.description || ''}
            onChange={(event) => updateField('description', event.target.value)}
            rows={5}
            placeholder="Tell PrixmoAI what you sell, how you want to sound, and what kind of customers you want to attract."
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
