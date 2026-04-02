import { memo } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from 'lucide-react';
import type { AnalyticsMetricValue } from '../../types';
import { formatPercentage } from '../../lib/utils';
import { MiniPublishedPostsBars, MiniSparkline } from './AnalyticsCharts';

const formatValue = (title: string, value: number | null) => {
  if (value === null) {
    return '—';
  }

  if (title === 'Engagement Rate') {
    return formatPercentage(value);
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

export const AnalyticsKpiCard = memo(({
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
            <span className="analytics-kpi-card__tooltip-wrap">
              <button
                type="button"
                className="analytics-kpi-card__tooltip"
                aria-label={`${title}: ${tooltip}`}
              >
                <Info size={12} />
              </button>
              <span className="analytics-kpi-card__tooltip-bubble" role="tooltip">
                {tooltip}
              </span>
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
        {title === 'Posts Published' ? (
          <MiniPublishedPostsBars points={metric.sparkline} />
        ) : (
          <MiniSparkline points={metric.sparkline} />
        )}
      </div>
    </article>
  );
});
