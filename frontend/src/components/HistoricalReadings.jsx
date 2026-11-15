
import "../styles/HistoricalReadings.css";
import { useMemo } from "react";

const MARGIN = { top: 14, right: 20, bottom: 55, left: 65 };
const TICK_COUNT = 4;

const WIDTH = 600;
const HEIGHT = 300;

function formatValue(value) {
  return Number.isInteger(value)
    ? String(value)
    : Number(value.toFixed(2));
}

// Format date and time separately using Philippine time
function formatTime(date) {
  return {
    date: date.toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
    }),
    time: date.toLocaleTimeString("en-PH", {
      timeZone: "Asia/Manila",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  };
}

function HistoricalReadings({ readings = [], parameter, label }) {

  // Prepare and sort historical readings
  const data = useMemo(
    () =>
      readings
        .map((reading) => ({
          time: new Date(
            reading.recordedAt ??
            reading.timestamp ??
            reading.recorded_at ??
            reading.created_at ??
            reading.t
          ),
          value: Number(reading[parameter]),
        }))
        .filter(
          (item) =>
            Number.isFinite(item.value) &&
            !Number.isNaN(item.time.getTime())
        )
        .sort((a, b) => a.time - b.time),
    [readings, parameter]
  );

  // Dynamic Y-axis title
  const axisLabel =
    parameter === "ph"
      ? "pH Level"
      : parameter === "temperature"
        ? "Temperature (°C)"
        : parameter === "turbidity"
          ? "Turbidity (NTU)"
          : "Sensor Reading";

  if (data.length === 0) {
    return (
      <div className="chart-panel">
        <div className="chart-label">{label}</div>
        <div className="chart-no-data">
          NO DATA AVAILABLE
        </div>
      </div>
    );
  }

  const width = WIDTH;
  const height = HEIGHT;

  const plotWidth =
    width - MARGIN.left - MARGIN.right;

  const plotHeight =
    height - MARGIN.top - MARGIN.bottom;

  // Calculate Y-axis range
  const values = data.map((item) => item.value);

  let min = Math.min(...values);
  let max = Math.max(...values);

  const pad =
    min === max
      ? Math.abs(min) * 0.1 || 1
      : (max - min) * 0.1;

  min -= pad;
  max += pad;

  const range = max - min;

  const getY = (value) =>
    MARGIN.top +
    plotHeight -
    ((value - min) / range) * plotHeight;

  // Calculate X-axis using actual timestamps
  const startTime = data[0].time.getTime();
  const endTime = data[data.length - 1].time.getTime();

  const timeSpan = endTime - startTime;

  const getX = (time) =>
    data.length === 1 || timeSpan === 0
      ? MARGIN.left + plotWidth / 2
      : MARGIN.left +
        ((time.getTime() - startTime) / timeSpan) *
          plotWidth;

  // Generate chart points
  const points = data
    .map(
      (item) =>
        `${getX(item.time)},${getY(item.value)}`
    )
    .join(" ");

  // Generate Y-axis ticks
  const yTicks = Array.from(
    { length: TICK_COUNT },
    (_, i) => min + (range * i) / (TICK_COUNT - 1)
  );

  // Generate distinct X-axis labels
  const labelIndices =
    data.length === 1
      ? [0]
      : [
          0,
          Math.floor((data.length - 1) / 2),
          data.length - 1,
        ];

  const xLabels = [];
  const usedLabels = new Set();

  labelIndices.forEach((index) => {
    const item = data[index];
    const formatted = formatTime(item.time);
    const uniqueKey = `${formatted.date} ${formatted.time}`;

    if (!usedLabels.has(uniqueKey)) {
      usedLabels.add(uniqueKey);

      xLabels.push({
        item,
        date: formatted.date,
        time: formatted.time,
        index,
      });
    }
  });

  return (
    <div className="chart-panel">

      <div className="chart-label">
        {label}
      </div>

      <div className="chart-graph">

        <svg
          className="trend-chart"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${label} historical trend chart`}
        >

          {/* Y-axis grid lines and labels */}
          {yTicks.map((tick, index) => (
            <g key={index}>

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

          {/* X-axis labels: Date above Time */}
          {xLabels.map(({ item, date, time, index }) => (
            <g
              key={`${item.time.getTime()}-${index}`}
              transform={`translate(${getX(item.time)}, ${height - 35})`}
            >
              <text
                textAnchor="middle"
                fontSize="11"
                fill="#64748B"
              >
                <tspan x="0" dy="0">
                  {date}
                </tspan>

                <tspan x="0" dy="15">
                  {time}
                </tspan>
              </text>
            </g>
          ))}

          {/* Y-axis title */}
          <text
            x="15"
            y={MARGIN.top + plotHeight / 2}
            textAnchor="middle"
            fontSize="12"
            fontWeight="600"
            fill="#475569"
            transform={`rotate(-90 15 ${MARGIN.top + plotHeight / 2})`}
          >
            {axisLabel}
          </text>

          {/* Historical trend line */}
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

          {/* Individual historical readings */}
          {data.map((item, index) => (
            <circle
              key={`${parameter}-${item.time.getTime()}-${index}`}
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

export default HistoricalReadings;
