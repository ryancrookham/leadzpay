"use client";

import { useState, useMemo } from "react";

interface RevenueDay {
  day: string;
  revenue: number;
  txCount: number;
}

interface RevenueChartProps {
  revenueByDay: RevenueDay[];
}

interface ChartPoint {
  day: string;
  dateLabel: string;
  revenue: number;
  txCount: number;
  rollingAvg: number;
}

function computeChartData(rawData: RevenueDay[]): ChartPoint[] {
  if (rawData.length === 0) return [];

  // Build a map of day string -> data
  const dataMap = new Map(rawData.map(d => [d.day.split("T")[0], d]));

  // Determine the date range: last 37 days to today
  const today = new Date();
  const allDays: string[] = [];
  for (let i = 36; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    allDays.push(date.toISOString().split("T")[0]);
  }

  // Fill in missing days with zero
  const filledData = allDays.map(day => ({
    day,
    revenue: dataMap.get(day)?.revenue ?? 0,
    txCount: dataMap.get(day)?.txCount ?? 0,
  }));

  // Compute 7-day rolling average
  const withRollingAvg = filledData.map((entry, index) => {
    const windowStart = Math.max(0, index - 6);
    const window = filledData.slice(windowStart, index + 1);
    const avg = window.reduce((sum, d) => sum + d.revenue, 0) / window.length;
    return {
      ...entry,
      rollingAvg: parseFloat(avg.toFixed(2)),
      dateLabel: new Date(entry.day + "T12:00:00").toLocaleDateString(undefined, {
        month: "numeric",
        day: "numeric",
      }),
    };
  });

  // Return only the last 30 entries (first 7 were lookback for rolling avg)
  return withRollingAvg.slice(-30);
}

function niceAxisTicks(maxValue: number): number[] {
  if (maxValue <= 0) return [0];
  // Find a nice step size
  const rawStep = maxValue / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceSteps = [1, 2, 2.5, 5, 10];
  const step = niceSteps.find(s => s * magnitude >= rawStep)! * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v <= maxValue + step * 0.1; v += step) {
    ticks.push(parseFloat(v.toFixed(2)));
  }
  return ticks;
}

export default function RevenueChart({ revenueByDay }: RevenueChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const chartData = useMemo(() => computeChartData(revenueByDay), [revenueByDay]);

  if (chartData.length === 0) return null;

  // Chart dimensions
  const svgWidth = 700;
  const svgHeight = 240;
  const paddingLeft = 52;
  const paddingRight = 12;
  const paddingTop = 16;
  const paddingBottom = 32;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const maxRevenue = Math.max(...chartData.map(d => d.revenue), ...chartData.map(d => d.rollingAvg), 1);
  const axisTicks = niceAxisTicks(maxRevenue);
  const yMax = axisTicks[axisTicks.length - 1] || maxRevenue;

  const barCount = chartData.length;
  const barGap = 3;
  const barWidth = Math.max((chartWidth - barGap * (barCount - 1)) / barCount, 4);

  // Get x position for a bar/point at index
  const getX = (i: number) => paddingLeft + i * (barWidth + barGap) + barWidth / 2;
  const getBarX = (i: number) => paddingLeft + i * (barWidth + barGap);
  const getY = (value: number) => paddingTop + chartHeight - (value / yMax) * chartHeight;

  // Build rolling average line points
  const linePoints = chartData
    .map((d, i) => `${getX(i)},${getY(d.rollingAvg)}`)
    .join(" ");

  // X-axis labels: show every 5th day to avoid crowding
  const labelInterval = barCount <= 15 ? 2 : 5;

  const hoveredData = hoveredIndex !== null ? chartData[hoveredIndex] : null;

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Horizontal grid lines */}
          {axisTicks.map((tick) => (
            <line
              key={tick}
              x1={paddingLeft}
              y1={getY(tick)}
              x2={svgWidth - paddingRight}
              y2={getY(tick)}
              stroke="#374151"
              strokeDasharray="4 3"
              strokeWidth={0.5}
            />
          ))}

          {/* Y-axis labels */}
          {axisTicks.map((tick) => (
            <text
              key={`label-${tick}`}
              x={paddingLeft - 8}
              y={getY(tick) + 3.5}
              textAnchor="end"
              fill="#9CA3AF"
              fontSize={10}
            >
              ${tick % 1 === 0 ? tick : tick.toFixed(2)}
            </text>
          ))}

          {/* Bars */}
          {chartData.map((d, i) => (
            <rect
              key={`bar-${i}`}
              x={getBarX(i)}
              y={getY(d.revenue)}
              width={barWidth}
              height={Math.max(chartHeight - (chartHeight - (d.revenue / yMax) * chartHeight), 0)}
              rx={2}
              fill={hoveredIndex === i ? "#d4c462" : "#C5B358"}
              fillOpacity={hoveredIndex === i ? 1 : 0.8}
              className="transition-colors duration-150"
            />
          ))}

          {/* Rolling average line */}
          <polyline
            points={linePoints}
            fill="none"
            stroke="#60A5FA"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Active dot on rolling avg when hovering */}
          {hoveredIndex !== null && hoveredData && (
            <circle
              cx={getX(hoveredIndex)}
              cy={getY(hoveredData.rollingAvg)}
              r={4}
              fill="#60A5FA"
              stroke="#1e3a5f"
              strokeWidth={1.5}
            />
          )}

          {/* X-axis date labels */}
          {chartData.map((d, i) =>
            i % labelInterval === 0 || i === barCount - 1 ? (
              <text
                key={`x-${i}`}
                x={getX(i)}
                y={svgHeight - 6}
                textAnchor="middle"
                fill="#9CA3AF"
                fontSize={9}
              >
                {d.dateLabel}
              </text>
            ) : null
          )}

          {/* Invisible hover rects for tooltip triggering */}
          {chartData.map((_, i) => (
            <rect
              key={`hover-${i}`}
              x={getBarX(i) - barGap / 2}
              y={paddingTop}
              width={barWidth + barGap}
              height={chartHeight}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          ))}
        </svg>

        {/* Tooltip */}
        {hoveredIndex !== null && hoveredData && (
          <div
            className="absolute bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-lg pointer-events-none z-10"
            style={{
              left: `${((getX(hoveredIndex)) / svgWidth) * 100}%`,
              top: "0px",
              transform: hoveredIndex > barCount - 5 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            <p className="text-white text-xs font-medium mb-1">
              {new Date(hoveredData.day + "T12:00:00").toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </p>
            <p className="text-[#C5B358] text-xs">
              Revenue: ${hoveredData.revenue.toFixed(2)}
            </p>
            <p className="text-gray-400 text-[10px]">
              {hoveredData.txCount} lead{hoveredData.txCount !== 1 ? "s" : ""}
            </p>
            <p className="text-blue-400 text-xs mt-0.5">
              7-Day Avg: ${hoveredData.rollingAvg.toFixed(2)}
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-3 ml-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[#C5B358]/80" />
          <span className="text-gray-400 text-xs">Daily Revenue</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-blue-400 rounded" />
          <span className="text-gray-400 text-xs">7-Day Average</span>
        </div>
      </div>
    </div>
  );
}
