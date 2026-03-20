import { IMAGE_BACKGROUND_OPTIONS } from '../../lib/constants';

export const BackgroundSelector = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => (
  <div className="chip-grid">
    {IMAGE_BACKGROUND_OPTIONS.map((option) => (
      <button
        key={option}
        className={`chip ${value === option ? 'chip--active' : ''}`}
        type="button"
        onClick={() => onChange(option)}
      >
        {option}
      </button>
    ))}
  </div>
);
