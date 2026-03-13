"use client";

import React, { useState, useMemo } from "react";
import {
  LineChart,
  BarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ApiLead {
  submittedAt: string;
  pipelineStatus: string;
  contactedAt: string | null;
  quotedAt: string | null;
  soldAt: string | null;
  deadAt: string | null;
}

const COLORS: Record<string, string> = {
  leads: "#ef4444",
  contacted: "#f97316",
  quoted: "#ca8a04",
  sold: "#16a34a",
  dead: "#111827",
};

const LABELS: Record<string, string> = {
  leads: "Leads",
  contacted: "Contacted",
  quoted: "Quoted",
  sold: "Sold",
  dead: "Dead",
};

export default function DashboardChart({ leads }: { leads: ApiLead[] }) {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const data = useMemo(() => {
    const now = new Date();
    const days: { date: string; leads: number; contacted: number; quoted: number; sold: number; dead: number }[] = [];

    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      days.push({ date: key, leads: 0, contacted: 0, quoted: 0, sold: 0, dead: 0 });
    }

    const dateMap = new Map(days.map((d) => [d.date, d]));

    for (const lead of leads) {
      const submitted = lead.submittedAt?.split("T")[0];
      if (submitted && dateMap.has(submitted)) dateMap.get(submitted)!.leads++;

      const contacted = lead.contactedAt?.split("T")[0];
      if (contacted && dateMap.has(contacted)) dateMap.get(contacted)!.contacted++;

      const quoted = lead.quotedAt?.split("T")[0];
      if (quoted && dateMap.has(quoted)) dateMap.get(quoted)!.quoted++;

      const sold = lead.soldAt?.split("T")[0];
      if (sold && dateMap.has(sold)) dateMap.get(sold)!.sold++;

      const dead = lead.deadAt?.split("T")[0];
      if (dead && dateMap.has(dead)) dateMap.get(dead)!.dead++;
    }

    return days;
  }, [leads, range]);

  const toggleSeries = (key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const formatDate = (d: string | number) => {
    const date = new Date(String(d) + "T12:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const seriesKeys = ["leads", "contacted", "quoted", "sold", "dead"] as const;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-[#E8822A]">Pipeline Activity</h3>
        <div className="flex gap-2">
          {([7, 30, 90] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                range === r ? "bg-[#E8822A] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {r}d
            </button>
          ))}
          <button
            onClick={() => setChartType(chartType === "line" ? "bar" : "line")}
            className="px-3 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
          >
            {chartType === "line" ? "Bar" : "Line"}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {seriesKeys.map((key) => (
          <button
            key={key}
            onClick={() => toggleSeries(key)}
            className={`flex items-center gap-1.5 text-xs font-medium transition ${
              hiddenSeries.has(key) ? "opacity-40" : "opacity-100"
            }`}
          >
            <span
              className="w-3 h-3 rounded-full inline-block"
              style={{ backgroundColor: COLORS[key] }}
            />
            {LABELS[key]}
          </button>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={260}>
        {chartType === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={(label) => formatDate(label as string | number)} />
            {seriesKeys.map(
              (key) =>
                !hiddenSeries.has(key) && (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={COLORS[key]}
                    strokeWidth={2}
                    dot={false}
                    name={LABELS[key]}
                  />
                )
            )}
          </LineChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={(label) => formatDate(label as string | number)} />
            {seriesKeys.map(
              (key) =>
                !hiddenSeries.has(key) && (
                  <Bar key={key} dataKey={key} fill={COLORS[key]} name={LABELS[key]} />
                )
            )}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
