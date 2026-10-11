"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { formatINRMasked } from "../../utils/formatters";

/**
 * Month-over-month comparison chart.
 *
 * - mode="daily"   → one line per selected month, X axis = day of month (1..31).
 * - mode="monthly" → one bar per selected month, X axis = month label.
 *
 * `metric` picks the value plotted ("sales" | "profit"). Each series carries
 * its own stable color so the chart legend, tooltip and the side tables all
 * line up.
 */
export default function ReportsCompareChart({
  series,
  mode = "daily",
  metric = "sales",
  showAmount,
}) {
  // Track viewport width so we can thin the X-axis ticks and shrink the height
  // on phones — 31 day labels simply don't fit side-by-side on a small screen.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const tick = { fontSize: 10 };
  const tip = (v) => formatINRMasked(v, showAmount);
  const axisFmt = (v) => `₹${(v / 1000).toFixed(0)}k`;
  const active = series.filter((s) => s.data?.length);
  const height = isNarrow ? 240 : 280;

  if (active.length === 0) {
    return (
      <p className="text-gray-400 text-sm text-center py-10">
        No data for the selected months
      </p>
    );
  }

  // ── Monthly view: one bar per month ──
  if (mode === "monthly") {
    const data = active.map((s) => ({
      label: s.label,
      value: s.data.reduce((sum, d) => sum + (d[metric] || 0), 0),
    }));
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 5, right: 8, left: isNarrow ? -8 : 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={tick} interval={0} />
          <YAxis tick={tick} tickFormatter={axisFmt} width={46} />
          <Tooltip formatter={tip} />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="value"
            name={metric === "profit" ? "Profit" : "Sales"}
            radius={[3, 3, 0, 0]}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={active[i].color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Daily view: one line per month, X axis = day of month ──
  const maxDay = Math.max(...active.map((s) => s.data.length), 0);
  const rows = Array.from({ length: maxDay }, (_, i) => {
    const row = { day: i + 1 };
    active.forEach((s) => {
      row[s.monthKey] = s.data[i] ? s.data[i][metric] || 0 : null;
    });
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={rows}
        margin={{ top: 5, right: 8, left: isNarrow ? -8 : 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="day"
          tick={tick}
          name="Day"
          // Show every day on desktop, every ~5th on phones so labels stay legible.
          interval={isNarrow ? 4 : 0}
        />
        <YAxis tick={tick} tickFormatter={axisFmt} width={46} />
        <Tooltip formatter={tip} />
        <Legend
          iconSize={10}
          wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
        />
        {active.map((s) => (
          <Line
            key={s.monthKey}
            type="monotone"
            dataKey={s.monthKey}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={isNarrow ? false : { r: 2 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
