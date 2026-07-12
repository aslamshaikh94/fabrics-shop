"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import {
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  Users,
  CreditCard,
  Receipt,
} from "lucide-react";
import { useShowAmount } from "./ShowAmountProvider";

function pctChange(curr, prev) {
  if (!prev) return null;
  const diff = ((curr - prev) / prev) * 100;
  return { value: `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`, up: diff >= 0 };
}

function fmtAmt(n, show) {
  if (!show) return "₹•••";
  return `₹${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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

export default function Dashboard() {
  const { showAmount } = useShowAmount();
  const [stats, setStats] = useState({
    thisMonthSales: 0,
    thisMonthProfit: 0,
    thisMonthCollected: 0,
    thisMonthToCollect: 0,
    pendingPurchasePayments: 0,
    paidPurchasePayments: 0,
    pendingSalePayments: 0,
    totalFabrics: 0,
    totalFabricMeters: 0,
    totalFabricQuantity: 0,
    totalCustomers: 0,
    totalPurchases: 0,
    collectedAmount: 0,
    inventoryValue: 0,
  });
  const [changes, setChanges] = useState({});
  const [recentSales, setRecentSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState("month");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [periodStats, setPeriodStats] = useState({
    sales: 0,
    profit: 0,
    collected: 0,
    toCollect: 0,
  });
  const [availableYears, setAvailableYears] = useState([
    new Date().getFullYear(),
  ]);

  const fetchStats = useCallback(async () => {
    try {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

      const [
        salesRes,
        purchasesRes,
        fabricsRes,
        customersRes,
        thisMoSales,
        prevMoSales,
        thisMoCollect,
        prevMoCollect,
        recentRes,
        allCustomersRes,
        yearsRes,
      ] = await Promise.all([
        supabase
          .from("sales")
          .select("total_amount, remaining_amount, paid_amount"),
        supabase
          .from("purchases")
          .select("total_amount, paid_amount, remaining_amount"),
        supabase
          .from("fabrics")
          .select("available_meters, purchase_price_per_meter, quantity"),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase
          .from("sales")
          .select("total_amount, margin")
          .gte("sale_date", `${thisMonth}-01`),
        supabase
          .from("sales")
          .select("total_amount, margin")
          .gte("sale_date", `${prevMonth}-01`)
          .lt("sale_date", `${thisMonth}-01`),
        supabase
          .from("sales")
          .select("paid_amount, remaining_amount")
          .gte("sale_date", `${thisMonth}-01`),
        supabase
          .from("sales")
          .select("paid_amount, remaining_amount")
          .gte("sale_date", `${prevMonth}-01`)
          .lt("sale_date", `${thisMonth}-01`),
        supabase
          .from("sales")
          .select(
            "id, sale_date, total_amount, notes, fabric_name, customer_id, customer_name, sale_group_id, created_at",
          )
          .order("sale_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("customers").select("id, name"),
        supabase.from("sales").select("sale_date").order("sale_date").limit(1),
      ]);

      // Build available years
      if (yearsRes.data?.length) {
        const firstYear = new Date(yearsRes.data[0].sale_date).getFullYear();
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let y = firstYear; y <= currentYear; y++) years.push(y);
        setAvailableYears(years.reverse());
      }

      // Build customer name lookup
      const customerNameMap = Object.fromEntries(
        (allCustomersRes.data || []).map((c) => [c.id, c.name]),
      );

      const invValue =
        fabricsRes.data?.reduce(
          (s, f) => s + (f.available_meters * f.purchase_price_per_meter || 0),
          0,
        ) || 0;
      const totalMeters =
        fabricsRes.data?.reduce((s, f) => s + (f.available_meters || 0), 0) ||
        0;
      const totalQuantity =
        fabricsRes.data?.reduce((s, f) => {
          const num = parseFloat((f.quantity || "").replace(/[^0-9.]/g, ""));
          return s + (isNaN(num) ? 0 : num);
        }, 0) || 0;

      const currSales =
        thisMoSales.data?.reduce((s, r) => s + (r.total_amount || 0), 0) || 0;
      const prevSales =
        prevMoSales.data?.reduce((s, r) => s + (r.total_amount || 0), 0) || 0;
      const currProfit =
        thisMoSales.data?.reduce((s, r) => s + (r.margin || 0), 0) || 0;
      const prevProfit =
        prevMoSales.data?.reduce((s, r) => s + (r.margin || 0), 0) || 0;
      const currCollected =
        thisMoCollect.data?.reduce((s, r) => s + (r.paid_amount || 0), 0) || 0;
      const prevCollected =
        prevMoCollect.data?.reduce((s, r) => s + (r.paid_amount || 0), 0) || 0;
      const currToCollect =
        thisMoCollect.data?.reduce(
          (s, r) => s + (r.remaining_amount || 0),
          0,
        ) || 0;
      const prevToCollect =
        prevMoCollect.data?.reduce(
          (s, r) => s + (r.remaining_amount || 0),
          0,
        ) || 0;
      const totalSalesAmount =
        salesRes.data?.reduce((s, r) => s + (r.total_amount || 0), 0) || 0;
      const totalRemaining =
        salesRes.data?.reduce((s, r) => s + (r.remaining_amount || 0), 0) || 0;
      const totalPaidAmount =
        salesRes.data?.reduce((s, r) => s + (r.paid_amount || 0), 0) || 0;

      setStats({
        thisMonthSales: currSales,
        thisMonthProfit: currProfit,
        thisMonthCollected: currCollected,
        thisMonthToCollect: currToCollect,
        pendingSalePayments: totalRemaining,
        pendingPurchasePayments:
          purchasesRes.data?.reduce(
            (s, r) =>
              s + Math.max((r.total_amount || 0) - (r.paid_amount || 0), 0),
            0,
          ) || 0,
        paidPurchasePayments:
          purchasesRes.data?.reduce((s, r) => s + (r.paid_amount || 0), 0) || 0,
        totalFabrics: fabricsRes.data?.length || 0,
        totalFabricMeters: totalMeters,
        totalFabricQuantity: totalQuantity,
        inventoryValue: invValue,
        totalCustomers: customersRes.count || 0,
        totalPurchases:
          purchasesRes.data?.reduce((s, r) => s + (r.total_amount || 0), 0) ||
          0,
        collectedAmount: totalPaidAmount,
      });
      setChanges({
        sales: pctChange(currSales, prevSales),
        profit: pctChange(currProfit, prevProfit),
        collected: pctChange(currCollected, prevCollected),
        toCollect: pctChange(currToCollect, prevToCollect),
      });

      // Set initial period stats to current month
      setPeriodStats({
        sales: currSales,
        profit: currProfit,
        collected: currCollected,
        toCollect: currToCollect,
      });

      // Group recent sales
      const rawSales = recentRes.data || [];
      const groups = {};
      rawSales.forEach((sale) => {
        const key = sale.sale_group_id || sale.id;
        if (!groups[key]) {
          groups[key] = {
            id: key,
            sale_date: sale.sale_date,
            customer_id: sale.customer_id,
            customer_name:
              customerNameMap[sale.customer_id] ||
              sale.customer_name ||
              "Walk-in",
            firstFabricName: sale.fabric_name,
            total_amount: 0,
            createdAt: sale.created_at || sale.sale_date,
            items: [],
          };
        }
        groups[key].items.push(sale);
        groups[key].total_amount += sale.total_amount || 0;
        if (sale.fabric_name) groups[key].firstFabricName = sale.fabric_name;
        if (sale.created_at > groups[key].createdAt) {
          groups[key].createdAt = sale.created_at;
        }
      });

      const groupedRecentSales = Object.values(groups)
        .sort((a, b) => {
          const dateDiff = new Date(b.sale_date) - new Date(a.sale_date);
          if (dateDiff !== 0) return dateDiff;
          return new Date(b.createdAt) - new Date(a.createdAt);
        })
        .slice(0, 6);

      setRecentSales(groupedRecentSales);
    } catch (err) {
      console.error("Error fetching stats:", err);
      setError("Failed to load dashboard data. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Fetch period stats when selection changes
  useEffect(() => {
    if (loading) return;
    fetchPeriodStats();
  }, [selectedPeriod, selectedYear, selectedMonth]);

  async function fetchPeriodStats() {
    try {
      let startDate, endDate;
      const now = new Date();

      if (selectedPeriod === "month") {
        const monthStr = String(selectedMonth + 1).padStart(2, "0");
        startDate = `${selectedYear}-${monthStr}-01`;
        // Calculate last day of the month
        const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        endDate = `${selectedYear}-${monthStr}-${lastDay}`;
      } else if (selectedPeriod === "year") {
        startDate = `${selectedYear}-01-01`;
        endDate = `${selectedYear}-12-31`;
      } else {
        // all time
        startDate = "2000-01-01";
        endDate = "2099-12-31";
      }

      const [salesRes, collectRes] = await Promise.all([
        supabase
          .from("sales")
          .select("total_amount, margin")
          .gte("sale_date", startDate)
          .lte("sale_date", endDate),
        supabase
          .from("sales")
          .select("paid_amount, remaining_amount")
          .gte("sale_date", startDate)
          .lte("sale_date", endDate),
      ]);

      setPeriodStats({
        sales:
          salesRes.data?.reduce((s, r) => s + (r.total_amount || 0), 0) || 0,
        profit: salesRes.data?.reduce((s, r) => s + (r.margin || 0), 0) || 0,
        collected:
          collectRes.data?.reduce((s, r) => s + (r.paid_amount || 0), 0) || 0,
        toCollect:
          collectRes.data?.reduce((s, r) => s + (r.remaining_amount || 0), 0) ||
          0,
      });
    } catch (err) {
      console.error("Error fetching period stats:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-200 border-t-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  const now = new Date();
  const monthName = now.toLocaleString("en-IN", { month: "long" });

  const periodLabel =
    selectedPeriod === "month"
      ? `${MONTHS[selectedMonth]} ${selectedYear}`
      : selectedPeriod === "year"
        ? `${selectedYear}`
        : "All Time";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-0.5 text-sm">
          {monthName} {now.getFullYear()} overview
        </p>
      </div>

      {/* This month stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            title: `${monthName} Sales`,
            value: stats.thisMonthSales,
            change: changes.sales,
            icon: TrendingUp,
            iconBg: "bg-blue-500",
            valueBg: "text-gray-900",
          },
          {
            title: `${monthName} Profit`,
            value: stats.thisMonthProfit,
            change: changes.profit,
            icon: DollarSign,
            iconBg: "bg-green-500",
            valueBg: "text-green-700",
          },
          {
            title: `${monthName} Collected`,
            value: stats.thisMonthCollected,
            change: changes.collected,
            icon: Receipt,
            iconBg: "bg-green-500",
            valueBg: "text-green-600",
            subtitle: "Cash received this month",
          },
          {
            title: `${monthName} To Collect`,
            value: stats.thisMonthToCollect,
            change: changes.toCollect,
            icon: CreditCard,
            iconBg: "bg-purple-500",
            valueBg: "text-purple-600",
            subtitle: "Pending from customers",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="card-hover p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500 leading-tight">
                  {card.title}
                </p>
                <div className={`${card.iconBg} p-1.5 rounded-lg`}>
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <p className={`text-xl font-bold ${card.valueBg}`}>
                {fmtAmt(card.value, showAmount)}
              </p>
              {card.change && (
                <p
                  className={`text-xs mt-1 flex items-center gap-0.5 ${card.change.up ? "text-green-600" : "text-red-500"}`}
                >
                  {card.change.up ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {card.change.value} vs last month
                </p>
              )}
              {card.subtitle && (
                <p className="text-xs text-gray-400 mt-1">{card.subtitle}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3">
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
          {[
            ["month", "Month"],
            ["year", "Year"],
            ["all", "All Time"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setSelectedPeriod(v)}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${selectedPeriod === v ? "bg-white shadow text-gray-900" : "text-gray-500"}`}
            >
              {l}
            </button>
          ))}
        </div>
        {selectedPeriod !== "all" && (
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="input w-24 text-xs"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
        {selectedPeriod === "month" && (
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="input w-24 text-xs"
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Period stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            title: `${periodLabel} Sales`,
            value: periodStats.sales,
            icon: TrendingUp,
            iconBg: "bg-blue-500",
            valueBg: "text-gray-900",
          },
          {
            title: `${periodLabel} Profit`,
            value: periodStats.profit,
            icon: DollarSign,
            iconBg: "bg-green-500",
            valueBg: "text-green-700",
          },
          {
            title: `${periodLabel} Collected`,
            value: periodStats.collected,
            icon: Receipt,
            iconBg: "bg-green-500",
            valueBg: "text-green-600",
          },
          {
            title: `${periodLabel} To Collect`,
            value: periodStats.toCollect,
            icon: CreditCard,
            iconBg: "bg-purple-500",
            valueBg: "text-purple-600",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="card-hover p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500 leading-tight">
                  {card.title}
                </p>
                <div className={`${card.iconBg} p-1.5 rounded-lg`}>
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <p className={`text-xl font-bold ${card.valueBg}`}>
                {fmtAmt(card.value, showAmount)}
              </p>
            </div>
          );
        })}
      </div>

      {/* All-time totals */}
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Lifetime Summary
      </div>

      {/* Supplier payment breakdown */}
      <div className="card-hover p-4">
        <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">
          Supplier Payments
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-gray-400">Purchased</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">
              {fmtAmt(stats.totalPurchases, showAmount)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Paid</p>
            <p className="text-sm font-bold text-green-600 mt-0.5">
              {fmtAmt(stats.paidPurchasePayments, showAmount)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Pending</p>
            <p className="text-sm font-bold text-orange-600 mt-0.5">
              {fmtAmt(stats.pendingPurchasePayments, showAmount)}
            </p>
          </div>
        </div>
        <div className="mt-3 h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
          <div
            className="h-2.5 bg-green-500"
            style={{
              width:
                stats.totalPurchases > 0
                  ? `${(stats.paidPurchasePayments / stats.totalPurchases) * 100}%`
                  : "0%",
            }}
          />
          <div
            className="h-2.5 bg-orange-400"
            style={{
              width:
                stats.totalPurchases > 0
                  ? `${(stats.pendingPurchasePayments / stats.totalPurchases) * 100}%`
                  : "0%",
            }}
          />
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
            {stats.totalPurchases > 0
              ? Math.round(
                  (stats.paidPurchasePayments / stats.totalPurchases) * 100,
                )
              : 0}
            % paid
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>
            {stats.totalPurchases > 0
              ? Math.round(
                  (stats.pendingPurchasePayments / stats.totalPurchases) * 100,
                )
              : 0}
            % pending
          </span>
        </div>
      </div>

      {/* Inventory, Customers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="bg-primary-100 p-3 rounded-xl shrink-0">
            <Package className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Fabrics</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.totalFabrics}
            </p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="bg-blue-100 p-3 rounded-xl shrink-0">
            <Package className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Quantity</p>
            <p className="text-2xl font-bold text-blue-700">
              {stats.totalFabricQuantity}
            </p>
            <p className="text-xs text-blue-500 mt-0.5">units</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="bg-indigo-100 p-3 rounded-xl shrink-0">
            <Package className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Stock</p>
            <p className="text-2xl font-bold text-indigo-700">
              {stats.totalFabricMeters.toFixed(2)}
            </p>
            <p className="text-xs text-indigo-500 mt-0.5">meters</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="bg-accent-100 p-3 rounded-xl shrink-0">
            <Users className="w-6 h-6 text-accent-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Customers</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.totalCustomers}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Sales */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Sales</h2>
          <span className="text-xs text-gray-400">Last 6</span>
        </div>
        {recentSales.length === 0 ? (
          <div className="py-10 text-center">
            <TrendingUp className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No sales yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentSales.map((group) => (
              <div
                key={group.id}
                className="px-4 py-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">
                    {group.customer_name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {group.firstFabricName || "—"}
                    {group.items.length > 1 &&
                      ` (+${group.items.length - 1} more)`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-gray-900 text-sm">
                    {fmtAmt(group.total_amount, showAmount)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(group.sale_date).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
