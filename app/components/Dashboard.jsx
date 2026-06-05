"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  Users,
  AlertTriangle,
  AlertCircle,
  ShoppingBag,
  CreditCard,
  Receipt,
} from "lucide-react";

function pctChange(curr, prev) {
  if (!prev) return null;
  const diff = ((curr - prev) / prev) * 100;
  return { value: `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`, up: diff >= 0 };
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    thisMonthSales: 0,
    thisMonthProfit: 0,
    pendingPurchasePayments: 0,
    paidPurchasePayments: 0,
    pendingSalePayments: 0,
    totalFabrics: 0,
    totalCustomers: 0,
    totalPurchases: 0,
    totalExpenses: 0,
  });
  const [changes, setChanges] = useState({});
  const [lowStock, setLowStock] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
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
        lowStockRes,
        recentRes,
        expensesRes,
      ] = await Promise.all([
        supabase.from("sales").select("remaining_amount"),
        supabase
          .from("purchases")
          .select("total_amount, paid_amount, remaining_amount"),
        supabase.from("fabrics").select("id", { count: "exact", head: true }),
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
          .from("fabrics")
          .select("name, available_meters")
          .lt("available_meters", 10),
        supabase
          .from("sales")
          .select(
            "id, sale_date, total_amount, notes, customer:customers(name)",
          )
          .order("sale_date", { ascending: false })
          .limit(6),
        supabase.from("expenses").select("amount"),
      ]);

      const currSales =
        thisMoSales.data?.reduce((s, r) => s + (r.total_amount || 0), 0) || 0;
      const prevSales =
        prevMoSales.data?.reduce((s, r) => s + (r.total_amount || 0), 0) || 0;
      const currProfit =
        thisMoSales.data?.reduce((s, r) => s + (r.margin || 0), 0) || 0;
      const prevProfit =
        prevMoSales.data?.reduce((s, r) => s + (r.margin || 0), 0) || 0;

      setStats({
        thisMonthSales: currSales,
        thisMonthProfit: currProfit,
        pendingSalePayments:
          salesRes.data?.reduce((s, r) => s + (r.remaining_amount || 0), 0) ||
          0,
        pendingPurchasePayments:
          purchasesRes.data?.reduce(
            (s, r) => s + (r.remaining_amount || 0),
            0,
          ) || 0,
        paidPurchasePayments:
          purchasesRes.data?.reduce((s, r) => s + (r.paid_amount || 0), 0) || 0,
        totalFabrics: fabricsRes.count || 0,
        totalCustomers: customersRes.count || 0,
        totalPurchases:
          purchasesRes.data?.reduce((s, r) => s + (r.total_amount || 0), 0) ||
          0,
        totalExpenses:
          expensesRes.data?.reduce((s, r) => s + (r.amount || 0), 0) || 0,
      });
      setChanges({
        sales: pctChange(currSales, prevSales),
        profit: pctChange(currProfit, prevProfit),
      });
      setLowStock(lowStockRes.data || []);
      setRecentSales(recentRes.data || []);
    } catch (err) {
      console.error("Error fetching stats:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const now = new Date();
  const monthName = now.toLocaleString("en-IN", { month: "long" });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-0.5 text-sm">
          {monthName} {now.getFullYear()} overview
        </p>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-warning-800 text-sm">
              Low Stock Alert
            </p>
            <p className="text-sm text-warning-700 mt-0.5">
              {lowStock
                .map((f) => `${f.name} (${f.available_meters}m)`)
                .join(" · ")}
            </p>
          </div>
        </div>
      )}

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
            title: "To Collect",
            value: stats.pendingSalePayments,
            icon: CreditCard,
            iconBg: "bg-purple-500",
            valueBg: "text-purple-600",
            subtitle: "From customers",
          },
          {
            title: "Total Expenses",
            value: stats.totalExpenses,
            icon: Receipt,
            iconBg: "bg-red-500",
            valueBg: "text-red-600",
            subtitle: "All time",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500 leading-tight">
                  {card.title}
                </p>
                <div className={`${card.iconBg} p-1.5 rounded-lg`}>
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <p className={`text-xl font-bold ${card.valueBg}`}>
                ₹{card.value.toLocaleString("en-IN")}
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

      {/* Supplier payment breakdown */}
      <div className="card p-4">
        <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">
          Supplier Payments
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-gray-400">Purchased</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">
              ₹{stats.totalPurchases.toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Paid</p>
            <p className="text-sm font-bold text-green-600 mt-0.5">
              ₹{stats.paidPurchasePayments.toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Pending</p>
            <p className="text-sm font-bold text-orange-600 mt-0.5">
              ₹{stats.pendingPurchasePayments.toLocaleString("en-IN")}
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
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="bg-primary-100 p-3 rounded-xl shrink-0">
            <Package className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Fabric Types</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.totalFabrics}
            </p>
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
            {recentSales.map((sale) => (
              <div
                key={sale.id}
                className="px-4 py-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">
                    {sale.customer?.name || "Walk-in"}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {sale.notes?.split("|")[0]?.replace("Fabric:", "").trim() ||
                      "—"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-gray-900 text-sm">
                    ₹{sale.total_amount.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(sale.sale_date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
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
