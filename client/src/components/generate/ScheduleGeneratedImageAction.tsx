import { CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { writeSchedulerGeneratedMediaIntent } from '../../lib/schedulerGeneratedMedia';
import type { SchedulerGeneratedMediaIntent } from '../../types';

export const ScheduleGeneratedImageAction = ({
  intent,
  disabled = false,
}: {
  intent: SchedulerGeneratedMediaIntent;
  disabled?: boolean;
}) => {
  const navigate = useNavigate();

  const handleSchedule = () => {
    if (disabled) {
      return;
    }

    writeSchedulerGeneratedMediaIntent(intent);
    navigate('/app/scheduler', {
      state: {
        generatedMediaIntent: intent,
      },
    });
  };

  return (
    <button
      type="button"
      className="generated-image-card__schedule"
      onClick={handleSchedule}
      disabled={disabled}
      aria-label="Schedule this image directly"
      title="Schedule this image directly"
    >
      <CalendarClock size={15} />
      <span>Schedule</span>
    </button>
  );
};
