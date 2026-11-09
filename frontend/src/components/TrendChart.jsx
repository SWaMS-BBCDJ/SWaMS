import { useMemo } from "react";

const MARGIN = { top: 14, right: 16, bottom: 30, left: 44 };
const TICK_COUNT = 4;

/* Fixed drawing size. The SVG scales to fit its container,
   so no measuring (ResizeObserver) is needed. */
const WIDTH = 600;
const HEIGHT = 280;

function formatValue(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatTime(date, spansDays) {
  return spansDays
    ? date.toLocaleDateString([], { month: "short", day: "numeric" })
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function TrendChart({ readings = [], parameter, label }) {
  /* Keep date and value together so they never fall out of step */
  const data = useMemo(
    () =>
      readings
        .map((reading) => ({
          time: new Date(reading.recordedAt),
          value: Number(reading[parameter]),
        }))
        .filter(
          (item) =>
            Number.isFinite(item.value) && !Number.isNaN(item.time.getTime())
        )
        .sort((a, b) => a.time - b.time),
    [readings, parameter]
  );

  if (data.length === 0) {
    return (
      <div className="chart-panel">
        <div className="chart-label">{label}</div>
        <div className="chart-no-data">NO DATA</div>
      </div>
    );
  }

  const width = WIDTH;
  const height = HEIGHT;
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;

  /* Y scale: pad the range so flat readings sit in the middle, not on the edge */
  const values = data.map((item) => item.value);
  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  } else {
    const pad = (max - min) * 0.1;
    min -= pad;
    max += pad;
  }

  const range = max - min;
  const getY = (value) =>
    MARGIN.top + plotHeight - ((value - min) / range) * plotHeight;

  /* X scale: position by real time, so gaps between readings show up */
  const startTime = data[0].time.getTime();
  const endTime = data[data.length - 1].time.getTime();
  const timeSpan = endTime - startTime;
  const spansDays = timeSpan > 24 * 60 * 60 * 1000;

  const getX = (time) =>
    data.length === 1 || timeSpan === 0
      ? MARGIN.left + plotWidth / 2
      : MARGIN.left + ((time.getTime() - startTime) / timeSpan) * plotWidth;

  const points = data
    .map((item) => `${getX(item.time)},${getY(item.value)}`)
    .join(" ");

  const yTicks = Array.from(
    { length: TICK_COUNT },
    (_, i) => min + (range * i) / (TICK_COUNT - 1)
  );

  const xLabels =
    data.length === 1
      ? [{ item: data[0], anchor: "middle" }]
      : [
          { item: data[0], anchor: "start" },
          { item: data[Math.floor((data.length - 1) / 2)], anchor: "middle" },
          { item: data[data.length - 1], anchor: "end" },
        ];

  return (
    <div className="chart-panel">
      <div className="chart-label">{label}</div>

      <div className="chart-graph">
        <svg
          className="trend-chart"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${label} trend chart`}
        >
          {/* Grid lines and Y axis labels */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={getY(tick)}
                y2={getY(tick)}
                stroke="#E2E8F0"
                strokeWidth="1"
              />
              <text
                x={MARGIN.left - 8}
                y={getY(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="11"
                fill="#64748B"
              >
                {formatValue(Number(tick.toFixed(2)))}
              </text>
            </g>
          ))}

          {/* X axis time labels */}
          {xLabels.map(({ item, anchor }) => (
            <text
              key={item.time.getTime()}
              x={getX(item.time)}
              y={height - 8}
              textAnchor={anchor}
              fontSize="11"
              fill="#64748B"
            >
              {formatTime(item.time, spansDays)}
            </text>
          ))}

          {/* Trend line (needs 2+ readings) */}
          {data.length > 1 && (
            <polyline
              points={points}
              fill="none"
              stroke="#28734D"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* One dot per stored reading, with a hover tooltip */}
          {data.map((item, index) => (
            <circle
              key={`${parameter}-${index}`}
              cx={getX(item.time)}
              cy={getY(item.value)}
              r="4"
              fill="#FFFFFF"
              stroke="#28734D"
              strokeWidth="2"
            >
              <title>
                {`${formatValue(item.value)} - ${item.time.toLocaleString()}`}
              </title>
            </circle>
          ))}
        </svg>
      </div>
    </div>
  );
}

export default TrendChart;