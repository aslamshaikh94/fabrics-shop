"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  Search,
  Calendar,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  ShoppingBag,
  Users,
  Pencil,
  X,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Landmark,
  Trash2,
  AlertTriangle,
  Download,
  Wallet,
} from "lucide-react";

import { useToast } from "./Toast";
import ConfirmModal from "./ConfirmModal";
import { matchPartner } from "../utils/partnerWithdrawal";

const PAGE_SIZE = 10;

const MONTH_LABELS = [
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

// Round to 2 decimals (money safe)
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Badge colours per statement source
const SOURCE_BADGE = {
  "Customer transfer": "bg-blue-100 text-blue-700",
  Deposit: "bg-amber-100 text-amber-700",
  Withdrawal: "bg-rose-100 text-rose-700",
  "Purchase payment": "bg-violet-100 text-violet-700",
};

function fmtAmt(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function Payments({
  initialTab = "suppliers",
  accountsOnly = false,
}) {
  const toast = useToast();
  const [purchasePayments, setPurchasePayments] = useState([]);
  const [salePayments, setSalePayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentTypeFilter, setPaymentTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateStart, setCustomDateStart] = useState("");
  const [customDateEnd, setCustomDateEnd] = useState("");
  const [page, setPage] = useState(1);
  const [supplierSummary, setSupplierSummary] = useState([]);
  const [customerSummary, setCustomerSummary] = useState([]);
  const [activeTab, setActiveTab] = useState(
    ["partners", "suppliers", "customers", "transactions"].includes(initialTab)
      ? initialTab
      : "suppliers",
  );
  const [editingPayment, setEditingPayment] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [partners, setPartners] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [confirmDeleteDeposit, setConfirmDeleteDeposit] = useState(null);
  const [depositForm, setDepositForm] = useState({
    id: null,
    amount: "",
    deposit_date: new Date().toISOString().split("T")[0],
    method: "cash",
    partner_id: "",
    notes: "",
  });
  const [partnerYear, setPartnerYear] = useState(new Date().getFullYear());
  const [holderFilter, setHolderFilter] = useState("all");
  const [trackerPartner, setTrackerPartner] = useState(null);

  // Opening balance editor (per account holder)
  const [showOpeningForm, setShowOpeningForm] = useState(false);
  const [openingForm, setOpeningForm] = useState({ amount: "", date: "" });

  // Bulk assignment of customer payments that carry no account holder yet
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkSelected, setBulkSelected] = useState([]);
  const [bulkPartnerId, setBulkPartnerId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [statementSearch, setStatementSearch] = useState("");
  const [statementType, setStatementType] = useState("all");
  const [statementFrom, setStatementFrom] = useState("");
  const [statementTo, setStatementTo] = useState("");

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [
        purchaseRes,
        saleRes,
        suppliersRes,
        customersRes,
        salesRes,
        purchasesRes,
        partnersRes,
        depositsRes,
        withdrawalsRes,
      ] = await Promise.all([
        supabase
          .from("purchase_payments")
          .select("*, purchase_id")
          .order("payment_date", { ascending: false }),
        supabase
          .from("sale_payments")
          .select("*, sale_id")
          .order("payment_date", { ascending: false }),
        supabase.from("suppliers").select("id, name"),
        supabase.from("customers").select("id, name"),
        supabase
          .from("sales")
          .select(
            "id, sale_group_id, customer_id, customer_name, total_amount, paid_amount, remaining_amount",
          ),
        supabase
          .from("purchases")
          .select(
            "id, supplier_id, total_amount, paid_amount, remaining_amount",
          ),
        supabase.from("partners").select("*").order("name"),
        supabase
          .from("cash_deposits")
          .select("*")
          .order("deposit_date", { ascending: false }),
        supabase
          .from("withdrawals")
          .select("*")
          .order("withdrawal_date", { ascending: false }),
      ]);

      const partnerMap = Object.fromEntries(
        (partnersRes.data || []).map((p) => [p.id, p.name]),
      );
      setPartners(partnersRes.data || []);
      setWithdrawals(withdrawalsRes.data || []);
      setDeposits(
        (depositsRes.data || []).map((d) => ({
          ...d,
          partner_name: d.partner_id
            ? partnerMap[d.partner_id] || "Unknown"
            : null,
        })),
      );

      const supplierMap = Object.fromEntries(
        (suppliersRes.data || []).map((s) => [s.id, s.name]),
      );
      const customerMap = Object.fromEntries(
        (customersRes.data || []).map((c) => [c.id, c.name]),
      );
      const purchaseSupplierMap = Object.fromEntries(
        (purchasesRes.data || []).map((p) => [p.id, p.supplier_id]),
      );
      const saleInfoMap = Object.fromEntries(
        (salesRes.data || []).map((s) => [
          s.id,
          { customer_id: s.customer_id, customer_name: s.customer_name },
        ]),
      );
      const saleGroupMap = {};
      (salesRes.data || []).forEach((s) => {
        if (s.sale_group_id && !saleGroupMap[s.sale_group_id]) {
          saleGroupMap[s.sale_group_id] = {
            customer_id: s.customer_id,
            customer_name: s.customer_name,
          };
        }
      });

      setPurchasePayments(
        (purchaseRes.data || []).map((p) => ({
          ...p,
          purchase: {
            suppliers: {
              name:
                supplierMap[purchaseSupplierMap[p.purchase_id]] || "Unknown",
            },
          },
        })),
      );
      setSalePayments(
        (saleRes.data || []).map((s) => {
          const info =
            saleInfoMap[s.sale_id] || saleGroupMap[s.sale_group_id] || {};
          const name =
            info.customer_name ||
            (info.customer_id ? customerMap[info.customer_id] : null) ||
            "Walk-in";
          return {
            ...s,
            sale: { customers: { name } },
            partner_name: s.partner_id
              ? partnerMap[s.partner_id] || "Unknown"
              : null,
          };
        }),
      );

      // Supplier summary
      const supMap = {};
      (purchasesRes.data || []).forEach((p) => {
        const name = supplierMap[p.supplier_id] || "Unknown";
        if (!supMap[name])
          supMap[name] = { name, total: 0, paid: 0, pending: 0 };
        supMap[name].total += p.total_amount || 0;
        supMap[name].paid += p.paid_amount || 0;
        supMap[name].pending += Math.max(
          (p.total_amount || 0) - (p.paid_amount || 0),
          0,
        );
      });
      setSupplierSummary(
        Object.values(supMap).sort((a, b) => b.pending - a.pending),
      );

      // Customer summary
      const custMap = {};
      (salesRes.data || []).forEach((s) => {
        const name =
          s.customer_name ||
          (s.customer_id ? customerMap[s.customer_id] : null) ||
          "Walk-in";
        if (!custMap[name])
          custMap[name] = { name, total: 0, paid: 0, pending: 0 };
        custMap[name].total += s.total_amount || 0;
        custMap[name].paid += s.paid_amount || 0;
        custMap[name].pending += Math.max(
          (s.total_amount || 0) - (s.paid_amount || 0),
          0,
        );
      });
      setCustomerSummary(
        Object.values(custMap).sort((a, b) => b.pending - a.pending),
      );
    } catch (error) {
      console.error("Error fetching payments:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [
    searchTerm,
    paymentTypeFilter,
    dateFilter,
    customDateStart,
    customDateEnd,
  ]);

  async function handleEditPayment(e) {
    e.preventDefault();
    if (!editingPayment) return;
    const amount = parseFloat(editForm.amount) || 0;
    if (amount <= 0) {
      toast("Amount must be greater than 0", "error");
      return;
    }
    try {
      const payload = {
        amount,
        payment_date: editForm.payment_date,
        payment_method: editForm.payment_method,
      };
      let error;
      if (editingPayment.type === "received") {
        payload.partner_id =
          editForm.payment_method === "upi"
            ? editForm.partner_id || null
            : null;
        const res = await supabase
          .from("sale_payments")
          .update(payload)
          .eq("id", editingPayment.id);
        error = res.error;
      } else {
        payload.partner_id = editForm.partner_id || null;
        const res = await supabase
          .from("purchase_payments")
          .update(payload)
          .eq("id", editingPayment.id);
        error = res.error;
      }
      if (error) throw error;
      toast("Payment updated");
      setEditingPayment(null);
      fetchAll();
    } catch (err) {
      toast(err.message || "Failed to update payment", "error");
    }
  }

  // ── Cash deposit handlers ──
  function openDepositForm() {
    setDepositForm({
      id: null,
      amount: "",
      deposit_date: new Date().toISOString().split("T")[0],
      method: "cash",
      partner_id: partners.find((p) => p.name === effectiveHolder)?.id || "",
      notes: "",
    });
    setShowDepositForm(true);
  }

  function openEditDeposit(deposit) {
    setDepositForm({
      id: deposit.id,
      amount:
        deposit.amount === null || deposit.amount === undefined
          ? ""
          : String(deposit.amount),
      deposit_date: deposit.deposit_date,
      method: deposit.method || "cash",
      partner_id: deposit.partner_id || "",
      notes: deposit.notes || "",
    });
    setShowDepositForm(true);
  }

  async function handleDepositSubmit(e) {
    e.preventDefault();
    const amount = parseFloat(depositForm.amount) || 0;
    if (!(amount > 0)) {
      toast("Amount must be greater than 0", "error");
      return;
    }
    if (!depositForm.partner_id) {
      toast("Please select the partner account for this deposit", "error");
      return;
    }
    const payload = {
      partner_id: depositForm.partner_id,
      amount,
      deposit_date: depositForm.deposit_date,
      method: depositForm.method,
      notes: depositForm.notes || "",
    };
    try {
      const { error } = depositForm.id
        ? await supabase
            .from("cash_deposits")
            .update(payload)
            .eq("id", depositForm.id)
        : await supabase.from("cash_deposits").insert([payload]);
      if (error) throw error;
      toast(depositForm.id ? "Deposit updated" : "Cash deposit recorded");
      setShowDepositForm(false);
      fetchAll();
    } catch (err) {
      toast(err.message || "Failed to save deposit", "error");
    }
  }

  async function handleDeleteDeposit(id) {
    try {
      const { error } = await supabase
        .from("cash_deposits")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast("Deposit deleted");
      setConfirmDeleteDeposit(null);
      fetchAll();
    } catch (err) {
      toast(err.message || "Failed to delete deposit", "error");
    }
  }

  // ── Account opening balance ──
  function openOpeningForm() {
    if (!holderPartner) {
      toast("Select an account holder first", "error");
      return;
    }
    setOpeningForm({
      amount: manualOpening ? String(manualOpening) : "",
      date: manualOpeningDate || `${currentPartnerYear}-01-01`,
    });
    setShowOpeningForm(true);
  }

  async function handleOpeningSubmit(e) {
    e.preventDefault();
    if (!holderPartner) return;
    const amount = parseFloat(openingForm.amount) || 0;
    try {
      const { error } = await supabase
        .from("partners")
        .update({
          opening_balance: amount,
          opening_balance_date: openingForm.date || null,
        })
        .eq("id", holderPartner.id);
      if (error) throw error;
      toast(`Opening balance saved for ${holderPartner.name}`);
      setShowOpeningForm(false);
      fetchAll();
    } catch (err) {
      toast(err.message || "Failed to save opening balance", "error");
    }
  }

  // ── Bulk assign untracked UPI payments to an account holder ──
  function openBulkAssign() {
    setBulkSelected(untrackedYear.map((p) => p.id));
    setBulkPartnerId("");
    setShowBulkAssign(true);
  }

  function toggleBulkPayment(id) {
    setBulkSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleBulkAssign(e) {
    e.preventDefault();
    if (bulkSelected.length === 0) {
      toast("Select at least one payment", "error");
      return;
    }
    if (!bulkPartnerId) {
      toast("Select the account holder to credit", "error");
      return;
    }
    setBulkSaving(true);
    try {
      const { error } = await supabase
        .from("sale_payments")
        .update({ partner_id: bulkPartnerId })
        .in("id", bulkSelected);
      if (error) throw error;
      const name =
        partners.find((p) => p.id === bulkPartnerId)?.name || "account";
      toast(
        `${bulkSelected.length} payment${bulkSelected.length === 1 ? "" : "s"} credited to ${name}`,
      );
      setShowBulkAssign(false);
      setBulkSelected([]);
      setBulkPartnerId("");
      setHolderFilter("all");
      fetchAll();
    } catch (err) {
      toast(err.message || "Failed to assign payments", "error");
    } finally {
      setBulkSaving(false);
    }
  }

  async function fetchSupplierSummary() {
    try {
      const [purchasesRes, suppliersRes] = await Promise.all([
        supabase
          .from("purchases")
          .select("supplier_id, total_amount, paid_amount, remaining_amount"),
        supabase.from("suppliers").select("id, name"),
      ]);

      const supplierNames = Object.fromEntries(
        (suppliersRes.data || []).map((s) => [s.id, s.name]),
      );

      const data = purchasesRes.data || [];
      const map = {};
      data.forEach((p) => {
        const name = supplierNames[p.supplier_id] || "Unknown";
        if (!map[name]) map[name] = { name, total: 0, paid: 0, pending: 0 };
        map[name].total += p.total_amount || 0;
        map[name].paid += p.paid_amount || 0;
        map[name].pending += Math.max(
          (p.total_amount || 0) - (p.paid_amount || 0),
          0,
        );
      });
      setSupplierSummary(
        Object.values(map).sort((a, b) => b.pending - a.pending),
      );
    } catch (err) {
      console.error("Error fetching supplier summary:", err);
    }
  }

  async function fetchPayments() {
    try {
      const [
        purchaseRes,
        saleRes,
        suppliersRes,
        customersRes,
        salesRes,
        partnersRes,
        depositsRes,
        withdrawalsRes,
      ] = await Promise.all([
        supabase
          .from("purchase_payments")
          .select("*, purchase_id")
          .order("payment_date", { ascending: false }),
        supabase
          .from("sale_payments")
          .select("*")
          .order("payment_date", { ascending: false }),
        supabase.from("purchases").select("id, supplier_id"),
        supabase.from("customers").select("id, name"),
        supabase
          .from("sales")
          .select("id, sale_group_id, customer_id, customer_name"),
        supabase.from("partners").select("*").order("name"),
        supabase
          .from("cash_deposits")
          .select("*")
          .order("deposit_date", { ascending: false }),
        supabase
          .from("withdrawals")
          .select("*")
          .order("withdrawal_date", { ascending: false }),
      ]);

      const partnerMap = Object.fromEntries(
        (partnersRes.data || []).map((p) => [p.id, p.name]),
      );
      setPartners(partnersRes.data || []);
      setWithdrawals(withdrawalsRes.data || []);
      setDeposits(
        (depositsRes.data || []).map((d) => ({
          ...d,
          partner_name: d.partner_id
            ? partnerMap[d.partner_id] || "Unknown"
            : null,
        })),
      );

      const purchasePaymentsData = purchaseRes.data || [];
      const salePaymentsData = saleRes.data || [];
      const purchases = (suppliersRes.data || []).reduce((map, p) => {
        map[p.id] = p.supplier_id;
        return map;
      }, {});
      const sales = (salesRes.data || []).reduce((map, s) => {
        map[s.id] = {
          customer_id: s.customer_id,
          customer_name: s.customer_name,
        };
        return map;
      }, {});
      const salesByGroup = {};
      (salesRes.data || []).forEach((s) => {
        if (s.sale_group_id && !salesByGroup[s.sale_group_id]) {
          salesByGroup[s.sale_group_id] = {
            customer_id: s.customer_id,
            customer_name: s.customer_name,
          };
        }
      });

      // Build customer name lookup from the customers table
      const customerNames = Object.fromEntries(
        (customersRes.data || []).map((c) => [c.id, c.name]),
      );

      // Get all unique supplier IDs
      const supplierIds = [
        ...new Set(
          purchasePaymentsData
            .map((p) => purchases[p.purchase_id])
            .filter(Boolean),
        ),
      ];

      // Fetch supplier names
      const supplierNamesRes =
        supplierIds.length > 0
          ? await supabase
              .from("suppliers")
              .select("id, name")
              .in("id", supplierIds)
          : { data: [] };

      const supplierNames = Object.fromEntries(
        (supplierNamesRes.data || []).map((s) => [s.id, s.name]),
      );

      // Attach resolved names to payment records
      const enrichedPurchasePayments = purchasePaymentsData.map((p) => ({
        ...p,
        purchase: {
          suppliers: {
            name: supplierNames[purchases[p.purchase_id]] || "Unknown",
          },
        },
      }));
      const enrichedSalePayments = salePaymentsData.map((s) => {
        const saleInfo =
          sales[s.sale_id] || salesByGroup[s.sale_group_id] || {};
        // First try customer_name from the sale record itself (for walk-in sales with custom names)
        const name = saleInfo.customer_name
          ? saleInfo.customer_name
          : saleInfo.customer_id
            ? customerNames[saleInfo.customer_id] || "Walk-in"
            : "Walk-in";
        return {
          ...s,
          sale: {
            customers: { name },
          },
          partner_name: s.partner_id
            ? partnerMap[s.partner_id] || "Unknown"
            : null,
        };
      });

      setPurchasePayments(enrichedPurchasePayments);
      setSalePayments(enrichedSalePayments);
    } catch (error) {
      console.error("Error fetching payments:", error);
    } finally {
      setLoading(false);
    }
  }

  const filterByDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    switch (dateFilter) {
      case "today": {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime();
      }
      case "week": {
        const w = new Date(today);
        w.setDate(w.getDate() - 7);
        return date >= w;
      }
      case "month": {
        const m = new Date(today);
        m.setMonth(m.getMonth() - 1);
        return date >= m;
      }
      case "custom":
        if (customDateStart && date < new Date(customDateStart)) return false;
        if (customDateEnd && date > new Date(customDateEnd)) return false;
        return true;
      default:
        return true;
    }
  };

  const paymentsMade = purchasePayments
    .filter((p) => filterByDate(p.payment_date))
    .map((p) => ({
      id: p.id,
      type: "paid",
      amount: p.amount,
      date: p.payment_date,
      method: p.payment_method,
      reference: p.reference_number,
      party: p.purchase?.suppliers?.name || "Unknown",
      notes: p.notes,
    }));

  const paymentsReceived = salePayments
    .filter((p) => filterByDate(p.payment_date))
    .map((p) => ({
      id: p.id,
      type: "received",
      amount: p.amount,
      date: p.payment_date,
      method: p.payment_method,
      reference: p.reference_number,
      party: p.sale?.customers?.name || "Walk-in",
      notes: p.notes,
      partner_id: p.partner_id || "",
      partner_name: p.partner_name || null,
    }));

  const allPayments = [...paymentsMade, ...paymentsReceived]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter((p) => {
      if (paymentTypeFilter !== "all" && p.type !== paymentTypeFilter)
        return false;
      if (holderFilter === "__untracked__") {
        // Customer payments collected but not credited to an account holder
        if (p.type !== "received" || p.partner_name) return false;
      } else if (
        holderFilter !== "all" &&
        (p.partner_name || "") !== holderFilter
      )
        return false;
      if (searchTerm)
        return p.party.toLowerCase().includes(searchTerm.toLowerCase());
      return true;
    });

  const totalPages = Math.ceil(allPayments.length / PAGE_SIZE);
  const paginatedPayments = allPayments.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const totalPaid = paymentsMade.reduce((sum, p) => sum + p.amount, 0);
  const totalReceived = paymentsReceived.reduce((sum, p) => sum + p.amount, 0);
  const netFlow = totalReceived - totalPaid;

  // ── Account holders (partners) ──
  // Every account holder: partners with any historical activity plus all currently
  // active partners. Built across ALL years so changing the year never hides an
  // account from the dropdown.
  const activePartners = partners.filter((p) => p.is_active !== false);
  const holdersWithActivity = Array.from(
    new Set([
      ...salePayments.filter((p) => p.partner_name).map((p) => p.partner_name),
      ...deposits.filter((d) => d.partner_name).map((d) => d.partner_name),
      ...withdrawals
        .map((w) => matchPartner(w.withdrawn_by, partners)?.name || null)
        .filter(Boolean),
    ]),
  ).sort();
  const holderNames = Array.from(
    new Set([...holdersWithActivity, ...activePartners.map((p) => p.name)]),
  ).sort();

  // ── Year selector: every year that has account activity ──
  const partnerYears = Array.from(
    new Set([
      ...salePayments
        .filter((p) => p.partner_id)
        .map((p) => new Date(p.payment_date).getFullYear()),
      ...deposits
        .filter((d) => d.partner_id)
        .map((d) => new Date(d.deposit_date).getFullYear()),
      ...withdrawals
        .filter((w) => matchPartner(w.withdrawn_by, partners))
        .map((w) => new Date(w.withdrawal_date).getFullYear()),
      ...purchasePayments
        .filter((pp) => pp.partner_id && (pp.reinvested_amount || 0) > 0)
        .map((pp) => new Date(pp.payment_date).getFullYear()),
    ]).values(),
  ).sort((a, b) => b - a);
  const currentPartnerYear = partnerYears.includes(partnerYear)
    ? partnerYear
    : partnerYears[0] || new Date().getFullYear();

  // ── Account ledger for the selected holder ──
  // Defaults to the first holder with activity so their statement shows immediately,
  // and falls back safely if the selected holder is no longer available.
  const effectiveHolder =
    trackerPartner && holderNames.includes(trackerPartner)
      ? trackerPartner
      : holdersWithActivity[0] || holderNames[0] || null;
  const yearOf = (d) => new Date(d).getFullYear();
  const byDateDesc = (a, b) => new Date(b.date) - new Date(a.date);

  // ── Per-account summaries — every holder shown separately (overview cards) ──
  const getHolderEntries = (name) => {
    if (!name) return [];
    return [
      ...salePayments
        .filter((p) => p.partner_name === name)
        .map((p) => ({
          key: `sale-${p.id}`,
          date: p.payment_date,
          description: p.sale?.customers?.name || "Walk-in",
          type: "credit",
          amount: p.amount,
        })),
      ...deposits
        .filter((d) => d.partner_name === name)
        .map((d) => ({
          key: `deposit-${d.id}`,
          date: d.deposit_date,
          description: d.notes || "Cash deposit",
          type: "credit",
          amount: d.amount,
        })),
      ...withdrawals
        .filter((w) => {
          const p = matchPartner(w.withdrawn_by, partners);
          return p && p.name === name;
        })
        .map((w) => ({
          key: `withdrawal-${w.id}`,
          date: w.withdrawal_date,
          description: w.reason || "Withdrawal",
          type: "debit",
          amount: w.amount,
        })),
      ...purchasePayments
        .filter(
          (pp) =>
            pp.partner_id &&
            (pp.reinvested_amount || 0) > 0 &&
            partners.some((p) => p.id === pp.partner_id && p.name === name),
        )
        .map((pp) => ({
          key: `purchase-${pp.id}`,
          date: pp.payment_date,
          description: `Paid to ${pp.purchase?.suppliers?.name || "Supplier"} (reinvested)`,
          type: "debit",
          amount: pp.reinvested_amount,
        })),
    ];
  };
  const holderSummaries = holderNames.map((name) => {
    const entries = getHolderEntries(name);
    const partner = partners.find((p) => p.name === name) || null;
    const manualOpening = Number(partner?.opening_balance || 0);
    const manualOpeningDate = partner?.opening_balance_date || "";
    const openingApplies =
      Boolean(manualOpeningDate) &&
      currentPartnerYear >= yearOf(manualOpeningDate);
    const statementStart = openingApplies ? manualOpeningDate : "";
    const afterStart = (e) => !statementStart || e.date >= statementStart;
    const opening = r2(
      (openingApplies ? manualOpening : 0) +
        entries
          .filter((e) => yearOf(e.date) < currentPartnerYear && afterStart(e))
          .reduce(
            (s, e) => s + (e.type === "credit" ? e.amount : -e.amount),
            0,
          ),
    );
    const yearEntries = entries.filter(
      (e) => yearOf(e.date) === currentPartnerYear && afterStart(e),
    );
    const credit = r2(
      yearEntries
        .filter((e) => e.type === "credit")
        .reduce((s, e) => s + (e.amount || 0), 0),
    );
    const debit = r2(
      yearEntries
        .filter((e) => e.type === "debit")
        .reduce((s, e) => s + (e.amount || 0), 0),
    );
    return {
      name,
      opening,
      credit,
      debit,
      closing: r2(opening + credit - debit),
      count: yearEntries.length,
      recent: [...yearEntries].sort(byDateDesc).slice(0, 5),
    };
  });
  // One card per account holder — including holders with no activity in the selected
  // year, so changing the year never hides an account (the same rule the account-holder
  // dropdown follows). Drives the "All accounts" grid plus its column count, so a lone
  // account isn't left in half a row while multiple accounts sit side by side.
  const visibleAccounts = holderSummaries;
  const openStatement = (name) => {
    setTrackerPartner(name);
    setTimeout(() => {
      document
        .getElementById("account-statement")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const holderTransfersAll = effectiveHolder
    ? salePayments
        .filter((p) => p.partner_name === effectiveHolder)
        .map((p) => ({
          key: `sale-${p.id}`,
          date: p.payment_date,
          description: p.sale?.customers?.name || "Walk-in",
          method: p.payment_method || "upi",
          source: "Customer transfer",
          type: "credit",
          amount: p.amount,
        }))
    : [];
  const holderDepositsAll = effectiveHolder
    ? deposits
        .filter((d) => d.partner_name === effectiveHolder)
        .map((d) => ({
          key: `deposit-${d.id}`,
          depositId: d.id,
          date: d.deposit_date,
          description: d.notes || "Cash deposit",
          method: d.method || "cash",
          source: "Deposit",
          type: "credit",
          amount: d.amount,
        }))
    : [];
  const holderWithdrawals = effectiveHolder
    ? withdrawals
        .filter((w) => {
          const p = matchPartner(w.withdrawn_by, partners);
          return p && p.name === effectiveHolder;
        })
        .map((w) => ({
          key: `withdrawal-${w.id}`,
          date: w.withdrawal_date,
          description: w.reason || "Withdrawal",
          source: "Withdrawal",
          type: "debit",
          amount: w.amount,
        }))
    : [];
  const holderPurchaseDebits = effectiveHolder
    ? purchasePayments
        .filter(
          (pp) =>
            pp.partner_id &&
            (pp.reinvested_amount || 0) > 0 &&
            partners.some(
              (p) => p.id === pp.partner_id && p.name === effectiveHolder,
            ),
        )
        .map((pp) => ({
          key: `purchase-${pp.id}`,
          date: pp.payment_date,
          description: `Paid to ${pp.purchase?.suppliers?.name || "Supplier"} (reinvested)`,
          source: "Purchase payment",
          type: "debit",
          amount: pp.reinvested_amount,
        }))
    : [];

  // Full history is used for the opening / closing balance so multi-year
  // statements stay correct.
  const allHolderEntries = [
    ...holderTransfersAll,
    ...holderDepositsAll,
    ...holderWithdrawals,
    ...holderPurchaseDebits,
  ];
  // ── Opening balance ──
  // The account holder may carry a manual opening balance: a snapshot of what the
  // account already held "as of" `opening_balance_date`. Whenever that snapshot
  // covers the selected year, everything dated before it must be hidden from the
  // statement — otherwise those transactions are counted twice (once inside the
  // snapshot, once again as statement rows).
  const holderPartner =
    partners.find((p) => p.name === effectiveHolder) || null;
  const manualOpening = Number(holderPartner?.opening_balance || 0);
  const manualOpeningDate = holderPartner?.opening_balance_date || "";
  // A snapshot only describes its own year and later — an earlier year's statement
  // cannot be derived from a balance that is dated after it.
  const openingApplies =
    Boolean(manualOpeningDate) &&
    currentPartnerYear >= yearOf(manualOpeningDate);
  // Set when the snapshot falls inside the year currently being viewed.
  const openingSnapshotInYear =
    openingApplies && yearOf(manualOpeningDate) === currentPartnerYear;
  // Earliest date shown / accumulated for the selected year.
  const statementStart = openingApplies ? manualOpeningDate : "";

  const openingBalance = r2(
    (openingApplies ? manualOpening : 0) +
      allHolderEntries
        .filter((e) => yearOf(e.date) < currentPartnerYear)
        .filter((e) => !statementStart || e.date >= statementStart)
        .reduce((s, e) => s + (e.type === "credit" ? e.amount : -e.amount), 0),
  );

  // Entries dated before the opening-balance snapshot are already represented by
  // `openingBalance`, so every year-scoped total below must skip them — otherwise
  // the same money is counted twice (once in the snapshot, once as a transaction).
  const afterStatementStart = (e) =>
    !statementStart || e.date >= statementStart;

  // Direct transfers from customers into this account, for the selected year
  const holderCredits = holderTransfersAll
    .filter(
      (e) => yearOf(e.date) === currentPartnerYear && afterStatementStart(e),
    )
    .sort(byDateDesc);
  const holderCreditTotal =
    Math.round(holderCredits.reduce((s, r) => s + (r.amount || 0), 0) * 100) /
    100;

  // Debits (money out) for the selected year
  const holderDebits = [...holderWithdrawals, ...holderPurchaseDebits]
    .filter(
      (e) => yearOf(e.date) === currentPartnerYear && afterStatementStart(e),
    )
    .sort(byDateDesc);

  // ── Cash deposits of the selected holder for the selected year ──
  // Deposits subsumed by the opening-balance snapshot are excluded so they are not
  // counted twice in the credit total.
  const yearDeposits = deposits
    .filter(
      (d) =>
        d.partner_name === effectiveHolder &&
        new Date(d.deposit_date).getFullYear() === currentPartnerYear &&
        afterStatementStart({ date: d.deposit_date }),
    )
    .sort((a, b) => new Date(b.deposit_date) - new Date(a.deposit_date));
  const yearDepositTotal =
    Math.round(yearDeposits.reduce((s, d) => s + (d.amount || 0), 0) * 100) /
    100;

  // Year totals: credits are customer transfers + deposits, debits are
  // withdrawals + the reinvested part of supplier payments made from this account.
  const yearCreditTotal =
    Math.round((holderCreditTotal + yearDepositTotal) * 100) / 100;
  const yearDebitTotal =
    Math.round(holderDebits.reduce((s, r) => s + (r.amount || 0), 0) * 100) /
    100;
  const closingBalance =
    Math.round((openingBalance + yearCreditTotal - yearDebitTotal) * 100) / 100;

  // ── Untracked: UPI customer payments not credited to any account holder ──
  // Cash collections are intentionally excluded: cash legitimately sits with the
  // shop until it is deposited, and the deposit is what credits an account.
  const untrackedYear = salePayments
    .filter(
      (p) =>
        !p.partner_name &&
        p.payment_method === "upi" &&
        yearOf(p.payment_date) === currentPartnerYear,
    )
    .sort(byDateDesc);
  const untrackedTotal = r2(
    untrackedYear.reduce((s, p) => s + (p.amount || 0), 0),
  );

  // ── Month-wise breakdown for the selected holder (credit / debit / net) ──
  const holderYearCredits = [
    ...holderCredits,
    ...yearDeposits.map((d) => ({ date: d.deposit_date, amount: d.amount })),
  ];
  const holderMonthRows = MONTH_LABELS.map((label, i) => {
    const credit = holderYearCredits
      .filter((e) => new Date(e.date).getMonth() === i)
      .reduce((s, e) => s + (e.amount || 0), 0);
    const debit = holderDebits
      .filter((e) => new Date(e.date).getMonth() === i)
      .reduce((s, e) => s + (e.amount || 0), 0);
    return {
      label,
      credit: r2(credit),
      debit: r2(debit),
      net: r2(credit - debit),
    };
  });
  const hasMonthActivity = holderMonthRows.some((r) => r.credit || r.debit);

  // ── Credit / debit composition for the selected holder + year ──
  const creditSources = [
    {
      label: "Customer transfers",
      value: r2(holderCredits.reduce((s, r) => s + (r.amount || 0), 0)),
      color: "bg-blue-500",
    },
    { label: "Deposits", value: yearDepositTotal, color: "bg-amber-500" },
  ].filter((s) => s.value);
  const debitSources = [
    {
      label: "Withdrawals",
      value: r2(
        holderDebits
          .filter((r) => r.source === "Withdrawal")
          .reduce((s, r) => s + (r.amount || 0), 0),
      ),
      color: "bg-rose-500",
    },
    {
      label: "Supplier payments (reinvested)",
      value: r2(
        holderDebits
          .filter((r) => r.source === "Purchase payment")
          .reduce((s, r) => s + (r.amount || 0), 0),
      ),
      color: "bg-purple-500",
    },
  ].filter((s) => s.value);

  // ── Unified account statement for the selected holder (bank-style) ──
  // Chronological order is used to compute the running balance; the table is then
  // displayed newest-first with the balance as of that transaction.
  const holderYearEntries = allHolderEntries
    .filter((e) => yearOf(e.date) === currentPartnerYear)
    // Transactions already covered by the opening-balance snapshot are excluded here
    // (they are represented by `openingBalance` instead).
    .filter((e) => !statementStart || e.date >= statementStart)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const balanceByKey = {};
  let runningBalance = openingBalance;
  holderYearEntries.forEach((e) => {
    runningBalance = r2(
      runningBalance + (e.type === "credit" ? e.amount : -e.amount),
    );
    balanceByKey[e.key] = runningBalance;
  });

  const statementQuery = statementSearch.trim().toLowerCase();
  const statementFiltersActive = Boolean(
    statementQuery || statementType !== "all" || statementFrom || statementTo,
  );
  const statementRows = holderYearEntries
    .filter((e) => {
      if (statementType !== "all" && e.type !== statementType) return false;
      if (statementFrom && e.date < statementFrom) return false;
      if (statementTo && e.date > statementTo) return false;
      if (statementQuery) {
        const hay =
          `${e.description || ""} ${e.source || ""} ${e.method || ""}`.toLowerCase();
        if (!hay.includes(statementQuery)) return false;
      }
      return true;
    })
    .slice()
    .reverse();
  const statementCreditTotal = r2(
    statementRows
      .filter((r) => r.type === "credit")
      .reduce((s, r) => s + (r.amount || 0), 0),
  );
  const statementDebitTotal = r2(
    statementRows
      .filter((r) => r.type === "debit")
      .reduce((s, r) => s + (r.amount || 0), 0),
  );

  function clearStatementFilters() {
    setStatementSearch("");
    setStatementType("all");
    setStatementFrom("");
    setStatementTo("");
  }

  /**
   * Export the current account statement (respecting the active filters) as a CSV
   * file, in chronological order with the running balance per transaction.
   */
  function exportStatementCsv() {
    const header = [
      "Date",
      "Description",
      "Source",
      "Method",
      "Credit (in)",
      "Debit (out)",
      "Balance",
    ];
    const rows = [];
    if (openingBalance !== 0) {
      rows.push([
        "",
        openingSnapshotInYear
          ? `Opening balance (as of ${manualOpeningDate})`
          : `Opening balance (before ${currentPartnerYear})`,
        "",
        "",
        "",
        "",
        openingBalance,
      ]);
    }
    // statementRows is newest-first for display; CSV reads better oldest-first.
    statementRows
      .slice()
      .reverse()
      .forEach((row) => {
        rows.push([
          row.date,
          row.description || "",
          row.source || "",
          row.method || "",
          row.type === "credit" ? row.amount : "",
          row.type === "debit" ? row.amount : "",
          balanceByKey[row.key] ?? "",
        ]);
      });
    rows.push([
      "",
      "Closing balance",
      "",
      "",
      r2(statementCreditTotal),
      r2(statementDebitTotal),
      closingBalance,
    ]);

    const escapeCell = (cell) => {
      const value = String(cell ?? "");
      return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    };
    const csv = [header, ...rows]
      .map((line) => line.map(escapeCell).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      `statement-${effectiveHolder || "account"}-${currentPartnerYear}.csv`.replace(
        /[^\w.-]+/g,
        "-",
      );
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Statement exported");
  }

  // Quick date presets for the statement (all within the selected year).
  // Single source of truth for the ranges so the "active" pill and the applied
  // range can never drift apart.
  function statementPresetRange(preset) {
    const y = currentPartnerYear;
    const pad = (n) => String(n).padStart(2, "0");
    const lastDay = (yy, mm) => new Date(yy, mm, 0).getDate();
    const now = new Date();
    if (preset === "thisMonth") {
      const m = now.getFullYear() === y ? now.getMonth() + 1 : 1;
      return {
        from: `${y}-${pad(m)}-01`,
        to: `${y}-${pad(m)}-${pad(lastDay(y, m))}`,
      };
    }
    if (preset === "thisQuarter") {
      const q = now.getFullYear() === y ? Math.floor(now.getMonth() / 3) : 3;
      const startMonth = q * 3 + 1;
      const endMonth = startMonth + 2;
      return {
        from: `${y}-${pad(startMonth)}-01`,
        to: `${y}-${pad(endMonth)}-${pad(lastDay(y, endMonth))}`,
      };
    }
    if (preset === "thisYear") {
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    return { from: "", to: "" };
  }

  function applyStatementPreset(preset) {
    const { from, to } = statementPresetRange(preset);
    setStatementFrom(from);
    setStatementTo(to);
  }

  // Which preset (if any) matches the current from/to, so it can be highlighted
  const activePreset = (() => {
    if (!statementFrom && !statementTo) return "all";
    const y = currentPartnerYear;
    if (statementFrom === `${y}-01-01` && statementTo === `${y}-12-31`)
      return "thisYear";
    return null;
  })();

  // Partners offered in the deposit form: active ones, plus whichever partner the
  // loaded deposit already belongs to (so editing never loses the selection).
  const depositPartnerOptions = partners.filter(
    (p) => p.is_active !== false || p.id === depositForm.partner_id,
  );

  // Same rule for the payment edit form: active partners only, but never drop the
  // partner already linked to the payment being edited even if since deactivated.
  const paymentPartnerOptions = partners.filter(
    (p) => p.is_active !== false || p.id === editForm.partner_id,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-200 border-t-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!accountsOnly && (
        <>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
            <p className="text-gray-500 mt-1">Track all payment transactions</p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab("suppliers")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "suppliers" ? "border-primary-600 text-primary-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Supplier Summary
            </button>
            <button
              onClick={() => setActiveTab("customers")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "customers" ? "border-primary-600 text-primary-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Customer Summary
            </button>
            <button
              onClick={() => setActiveTab("transactions")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "transactions" ? "border-primary-600 text-primary-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              Transactions
            </button>
          </div>
        </>
      )}

      {/* Supplier Summary Tab */}
      {activeTab === "suppliers" && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700">All Suppliers</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: "480px" }}>
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Supplier
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Purchased
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Paid
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pending
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Progress
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {supplierSummary.map((s) => {
                  const paidPct =
                    s.total > 0 ? ((s.paid / s.total) * 100).toFixed(1) : 0;
                  const pendingPct =
                    s.total > 0 ? ((s.pending / s.total) * 100).toFixed(1) : 0;
                  return (
                    <tr key={s.name} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="bg-warning-100 p-1.5 rounded-lg shrink-0">
                            <ShoppingBag className="w-4 h-4 text-warning-600" />
                          </div>
                          <span className="font-medium text-gray-900">
                            {s.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                        ₹
                        {s.total.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        <span className="font-semibold text-accent-600">
                          ₹
                          {s.paid.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        <span
                          className={
                            s.pending > 0
                              ? "font-semibold text-warning-600"
                              : "text-gray-400"
                          }
                        >
                          ₹
                          {s.pending.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div
                          className="relative inline-flex items-center justify-center rounded-full overflow-hidden text-xs font-medium px-2.5 py-0.5 cursor-pointer"
                          style={{ minWidth: "72px" }}
                          title={`Paid: ${paidPct}%  |  Pending: ${pendingPct}%`}
                        >
                          <span className="absolute inset-0 bg-warning-200" />
                          <span
                            className="absolute inset-y-0 left-0 bg-accent-400"
                            style={{ width: `${paidPct}%` }}
                          />
                          <span
                            className="relative z-10 font-medium"
                            style={{ color: "#111" }}
                          >
                            {s.pending > 0
                              ? s.paid > 0
                                ? "Partial"
                                : "Pending"
                              : "Paid"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {supplierSummary.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      ₹
                      {supplierSummary
                        .reduce((s, r) => s + r.total, 0)
                        .toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-accent-600">
                      ₹
                      {supplierSummary
                        .reduce((s, r) => s + r.paid, 0)
                        .toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-warning-600">
                      ₹
                      {supplierSummary
                        .reduce((s, r) => s + r.pending, 0)
                        .toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {supplierSummary.length === 0 && (
            <p className="text-center py-10 text-gray-500 text-sm">
              No supplier data found
            </p>
          )}
        </div>
      )}

      {activeTab === "customers" && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700">All Customers</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: "480px" }}>
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Billed
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Paid
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pending
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customerSummary.map((c) => (
                  <tr key={c.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-primary-100 p-1.5 rounded-lg shrink-0">
                          <Users className="w-4 h-4 text-primary-600" />
                        </div>
                        <span className="font-medium text-gray-900">
                          {c.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                      ₹
                      {c.total.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-accent-600">
                      ₹
                      {c.paid.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <span
                        className={
                          c.pending > 0
                            ? "font-semibold text-warning-600"
                            : "text-gray-400"
                        }
                      >
                        ₹
                        {c.pending.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {customerSummary.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      ₹
                      {customerSummary
                        .reduce((s, r) => s + r.total, 0)
                        .toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-accent-600">
                      ₹
                      {customerSummary
                        .reduce((s, r) => s + r.paid, 0)
                        .toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-warning-600">
                      ₹
                      {customerSummary
                        .reduce((s, r) => s + r.pending, 0)
                        .toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {customerSummary.length === 0 && (
            <p className="text-center py-10 text-gray-500 text-sm">
              No customer data found
            </p>
          )}
        </div>
      )}

      {activeTab === "partners" && (
        <div className="space-y-5">
          {/* Page header + account controls */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
              <p className="text-gray-500 mt-1">
                Track every credit and debit in each account holder&apos;s
                account
              </p>
            </div>
            <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end">
              {holderNames.length > 0 && (
                <label className="flex w-full flex-col gap-1 sm:w-auto">
                  <span className="text-xs font-medium text-gray-500">
                    Account holder
                  </span>
                  <select
                    value={effectiveHolder || ""}
                    onChange={(e) => setTrackerPartner(e.target.value)}
                    className="input w-full py-2 sm:w-auto sm:min-w-[170px]"
                  >
                    {holderNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {partnerYears.length > 0 && (
                <label className="flex w-full flex-col gap-1 sm:w-auto">
                  <span className="text-xs font-medium text-gray-500">
                    Year
                  </span>
                  <select
                    value={currentPartnerYear}
                    onChange={(e) => setPartnerYear(Number(e.target.value))}
                    className="input w-full py-2 sm:w-28"
                  >
                    {partnerYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                onClick={openDepositForm}
                className="btn btn-primary w-full px-3 py-2 text-sm flex items-center justify-center gap-1.5 sm:w-auto"
              >
                <Landmark className="w-4 h-4" /> Deposit Cash
              </button>
            </div>
          </div>

          {untrackedYear.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-800">
                    {untrackedYear.length} customer payment
                    {untrackedYear.length === 1 ? " is" : "s are"} not linked to
                    an account holder
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {fmtAmt(untrackedTotal)} collected in {currentPartnerYear}{" "}
                    without being credited to an account.
                  </p>
                </div>
              </div>
              <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center">
                <button
                  type="button"
                  onClick={openBulkAssign}
                  className="btn btn-primary w-full px-3 py-1.5 text-sm sm:w-auto"
                >
                  Assign to account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("transactions");
                    setPaymentTypeFilter("received");
                    setHolderFilter("__untracked__");
                    setPage(1);
                  }}
                  className="btn btn-secondary w-full px-3 py-1.5 text-sm sm:w-auto"
                >
                  Review payments
                </button>
              </div>
            </div>
          )}

          {effectiveHolder ? (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="min-w-0 rounded-xl p-3 bg-green-50 border border-gray-100">
                  <p className="text-xs font-medium text-gray-500">
                    Total Credit (in)
                  </p>
                  <p className="text-base sm:text-lg font-bold text-green-700 mt-1 tabular-nums break-words">
                    {fmtAmt(yearCreditTotal)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {currentPartnerYear}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl p-3 bg-red-50 border border-gray-100">
                  <p className="text-xs font-medium text-gray-500">
                    Total Debit (out)
                  </p>
                  <p className="text-base sm:text-lg font-bold text-red-600 mt-1 tabular-nums break-words">
                    {fmtAmt(yearDebitTotal)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {currentPartnerYear}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl p-3 bg-gray-50 border border-gray-100">
                  <p className="text-xs font-medium text-gray-500">
                    Opening Balance
                  </p>
                  <p className="text-base sm:text-lg font-bold text-gray-700 mt-1 tabular-nums break-words">
                    {fmtAmt(openingBalance)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    before {currentPartnerYear}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl p-3 bg-blue-50 border border-gray-100">
                  <p className="text-xs font-medium text-gray-500">
                    Closing Balance
                  </p>
                  <p className="text-base sm:text-lg font-bold text-blue-700 mt-1 tabular-nums break-words">
                    {fmtAmt(closingBalance)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    end of {currentPartnerYear}
                  </p>
                </div>
              </div>

              {/* Where the money came from / went */}
              <div className="mb-3">
                <p className="text-sm font-medium text-gray-700">
                  Credits / debits — {effectiveHolder}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Money movement for the selected account in {currentPartnerYear}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {[
                  {
                    title: "Credits (money in)",
                    rows: creditSources,
                    total: yearCreditTotal,
                  },
                  {
                    title: "Debits (money out)",
                    rows: debitSources,
                    total: yearDebitTotal,
                  },
                ].map((group) => (
                  <div key={group.title} className="card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-700 min-w-0">
                        {group.title}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 text-right tabular-nums">
                        {fmtAmt(group.total)}
                      </p>
                    </div>
                    {group.rows.length === 0 ? (
                      <p className="text-xs text-gray-400 mt-3">
                        No {group.title.split(" ")[0].toLowerCase()} in{" "}
                        {currentPartnerYear}.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {group.rows.map((s) => (
                          <div key={s.label}>
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <span className="text-gray-600 min-w-0 break-words">
                                {s.label}
                              </span>
                              <span className="font-medium text-gray-800 text-right tabular-nums">
                                {fmtAmt(s.value)}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${s.color}`}
                                style={{
                                  width: `${group.total ? Math.min(100, (s.value / group.total) * 100) : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>


              {/* All accounts — every holder shown separately with full detail */}
              {visibleAccounts.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    All accounts — {currentPartnerYear}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 mb-3">
                    Each account holder shown separately with their own balance
                    and recent activity
                  </p>
                  <div
                    className={`grid grid-cols-1 gap-4 ${
                      visibleAccounts.length > 1 ? "md:grid-cols-2" : ""
                    }`}
                  >
                    {visibleAccounts.map((r) => (
                      <div
                        key={r.name}
                        className={`card overflow-hidden ${
                          r.name === effectiveHolder
                            ? "ring-2 ring-primary-500/60"
                            : ""
                        }`}
                      >
                        <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2 sm:items-center">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 text-sm font-bold flex items-center justify-center shrink-0">
                              {r.name.charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">
                                {r.name}
                                {r.name === effectiveHolder && (
                                  <span className="ml-2 text-xs text-primary-600 font-normal">
                                    viewing
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-gray-400">
                                {r.count} transaction
                                {r.count === 1 ? "" : "s"} this year
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => openStatement(r.name)}
                            className="btn btn-secondary px-3 py-1.5 text-xs shrink-0 whitespace-nowrap"
                          >
                            <span className="sm:hidden">View</span>
                            <span className="hidden sm:inline">Open statement</span>
                          </button>
                        </div>

                        {/* Per-account summary: opening / credit / debit / balance */}
                        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 px-4 py-3 bg-gray-50/60">
                          <div className="min-w-0">
                            <p className="text-[11px] text-gray-500">
                              Opening
                            </p>
                            <p className="text-xs sm:text-sm font-semibold text-gray-700 tabular-nums break-words">
                              {fmtAmt(r.opening)}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] text-gray-500">
                              Credit (in)
                            </p>
                            <p className="text-xs sm:text-sm font-semibold text-green-700 tabular-nums break-words">
                              +{fmtAmt(r.credit)}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] text-gray-500">
                              Debit (out)
                            </p>
                            <p className="text-xs sm:text-sm font-semibold text-red-600 tabular-nums break-words">
                              −{fmtAmt(r.debit)}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] text-gray-500">
                              Balance
                            </p>
                            <p
                              className={`text-xs sm:text-sm font-bold tabular-nums break-words ${
                                r.closing >= 0
                                  ? "text-blue-700"
                                  : "text-red-600"
                              }`}
                            >
                              {fmtAmt(r.closing)}
                            </p>
                          </div>
                        </div>

                        {/* Recent activity (latest 5) */}
                        {r.recent.length > 0 && (
                          <ul className="divide-y divide-gray-100">
                            {r.recent.map((e) => (
                              <li
                                key={`${r.name}-${e.key}`}
                                className="px-4 py-2 flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm text-gray-800 truncate">
                                    {e.description}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    {new Date(e.date).toLocaleDateString(
                                      "en-GB",
                                      {
                                        day: "numeric",
                                        month: "short",
                                        year: "2-digit",
                                      },
                                    )}
                                  </p>
                                </div>
                                <span
                                  className={`text-sm font-bold shrink-0 ${
                                    e.type === "credit"
                                      ? "text-green-700"
                                      : "text-red-600"
                                  }`}
                                >
                                  {e.type === "credit" ? "+" : "−"}
                                  {fmtAmt(e.amount)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Account statement — every credit & debit with running balance */}
              <div
                className="card overflow-hidden scroll-mt-20"
                id="account-statement"
              >
                <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3 sm:items-center sm:gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 break-words">
                      Account statement — {effectiveHolder}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Credits, debits and running balance for{" "}
                      {currentPartnerYear}
                    </p>
                  </div>
                  <div className="grid w-full grid-cols-2 gap-2 text-sm sm:flex sm:w-auto sm:items-center sm:gap-3">
                    <span className="text-right font-semibold text-green-700 tabular-nums sm:text-left">
                      +{fmtAmt(statementCreditTotal)}
                    </span>
                    <span className="text-right font-semibold text-red-600 tabular-nums sm:text-left">
                      −{fmtAmt(statementDebitTotal)}
                    </span>
                    <button
                      type="button"
                      onClick={openOpeningForm}
                      className="btn btn-secondary px-2 py-1.5 text-xs sm:px-3 sm:text-sm flex w-full items-center justify-center gap-1.5 sm:w-auto"
                      title="Set the balance this account already held"
                    >
                      <Wallet className="w-4 h-4" /> Opening Balance
                    </button>
                    <button
                      type="button"
                      onClick={exportStatementCsv}
                      className="btn btn-secondary px-2 py-1.5 text-xs sm:px-3 sm:text-sm flex w-full items-center justify-center gap-1.5 sm:w-auto"
                      title="Download this statement as CSV"
                    >
                      <Download className="w-4 h-4" /> Export CSV
                    </button>
                  </div>
                </div>

                {/* Statement filters */}
                <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:flex-1 sm:min-w-[180px]">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={statementSearch}
                      onChange={(e) => setStatementSearch(e.target.value)}
                      placeholder="Search description or source…"
                      className="input pl-9"
                    />
                  </div>
                  <select
                    value={statementType}
                    onChange={(e) => setStatementType(e.target.value)}
                    className="input w-full sm:w-auto"
                    title="Filter by credit / debit"
                  >
                    <option value="all">All types</option>
                    <option value="credit">Credit (in)</option>
                    <option value="debit">Debit (out)</option>
                  </select>
                  <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
                    <input
                      type="date"
                      value={statementFrom}
                      onChange={(e) => setStatementFrom(e.target.value)}
                      className="input w-full min-w-0 sm:w-auto"
                      title="From date"
                    />
                    <input
                      type="date"
                      value={statementTo}
                      onChange={(e) => setStatementTo(e.target.value)}
                      className="input w-full min-w-0 sm:w-auto"
                      title="To date"
                    />
                  </div>
                  {statementFiltersActive && (
                    <button
                      type="button"
                      onClick={clearStatementFilters}
                      className="btn btn-secondary px-3 py-2 text-sm w-full justify-center sm:w-auto"
                    >
                      <X className="w-3.5 h-3.5" /> Clear
                    </button>
                  )}
                  <div className="grid w-full grid-cols-4 gap-1 sm:ml-auto sm:flex sm:w-auto sm:items-center">
                    {[
                      { id: "all", label: "All" },
                      { id: "thisMonth", label: "Month" },
                      { id: "thisQuarter", label: "Quarter" },
                      { id: "thisYear", label: "Year" },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyStatementPreset(preset.id)}
                        className={`px-1 sm:px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                          activePreset === preset.id
                            ? "bg-primary-600 text-white border-primary-600"
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Statement table */}
                <p className="px-4 py-2 text-xs text-gray-500 sm:hidden">
                  Swipe left to see all statement columns.
                </p>
                <div className="overflow-x-auto overscroll-x-contain">
                  <table className="w-full" style={{ minWidth: "700px" }}>
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Date
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Source
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Credit (in)
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Debit (out)
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Balance
                        </th>
                        <th className="text-right px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {openingBalance !== 0 && (
                        <tr className="bg-gray-50">
                          <td className="px-4 py-2.5 text-sm text-gray-400 whitespace-nowrap">
                            —
                          </td>
                          <td
                            className="px-4 py-2.5 text-sm font-medium text-gray-600"
                            colSpan={2}
                          >
                            {openingSnapshotInYear
                              ? `Opening balance (as of ${new Date(manualOpeningDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})`
                              : `Opening balance (before ${currentPartnerYear})`}
                            {openingSnapshotInYear && (
                              <span className="block text-xs font-normal text-gray-400">
                                Earlier transactions are included in this
                                balance
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5" />
                          <td className="px-4 py-2.5" />
                          <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-700">
                            {fmtAmt(openingBalance)}
                          </td>
                          <td />
                        </tr>
                      )}
                      {statementRows.map((r) => (
                        <tr key={r.key} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">
                            {new Date(r.date).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-gray-900">
                            {r.description}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`badge ${SOURCE_BADGE[r.source] || "bg-blue-100 text-blue-700"}`}
                            >
                              {r.source}
                            </span>
                            {r.method ? (
                              <span className="ml-2 text-xs text-gray-400 uppercase">
                                {r.method}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm font-bold text-green-700">
                            {r.type === "credit" ? `+${fmtAmt(r.amount)}` : ""}
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm font-bold text-red-600">
                            {r.type === "debit" ? `−${fmtAmt(r.amount)}` : ""}
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-700">
                            {fmtAmt(balanceByKey[r.key])}
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            {r.depositId ? (
                              <span className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const d = deposits.find(
                                      (x) => x.id === r.depositId,
                                    );
                                    if (d) openEditDeposit(d);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-gray-100"
                                  title="Edit deposit"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-gray-500" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmDeleteDeposit(r.depositId)
                                  }
                                  className="p-1.5 rounded-lg hover:bg-red-50"
                                  title="Delete deposit"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                </button>
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td
                          className="px-4 py-3 text-sm font-semibold text-gray-700"
                          colSpan={3}
                        >
                          {statementFiltersActive
                            ? "Filtered total"
                            : "Year total"}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-green-700">
                          +{fmtAmt(statementCreditTotal)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-red-600">
                          −{fmtAmt(statementDebitTotal)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-blue-700">
                          {fmtAmt(closingBalance)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {statementRows.length === 0 && (
                  <p className="text-center py-10 text-gray-500 text-sm">
                    {statementFiltersActive
                      ? "No transactions match the current filters."
                      : `No transactions for ${effectiveHolder} in ${currentPartnerYear}.`}
                  </p>
                )}
              </div>

              {/* Month-wise summary for this account */}
              {hasMonthActivity && (
                <div className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-700">
                      Monthly summary — {currentPartnerYear}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Month-wise credit and debit for {effectiveHolder}&apos;s
                      account
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Month
                          </th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Credit (in)
                          </th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Debit (out)
                          </th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Net
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {holderMonthRows
                          .filter((r) => r.credit || r.debit)
                          .map((r) => (
                            <tr key={r.label} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-sm font-medium text-gray-700">
                                {r.label}
                              </td>
                              <td className="px-4 py-2.5 text-right text-sm text-green-700">
                                {r.credit ? `+${fmtAmt(r.credit)}` : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-right text-sm text-red-600">
                                {r.debit ? `−${fmtAmt(r.debit)}` : "—"}
                              </td>
                              <td
                                className={`px-4 py-2.5 text-right text-sm font-semibold ${r.net >= 0 ? "text-gray-700" : "text-red-600"}`}
                              >
                                {fmtAmt(r.net)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                        <tr>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-700">
                            Year total
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-green-700">
                            +{fmtAmt(yearCreditTotal)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-red-600">
                            −{fmtAmt(yearDebitTotal)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                            {fmtAmt(r2(yearCreditTotal - yearDebitTotal))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

            </>
          ) : (
            <div className="card p-8 text-center text-gray-500 text-sm">
              No account activity yet. Record UPI sale payments or cash deposits
              to start tracking an account here.
            </div>
          )}
        </div>
      )}
      {activeTab === "transactions" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Payments Made</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">
                    ₹
                    {totalPaid.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div className="bg-red-100 p-3 rounded-lg">
                  <ArrowUpRight className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Payments Received</p>
                  <p className="text-2xl font-bold text-accent-600 mt-1">
                    ₹
                    {totalReceived.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div className="bg-accent-100 p-3 rounded-lg">
                  <ArrowDownLeft className="w-6 h-6 text-accent-600" />
                </div>
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Net Cash Flow</p>
                  <p
                    className={`text-2xl font-bold mt-1 ${netFlow >= 0 ? "text-accent-600" : "text-red-600"}`}
                  >
                    ₹
                    {netFlow.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div
                  className={`${netFlow >= 0 ? "bg-accent-100" : "bg-red-100"} p-3 rounded-lg`}
                >
                  <Filter
                    className={`w-6 h-6 ${netFlow >= 0 ? "text-accent-600" : "text-red-600"}`}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by party name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input pl-10"
                  />
                </div>
                <select
                  value={paymentTypeFilter}
                  onChange={(e) => setPaymentTypeFilter(e.target.value)}
                  className="input"
                >
                  <option value="all">All Payments</option>
                  <option value="paid">Payments Made</option>
                  <option value="received">Payments Received</option>
                </select>
                <select
                  value={holderFilter}
                  onChange={(e) => setHolderFilter(e.target.value)}
                  className="input"
                >
                  <option value="all">All Account Holders</option>
                  <option value="__untracked__">Untracked (no account)</option>
                  {holderNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="input"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last 30 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
              {dateFilter === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={customDateStart}
                    onChange={(e) => setCustomDateStart(e.target.value)}
                    className="input"
                  />
                  <input
                    type="date"
                    value={customDateEnd}
                    onChange={(e) => setCustomDateEnd(e.target.value)}
                    className="input"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {paginatedPayments.map((payment) => {
              return (
                <div
                  key={`${payment.type}-${payment.id}`}
                  className={`card p-4 border-l-4 ${payment.type === "received" ? "border-l-accent-500" : "border-l-red-500"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className={`p-2 rounded-lg ${payment.type === "received" ? "bg-accent-100" : "bg-red-100"}`}
                      >
                        {payment.type === "received" ? (
                          <ArrowDownLeft className="w-5 h-5 text-accent-600" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {payment.type === "received" ? "From" : "To"}:{" "}
                          {payment.party}
                        </p>
                        <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(payment.date).toLocaleDateString(
                              "en-GB",
                              {
                                day: "numeric",
                                month: "short",
                                year: "2-digit",
                              },
                            )}
                          </span>
                          <span className="badge bg-gray-200 text-gray-700 uppercase">
                            {payment.method}
                          </span>
                          {payment.type === "received" &&
                            payment.method === "upi" &&
                            !payment.partner_name && (
                              <span className="badge bg-warning-100 text-warning-800">
                                Untracked
                              </span>
                            )}
                          {payment.reference && (
                            <span className="text-xs text-gray-400">
                              Ref: {payment.reference}
                            </span>
                          )}
                        </div>
                        {payment.type === "received" &&
                          payment.partner_name && (
                            <p className="text-xs font-medium text-blue-700 flex items-center gap-1 mt-1">
                              <Users className="w-3.5 h-3.5" />
                              Credited to account of: {payment.partner_name}
                            </p>
                          )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-lg font-bold ${payment.type === "received" ? "text-accent-600" : "text-red-600"}`}
                      >
                        {payment.type === "received" ? "+" : "-"}₹
                        {payment.amount.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  </div>
                  {payment.notes && (
                    <p className="text-sm text-gray-500 mt-2 pl-12 italic">
                      {payment.notes}
                    </p>
                  )}
                  <div className="flex justify-end mt-1">
                    <button
                      onClick={() => {
                        setEditingPayment(payment);
                        setEditForm({
                          amount: payment.amount,
                          payment_date: payment.date,
                          payment_method: payment.method,
                          partner_id: payment.partner_id || "",
                        });
                      }}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 pt-4">
              <p className="text-sm text-gray-500">
                {allPayments.length} transactions — page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {allPayments.length === 0 && (
            <div className="text-center py-16">
              <CreditCard className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">
                No payments found matching your filters
              </p>
              <p className="text-gray-300 text-sm mt-1">
                Try adjusting your search or filters
              </p>
            </div>
          )}
        </>
      )}

      {editingPayment && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-4 sm:p-6 m-4 sm:my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Edit Payment</h2>
              <button
                onClick={() => setEditingPayment(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-600">
                {editingPayment.type === "received" ? "Customer" : "Supplier"}:{" "}
                <span className="font-medium">{editingPayment.party}</span>
              </p>
            </div>
            <form onSubmit={handleEditPayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editForm.amount}
                  onChange={(e) =>
                    setEditForm({ ...editForm, amount: e.target.value })
                  }
                  className="input"
                  onWheel={(e) => e.target.blur()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={editForm.payment_date}
                  onChange={(e) =>
                    setEditForm({ ...editForm, payment_date: e.target.value })
                  }
                  className="input w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={editForm.payment_method}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        payment_method: e.target.value,
                      })
                    }
                    className="input"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                  </select>
                </div>
                {editingPayment.type === "received" ? (
                  editForm.payment_method === "upi" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Account Holder (Partner)
                      </label>
                      <select
                        value={editForm.partner_id || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            partner_id: e.target.value,
                          })
                        }
                        className="input"
                      >
                        <option value="">— Select partner —</option>
                        {paymentPartnerOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Paid From Account (Partner)
                    </label>
                    <select
                      value={editForm.partner_id || ""}
                      onChange={(e) =>
                        setEditForm({ ...editForm, partner_id: e.target.value })
                      }
                      className="input"
                    >
                      <option value="">— No account —</option>
                      {paymentPartnerOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Update Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showDepositForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto p-2 sm:p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-4 sm:p-6 m-4 sm:my-8 shadow-xl border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {depositForm.id ? "Edit Deposit" : "Deposit Cash into Account"}
              </h2>
              <button
                onClick={() => setShowDepositForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleDepositSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={depositForm.amount}
                    onChange={(e) =>
                      setDepositForm({ ...depositForm, amount: e.target.value })
                    }
                    className="input"
                    placeholder="0.00"
                    onWheel={(e) => e.target.blur()}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={depositForm.deposit_date}
                    onChange={(e) =>
                      setDepositForm({
                        ...depositForm,
                        deposit_date: e.target.value,
                      })
                    }
                    className="input w-full"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Holder (Partner) *
                </label>
                <select
                  value={depositForm.partner_id}
                  onChange={(e) =>
                    setDepositForm({
                      ...depositForm,
                      partner_id: e.target.value,
                    })
                  }
                  className="input"
                  required
                >
                  <option value="">— Select partner —</option>
                  {depositPartnerOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mode of Transfer
                </label>
                <select
                  value={depositForm.method}
                  onChange={(e) =>
                    setDepositForm({ ...depositForm, method: e.target.value })
                  }
                  className="input"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI Transfer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={depositForm.notes}
                  onChange={(e) =>
                    setDepositForm({ ...depositForm, notes: e.target.value })
                  }
                  className="input"
                  rows={2}
                  placeholder="Optional"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDepositForm(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {depositForm.id ? "Update Deposit" : "Record Deposit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDeleteDeposit && (
        <ConfirmModal
          message="This will permanently delete this deposit and remove it from the account statement."
          onConfirm={() => handleDeleteDeposit(confirmDeleteDeposit)}
          onCancel={() => setConfirmDeleteDeposit(null)}
        />
      )}

      {/* Opening balance — the balance this account already held before tracking started */}
      {showOpeningForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto p-2 sm:p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-4 sm:p-6 m-4 sm:my-8 shadow-xl border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Opening Balance</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {holderPartner?.name}
                </p>
              </div>
              <button
                onClick={() => setShowOpeningForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleOpeningSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Balance the account already held *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={openingForm.amount}
                  onChange={(e) =>
                    setOpeningForm({ ...openingForm, amount: e.target.value })
                  }
                  className="input"
                  placeholder="0.00"
                  onWheel={(e) => e.target.blur()}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">
                  Use a negative value if the account was overdrawn.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  As of date
                </label>
                <input
                  type="date"
                  value={openingForm.date}
                  onChange={(e) =>
                    setOpeningForm({ ...openingForm, date: e.target.value })
                  }
                  className="input w-full"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Transactions before this date are treated as already included
                  in the opening balance.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOpeningForm(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Save Opening Balance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk assign untracked customer payments to an account holder */}
      {showBulkAssign && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto p-2 sm:p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-4 sm:p-6 m-4 sm:my-8 shadow-xl border border-gray-200">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold">
                Credit payments to an account
              </h2>
              <button
                onClick={() => setShowBulkAssign(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {untrackedYear.length} customer payment
              {untrackedYear.length === 1 ? "" : "s"} totalling{" "}
              {fmtAmt(untrackedTotal)} in {currentPartnerYear}{" "}
              {untrackedYear.length === 1 ? "is" : "are"} not linked to an
              account holder. Select the payments and the account they were
              credited to.
            </p>

            <form onSubmit={handleBulkAssign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Credit to Account Holder *
                </label>
                <select
                  value={bulkPartnerId}
                  onChange={(e) => setBulkPartnerId(e.target.value)}
                  className="input"
                  required
                >
                  <option value="">— Select account holder —</option>
                  {partners
                    .filter((p) => p.is_active !== false)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Payments ({bulkSelected.length} of {untrackedYear.length}{" "}
                    selected)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setBulkSelected(
                        bulkSelected.length === untrackedYear.length
                          ? []
                          : untrackedYear.map((p) => p.id),
                      )
                    }
                    className="text-xs font-medium text-primary-600 hover:text-primary-700"
                  >
                    {bulkSelected.length === untrackedYear.length
                      ? "Clear all"
                      : "Select all"}
                  </button>
                </div>
                <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
                  {untrackedYear.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={bulkSelected.includes(p.id)}
                        onChange={() => toggleBulkPayment(p.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="flex-1 text-sm text-gray-700 truncate">
                        {p.sale?.customers?.name || "Walk-in"}
                      </span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {new Date(p.payment_date).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        })}
                      </span>
                      <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
                        {fmtAmt(p.amount)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBulkAssign(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    bulkSaving || bulkSelected.length === 0 || !bulkPartnerId
                  }
                  className="btn btn-primary flex-1 disabled:opacity-50"
                >
                  {bulkSaving
                    ? "Assigning…"
                    : `Credit ${bulkSelected.length} payment${bulkSelected.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
