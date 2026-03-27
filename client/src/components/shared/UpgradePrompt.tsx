import { ArrowUpRight, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PlanType } from '../../types';
import type { UpgradePromptDetail } from '../../lib/upgradePrompt';

const getUpgradeLabel = (plan: PlanType) => {
  if (plan === 'free') {
    return 'Upgrade to Basic';
  }

  if (plan === 'basic') {
    return 'Upgrade to Pro';
  }

  return 'Open Billing';
};

export const UpgradePrompt = ({
  prompt,
  currentPlan,
  onDismiss,
}: {
  prompt: UpgradePromptDetail;
  currentPlan: PlanType;
  onDismiss: () => void;
}) => {
  const navigate = useNavigate();

  return (
    <div className="upgrade-prompt" role="status" aria-live="polite">
      <div className="upgrade-prompt__icon">
        <Sparkles size={16} />
      </div>
      <div className="upgrade-prompt__copy">
        <strong>{prompt.title}</strong>
        <span>{prompt.message}</span>
      </div>
      <div className="upgrade-prompt__actions">
        <button
          type="button"
          className="upgrade-prompt__button"
          onClick={() => {
            onDismiss();
            navigate('/app/billing');
          }}
        >
          <span>{getUpgradeLabel(currentPlan)}</span>
          <ArrowUpRight size={14} />
        </button>
        <button
          type="button"
          className="upgrade-prompt__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss upgrade prompt"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
