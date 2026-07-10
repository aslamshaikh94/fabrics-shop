"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import dynamic from "next/dynamic";
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
  Pencil,
} from "lucide-react";
import { useToast } from "./Toast";
import Modal from "./shared/Modal";
import ConfirmModal from "./ConfirmModal";

// Dynamically import heavy sub-components (recharts is only loaded when needed)
const PartnerMonthlyChart = dynamic(
  () => import("./partners/PartnerMonthlyChart"),
  {
    ssr: false,
    loading: () => (
      <div className="card p-4">
        <div className="animate-pulse bg-gray-200 rounded-lg h-[250px]" />
      </div>
    ),
  },
);

const PartnerCards = dynamic(() => import("./partners/PartnerCards"), {
  loading: () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[1, 2].map((i) => (
        <div key={i} className="card p-5 animate-pulse">
          <div className="h-16 bg-gray-200 rounded-lg" />
        </div>
      ))}
    </div>
  ),
});

const WithdrawalTable = dynamic(() => import("./partners/WithdrawalTable"), {
  loading: () => (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="h-6 bg-gray-200 rounded w-48 animate-pulse" />
      </div>
    </div>
  ),
});

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

function fmtShort(n) {
  n = Number(n || 0);
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n}`;
}

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
  const [editingPartner, setEditingPartner] = useState(null);

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
    setFilterMonth("all");
    setFilterPartner("all");
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
        .order("created_at");
      setPartners(data || []);
    } catch (err) {
      console.error("Error fetching partners:", err);
      setPartners([]);
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      const [salesRes, withdrawalsRes, fabricsRes] = await Promise.all([
        supabase
          .from("sales")
          .select(
            "sale_date, total_amount, margin, meters, price_per_meter, cost_price_per_meter, fabric_id, fabric_name",
          )
          .gte("sale_date", `${year}-01-01`)
          .lte("sale_date", `${year}-12-31`),
        supabase
          .from("withdrawals")
          .select("id, withdrawal_date, amount, withdrawn_by, reason")
          .gte("withdrawal_date", `${year}-01-01`)
          .lte("withdrawal_date", `${year}-12-31`)
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
        await supabase
          .from("withdrawals")
          .update({
            amount: parseFloat(withdrawalAmount),
            withdrawal_date: withdrawalDate,
            withdrawn_by: partner.name,
            reason: withdrawalReason,
          })
          .eq("id", editingWithdrawalId);
        toast("Withdrawal updated");
      } else {
        await supabase
          .from("withdrawals")
          .insert([
            {
              amount: parseFloat(withdrawalAmount),
              withdrawal_date: withdrawalDate,
              withdrawn_by: partner.name,
              reason: withdrawalReason,
            },
          ]);
        toast("Withdrawal recorded");
      }
      setShowWithdrawalForm(false);
      resetWithdrawalForm();
      fetchData();
    } catch (err) {
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

  async function handleDeleteWithdrawal(id) {
    try {
      await supabase.from("withdrawals").delete().eq("id", id);
      toast("Withdrawal deleted");
      setConfirmDeleteWithdrawal(null);
      fetchData();
    } catch (err) {
      toast("Failed to delete withdrawal", "error");
      setConfirmDeleteWithdrawal(null);
    }
  }

  async function handleAddPartner(e) {
    e.preventDefault();
    if (!newPartnerName.trim()) return;
    const shareVal = parseFloat(newPartnerShare) || 50;
    const totalShare = partners.reduce(
      (s, p) => s + (p.share_percentage || 0),
      0,
    );
    if (totalShare + shareVal > 100) {
      toast(`Total share would exceed 100% (current: ${totalShare}%)`, "error");
      return;
    }
    try {
      await supabase
        .from("partners")
        .insert([{ name: newPartnerName.trim(), share_percentage: shareVal }]);
      toast(`Partner "${newPartnerName.trim()}" added`);
      setShowAddPartnerForm(false);
      setNewPartnerName("");
      setNewPartnerShare("50");
      await fetchPartners();
    } catch (err) {
      toast("Failed to add partner", "error");
    }
  }

  async function handleUpdatePartner(e) {
    e.preventDefault();
    if (!newPartnerName.trim() || !editingPartner) return;
    const shareVal = parseFloat(newPartnerShare) || 50;
    const totalShare = partners
      .filter((p) => p.id !== editingPartner)
      .reduce((s, p) => s + (p.share_percentage || 0), 0);
    if (totalShare + shareVal > 100) {
      toast(`Total share would exceed 100% (current: ${totalShare}%)`, "error");
      return;
    }
    try {
      await supabase
        .from("partners")
        .update({ name: newPartnerName.trim(), share_percentage: shareVal })
        .eq("id", editingPartner);
      toast("Partner updated");
      setShowAddPartnerForm(false);
      setNewPartnerName("");
      setNewPartnerShare("50");
      setEditingPartner(null);
      await fetchPartners();
    } catch (err) {
      toast("Failed to update partner", "error");
    }
  }

  async function handleRemovePartner(partnerId) {
    try {
      await supabase
        .from("partners")
        .update({ is_active: false })
        .eq("id", partnerId);
      toast("Partner removed");
      setConfirmRemovePartner(null);
      await fetchPartners();
    } catch (err) {
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

  const currentMonthData = monthlyData[new Date().getMonth()] || {
    sales: 0,
    grossProfit: 0,
  };

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Partner Profit Sharing
          </h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            {partners.length > 0
              ? partners
                  .map((p) => `${p.name} (${p.share_percentage}%)`)
                  .join(", ")
              : "No partners added yet"}{" "}
            — {year}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setEditingPartner(null);
              setNewPartnerName("");
              setNewPartnerShare("50");
              setShowAddPartnerForm(true);
            }}
            className="btn btn-secondary"
          >
            <UserPlus className="w-4 h-4 mr-1.5" /> Partner
          </button>
          <button
            onClick={() => {
              setEditingWithdrawalId(null);
              resetWithdrawalForm();
              setShowWithdrawalForm(true);
            }}
            className="btn btn-primary"
            disabled={!partners.length}
          >
            <Plus className="w-4 h-4 mr-1.5" /> Withdrawal
          </button>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input w-24"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setLoading(true);
              fetchData();
              toast("Recalculated successfully");
            }}
            className="btn btn-secondary"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {partners.length === 0 ? (
        <div className="text-center py-20">
          <Users className="w-14 h-14 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 font-medium text-lg">
            No partners added yet
          </p>
          <p className="text-gray-300 text-sm mt-1">
            Click "Add Partner" to get started
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500">
                  This Month Sales
                </p>
                <div className="bg-blue-500 p-1.5 rounded-lg">
                  <ShoppingBag className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <p className="text-lg font-bold text-blue-700">
                {fmtShort(currentMonthData.sales)}
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500">
                  This Month Profit
                </p>
                <div className="bg-green-500 p-1.5 rounded-lg">
                  <TrendingUp className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <p className="text-lg font-bold text-green-700">
                {fmtShort(currentMonthData.grossProfit)}
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500">
                  {year} Total Sales
                </p>
                <div className="bg-indigo-500 p-1.5 rounded-lg">
                  <DollarSign className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <p className="text-lg font-bold text-indigo-700">
                {fmtShort(summary.totalSales)}
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500">
                  {year} Gross Profit
                </p>
                <div className="bg-emerald-500 p-1.5 rounded-lg">
                  <TrendingUp className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <p className="text-lg font-bold text-emerald-700">
                {fmtShort(summary.grossProfit)}
              </p>
            </div>
          </div>

          <PartnerCards
            partners={partners}
            summaries={partnerSummaries}
            details={partnerDetails}
            onEditPartner={(p) => {
              setEditingPartner(p.id);
              setNewPartnerName(p.name);
              setNewPartnerShare(p.share_percentage.toString());
              setShowAddPartnerForm(true);
            }}
            onRemovePartner={(id) => setConfirmRemovePartner(id)}
          />

          <PartnerMonthlyChart
            monthlyData={monthlyData}
            chartView={chartView}
            setChartView={setChartView}
            partners={partners}
          />

          <WithdrawalTable
            withdrawals={filteredWithdrawals}
            partners={partners}
            filterPartner={filterPartner}
            setFilterPartner={setFilterPartner}
            filterMonth={filterMonth}
            setFilterMonth={setFilterMonth}
            onAdd={() => {
              setEditingWithdrawalId(null);
              resetWithdrawalForm();
              setShowWithdrawalForm(true);
            }}
            onEdit={openEditWithdrawal}
            onDelete={handleDeleteWithdrawal}
            confirmDelete={confirmDeleteWithdrawal}
            setConfirmDelete={setConfirmDeleteWithdrawal}
            allWithdrawals={allWithdrawals}
          />
        </>
      )}

      <Modal
        open={showAddPartnerForm}
        onClose={() => {
          setShowAddPartnerForm(false);
          setNewPartnerName("");
          setNewPartnerShare("50");
          setEditingPartner(null);
        }}
        title={editingPartner ? "Edit Partner" : "Add Partner"}
      >
        <form
          onSubmit={editingPartner ? handleUpdatePartner : handleAddPartner}
          className="space-y-4"
        >
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
                : `Current total: ${partners.filter((p) => p.id !== editingPartner).reduce((s, p) => s + (p.share_percentage || 0), 0)}% — should not exceed 100%`}
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowAddPartnerForm(false);
                setNewPartnerName("");
                setNewPartnerShare("50");
                setEditingPartner(null);
              }}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1">
              {editingPartner ? "Update Partner" : "Add Partner"}
            </button>
          </div>
        </form>
      </Modal>

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
              className="input"
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
              placeholder="0.00"
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
              {saving
                ? "Saving..."
                : editingWithdrawalId
                  ? "Update Withdrawal"
                  : "Record Withdrawal"}
            </button>
          </div>
        </form>
      </Modal>

      {confirmRemovePartner && (
        <ConfirmModal
          message={`Remove ${partners.find((p) => p.id === confirmRemovePartner)?.name || "this partner"} from profit sharing? Their withdrawal history will be preserved.`}
          onConfirm={() => handleRemovePartner(confirmRemovePartner)}
          onCancel={() => setConfirmRemovePartner(null)}
        />
      )}
    </div>
  );
}
