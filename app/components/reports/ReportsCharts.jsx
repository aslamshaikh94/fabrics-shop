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
} from "recharts";
import { formatINRMasked } from "../../utils/formatters";

/**
 * Monthly trend + sales-vs-purchases charts, split out of Reports.jsx so the
 * recharts bundle (~300KB) only loads when the Analytics tab renders —
 * not on every dashboard/payments/sales visit.
 */
export default function ReportsCharts({ monthlyData, chartView, showAmount }) {
  const tick = { fontSize: 10 };
  const tip = (v) => formatINRMasked(v, showAmount);
  const axisFmt = (v) => `₹${(v / 1000).toFixed(0)}k`;
  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart
          data={monthlyData}
          margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
        >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={tick} />
            <YAxis tick={tick} tickFormatter={axisFmt} width={42} />
            <Tooltip formatter={tip} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            {(chartView === "all" || chartView === "sales") && (
              <Line
                type="monotone"
                dataKey="sales"
                name="Sales"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            )}
            {(chartView === "all" || chartView === "profit") && (
              <Line
                type="monotone"
                dataKey="profit"
                name="Profit"
                stroke="#16a34a"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            )}
            {(chartView === "all" || chartView === "purchases") && (
              <Line
                type="monotone"
                dataKey="purchases"
                name="Purchases"
                stroke="#d97706"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>

      <div className="card p-4 mt-5">
        <h2 className="font-semibold text-gray-900 mb-4">
          Monthly Sales vs Purchases
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={monthlyData}
            margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={tick} />
            <YAxis tick={tick} tickFormatter={axisFmt} width={42} />
            <Tooltip formatter={tip} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="sales"
              name="Sales"
              fill="#2563eb"
              radius={[3, 3, 0, 0]}
            />
            <Bar
              dataKey="purchases"
              name="Purchases"
              fill="#d97706"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
