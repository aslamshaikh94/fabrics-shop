"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
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
import {
  TrendingUp,
  DollarSign,
  Users,
  Wallet,
  ShoppingBag,
  RefreshCw,
  Calendar,
  Plus,
  Trash2,
  UserPlus,
  UserMinus,
  Pencil,
} from "lucide-react";
import { useToast } from "./Toast";
import Modal from "./shared/Modal";
import ConfirmModal from "./ConfirmModal";

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

function fmt(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function fmtShort(n) {
  n = Number(n || 0);
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n}`;
}

const partnerColors = [
  {
    border: "border-l-blue-500",
    bg: "bg-blue-50/50",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    chart: "#3b82f6",
  },
  {
    border: "border-l-purple-500",
    bg: "bg-purple-50/50",
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    chart: "#8b5cf6",
  },
  {
    border: "border-l-emerald-500",
    bg: "bg-emerald-50/50",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    chart: "#10b981",
  },
  {
    border: "border-l-orange-500",
    bg: "bg-orange-50/50",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    chart: "#f59e0b",
  },
  {
    border: "border-l-rose-500",
    bg: "bg-rose-50/50",
    iconBg: "bg-rose-100",
    iconColor: "text-rose-600",
    chart: "#f43f5e",
  },
  {
    border: "border-l-cyan-500",
    bg: "bg-cyan-50/50",
    iconBg: "bg-cyan-100",
    iconColor: "text-cyan-600",
    chart: "#06b6d4",
  },
];

export default function PartnersPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState([
    new Date().getFullYear(),
  ]);
  const [partners, setPartners] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [allWithdrawals, setAllWithdrawals] = useState([]);
  const [summary, setSummary] = useState({ totalSales: 0, grossProfit: 0 });
  const [partnerSummaries, setPartnerSummaries] = useState({});
  const [partnerDetails, setPartnerDetails] = useState({});
  const [chartView, setChartView] = useState("profit");

  const [showWithdrawalForm, setShowWithdrawalForm] = useState(false);
  const [editingWithdrawalId, setEditingWithdrawalId] = useState(null);
  const [withdrawalPartnerId, setWithdrawalPartnerId] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalDate, setWithdrawalDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [withdrawalReason, setWithdrawalReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDeleteWithdrawal, setConfirmDeleteWithdrawal] = useState(null);

  const [showAddPartnerForm, setShowAddPartnerForm] = useState(false);
  const [newPartnerName, setNewPartnerName] = useState("");
  const [newPartnerShare, setNewPartnerShare] = useState("50");
  const [confirmRemovePartner, setConfirmRemovePartner] = useState(null);
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterPartner, setFilterPartner] = useState("all");

  useEffect(() => {
    async function init() {
      await fetchYears();
      await fetchPartners();
      await fetchData();
    }
    init();
  }, []);
  useEffect(() => {
    fetchData();
  }, [year, partners]);

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

  async function fetchPartners() {
    try {
      const { data } = await supabase
        .from("partners")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      setPartners(data || []);
    } catch (err) {
      console.error("Error fetching partners:", err);
      setPartners([]);
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const [salesRes, withdrawalsRes, fabricsRes] = await Promise.all([
        supabase
          .from("sales")
          .select(
            "sale_date, total_amount, margin, meters, price_per_meter, cost_price_per_meter, fabric_id, fabric_name",
          )
          .gte("sale_date", startDate)
          .lte("sale_date", endDate),
        supabase
          .from("withdrawals")
          .select("id, withdrawal_date, amount, withdrawn_by, reason")
          .gte("withdrawal_date", startDate)
          .lte("withdrawal_date", endDate)
          .order("withdrawal_date", { ascending: false }),
        supabase.from("fabrics").select("id, name, purchase_price_per_meter"),
      ]);

      const sales = salesRes.data || [];
      const withdrawals = withdrawalsRes.data || [];
      const fabrics = fabricsRes.data || [];
      setAllWithdrawals(withdrawals);

      const fabricCostMap = {};
      fabrics.forEach((f) => {
        fabricCostMap[f.id] = f.purchase_price_per_meter || 0;
        fabricCostMap[f.name?.toLowerCase()] = f.purchase_price_per_meter || 0;
      });

      const monthly = Array.from({ length: 12 }, (_, i) => ({
        month: MONTHS[i],
        monthNum: i + 1,
        sales: 0,
        grossProfit: 0,
      }));

      sales.forEach((s) => {
        const m = new Date(s.sale_date).getMonth();
        monthly[m].sales += s.total_amount || 0;
        let costPrice = s.cost_price_per_meter || 0;
        if (costPrice <= 0)
          costPrice =
            fabricCostMap[s.fabric_id] ||
            fabricCostMap[s.fabric_name?.toLowerCase()] ||
            0;
        if (costPrice > 0)
          monthly[m].grossProfit +=
            (s.meters || 0) * ((s.price_per_meter || 0) - costPrice);
        else monthly[m].grossProfit += s.margin || 0;
      });

      setMonthlyData(monthly);

      const totalSales = monthly.reduce((s, m) => s + m.sales, 0);
      const grossProfit = monthly.reduce((s, m) => s + m.grossProfit, 0);
      setSummary({ totalSales, grossProfit });

      const pSum = {};
      const pDet = {};
      const totalShare =
        partners.reduce((s, p) => s + (p.share_percentage || 0), 0) || 100;

      partners.forEach((partner, idx) => {
        const sharePct = (partner.share_percentage || 0) / totalShare;
        const nameLower = partner.name.toLowerCase();
        const shareAmount = grossProfit * sharePct;
        const pWithdrawals = withdrawals.filter((w) =>
          (w.withdrawn_by || "").toLowerCase().includes(nameLower),
        );
        const withdrawnAmount = pWithdrawals.reduce(
          (s, w) => s + (w.amount || 0),
          0,
        );

        pSum[partner.id] = {
          share: shareAmount,
          withdrawn: withdrawnAmount,
          balance: shareAmount - withdrawnAmount,
          color: partnerColors[idx % partnerColors.length],
        };
        pDet[partner.id] = {
          withdrawals: pWithdrawals,
          sharePct: (sharePct * 100).toFixed(0),
        };
      });

      setPartnerSummaries(pSum);
      setPartnerDetails(pDet);
    } catch (err) {
      console.error("Error fetching partner data:", err);
      toast("Failed to load partner data", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveWithdrawal(e) {
    e.preventDefault();
    if (!withdrawalPartnerId || !withdrawalAmount) return;
    const partner = partners.find((p) => p.id === withdrawalPartnerId);
    if (!partner) return;
    setSaving(true);
    try {
      if (editingWithdrawalId) {
        const { error } = await supabase
          .from("withdrawals")
          .update({
            amount: parseFloat(withdrawalAmount),
            withdrawal_date: withdrawalDate,
            withdrawn_by: partner.name,
            reason: withdrawalReason,
          })
          .eq("id", editingWithdrawalId);
        if (error) throw error;
        toast("Withdrawal updated");
      } else {
        const { error } = await supabase.from("withdrawals").insert([
          {
            amount: parseFloat(withdrawalAmount),
            withdrawal_date: withdrawalDate,
            withdrawn_by: partner.name,
            reason: withdrawalReason,
          },
        ]);
        if (error) throw error;
        toast(
          `Withdrawal of ₹${parseFloat(withdrawalAmount).toLocaleString("en-IN")} recorded`,
        );
      }
      setShowWithdrawalForm(false);
      resetWithdrawalForm();
      fetchData();
    } catch (err) {
      console.error("Error saving withdrawal:", err);
      toast("Failed to save withdrawal", "error");
    } finally {
      setSaving(false);
    }
  }

  function openEditWithdrawal(w) {
    const partner = partners.find((p) =>
      (w.withdrawn_by || "").toLowerCase().includes(p.name.toLowerCase()),
    );
    setEditingWithdrawalId(w.id);
    setWithdrawalPartnerId(partner?.id || "");
    setWithdrawalAmount(w.amount.toString());
    setWithdrawalDate(w.withdrawal_date);
    setWithdrawalReason(w.reason || "");
    setShowWithdrawalForm(true);
  }

  function openAddWithdrawal() {
    setEditingWithdrawalId(null);
    resetWithdrawalForm();
    setShowWithdrawalForm(true);
  }

  async function handleDeleteWithdrawal(id) {
    try {
      const { error } = await supabase
        .from("withdrawals")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast("Withdrawal deleted");
      setConfirmDeleteWithdrawal(null);
      fetchData();
    } catch (err) {
      console.error("Error deleting withdrawal:", err);
      toast("Failed to delete withdrawal", "error");
      setConfirmDeleteWithdrawal(null);
    }
  }

  async function handleAddPartner(e) {
    e.preventDefault();
    if (!newPartnerName.trim()) return;
    try {
      const { error } = await supabase.from("partners").insert([
        {
          name: newPartnerName.trim(),
          share_percentage: parseFloat(newPartnerShare) || 50,
        },
      ]);
      if (error) throw error;
      toast(`Partner "${newPartnerName.trim()}" added`);
      setShowAddPartnerForm(false);
      setNewPartnerName("");
      setNewPartnerShare("50");
      await fetchPartners();
    } catch (err) {
      console.error("Error adding partner:", err);
      toast("Failed to add partner", "error");
    }
  }

  async function handleRemovePartner(partnerId) {
    try {
      const { error } = await supabase
        .from("partners")
        .update({ is_active: false })
        .eq("id", partnerId);
      if (error) throw error;
      toast("Partner removed");
      setConfirmRemovePartner(null);
      await fetchPartners();
    } catch (err) {
      console.error("Error removing partner:", err);
      toast("Failed to remove partner", "error");
      setConfirmRemovePartner(null);
    }
  }

  function resetWithdrawalForm() {
    setEditingWithdrawalId(null);
    setWithdrawalPartnerId("");
    setWithdrawalAmount("");
    setWithdrawalReason("");
    setWithdrawalDate(new Date().toISOString().split("T")[0]);
  }

  async function handleRecalculate() {
    setLoading(true);
    toast("Recalculating...");
    await fetchData();
    toast("Recalculated successfully");
  }

  const currentMonthData = monthlyData[new Date().getMonth()] || {
    sales: 0,
    grossProfit: 0,
  };

  function getPartnerName(withdrawal) {
    const by = (withdrawal.withdrawn_by || "").toLowerCase();
    for (const p of partners) {
      if (by.includes(p.name.toLowerCase())) return p.name;
    }
    return withdrawal.withdrawn_by || "Unknown";
  }

  const filteredWithdrawals = allWithdrawals.filter((w) => {
    const matchMonth =
      filterMonth === "all" ||
      w.withdrawal_date?.startsWith(`${year}-${filterMonth}`);
    const matchPartner =
      filterPartner === "all" ||
      (w.withdrawn_by || "")
        .toLowerCase()
        .includes(filterPartner.toLowerCase());
    return matchMonth && matchPartner;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Partner Profit Sharing
          </h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            {partners
              .map((p) => `${p.name} (${p.share_percentage}%)`)
              .join(" — ")}{" "}
            — {year}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={openAddWithdrawal}
            className="btn btn-primary"
            disabled={!partners.length}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Record Withdrawal
          </button>
          <button
            onClick={() => setShowAddPartnerForm(true)}
            className="btn btn-secondary"
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            Add Partner
          </button>
          {partners.length > 0 && (
            <button
              onClick={() =>
                setConfirmRemovePartner(partners[partners.length - 1].id)
              }
              className="btn btn-secondary text-red-600 hover:bg-red-50"
              title="Remove last partner"
            >
              <UserMinus className="w-4 h-4" />
            </button>
          )}
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
          <button
            onClick={handleRecalculate}
            className="btn btn-secondary"
            title="Recalculate"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Current Month Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="card-hover p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-500">
              This Month Sales
            </p>
            <div className="bg-blue-500 p-1.5 rounded-lg">
              <ShoppingBag className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <p className="text-xl font-bold text-blue-700">
            {fmt(currentMonthData.sales)}
          </p>
        </div>
        <div className="card-hover p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-500">Gross Profit</p>
            <div className="bg-green-500 p-1.5 rounded-lg">
              <TrendingUp className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <p className="text-xl font-bold text-green-700">
            {fmt(currentMonthData.grossProfit)}
          </p>
        </div>
      </div>

      {/* Year Summary */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          {year} Year Summary
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Total Sales</p>
            <p className="text-lg font-bold text-gray-900">
              {fmt(summary.totalSales)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Gross Profit</p>
            <p className="text-lg font-bold text-green-700">
              {fmt(summary.grossProfit)}
            </p>
          </div>
        </div>
      </div>

      {/* Dynamic Partner Cards */}
      <div
        className={`grid grid-cols-1 ${partners.length > 1 ? "md:grid-cols-2" : ""} gap-4`}
      >
        {partners.map((partner, idx) => {
          const ps = partnerSummaries[partner.id];
          const pd = partnerDetails[partner.id];
          const color = partnerColors[idx % partnerColors.length];
          if (!ps) return null;
          return (
            <div
              key={partner.id}
              className={`card p-5 border-l-4 ${color.border}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`${color.iconBg} p-2 rounded-lg`}>
                    <Users className={`w-5 h-5 ${color.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {partner.name}
                    </h3>
                    <p className="text-xs text-gray-400">
                      {partner.share_percentage}% Share
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setConfirmRemovePartner(partner.id)}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-colors"
                  title={`Remove ${partner.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    Profit Share ({pd?.sharePct || partner.share_percentage}%)
                  </span>
                  <span className="font-semibold text-green-700">
                    {fmt(ps.share)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Withdrawn</span>
                  <span className="font-semibold text-red-600">
                    - {fmt(ps.withdrawn)}
                  </span>
                </div>
                <div className="border-t border-gray-100 pt-2 flex justify-between text-sm">
                  <span className="font-medium text-gray-700">Balance Due</span>
                  <span
                    className={`font-bold text-base ${ps.balance >= 0 ? "text-green-700" : "text-red-600"}`}
                  >
                    {fmt(ps.balance)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart */}
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
                className={`px-2.5 py-1.5 rounded-md font-medium transition-all ${chartView === v ? "bg-white shadow text-gray-900" : "text-gray-500"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {chartView === "profit" && (
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
        )}
        {chartView === "shares" && partners.length > 0 && (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={monthlyData.map((m) => {
                const row = { month: m.month };
                partners.forEach((p) => {
                  const ps = partnerSummaries[p.id];
                  row[p.name] = ps ? ps.share / 12 : 0;
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

      {/* Withdrawal Records Table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-gray-400" />
            Withdrawal Records
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={filterPartner}
              onChange={(e) => setFilterPartner(e.target.value)}
              className="input text-xs py-1.5 w-32"
            >
              <option value="all">All Partners</option>
              {partners.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="input text-xs py-1.5 w-28"
            >
              <option value="all">All Months</option>
              {MONTHS.map((m, i) => (
                <option key={i} value={String(i + 1).padStart(2, "0")}>
                  {m}
                </option>
              ))}
            </select>
            <button
              onClick={openAddWithdrawal}
              className="btn btn-primary text-xs py-1.5"
              disabled={!partners.length}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: "600px" }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Partner
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredWithdrawals.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-gray-400"
                  >
                    No withdrawals recorded
                  </td>
                </tr>
              ) : (
                filteredWithdrawals.map((w) => (
                  <tr
                    key={w.id}
                    className="hover:bg-gray-50 transition-colors group"
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {new Date(w.withdrawal_date).toLocaleDateString(
                          "en-IN",
                          { day: "numeric", month: "short", year: "numeric" },
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-medium text-gray-900">
                        {getPartnerName(w)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-sm text-gray-500 max-w-[200px] truncate">
                        {w.reason || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-sm font-semibold text-red-600">
                        ₹{w.amount.toLocaleString("en-IN")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditWithdrawal(w)}
                          className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteWithdrawal(w.id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Partner Details - Withdrawals per partner */}
      <div
        className={`grid grid-cols-1 ${partners.length > 1 ? "md:grid-cols-2" : ""} gap-4`}
      >
        {partners.map((partner, idx) => {
          const pd = partnerDetails[partner.id];
          const color = partnerColors[idx % partnerColors.length];
          if (!pd) return null;
          return (
            <div key={partner.id} className="card overflow-hidden">
              <div className={`px-4 py-3 border-b border-gray-100 ${color.bg}`}>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Users className={`w-4 h-4 ${color.iconColor}`} />
                  {partner.name} — Withdrawals
                </h3>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Withdrawals
                  </h4>
                  {pd.withdrawals.length === 0 ? (
                    <p className="text-sm text-gray-400">No withdrawals</p>
                  ) : (
                    <div className="space-y-1.5">
                      {pd.withdrawals.slice(0, 5).map((w) => (
                        <div
                          key={w.id}
                          className="flex items-center justify-between text-sm group"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-gray-600 truncate block">
                              {w.reason || "Withdrawal"}
                            </span>
                            <span className="text-xs text-gray-400">
                              {new Date(w.withdrawal_date).toLocaleDateString(
                                "en-IN",
                                { day: "numeric", month: "short" },
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <span className="text-red-600 font-medium">
                              ₹{w.amount.toLocaleString("en-IN")}
                            </span>
                            <button
                              onClick={() => openEditWithdrawal(w)}
                              className="p-1 hover:bg-blue-50 rounded text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all"
                              title="Edit"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteWithdrawal(w.id)}
                              className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {pd.withdrawals.length > 5 && (
                        <p className="text-xs text-gray-400">
                          +{pd.withdrawals.length - 5} more
                        </p>
                      )}
                    </div>
                  )}
                  {pd.withdrawals.length > 0 && (
                    <p className="text-sm font-medium text-gray-700 mt-2">
                      Total: ₹
                      {pd.withdrawals
                        .reduce((s, w) => s + (w.amount || 0), 0)
                        .toLocaleString("en-IN")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Partner Modal */}
      <Modal
        open={showAddPartnerForm}
        onClose={() => {
          setShowAddPartnerForm(false);
          setNewPartnerName("");
          setNewPartnerShare("50");
        }}
        title="Add Partner"
      >
        <form onSubmit={handleAddPartner} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Partner Name *
            </label>
            <input
              type="text"
              required
              value={newPartnerName}
              onChange={(e) => setNewPartnerName(e.target.value)}
              className="input"
              placeholder="e.g., Riyaz Shaikh"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Share Percentage (%)
            </label>
            <input
              type="number"
              min="1"
              max="100"
              step="0.01"
              value={newPartnerShare}
              onChange={(e) => setNewPartnerShare(e.target.value)}
              className="input"
              placeholder="50"
            />
            <p className="text-xs text-gray-400 mt-1">
              {partners.length === 0
                ? "First partner — share will be 100% of profits."
                : `Total share % should add up to 100.`}
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowAddPartnerForm(false);
                setNewPartnerName("");
                setNewPartnerShare("50");
              }}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1">
              Add Partner
            </button>
          </div>
        </form>
      </Modal>

      {/* Add/Edit Withdrawal Modal */}
      <Modal
        open={showWithdrawalForm}
        onClose={() => {
          setShowWithdrawalForm(false);
          resetWithdrawalForm();
        }}
        title={editingWithdrawalId ? "Edit Withdrawal" : "Record Withdrawal"}
      >
        <form onSubmit={handleSaveWithdrawal} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Partner *
            </label>
            <select
              required
              value={withdrawalPartnerId}
              onChange={(e) => setWithdrawalPartnerId(e.target.value)}
              className="input"
            >
              <option value="">Select partner...</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={withdrawalDate}
              onChange={(e) => setWithdrawalDate(e.target.value)}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount (₹) *
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={withdrawalAmount}
              onChange={(e) => setWithdrawalAmount(e.target.value)}
              className="input"
              placeholder="₹0.00"
              onWheel={(e) => e.target.blur()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason
            </label>
            <textarea
              value={withdrawalReason}
              onChange={(e) => setWithdrawalReason(e.target.value)}
              className="input"
              rows={2}
              placeholder="Optional reason"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowWithdrawalForm(false);
                resetWithdrawalForm();
              }}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary flex-1"
            >
              {saving ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 inline"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Saving...
                </>
              ) : editingWithdrawalId ? (
                "Update Withdrawal"
              ) : (
                "Record Withdrawal"
              )}
            </button>
          </div>
        </form>
      </Modal>

      {confirmDeleteWithdrawal && (
        <ConfirmModal
          message="This will permanently delete this withdrawal record."
          onConfirm={() => handleDeleteWithdrawal(confirmDeleteWithdrawal)}
          onCancel={() => setConfirmDeleteWithdrawal(null)}
        />
      )}
      {confirmRemovePartner && (
        <ConfirmModal
          message="This will remove the partner from profit sharing."
          onConfirm={() => handleRemovePartner(confirmRemovePartner)}
          onCancel={() => setConfirmRemovePartner(null)}
        />
      )}

      {partners.length === 0 && (
        <div className="text-center py-16">
          <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No partners added yet</p>
          <p className="text-gray-300 text-sm mt-1">
            Click "Add Partner" to get started
          </p>
        </div>
      )}
    </div>
  );
}
