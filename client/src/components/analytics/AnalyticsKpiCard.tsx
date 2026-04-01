import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from 'lucide-react';
import type { AnalyticsMetricValue } from '../../types';
import { MiniSparkline } from './AnalyticsCharts';

const formatValue = (title: string, value: number | null) => {
  if (value === null) {
    return '—';
  }

  if (title === 'Engagement Rate') {
    return `${value.toFixed(1)}%`;
  }

  return Intl.NumberFormat('en-US', {
    notation: value >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value);
};

const formatChange = (metric: AnalyticsMetricValue) => {
  if (metric.changePercent === null) {
    return 'No comparison';
  }

  if (metric.direction === 'flat') {
    return 'Flat vs previous';
  }

  return `${Math.abs(metric.changePercent).toFixed(1)}% vs previous`;
};

export const AnalyticsKpiCard = ({
  title,
  metric,
  tooltip,
}: {
  title: string;
  metric: AnalyticsMetricValue;
  tooltip?: string;
}) => {
  const Icon =
    metric.direction === 'up'
      ? ArrowUpRight
      : metric.direction === 'down'
        ? ArrowDownRight
        : ArrowRight;

  return (
    <article className="analytics-kpi-card">
      <div className="analytics-kpi-card__top">
        <span className="analytics-kpi-card__label">
          {title}
          {tooltip ? (
            <span
              className="analytics-kpi-card__tooltip"
              title={tooltip}
              aria-label={tooltip}
            >
              <Info size={12} />
            </span>
          ) : null}
        </span>
        <span
          className={`analytics-kpi-card__delta analytics-kpi-card__delta--${metric.direction}`}
        >
          <Icon size={14} />
          {formatChange(metric)}
        </span>
      </div>
      <strong className="analytics-kpi-card__value">{formatValue(title, metric.value)}</strong>
      <div className="analytics-kpi-card__sparkline">
        <MiniSparkline points={metric.sparkline} />
      </div>
    </article>
  );
};
