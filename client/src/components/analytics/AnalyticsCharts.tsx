import { memo, useMemo, useState } from 'react';
import type {
  AnalyticsAudienceBreakdownItem,
  AnalyticsFollowerTrendPoint,
  AnalyticsHeatmapCell,
  AnalyticsMetricPoint,
  AnalyticsTrendPoint,
} from '../../types';

const SVG_WIDTH = 720;
const SVG_HEIGHT = 260;
const CHART_PADDING = { top: 20, right: 16, bottom: 30, left: 16 };
const MINI_SPARKLINE_WIDTH = 120;
const MINI_SPARKLINE_HEIGHT = 34;
const MINI_SPARKLINE_PADDING = { top: 4, right: 2, bottom: 4, left: 2 };

const buildPath = (points: Array<{ x: number; y: number }>) =>
  points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

const scalePoints = (
  values: number[],
  width: number,
  height: number,
  padding = CHART_PADDING
) => {
  if (!values.length) {
    return [];
  }

  const max = Math.max(...values, 1);
  const innerWidth = Math.max(1, width - padding.left - padding.right);
  const innerHeight = Math.max(1, height - padding.top - padding.bottom);

  return values.map((value, index) => ({
    x:
      padding.left +
      (values.length === 1 ? innerWidth / 2 : (innerWidth * index) / (values.length - 1)),
    y: padding.top + innerHeight - (value / max) * innerHeight,
  }));
};

export const MiniSparkline = memo(({ points }: { points: AnalyticsMetricPoint[] }) => {
  const scaled = useMemo(
    () =>
      scalePoints(
        points.map((point) => point.value),
        MINI_SPARKLINE_WIDTH,
        MINI_SPARKLINE_HEIGHT,
        MINI_SPARKLINE_PADDING
      ),
    [points]
  );

  if (!scaled.length) {
    return null;
  }

  return (
    <svg
      viewBox={`0 0 ${MINI_SPARKLINE_WIDTH} ${MINI_SPARKLINE_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={buildPath(scaled)} />
    </svg>
  );
});

export const MiniPublishedPostsBars = memo(({ points }: { points: AnalyticsMetricPoint[] }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const bars = useMemo(() => points.slice(-5), [points]);
  const maxValue = Math.max(...bars.map((point) => point.value), 1);
  const MAX_BAR_HEIGHT = 40;
  const MIN_BAR_HEIGHT = 4;

  if (!bars.length) {
    return null;
  }

  return (
    <div className="analytics-mini-bars" aria-label="Daily published posts for the last 5 days">
      <div className="analytics-mini-bars__plot">
        {bars.map((point, index) => {
          const normalizedHeight = maxValue > 0 ? point.value / maxValue : 0;
          const barHeight =
            point.value === 0
              ? MIN_BAR_HEIGHT
              : Math.max(MIN_BAR_HEIGHT, normalizedHeight * MAX_BAR_HEIGHT);
          const isHovered = hoveredIndex === index;
          const tooltipPositionClass =
            index >= bars.length - 1
              ? 'is-right'
              : index === 0
                ? 'is-left'
                : 'is-center';

          return (
            <button
              key={`${point.date}-${index}`}
              type="button"
              className={`analytics-mini-bars__item ${isHovered ? 'is-hovered' : ''}`}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onFocus={() => setHoveredIndex(index)}
              onBlur={() => setHoveredIndex(null)}
              aria-label={`Posts published: ${point.value}. Date: ${point.label}`}
            >
              <span className="analytics-mini-bars__bar-wrap">
                {isHovered ? (
                  <span className="analytics-mini-bars__value">{point.value}</span>
                ) : null}
                <span
                  className={`analytics-mini-bars__bar ${point.value === 0 ? 'is-zero' : ''}`}
                  style={{ height: `${Math.min(barHeight, MAX_BAR_HEIGHT)}px` }}
                />
              </span>
              {isHovered ? (
                <span className={`analytics-mini-bars__tooltip ${tooltipPositionClass}`}>
                  <strong>Posts published: {point.value}</strong>
                  <span>Date: {point.label}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="analytics-mini-bars__labels" aria-hidden="true">
        {bars.map((point, index) => (
          <span key={`${point.date}-label-${index}`}>{point.label}</span>
        ))}
      </div>
    </div>
  );
});

export const DualLineChart = memo(({
  title,
  subtitle,
  points,
}: {
  title: string;
  subtitle: string;
  points: AnalyticsTrendPoint[];
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const impressionValues = points.map((point) => point.impressions);
  const reachValues = points.map((point) => point.reach);
  const max = Math.max(...impressionValues, ...reachValues, 1);
  const innerWidth = SVG_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const innerHeight = SVG_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const impressionPoints = points.map((point, index) => ({
    x:
      CHART_PADDING.left +
      (points.length === 1 ? innerWidth / 2 : (innerWidth * index) / (points.length - 1)),
    y: CHART_PADDING.top + innerHeight - (point.impressions / max) * innerHeight,
  }));
  const reachPoints = points.map((point, index) => ({
    x:
      CHART_PADDING.left +
      (points.length === 1 ? innerWidth / 2 : (innerWidth * index) / (points.length - 1)),
    y: CHART_PADDING.top + innerHeight - (point.reach / max) * innerHeight,
  }));
  const hoveredPoint =
    hoveredIndex === null ? null : { data: points[hoveredIndex], impression: impressionPoints[hoveredIndex], reach: reachPoints[hoveredIndex] };

  return (
    <article className="analytics-chart-card">
      <div className="analytics-chart-card__header">
        <div>
          <p className="section-eyebrow">Trend</p>
          <h3>{title}</h3>
        </div>
        <span>{subtitle}</span>
      </div>
      <div className="analytics-chart analytics-chart--line">
        <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img" aria-label={title}>
          {[0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = CHART_PADDING.top + innerHeight - innerHeight * fraction;
            return (
              <line
                key={fraction}
                x1={CHART_PADDING.left}
                x2={SVG_WIDTH - CHART_PADDING.right}
                y1={y}
                y2={y}
                className="analytics-chart__grid"
              />
            );
          })}
          <path d={buildPath(impressionPoints)} className="analytics-chart__line analytics-chart__line--primary" />
          <path d={buildPath(reachPoints)} className="analytics-chart__line analytics-chart__line--secondary" />
          {points.map((point, index) => (
            <g key={point.date}>
              <circle
                cx={impressionPoints[index]?.x}
                cy={impressionPoints[index]?.y}
                r={4}
                className="analytics-chart__dot analytics-chart__dot--primary"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
              <circle
                cx={reachPoints[index]?.x}
                cy={reachPoints[index]?.y}
                r={4}
                className="analytics-chart__dot analytics-chart__dot--secondary"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            </g>
          ))}
        </svg>
        {hoveredPoint ? (
          <div className="analytics-chart__tooltip">
            <strong>{hoveredPoint.data.label}</strong>
            <span>Impressions {hoveredPoint.data.impressions.toLocaleString()}</span>
            <span>Reach {hoveredPoint.data.reach.toLocaleString()}</span>
            {hoveredPoint.data.platformBreakdown.instagram ? (
              <span>Instagram {hoveredPoint.data.platformBreakdown.instagram.impressions.toLocaleString()}</span>
            ) : null}
            {hoveredPoint.data.platformBreakdown.facebook ? (
              <span>Facebook {hoveredPoint.data.platformBreakdown.facebook.impressions.toLocaleString()}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="analytics-chart__legend">
        <span><i className="analytics-chart__legend-swatch analytics-chart__legend-swatch--primary" />Impressions</span>
        <span><i className="analytics-chart__legend-swatch analytics-chart__legend-swatch--secondary" />Reach</span>
      </div>
    </article>
  );
});

export const StackedEngagementChart = memo(({
  title,
  subtitle,
  points,
}: {
  title: string;
  subtitle: string;
  points: AnalyticsTrendPoint[];
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showShares, setShowShares] = useState(true);
  const [showReactions, setShowReactions] = useState(true);
  const values = points.map((point) =>
    point.likes +
    point.comments +
    point.saves +
    (showShares ? point.shares : 0) +
    (showReactions ? point.reactions : 0)
  );
  const max = Math.max(...values, 1);
  const barWidth = Math.max(14, (SVG_WIDTH - CHART_PADDING.left - CHART_PADDING.right) / Math.max(points.length * 1.5, 1));

  return (
    <article className="analytics-chart-card">
      <div className="analytics-chart-card__header">
        <div>
          <p className="section-eyebrow">Breakdown</p>
          <h3>{title}</h3>
        </div>
        <div className="analytics-chart-card__toggles">
          <button type="button" className={showShares ? 'is-active' : ''} onClick={() => setShowShares((value) => !value)}>
            Shares
          </button>
          <button type="button" className={showReactions ? 'is-active' : ''} onClick={() => setShowReactions((value) => !value)}>
            Reactions
          </button>
        </div>
      </div>
      <div className="analytics-chart analytics-chart--bar">
        <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img" aria-label={title}>
          {points.map((point, index) => {
            const x =
              CHART_PADDING.left +
              (SVG_WIDTH - CHART_PADDING.left - CHART_PADDING.right) *
                (index / Math.max(points.length, 1)) +
              8;
            const segments = [
              { key: 'likes', value: point.likes, className: 'analytics-chart__bar-segment--likes' },
              { key: 'comments', value: point.comments, className: 'analytics-chart__bar-segment--comments' },
              { key: 'saves', value: point.saves, className: 'analytics-chart__bar-segment--saves' },
              ...(showShares ? [{ key: 'shares', value: point.shares, className: 'analytics-chart__bar-segment--shares' }] : []),
              ...(showReactions ? [{ key: 'reactions', value: point.reactions, className: 'analytics-chart__bar-segment--reactions' }] : []),
            ];
            let currentY = SVG_HEIGHT - CHART_PADDING.bottom;

            return (
              <g
                key={point.date}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {segments.map((segment) => {
                  const height = (segment.value / max) * (SVG_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom);
                  currentY -= height;

                  return (
                    <rect
                      key={segment.key}
                      x={x}
                      y={currentY}
                      width={barWidth}
                      height={Math.max(height, 0)}
                      rx={6}
                      className={`analytics-chart__bar-segment ${segment.className}`}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
        {hoveredIndex !== null ? (
          <div className="analytics-chart__tooltip">
            <strong>{points[hoveredIndex]?.label}</strong>
            <span>Likes {points[hoveredIndex]?.likes.toLocaleString()}</span>
            <span>Comments {points[hoveredIndex]?.comments.toLocaleString()}</span>
            <span>Saves {points[hoveredIndex]?.saves.toLocaleString()}</span>
            {showShares ? <span>Shares {points[hoveredIndex]?.shares.toLocaleString()}</span> : null}
            {showReactions ? <span>Reactions {points[hoveredIndex]?.reactions.toLocaleString()}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="analytics-chart__legend analytics-chart__legend--dense">
        <span><i className="analytics-chart__legend-swatch analytics-chart__legend-swatch--likes" />Likes</span>
        <span><i className="analytics-chart__legend-swatch analytics-chart__legend-swatch--comments" />Comments</span>
        <span><i className="analytics-chart__legend-swatch analytics-chart__legend-swatch--saves" />Saves</span>
        <span><i className="analytics-chart__legend-swatch analytics-chart__legend-swatch--shares" />Shares</span>
        <span><i className="analytics-chart__legend-swatch analytics-chart__legend-swatch--reactions" />Reactions</span>
      </div>
      <span className="analytics-chart-card__footnote">{subtitle}</span>
    </article>
  );
});

export const EngagementHeatmap = memo(({
  cells,
  valueLabel = 'posts',
}: {
  cells: AnalyticsHeatmapCell[];
  valueLabel?: string;
}) => {
  const [hoveredCell, setHoveredCell] = useState<AnalyticsHeatmapCell | null>(null);

  return (
    <div className="analytics-heatmap">
      <div className="analytics-heatmap__hours">
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour}>{hour}</span>
        ))}
      </div>
      <div className="analytics-heatmap__grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div key={day} className="analytics-heatmap__row">
            <span>{day}</span>
            <div className="analytics-heatmap__cells">
              {cells
                .filter((cell) => cell.day === day)
                .sort((left, right) => left.hour - right.hour)
                .map((cell) => (
                  <button
                    key={`${cell.day}-${cell.hour}`}
                    type="button"
                    className="analytics-heatmap__cell"
                    style={{ opacity: 0.18 + cell.intensity * 0.82 }}
                    onMouseEnter={() => setHoveredCell(cell)}
                    onMouseLeave={() => setHoveredCell(null)}
                    aria-label={`${cell.day} ${cell.hour}:00`}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
      {hoveredCell ? (
        <div className="analytics-chart__tooltip analytics-chart__tooltip--static">
          <strong>
            {hoveredCell.day} {hoveredCell.hour}:00
          </strong>
          <span>{hoveredCell.posts} {valueLabel}</span>
          <span>
            {hoveredCell.averageEngagementRate !== null
              ? `${hoveredCell.averageEngagementRate.toFixed(1)}% avg engagement`
              : 'No data'}
          </span>
        </div>
      ) : null}
    </div>
  );
});

const DONUT_COLORS = ['#8fd8ff', '#73f0d5', '#facc15', '#fb7185', '#c084fc', '#7dd3fc'];

export const AudienceDonutChart = memo(({
  items,
}: {
  items: AnalyticsAudienceBreakdownItem[];
}) => {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (!items.length || total <= 0) {
    return <div className="analytics-blank-state">No audience demographic data yet.</div>;
  }

  return (
    <div className="analytics-donut">
      <div className="analytics-donut__chart">
        <svg viewBox="0 0 180 180" aria-label="Audience age and gender breakdown">
          <circle
            cx="90"
            cy="90"
            r={radius}
            className="analytics-donut__track"
          />
          {items.map((item, index) => {
            const value = item.value / total;
            const dash = value * circumference;
            const strokeDasharray = `${dash} ${circumference - dash}`;
            const strokeDashoffset = -offset;
            offset += dash;

            return (
              <circle
                key={item.label}
                cx="90"
                cy="90"
                r={radius}
                className="analytics-donut__segment"
                stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
              />
            );
          })}
        </svg>
        <div className="analytics-donut__center">
          <strong>{items[0]?.label ?? '—'}</strong>
          <span>Top segment</span>
        </div>
      </div>
      <div className="analytics-donut__legend">
        {items.map((item, index) => (
          <div key={item.label} className="analytics-donut__legend-row">
            <span className="analytics-donut__legend-label">
              <i style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
              {item.label}
            </span>
            <strong>{item.value.toLocaleString()}</strong>
          </div>
        ))}
      </div>
    </div>
  );
});

export const FollowerGrowthChart = memo(({
  points,
}: {
  points: AnalyticsFollowerTrendPoint[];
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const scaled = useMemo(
    () => scalePoints(points.map((point) => point.value), SVG_WIDTH, 220),
    [points]
  );

  if (points.length < 2 || scaled.length < 2) {
    return <div className="analytics-blank-state">Not enough follower history yet.</div>;
  }

  const hoveredPoint = hoveredIndex === null ? null : points[hoveredIndex];

  return (
    <div className="analytics-chart analytics-chart--compact">
      <svg viewBox={`0 0 ${SVG_WIDTH} 220`} role="img" aria-label="Follower growth over time">
        {[0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = CHART_PADDING.top + (220 - CHART_PADDING.top - CHART_PADDING.bottom) - (220 - CHART_PADDING.top - CHART_PADDING.bottom) * fraction;
          return (
            <line
              key={fraction}
              x1={CHART_PADDING.left}
              x2={SVG_WIDTH - CHART_PADDING.right}
              y1={y}
              y2={y}
              className="analytics-chart__grid"
            />
          );
        })}
        <path d={buildPath(scaled)} className="analytics-chart__line analytics-chart__line--secondary" />
        {scaled.map((point, index) => (
          <circle
            key={points[index]?.date}
            cx={point.x}
            cy={point.y}
            r={4}
            className="analytics-chart__dot analytics-chart__dot--secondary"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          />
        ))}
      </svg>
      {hoveredPoint ? (
        <div className="analytics-chart__tooltip">
          <strong>{hoveredPoint.label}</strong>
          <span>{hoveredPoint.value.toLocaleString()} followers</span>
        </div>
      ) : null}
    </div>
  );
});
