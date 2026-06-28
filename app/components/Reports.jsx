"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useShowAmount } from "./ShowAmountProvider";
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
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingBag,
  Receipt,
  Users,
  Package,
  MessageCircle,
  AlertTriangle,
} from "lucide-react";

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
function fmt(n, show = true) {
  if (!show) return "₹•••";
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}
function fmtShort(n, show = true) {
  if (!show) return "₹•••";
  n = Number(n || 0);
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n}`;
}
function pctChange(curr, prev) {
  if (!prev) return null;
  const diff = ((curr - prev) / prev) * 100;
  return { value: Math.abs(diff).toFixed(1), up: diff >= 0 };
}

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("analytics");
  const [monthlyData, setMonthlyData] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [topFabrics, setTopFabrics] = useState([]);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalProfit: 0,
    netProfit: 0,
    totalPurchases: 0,
    totalReceivables: 0,
    totalExpenses: 0,
  });
  const [prevSummary, setPrevSummary] = useState({
    totalSales: 0,
    totalProfit: 0,
    netProfit: 0,
  });
  const [alerts, setAlerts] = useState({
    pendingCustomers: [],
    pendingSuppliers: [],
    lowStock: [],
  });
  const [year, setYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState([
    new Date().getFullYear(),
  ]);
  const [chartView, setChartView] = useState("all");
  const [rankView, setRankView] = useState("revenue");
  const { showAmount } = useShowAmount();

  useEffect(() => {
    fetchYears();
    fetchAlerts();
  }, []);
  useEffect(() => {
    fetchAll();
  }, [year]);

  async function fetchYears() {
    const { data } = await supabase
      .from("sales")
      .select("sale_date")
      .order("sale_date");
    if (data?.length) {
      const years = [
        ...new Set(data.map((s) => new Date(s.sale_date).getFullYear())),
      ];
      const cur = new Date().getFullYear();
      if (!years.includes(cur)) years.push(cur);
      setAvailableYears(years.sort((a, b) => b - a));
    }
  }

  async function fetchAlerts() {
    try {
      const [custRes, supRes, stockRes, customersRes, suppliersRes] =
        await Promise.all([
          supabase
            .from("sales")
            .select("customer_id, remaining_amount")
            .gt("remaining_amount", 0),
          supabase
            .from("purchases")
            .select("supplier_id, remaining_amount")
            .gt("remaining_amount", 0),
          supabase
            .from("fabrics")
            .select("name, available_meters")
            .lt("available_meters", 10),
          supabase.from("customers").select("id, name, phone"),
          supabase.from("suppliers").select("id, name"),
        ]);

      const customerMap = Object.fromEntries(
        (customersRes.data || []).map((c) => [c.id, c]),
      );
      const supplierMap = Object.fromEntries(
        (suppliersRes.data || []).map((s) => [s.id, s]),
      );

      // Group customers
      const custMap = {};
      (custRes.data || []).forEach((s) => {
        const customer = customerMap[s.customer_id];
        const id = s.customer_id || "walk-in";
        const name = customer?.name || "Walk-in";
        const phone = customer?.phone || "";
        if (!custMap[id]) custMap[id] = { name, phone, pending: 0 };
        custMap[id].pending += s.remaining_amount || 0;
      });
      const pendingCustomers = Object.values(custMap)
        .sort((a, b) => b.pending - a.pending)
        .slice(0, 10);

      // Group suppliers
      const supMap = {};
      (supRes.data || []).forEach((p) => {
        const supplier = supplierMap[p.supplier_id];
        const name = supplier?.name || "Unknown";
        if (!supMap[name]) supMap[name] = { name, pending: 0 };
        supMap[name].pending += p.remaining_amount || 0;
      });
      const pendingSuppliers = Object.values(supMap)
        .sort((a, b) => b.pending - a.pending)
        .slice(0, 10);

      setAlerts({
        pendingCustomers,
        pendingSuppliers,
        lowStock: stockRes.data || [],
      });
    } catch (err) {
      console.error("Error fetching alerts:", err);
    }
  }

  async function fetchAll() {
    setLoading(true);
    try {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      const prevStart = `${year - 1}-01-01`;
      const prevEnd = `${year - 1}-12-31`;

      // Run queries with individual error handling so one failure doesn't break everything
      const safeQuery = async (promise, fallback = []) => {
        try {
          const res = await promise;
          return res.data || fallback;
        } catch (e) {
          console.error("Query failed:", e);
          return fallback;
        }
      };

      const [sales, purchases, expenses, prevSales, prevExp, customers] =
        await Promise.all([
          safeQuery(
            supabase
              .from("sales")
              .select(
                "sale_date, total_amount, margin, remaining_amount, meters, notes, fabric_name, customer_id",
              )
              .gte("sale_date", startDate)
              .lte("sale_date", endDate),
            [],
          ),
          safeQuery(
            supabase
              .from("purchases")
              .select("purchase_date, total_amount")
              .gte("purchase_date", startDate)
              .lte("purchase_date", endDate),
            [],
          ),
          safeQuery(
            supabase
              .from("expenses")
              .select("amount")
              .gte("expense_date", startDate)
              .lte("expense_date", endDate),
            [],
          ),
          safeQuery(
            supabase
              .from("sales")
              .select("total_amount, margin")
              .gte("sale_date", prevStart)
              .lte("sale_date", prevEnd),
            [],
          ),
          safeQuery(
            supabase
              .from("expenses")
              .select("amount")
              .gte("expense_date", prevStart)
              .lte("expense_date", prevEnd),
            [],
          ),
          safeQuery(supabase.from("customers").select("id, name"), []),
        ]);

      const totalExpenses = expenses.reduce((s, r) => s + (r.amount || 0), 0);
      const totalMargin = sales.reduce((s, r) => s + (r.margin || 0), 0);

      // Build customer lookup map
      const customerMap = Object.fromEntries(customers.map((c) => [c.id, c]));

      // Previous year summary for YoY
      const prevMargin = prevSales.reduce((s, r) => s + (r.margin || 0), 0);
      setPrevSummary({
        totalSales: prevSales.reduce((s, r) => s + (r.total_amount || 0), 0),
        totalProfit: prevMargin,
        netProfit:
          prevMargin - prevExp.reduce((s, r) => s + (r.amount || 0), 0),
      });

      // Monthly data with prev year overlay
      const monthly = Array.from({ length: 12 }, (_, i) => ({
        month: MONTHS[i],
        sales: 0,
        profit: 0,
        purchases: 0,
      }));
      sales.forEach((s) => {
        const m = new Date(s.sale_date).getMonth();
        monthly[m].sales += s.total_amount || 0;
        monthly[m].profit += s.margin || 0;
      });
      purchases.forEach((p) => {
        const m = new Date(p.purchase_date).getMonth();
        monthly[m].purchases += p.total_amount || 0;
      });
      setMonthlyData(monthly);

      setSummary({
        totalSales: sales.reduce((s, r) => s + (r.total_amount || 0), 0),
        totalProfit: totalMargin,
        netProfit: totalMargin - totalExpenses,
        totalPurchases: purchases.reduce(
          (s, r) => s + (r.total_amount || 0),
          0,
        ),
        totalReceivables: sales.reduce(
          (s, r) => s + (r.remaining_amount || 0),
          0,
        ),
        totalExpenses,
      });

      // Top 10 customers by revenue & pending
      const custMap = {};
      sales.forEach((s) => {
        const customer = customerMap[s.customer_id];
        const name = customer?.name || "Walk-in";
        if (!custMap[name]) custMap[name] = { name, revenue: 0, pending: 0 };
        custMap[name].revenue += s.total_amount || 0;
        custMap[name].pending += s.remaining_amount || 0;
      });
      setTopCustomers(Object.values(custMap));

      // Top 10 fabrics by revenue & meters
      const fabricMap = {};
      sales.forEach((s) => {
        const name = s.fabric_name || "Unknown";
        if (!fabricMap[name]) fabricMap[name] = { name, revenue: 0, meters: 0 };
        fabricMap[name].revenue += s.total_amount || 0;
        fabricMap[name].meters += s.meters || 0;
      });
      setTopFabrics(Object.values(fabricMap));
    } catch (err) {
      console.error("Error fetching reports:", err);
    } finally {
      setLoading(false);
    }
  }

  const totalAlerts =
    alerts.pendingCustomers.length +
    alerts.pendingSuppliers.length +
    alerts.lowStock.length;

  const cards = [
    {
      title: "Total Sales",
      value: summary.totalSales,
      prev: prevSummary.totalSales,
      icon: TrendingUp,
      bg: "bg-blue-50",
      iconBg: "bg-blue-500",
      text: "text-blue-700",
    },
    {
      title: "Gross Profit",
      value: summary.totalProfit,
      prev: prevSummary.totalProfit,
      icon: DollarSign,
      bg: "bg-green-50",
      iconBg: "bg-green-500",
      text: "text-green-700",
    },
    {
      title: "Total Expenses",
      value: summary.totalExpenses,
      icon: Receipt,
      bg: "bg-red-50",
      iconBg: "bg-red-500",
      text: "text-red-600",
    },
    {
      title: "Net Profit",
      value: summary.netProfit,
      prev: prevSummary.netProfit,
      icon: DollarSign,
      bg: summary.netProfit >= 0 ? "bg-emerald-50" : "bg-red-50",
      iconBg: summary.netProfit >= 0 ? "bg-emerald-500" : "bg-red-500",
      text: summary.netProfit >= 0 ? "text-emerald-700" : "text-red-600",
    },
    {
      title: "Total Purchases",
      value: summary.totalPurchases,
      icon: ShoppingBag,
      bg: "bg-orange-50",
      iconBg: "bg-orange-500",
      text: "text-orange-700",
    },
    {
      title: "Receivables",
      value: summary.totalReceivables,
      icon: Users,
      bg: "bg-purple-50",
      iconBg: "bg-purple-500",
      text: "text-purple-700",
    },
  ];

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-200 border-t-primary-600"></div>
      </div>
    );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Reports & Analytics
          </h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            Business performance — {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input w-28"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          ["analytics", "Analytics"],
          ["rankings", "Rankings"],
          ["alerts", `Alerts${totalAlerts > 0 ? ` (${totalAlerts})` : ""}`],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === id ? "border-primary-600 text-primary-600" : "border-transparent text-gray-500 hover:text-gray-700"} ${id === "alerts" && totalAlerts > 0 ? "text-red-500" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── ANALYTICS TAB ── */}
      {activeTab === "analytics" && (
        <div className="space-y-5">
          {/* Summary Cards with YoY */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {cards.map((card) => {
              const Icon = card.icon;
              const yoy =
                card.prev !== undefined
                  ? pctChange(card.value, card.prev)
                  : null;
              return (
                <div
                  key={card.title}
                  className={`rounded-xl p-3 ${card.bg} border border-gray-100`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-500 leading-tight">
                      {card.title}
                    </p>
                    <div className={`${card.iconBg} p-1.5 rounded-lg shrink-0`}>
                      <Icon className="w-3 h-3 text-white" />
                    </div>
                  </div>
                  <p className={`text-base font-bold ${card.text}`}>
                    {fmtShort(card.value, showAmount)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {fmt(card.value, showAmount)}
                  </p>
                  {yoy && (
                    <p
                      className={`text-xs mt-1 flex items-center gap-0.5 ${yoy.up ? "text-green-600" : "text-red-500"}`}
                    >
                      {yoy.up ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {yoy.value}% vs {year - 1}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Monthly Trend Chart */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Monthly Trend</h2>
              <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                {[
                  ["all", "All"],
                  ["sales", "Sales"],
                  ["profit", "Profit"],
                  ["purchases", "Purchases"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setChartView(v)}
                    className={`px-2.5 py-1.5 rounded-md font-medium transition-all ${chartView === v ? "bg-white shadow text-gray-900" : "text-gray-500"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={monthlyData}
                margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  width={42}
                />
                <Tooltip formatter={(v) => fmt(v, showAmount)} />
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
          </div>

          {/* Monthly Bar Chart */}
          <div className="card p-4">
            <h2 className="font-semibold text-gray-900 mb-4">
              Monthly Sales vs Purchases
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={monthlyData}
                margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  width={42}
                />
                <Tooltip formatter={(v) => fmt(v, showAmount)} />
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
        </div>
      )}

      {/* ── RANKINGS TAB ── */}
      {activeTab === "rankings" && (
        <div className="space-y-5">
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs w-fit">
            {[
              ["revenue", "By Revenue"],
              ["meters", "By Meters Sold"],
              ["pending", "By Pending"],
            ].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setRankView(v)}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${rankView === v ? "bg-white shadow text-gray-900" : "text-gray-500"}`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Top 10 Customers */}
          <div className="card p-4">
            <h2 className="font-semibold text-gray-900 mb-4">
              Top 10 Customers
            </h2>
            {topCustomers.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">
                No data for {year}
              </p>
            ) : (
              (() => {
                const sortedCustomers = [...topCustomers]
                  .filter((c) => rankView !== "pending" || c.pending > 0)
                  .sort((a, b) =>
                    rankView === "pending"
                      ? b.pending - a.pending
                      : b.revenue - a.revenue,
                  )
                  .slice(0, 10);
                const maxVal =
                  rankView === "pending"
                    ? sortedCustomers[0]?.pending || 0
                    : sortedCustomers[0]?.revenue || 0;
                return (
                  <div className="space-y-2.5">
                    {sortedCustomers.map((c, i) => {
                      const val =
                        rankView === "pending" ? c.pending : c.revenue;
                      const pct =
                        maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
                      return (
                        <div key={c.name}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-bold">
                                {i + 1}
                              </span>
                              <span className="font-medium text-gray-800 truncate">
                                {c.name}
                              </span>
                              {rankView !== "pending" && c.pending > 0 && (
                                <span className="shrink-0 text-xs text-warning-600 font-medium">
                                  ({fmt(c.pending, showAmount)} due)
                                </span>
                              )}
                            </div>
                            <span className="text-gray-600 shrink-0 ml-2">
                              {fmtShort(val, showAmount)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div
                              className="bg-blue-500 h-1.5 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>

          {/* Top 10 Fabrics */}
          <div className="card p-4">
            <h2 className="font-semibold text-gray-900 mb-4">Top 10 Fabrics</h2>
            {topFabrics.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">
                No data for {year}
              </p>
            ) : (
              (() => {
                const sortedFabrics = [...topFabrics]
                  .sort((a, b) =>
                    rankView === "meters"
                      ? b.meters - a.meters
                      : b.revenue - a.revenue,
                  )
                  .slice(0, 10);
                const maxVal =
                  rankView === "meters"
                    ? sortedFabrics[0]?.meters || 0
                    : sortedFabrics[0]?.revenue || 0;
                return (
                  <div className="space-y-2.5">
                    {sortedFabrics.map((f, i) => {
                      const val = rankView === "meters" ? f.meters : f.revenue;
                      const pct =
                        maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
                      return (
                        <div key={f.name}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0 w-5 h-5 rounded-full bg-accent-500 text-white text-xs flex items-center justify-center font-bold">
                                {i + 1}
                              </span>
                              <span className="font-medium text-gray-800 truncate">
                                {f.name}
                              </span>
                            </div>
                            <span className="text-gray-600 shrink-0 ml-2">
                              {rankView === "meters"
                                ? `${f.meters.toFixed(1)}m`
                                : fmtShort(f.revenue, showAmount)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div
                              className="bg-accent-500 h-1.5 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* ── ALERTS TAB ── */}
      {activeTab === "alerts" && (
        <div className="space-y-4">
          {/* Customer Dues */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-warning-600" />
              <h2 className="font-semibold text-gray-900">
                Customer Pending Payments
              </h2>
              <span className="ml-auto text-xs bg-warning-100 text-warning-700 px-2 py-0.5 rounded-full font-medium">
                {alerts.pendingCustomers.length}
              </span>
            </div>
            {alerts.pendingCustomers.length === 0 ? (
              <p className="text-center py-8 text-sm text-gray-400">
                No pending customer payments 🎉
              </p>
            ) : (
              <div className="divide-y divide-gray-50">
                {alerts.pendingCustomers.map((c, i) => (
                  <div
                    key={i}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {c.name}
                      </p>
                      {c.phone && (
                        <p className="text-xs text-gray-400">{c.phone}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold text-warning-600 text-sm">
                        {fmt(c.pending, showAmount)}
                      </span>
                      {c.phone && (
                        <a
                          href={`https://wa.me/91${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${c.name}, your outstanding balance is ${fmt(c.pending)}. Please clear at your earliest convenience. Thank you!`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-green-50 hover:bg-green-100 rounded-lg text-green-600"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Supplier Dues */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-orange-500" />
              <h2 className="font-semibold text-gray-900">
                Supplier Pending Payments
              </h2>
              <span className="ml-auto text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                {alerts.pendingSuppliers.length}
              </span>
            </div>
            {alerts.pendingSuppliers.length === 0 ? (
              <p className="text-center py-8 text-sm text-gray-400">
                No pending supplier payments 🎉
              </p>
            ) : (
              <div className="divide-y divide-gray-50">
                {alerts.pendingSuppliers.map((s, i) => (
                  <div
                    key={i}
                    className="px-4 py-3 flex items-center justify-between"
                  >
                    <p className="font-medium text-gray-900 text-sm">
                      {s.name}
                    </p>
                    <span className="font-semibold text-orange-600 text-sm">
                      {fmt(s.pending, showAmount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Low Stock */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Package className="w-4 h-4 text-red-500" />
              <h2 className="font-semibold text-gray-900">Low Stock Fabrics</h2>
              <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                {alerts.lowStock.length}
              </span>
            </div>
            {alerts.lowStock.length === 0 ? (
              <p className="text-center py-8 text-sm text-gray-400">
                All fabrics are well stocked 🎉
              </p>
            ) : (
              <div className="divide-y divide-gray-50">
                {alerts.lowStock.map((f, i) => (
                  <div
                    key={i}
                    className="px-4 py-3 flex items-center justify-between"
                  >
                    <p className="font-medium text-gray-900 text-sm">
                      {f.name}
                    </p>
                    <span className="font-semibold text-red-600 text-sm">
                      {f.available_meters}m left
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
