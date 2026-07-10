"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const partnerColors = [
  { chart: "#3b82f6" },
  { chart: "#8b5cf6" },
  { chart: "#10b981" },
  { chart: "#f59e0b" },
  { chart: "#f43f5e" },
  { chart: "#06b6d4" },
];

function fmt(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function PartnerMonthlyChart({
  monthlyData,
  chartView,
  setChartView,
  partners,
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Monthly Trend</h2>
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
          {[
            ["profit", "Profit"],
            ["shares", "Partner Shares"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setChartView(v)}
              className={`px-2.5 py-1.5 rounded-md font-medium transition-all ${
                chartView === v
                  ? "bg-white shadow text-gray-900"
                  : "text-gray-500"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {chartView === "profit" ? (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
              width={42}
            />
            <Tooltip formatter={(v) => fmt(v)} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="grossProfit"
              name="Gross Profit"
              fill="#16a34a"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={monthlyData.map((m) => {
              const row = { month: m.month };
              const totalShare =
                partners.reduce((s, p) => s + (p.share_percentage || 0), 0) ||
                100;
              partners.forEach((p) => {
                row[p.name] =
                  m.grossProfit * ((p.share_percentage || 0) / totalShare);
              });
              return row;
            })}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
              width={42}
            />
            <Tooltip formatter={(v) => fmt(v)} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            {partners.map((p, idx) => (
              <Bar
                key={p.id}
                dataKey={p.name}
                name={p.name}
                fill={partnerColors[idx % partnerColors.length].chart}
                radius={[3, 3, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
