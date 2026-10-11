"use client";

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
  const tick = { fontSize: 10 };
  const tip = (v) => formatINRMasked(v, showAmount);
  const axisFmt = (v) => `₹${(v / 1000).toFixed(0)}k`;
  const active = series.filter((s) => s.data?.length);

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
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={tick} />
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
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={rows} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="day" tick={tick} name="Day" />
        <YAxis tick={tick} tickFormatter={axisFmt} width={46} />
        <Tooltip formatter={tip} />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        {active.map((s) => (
          <Line
            key={s.monthKey}
            type="monotone"
            dataKey={s.monthKey}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
