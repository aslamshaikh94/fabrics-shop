"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useShowAmount } from "./ShowAmountProvider";
import {
  fetchAllRows,
  fetchAllRowsTolerant,
} from "../utils/pagedQuery";
import { buildSoldMeters } from "../utils/soldMeters";
import { formatDate } from "../utils/formatters";
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
  Percent,
} from "lucide-react";
import Pagination from "./shared/Pagination";

// Rows per page in the Stock tab's Fabric-wise table. Matches the other
// paginated tables in the app.
const STOCK_PAGE_SIZE = 10;

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
  return `₹${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function fmtShort(n, show = true) {
  if (!show) return "₹•••";
  n = Number(n || 0);
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n.toFixed(2)}`;
}
function pctChange(curr, prev) {
  if (!prev) return null;
  const diff = ((curr - prev) / prev) * 100;
  return { value: Math.abs(diff).toFixed(1), up: diff >= 0 };
}

// Dev-only diagnostic: compares purchases vs fabrics vs sales and shows where
// the Bought / Sold / In-Stock numbers on the Stock tab come from.
// Open /reports?debug=stock to view. Read-only, no writes.
// Note: an invoice total runs higher than its fabric rows because invoices
// include GST / other charges — that difference is expected, not drift.
function StockDiagnostic() {
  const [out, setOut] = useState("running…");
  useEffect(() => {
    (async () => {
      const fmtErr = (e) =>
        JSON.stringify(
          {
            message: e?.message,
            details: e?.details,
            hint: e?.hint,
            code: e?.code,
          },
          null,
          2,
        );
      try {
        const lines = [];
        const tryRows = async (label, cols, table = "purchases") => {
          try {
            // .order("id") is required for offset paging — see pagedQuery.js.
            return await fetchAllRows((a, b) =>
              supabase.from(table).select(cols).order("id").range(a, b),
            );
          } catch (e) {
            lines.push(`${label} FAILED: ${fmtErr(e)}`);
            return null;
          }
        };
        const p =
          (await tryRows("purchases", "id, purchase_number, total_amount")) ||
          [];
        const f =
          (await tryRows(
            "fabrics",
            "id, name, total_meters, available_meters, purchase_price_per_meter, selling_price_per_meter, purchase_id",
            "fabrics",
          )) || [];
        const s =
          (await tryRows(
            "sales",
            "id, fabric_id, fabric_name, meters, total_amount, discount_amount",
            "sales",
          )) || [];
        const num = (v) => Number(v) || 0;
        const pSum = p.reduce((t, r) => t + num(r.total_amount), 0);
        lines.push(`purchases: count=${p.length} sum(total_amount)=${pSum.toFixed(2)}`);
        const fBought = f.reduce((t, r) => t + num(r.total_meters) * num(r.purchase_price_per_meter), 0);
        const fStock = f.reduce((t, r) => t + num(r.available_meters) * num(r.purchase_price_per_meter), 0);
        const fTot = f.reduce((t, r) => t + num(r.total_meters), 0);
        const fAvail = f.reduce((t, r) => t + num(r.available_meters), 0);
        lines.push(`fabrics: count=${f.length} sum(total_meters×rate)=${fBought.toFixed(2)} sum(available×rate)=${fStock.toFixed(2)} total_m=${fTot.toFixed(1)} avail_m=${fAvail.toFixed(1)}`);
        lines.push(`fabrics without purchase_id: ${f.filter((r) => !r.purchase_id).length}`);
        lines.push(`fabrics where available > total: ${f.filter((r) => num(r.available_meters) > num(r.total_meters) + 0.001).length}`);
        const linked = s.filter((r) => r.fabric_id);
        const linkedM = linked.reduce((t, r) => t + num(r.meters), 0);
        const unlinkedM = s.reduce((t, r) => t + num(r.meters), 0) - linkedM;
        lines.push(`sales: count=${s.length} linked=${linked.length} (${linkedM.toFixed(1)}m) unlinked=${s.length - linked.length} (${unlinkedM.toFixed(1)}m)`);

        // Per-purchase reconciliation: purchase total vs sum of its fabric rows.
        const byPurchase = {};
        const purchasesWithRows = new Set();
        f.forEach((r) => {
          if (!r.purchase_id) return;
          purchasesWithRows.add(r.purchase_id);
          byPurchase[r.purchase_id] =
            (byPurchase[r.purchase_id] || 0) +
            num(r.total_meters) * num(r.purchase_price_per_meter);
        });
        const gaps = p
          .filter((pu) => purchasesWithRows.has(pu.id))
          .map((pu) => ({ pu, fv: byPurchase[pu.id] || 0, pv: num(pu.total_amount) }))
          .filter((x) => Math.abs(x.pv - x.fv) > 1)
          .sort((a, b) => Math.abs(b.pv - b.fv) - Math.abs(a.pv - a.fv));
        lines.push(
          `invoice vs fabric-row difference (GST/other charges): ${gaps.length} purchases, total=${gaps.reduce((t, x) => t + (x.pv - x.fv), 0).toFixed(2)}`,
        );
        gaps.slice(0, 10).forEach((x) =>
          lines.push(
            `INVOICE-GAP ${x.pu.purchase_number} invoice=${x.pv.toFixed(2)} fabric_rows=${x.fv.toFixed(2)} diff=${(x.pv - x.fv).toFixed(2)}`,
          ),
        );
        // Purchases with NO fabric rows keep their hand-entered total (by design)
        const noRows = p.filter((pu) => !purchasesWithRows.has(pu.id));
        lines.push(
          `purchases with no fabric rows: ${noRows.length}, their total=${noRows.reduce((t, r) => t + num(r.total_amount), 0).toFixed(2)}`,
        );
        lines.push(`fabrics not linked to any purchase: ${f.filter((r) => !r.purchase_id).length}`);
        const neg = f
          .map((r) => ({ r, avail: num(r.available_meters), implied: num(r.total_meters) }))
          .filter((x) => x.avail > x.implied + 0.001)
          .sort((a, b) => b.avail - b.implied - (a.avail - a.implied))
          .slice(0, 10);
        neg.forEach((x) =>
          lines.push(`AVAIL>TOTAL ${x.r.name} total=${x.r.total_meters} avail=${x.r.available_meters} rate=${x.r.purchase_price_per_meter}`),
        );
        const top = [...f]
          .map((r) => ({ name: r.name, v: num(r.available_meters) * num(r.purchase_price_per_meter), m: num(r.available_meters), rate: num(r.purchase_price_per_meter) }))
          .sort((a, b) => b.v - a.v)
          .slice(0, 10);
        top.forEach((t) => lines.push(`TOP-STOCK ${t.name} avail=${t.m.toFixed(1)}m rate=${t.rate} value=${t.v.toFixed(2)}`));
        setOut(lines.join("\n"));
      } catch (e) {
        setOut("error: " + fmtErr(e));
      }
    })();
  }, []);
  return (
    <pre className="card p-4 text-xs whitespace-pre-wrap overflow-auto max-h-96">
      {out}
    </pre>
  );
}

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("analytics");
  const [monthlyData, setMonthlyData] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [topFabrics, setTopFabrics] = useState([]);
  const [stockRows, setStockRows] = useState([]);
  // Purchase invoices (supplier payable = fabric cost + other charges + GST).
  // Kept separate from stockRows on purpose: stock is valued at each fabric's
  // own buying price, which never includes charges or GST.
  const [invoiceRows, setInvoiceRows] = useState([]);
  const [stockSearch, setStockSearch] = useState("");
  const [stockPage, setStockPage] = useState(1);
  // Sales that could not be pinned to exactly one fabric (blank name, or a
  // name shared by several fabric rows). Surfaced on screen instead of being
  // silently dropped or, worse, subtracted from multiple rows at once.
  const [unattributed, setUnattributed] = useState({
    meters: 0,
    count: 0,
  });
  // Which duplicate names caused the ambiguity, so the warning can name them
  // and say how many fabrics each one collides with.
  const [ambiguousNames, setAmbiguousNames] = useState([]);
  // Invoice detail below the stock tables: "bySupplier" rollup or "invoices" list.
  const [invoiceView, setInvoiceView] = useState("bySupplier");
  const [stockSort, setStockSort] = useState("inStockValue"); // inStockValue | soldValue | available | soldMeters
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalProfit: 0,
    totalPurchases: 0,
    totalReceivables: 0,
    totalExpenses: 0,
  });
  const [prevSummary, setPrevSummary] = useState({
    totalSales: 0,
    totalProfit: 0,
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
  const [filterMode, setFilterMode] = useState("year"); // "year" | "custom"
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [customTo, setCustomTo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [chartView, setChartView] = useState("all");
  const [rankView, setRankView] = useState("revenue");
  const { showAmount } = useShowAmount();

  useEffect(() => {
    fetchYears();
    fetchAlerts();
  }, []);
  useEffect(() => {
    fetchAll();
  }, [year, filterMode, customFrom, customTo]);

  async function fetchYears() {
    const { data } = await supabase
      .from("sales")
      .select("sale_date")
      .order("sale_date", { ascending: true })
      .limit(1);
    const firstYear = data?.length
      ? new Date(data[0].sale_date).getFullYear()
      : new Date().getFullYear();
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = firstYear; y <= currentYear; y++) years.push(y);
    setAvailableYears(years.reverse());
  }

  async function fetchAlerts() {
    try {
      const [custRes, supRes, stockRes, customersRes, suppliersRes] =
        await Promise.all([
          supabase
            .from("sales")
            .select("customer_id, total_amount, paid_amount, discount_amount"),
          supabase
            .from("purchases")
            .select("supplier_id, total_amount, paid_amount"),
          supabase
            .from("fabrics")
            .select("name, available_meters")
            .lt("available_meters", 2),
          supabase.from("customers").select("id, name, phone"),
          supabase.from("suppliers").select("id, name"),
        ]);

      const customerMap = Object.fromEntries(
        (customersRes.data || []).map((c) => [c.id, c]),
      );
      const supplierMap = Object.fromEntries(
        (suppliersRes.data || []).map((s) => [s.id, s]),
      );

      // Group customers - calculate pending in frontend
      const custMap = {};
      (custRes.data || []).forEach((s) => {
        const pending = Math.max(
          (s.total_amount || 0) -
            (s.discount_amount || 0) -
            (s.paid_amount || 0),
          0,
        );
        if (pending <= 0) return;
        const customer = customerMap[s.customer_id];
        const id = s.customer_id || "walk-in";
        const name = customer?.name || "Walk-in";
        const phone = customer?.phone || "";
        if (!custMap[id]) custMap[id] = { name, phone, pending: 0 };
        custMap[id].pending += pending;
      });
      const pendingCustomers = Object.values(custMap)
        .sort((a, b) => b.pending - a.pending)
        .slice(0, 10);

      // Group suppliers - calculate pending in frontend
      const supMap = {};
      (supRes.data || []).forEach((p) => {
        const pending = Math.max(
          (p.total_amount || 0) - (p.paid_amount || 0),
          0,
        );
        if (pending <= 0) return;
        const supplier = supplierMap[p.supplier_id];
        const name = supplier?.name || "Unknown";
        if (!supMap[name]) supMap[name] = { name, pending: 0 };
        supMap[name].pending += pending;
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
      const startDate =
        filterMode === "custom" && customFrom
          ? `${customFrom}-01`
          : `${year}-01-01`;
      // Build end date with LOCAL date components — toISOString() shifts to UTC
      // and can drop the last day of the month (e.g. Dec 31 -> Dec 30 in IST).
      const endDate =
        filterMode === "custom" && customTo
          ? (() => {
              const [y, m] = customTo.split("-").map(Number);
              const lastDay = new Date(y, m, 0).getDate();
              return `${y}-${String(m).padStart(2, "0")}-${lastDay}`;
            })()
          : `${year}-12-31`;
      const prevStart = `${year - 1}-01-01`;
      const prevEnd = `${year - 1}-12-31`;
      const isYearMode = filterMode === "year";

      // Run queries with individual error handling so one failure doesn't break everything.
      // NOTE: Supabase caps a single select at 1000 rows, so all-time /
      // lifetime queries (fabrics, allSales, allPurchases) page through
      // everything via fetchAllRows — otherwise totals silently undercount.
      const safeQuery = async (label, promise, fallback = []) => {
        try {
          const res = await promise;
          if (res.error) {
            console.error(`Query failed [${label}]:`, {
              message: res.error.message,
              details: res.error.details,
              hint: res.error.hint,
              code: res.error.code,
            });
            return fallback;
          }
          return res.data || fallback;
        } catch (e) {
          console.error(`Query failed [${label}]:`, e);
          return fallback;
        }
      };
      // Column-tolerant all-time fetches (shared helper): if this Supabase
      // project hasn't applied a migration that adds columns (e.g. 042's
      // fabric_amount / gst_*), fall back to the base shape instead of
      // failing the whole report.
      const safeAllRowsTolerant = fetchAllRowsTolerant;

      const [
        sales, purchases, allPurchases, expenses, prevSales, customers,
        fabrics, allSales, suppliers,
      ] = await Promise.all([
          safeQuery(
            "sales:range",
            supabase
              .from("sales")
              .select(
                "sale_date, total_amount, margin, remaining_amount, meters, notes, fabric_name, customer_id, discount_amount",
              )
              .gte("sale_date", startDate)
              .lte("sale_date", endDate),
            [],
          ),
          safeQuery(
            "purchases:range",
            supabase
              .from("purchases")
              .select("purchase_date, total_amount")
              .gte("purchase_date", startDate)
              .lte("purchase_date", endDate),
            [],
          ),
          // All-time purchase invoices, for the Stock tab's charges/GST breakdown.
          // Tolerant of DBs where migration 042 hasn't been applied yet — then it
          // falls back to just the total, and the breakdown reads as ₹0.
          safeAllRowsTolerant(
            "purchases:all",
            "purchases",
            "id, purchase_number, purchase_date, supplier_id, total_amount, fabric_amount, other_charges, gst_rate, gst_amount",
            "id, purchase_number, purchase_date, supplier_id, total_amount",
          ),
          safeQuery(
            "expenses:range",
            supabase
              .from("expenses")
              .select("amount")
              .gte("expense_date", startDate)
              .lte("expense_date", endDate),
            [],
          ),
          safeQuery(
            "sales:prev-year",
            supabase
              .from("sales")
              .select("total_amount, margin, discount_amount")
              .gte("sale_date", prevStart)
              .lte("sale_date", prevEnd),
            [],
          ),
          safeQuery("customers:id-name", supabase.from("customers").select("id, name"), []),
          safeAllRowsTolerant(
            "fabrics:all",
            "fabrics",
            "id, name, barcode, total_meters, available_meters, purchase_price_per_meter, selling_price_per_meter",
            "id, name, total_meters, available_meters, purchase_price_per_meter",
          ),
          // All-time sales — only meters per fabric are needed for stock.
          // Include fabric_id as a fallback if fabric_name (migration 023)
          // doesn't exist on this DB yet.
          safeAllRowsTolerant(
            "sales:all-meters",
            "sales",
            "fabric_name, fabric_id, meters",
            "meters",
          ),
          // Supplier names for the Stock tab's invoice breakdown.
          // NOTE: must stay last — this array is destructured by position.
          safeQuery("suppliers:id-name", supabase.from("suppliers").select("id, name"), []),
        ]);

      const totalExpenses = expenses.reduce((s, r) => s + (r.amount || 0), 0);
      const totalMargin = sales.reduce((s, r) => s + (r.margin || 0), 0);

      // Build customer lookup map
      const customerMap = Object.fromEntries(customers.map((c) => [c.id, c]));

      // Previous year summary for YoY (only in year mode)
      if (isYearMode) {
        const prevMargin = prevSales.reduce((s, r) => s + (r.margin || 0), 0);
        setPrevSummary({
          totalSales: prevSales.reduce(
            (s, r) => s + ((r.total_amount || 0) - (r.discount_amount || 0)),
            0,
          ),
          totalProfit: prevMargin,
        });
      } else {
        setPrevSummary({ totalSales: 0, totalProfit: 0 });
      }

      // Monthly data with prev year overlay
      const monthly = Array.from({ length: 12 }, (_, i) => ({
        month: MONTHS[i],
        sales: 0,
        profit: 0,
        purchases: 0,
      }));
      sales.forEach((s) => {
        const m = new Date(s.sale_date).getMonth();
        monthly[m].sales +=
          (s.total_amount || 0) - (s.discount_amount || 0);
        monthly[m].profit += s.margin || 0;
      });
      purchases.forEach((p) => {
        const m = new Date(p.purchase_date).getMonth();
        monthly[m].purchases += p.total_amount || 0;
      });
      setMonthlyData(monthly);

      setSummary({
        // total_amount is stored pre-discount; net it out so sales/profit match
        totalSales: sales.reduce(
          (s, r) => s + ((r.total_amount || 0) - (r.discount_amount || 0)),
          0,
        ),
        totalProfit: totalMargin,
        totalPurchases: purchases.reduce(
          (s, r) => s + (r.total_amount || 0),
          0,
        ),
        // remaining_amount is discount-aware and reflects all-time payments
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
        custMap[name].revenue +=
          (s.total_amount || 0) - (s.discount_amount || 0);
        custMap[name].pending += s.remaining_amount || 0;
      });
      setTopCustomers(Object.values(custMap));

      // Top 10 fabrics by revenue & meters
      const fabricMap = {};
      sales.forEach((s) => {
        const name = s.fabric_name || "Unknown";
        if (!fabricMap[name]) fabricMap[name] = { name, revenue: 0, meters: 0 };
        fabricMap[name].revenue += (s.total_amount || 0) - (s.discount_amount || 0);
        fabricMap[name].meters += s.meters || 0;
      });
      setTopFabrics(Object.values(fabricMap));

      // ── Stock tab: join fabrics (snapshot) with all-time sales per fabric ──
      // Attribution lives in app/utils/soldMeters.js so this table, the
      // Dashboard and the repaired available_meters column can never disagree:
      // sales.fabric_id wins, then a barcode match (barcodes are unique per
      // fabric), then a name that only one fabric carries. Anything still
      // ambiguous is surfaced rather than subtracted from several rows at once.
      const {
        soldByFabricId,
        unattributedMeters,
        unattributedCount,
        ambiguousNames,
      } = buildSoldMeters(fabrics, allSales);
      setUnattributed({ meters: unattributedMeters, count: unattributedCount });
      setAmbiguousNames(ambiguousNames);
      // Bought Stock is valued at each fabric's BUYING PRICE (fabric rows),
      // not from purchases.total_amount — an invoice total includes GST and
      // other charges, so it is higher than the fabric cost and would never
      // reconcile with Sold + In-Stock. The invoice totals are kept only as
      // an informational reference on screen.
      const supplierNameById = Object.fromEntries(
        (suppliers || []).map((s) => [s.id, s.name]),
      );
      const invoices = (allPurchases || []).map((p) => ({
        id: p.id,
        number: p.purchase_number || "—",
        date: p.purchase_date || null,
        supplier: supplierNameById[p.supplier_id] || null,
        fabric: Number(p.fabric_amount) || 0,
        charges: Number(p.other_charges) || 0,
        gstRate: Number(p.gst_rate) || 0,
        gst: Number(p.gst_amount) || 0,
        total: Number(p.total_amount) || 0,
      }));
      const rows = (fabrics || []).map((f) => {
        const totalMeters = Number(f.total_meters) || 0;
        const availableStored = Number(f.available_meters) || 0;
        const buyRate = Number(f.purchase_price_per_meter) || 0;
        const soldMeters = soldByFabricId.get(f.id) || 0;
        // In-stock meters are DERIVED from purchased − sold rather than read
        // from fabrics.available_meters, which drifts out of sync (sales
        // without fabric_id never decrement it, and the old stock trigger
        // could over-restore). Derived stock can never exceed what was bought.
        const availableMeters = Math.max(0, totalMeters - soldMeters);
        return {
          id: f.id,
          name: f.name,
          totalMeters,
          soldMeters,
          availableMeters,
          availableStored,
          storedDrift: Math.abs(availableStored - availableMeters) > 0.01,
          buyRate,
          // All values below are at BUYING price (cost), never selling price.
          // Bought value from fabric rows (for the table only)
          boughtValue: totalMeters * buyRate,
          // Sold stock value = meters sold × buying price
          soldValue: soldMeters * buyRate,
          // In-stock value = meters in hand × buying price
          inStockCostValue: availableMeters * buyRate,
        };
      });
      setStockRows(rows);
      setInvoiceRows(invoices);
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

  // ── Stock tab aggregates (lifetime snapshot from fabrics + all-time sales) ──
  // All values are at each fabric's BUYING PRICE, so they reconcile exactly:
  //   Bought = Sold + In-Stock
  // Invoice totals (GST/other charges included) are kept as a reference only.
  const stockTotals = useMemo(() => {
    const t = stockRows.reduce(
      (s, r) => ({
        fabrics: s.fabrics + 1,
        boughtMeters: s.boughtMeters + r.totalMeters,
        boughtValue: s.boughtValue + r.boughtValue,
        soldMeters: s.soldMeters + r.soldMeters,
        soldValue: s.soldValue + r.soldValue,
        inStockMeters: s.inStockMeters + r.availableMeters,
        inStockCost: s.inStockCost + r.inStockCostValue,
        driftRows: s.driftRows + (r.storedDrift ? 1 : 0),
      }),
      {
        fabrics: 0,
        boughtMeters: 0,
        boughtValue: 0,
        soldMeters: 0,
        soldValue: 0,
        inStockMeters: 0,
        inStockCost: 0,
        driftRows: 0,
      },
    );
    // Purchase invoices include GST + other charges, so they run higher than
    // the fabric buy prices. Shown as a note, not as stock value.
    const inv = invoiceRows.reduce(
      (s, r) => ({
        fabric: s.fabric + r.fabric,
        charges: s.charges + r.charges,
        gst: s.gst + r.gst,
        total: s.total + r.total,
      }),
      { fabric: 0, charges: 0, gst: 0, total: 0 },
    );
    return {
      ...t,
      invoiceTotal: inv.total,
      invoiceFabric: inv.fabric,
      invoiceCharges: inv.charges,
      invoiceGst: inv.gst,
      // Per-invoice tax + charges vs. the cost of the fabric itself.
      chargesGap: inv.total - t.boughtValue,
    };
  }, [stockRows, invoiceRows]);

  // GST/charges grouped by supplier, biggest total first.
  const invoiceBySupplier = useMemo(() => {
    const m = new Map();
    for (const r of invoiceRows) {
      const k = r.supplier || "Unknown supplier";
      const cur = m.get(k) || { supplier: k, invoices: 0, fabric: 0, charges: 0, gst: 0, total: 0 };
      cur.invoices += 1;
      cur.fabric += r.fabric;
      cur.charges += r.charges;
      cur.gst += r.gst;
      cur.total += r.total;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [invoiceRows]);

  const visibleStockRows = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    const filtered = q
      ? stockRows.filter((r) => (r.name || "").toLowerCase().includes(q))
      : [...stockRows];
    const by = {
      inStockValue: (a, b) => b.inStockCostValue - a.inStockCostValue,
      soldValue: (a, b) => b.soldValue - a.soldValue,
      available: (a, b) => b.availableMeters - a.availableMeters,
      soldMeters: (a, b) => b.soldMeters - a.soldMeters,
    }[stockSort];
    return filtered.sort(by);
  }, [stockRows, stockSearch, stockSort]);

  // Paginate the fabric-wise stock table. The page is clamped at render time
  // rather than in an effect, so narrowing the search can never leave the
  // table showing an empty page.
  const stockTotalPages = Math.max(
    1,
    Math.ceil(visibleStockRows.length / STOCK_PAGE_SIZE),
  );
  const stockPageSafe = Math.min(stockPage, stockTotalPages);
  const paginatedStockRows = useMemo(
    () =>
      visibleStockRows.slice(
        (stockPageSafe - 1) * STOCK_PAGE_SIZE,
        stockPageSafe * STOCK_PAGE_SIZE,
      ),
    [visibleStockRows, stockPageSafe],
  );

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
            Business performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
            {[["year", "Year"], ["custom", "Custom"]].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setFilterMode(v)}
                className={`px-2.5 py-1.5 rounded-md font-medium transition-all ${filterMode === v ? "bg-white shadow text-gray-900" : "text-gray-500"}`}
              >
                {l}
              </button>
            ))}
          </div>
          {filterMode === "year" ? (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="input w-28"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="month"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="input w-36 text-sm"
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="month"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value)}
                className="input w-36 text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {[
          ["analytics", "Analytics"],
          ["rankings", "Rankings"],
          ["stock", "Stock"],
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

      {/* Debug: stock diagnostic (dev only) */}
      {typeof window !== "undefined" &&
        window.location.search.includes("debug=stock") && (
          <StockDiagnostic />
        )}

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
                  {card.subtitle && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      {card.subtitle}
                    </p>
                  )}
                  {yoy && filterMode === "year" && (
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
                No data for selected period
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
                No data for selected period
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

      {/* ── STOCK TAB ── */}
      {activeTab === "stock" && (
        <div className="space-y-5">
          <p className="text-xs text-gray-400">
            Lifetime snapshot — stock in hand is derived as{" "}
            <span className="text-gray-500 font-medium">
              purchased metres − sold metres
            </span>
            , and every fabric is valued at its{" "}
            <span className="text-gray-500 font-medium">
              own buying price
            </span>{" "}
            (not selling price, and not the invoice total which includes GST).
          </p>
          {stockTotals.driftRows > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠️ {stockTotals.driftRows} fabric
              {stockTotals.driftRows > 1 ? "s have" : " has"} a stale stored
              stock figure (sales without a linked fabric never decremented it).
              The Fabric stock repair migration sets them right.
            </div>
          )}
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              {
                title: "Fabrics",
                raw: null,
                big: `${stockTotals.fabrics}`,
                small: "varieties tracked",
                icon: Package,
                bg: "bg-purple-50",
                iconBg: "bg-purple-500",
                text: "text-purple-700",
              },
              {
                title: "Bought Stock",
                raw: stockTotals.boughtValue,
                big: fmtShort(stockTotals.boughtValue, showAmount),
                small: `${stockTotals.boughtMeters.toFixed(1)}m purchased (buy price)`,
                icon: ShoppingBag,
                bg: "bg-orange-50",
                iconBg: "bg-orange-500",
                text: "text-orange-700",
              },
              {
                title: "Sold Stock",
                raw: stockTotals.soldValue,
                big: fmtShort(stockTotals.soldValue, showAmount),
                small: `${stockTotals.soldMeters.toFixed(1)}m sold (at buy price)`,
                icon: TrendingUp,
                bg: "bg-blue-50",
                iconBg: "bg-blue-500",
                text: "text-blue-700",
              },
              {
                title: "In-Stock Stock",
                raw: stockTotals.inStockCost,
                big: fmtShort(stockTotals.inStockCost, showAmount),
                small: `${stockTotals.inStockMeters.toFixed(1)}m in hand (at buy price)`,
                icon: DollarSign,
                bg: "bg-green-50",
                iconBg: "bg-green-500",
                text: "text-green-700",
              },
              {
                title: "Sell-through",
                raw: null,
                big: `${
                  stockTotals.boughtMeters > 0
                    ? Math.round(
                        (stockTotals.soldMeters / stockTotals.boughtMeters) *
                          100,
                      )
                    : 0
                }%`,
                small: "of purchased metres sold",
                icon: Package,
                bg: "bg-amber-50",
                iconBg: "bg-amber-500",
                text: "text-amber-700",
              },
            ].map((card) => {
              const Icon = card.icon;
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
                    {card.big}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {card.raw === null
                      ? card.small
                      : fmt(card.raw, showAmount)}
                  </p>
                  {card.raw !== null && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      {card.small}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Reconciliation — Bought = Sold + In-Stock, valued at fabric buy price */}
          <div className="card p-3">
            <p className="text-xs text-gray-400 mb-2">
              How these add up (each fabric valued at its buying price)
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-semibold text-gray-900">
                Bought {fmt(stockTotals.boughtValue, showAmount)}
              </span>
              <span className="text-gray-400">=</span>
              <span className="text-blue-700">
                Sold {fmt(stockTotals.soldValue, showAmount)}
              </span>
              <span className="text-gray-400">+</span>
              <span className="text-green-700">
                In-Stock {fmt(stockTotals.inStockCost, showAmount)}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Stock value above uses each fabric&apos;s own buying price, so it
              excludes GST and other charges. Invoice figures{" "}
              <span className="text-gray-500 font-medium">
                {fmt(stockTotals.invoiceTotal, showAmount)}
              </span>{" "}
              are the supplier payable only and are{" "}
              <span className="text-gray-500 font-medium">
                {fmt(Math.abs(stockTotals.chargesGap), showAmount)}
              </span>{" "}
              {stockTotals.chargesGap > 0 ? "more" : "less"} — broken down below.
            </p>
            {unattributed.count > 0 && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 mt-2">
                <p>
                  {unattributed.count} sale{unattributed.count > 1 ? "s" : ""}{" "}
                  totalling {fmt(unattributed.meters, showAmount)}m could not be
                  matched to a single fabric, so they are excluded from Sold
                  above. Re-link those sales to a fabric to include them.
                </p>
                {ambiguousNames.length > 0 && (
                  <>
                    <p className="mt-1.5 font-medium text-amber-800">
                      Duplicate fabric names — the cause:
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {ambiguousNames.slice(0, 5).map((a) => (
                        <li key={a.name} className="flex flex-wrap items-center gap-x-1.5">
                          <span className="font-medium text-amber-900">
                            {a.name}
                          </span>
                          <span>
                            — {a.candidates} fabrics share this name,{" "}
                            {a.count} sale{a.count > 1 ? "s" : ""} (
                            {fmt(a.meters, showAmount)}m) can&apos;t be pinned
                            to one
                          </span>
                        </li>
                      ))}
                      {ambiguousNames.length > 5 && (
                        <li className="text-amber-600">
                          +{ambiguousNames.length - 5} more
                        </li>
                      )}
                    </ul>
                    <p className="mt-1.5 text-amber-600">
                      Fix by scanning the barcode, or giving each fabric a
                      unique name. They are not counted twice, so stock is
                      never overstated.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── GST & other charges breakdown ── */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Receipt className="w-4 h-4 text-indigo-500" />
              <h2 className="font-semibold text-gray-900">
                GST &amp; Other Charges on Purchases
              </h2>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                {invoiceRows.length}
              </span>
              <p className="w-full text-[11px] text-gray-400 sm:w-auto sm:flex-1 sm:ml-1">
                Lifetime, all suppliers. Invoice total = fabric amount + other
                charges + GST. This is what you owe suppliers, so it is not part
                of stock value or gross profit.
              </p>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                {[
                  { key: "bySupplier", label: "By Supplier" },
                  { key: "invoices", label: "All Invoices" },
                ].map((o) => (
                  <button
                    key={o.key}
                    onClick={() => setInvoiceView(o.key)}
                    className={`px-3 py-1.5 font-medium transition ${
                      invoiceView === o.key
                        ? "bg-indigo-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  title: "Fabric Amount",
                  value: stockTotals.invoiceFabric,
                  sub: "cost of goods only",
                  icon: Package,
                  text: "text-orange-700",
                  bg: "bg-orange-50",
                },
                {
                  title: "Other Charges",
                  value: stockTotals.invoiceCharges,
                  sub: "freight, loading, etc.",
                  icon: Receipt,
                  text: "text-sky-700",
                  bg: "bg-sky-50",
                },
                {
                  title: "GST Paid",
                  value: stockTotals.invoiceGst,
                  sub: "input tax credit",
                  icon: Percent,
                  text: "text-violet-700",
                  bg: "bg-violet-50",
                },
                {
                  title: "Invoice Total",
                  value: stockTotals.invoiceTotal,
                  sub: "supplier payable",
                  icon: ShoppingBag,
                  text: "text-indigo-700",
                  bg: "bg-indigo-50",
                },
              ].map((c) => (
                <div key={c.title} className={`card p-3 ${c.bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <c.icon className={`w-4 h-4 ${c.text}`} />
                    <span className="text-xs font-medium text-gray-600">
                      {c.title}
                    </span>
                  </div>
                  <p
                    className={`text-lg font-bold ${c.text} tabular-nums`}
                    title={fmt(c.value, showAmount)}
                  >
                    {fmtShort(c.value, showAmount)}
                  </p>
                  <p className="text-[11px] text-gray-400">{c.sub}</p>
                </div>
              ))}
            </div>
            <div className="card overflow-hidden">
              {invoiceView === "bySupplier" ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Invoices</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Fabric Amt</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Other Charges</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">GST</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Invoice Total</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">GST %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {invoiceBySupplier.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">
                            No purchase invoices yet.
                          </td>
                        </tr>
                      ) : (
                        invoiceBySupplier.map((s) => (
                          <tr key={s.supplier} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-900">{s.supplier}</td>
                            <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">{s.invoices}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{fmt(s.fabric, showAmount)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-sky-700 whitespace-nowrap">{fmt(s.charges, showAmount)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-violet-700 whitespace-nowrap">{fmt(s.gst, showAmount)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">{fmt(s.total, showAmount)}</td>
                            <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">
                              {s.fabric > 0 ? `${((s.gst / s.fabric) * 100).toFixed(1)}%` : "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {invoiceBySupplier.length > 0 && (
                      <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                        <tr>
                          <td className="px-4 py-2.5 text-gray-900">Total</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {invoiceBySupplier.reduce((n, s) => n + s.invoices, 0)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{fmt(stockTotals.invoiceFabric, showAmount)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-sky-700 whitespace-nowrap">{fmt(stockTotals.invoiceCharges, showAmount)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-violet-700 whitespace-nowrap">{fmt(stockTotals.invoiceGst, showAmount)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 whitespace-nowrap">{fmt(stockTotals.invoiceTotal, showAmount)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                            {stockTotals.invoiceFabric > 0
                              ? `${((stockTotals.invoiceGst / stockTotals.invoiceFabric) * 100).toFixed(1)}%`
                              : "—"}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[26rem] overflow-y-auto">
                  <table className="w-full text-sm min-w-[860px]">
                    <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Fabric Amt</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Other Charges</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">GST Rate</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">GST Amt</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Invoice Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {invoiceRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-400">
                            No purchase invoices yet.
                          </td>
                        </tr>
                      ) : (
                        [...invoiceRows]
                          .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                          .map((r) => (
                            <tr key={r.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{r.number}</td>
                              <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{formatDate(r.date)}</td>
                              <td className="px-4 py-2.5 text-gray-600">{r.supplier || "—"}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{fmt(r.fabric, showAmount)}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-sky-700 whitespace-nowrap">{fmt(r.charges, showAmount)}</td>
                              <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">
                                {r.gstRate ? `${r.gstRate}%` : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-violet-700 whitespace-nowrap">{fmt(r.gst, showAmount)}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">{fmt(r.total, showAmount)}</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                    {invoiceRows.length > 0 && (
                      <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                        <tr>
                          <td colSpan={3} className="px-4 py-2.5 text-gray-900">Total ({invoiceRows.length})</td>
                          <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{fmt(stockTotals.invoiceFabric, showAmount)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-sky-700 whitespace-nowrap">{fmt(stockTotals.invoiceCharges, showAmount)}</td>
                          <td className="px-4 py-2.5 text-right text-gray-400">—</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-violet-700 whitespace-nowrap">{fmt(stockTotals.invoiceGst, showAmount)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 whitespace-nowrap">{fmt(stockTotals.invoiceTotal, showAmount)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Per-fabric table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
              <Package className="w-4 h-4 text-purple-500" />
              <h2 className="font-semibold text-gray-900">Fabric-wise Stock</h2>
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                {visibleStockRows.length}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <input
                  type="text"
                  value={stockSearch}
                  onChange={(e) => {
                    setStockSearch(e.target.value);
                    setStockPage(1);
                  }}
                  placeholder="Search fabric…"
                  className="input w-40 text-sm !py-1.5"
                />
                <select
                  value={stockSort}
                  onChange={(e) => {
                    setStockSort(e.target.value);
                    setStockPage(1);
                  }}
                  className="input w-44 text-sm !py-1.5"
                >
                  <option value="inStockValue">Sort: In-stock value</option>
                  <option value="soldValue">Sort: Sold value (cost)</option>
                  <option value="available">Sort: Meters in hand</option>
                  <option value="soldMeters">Sort: Meters sold</option>
                </select>
              </div>
            </div>
            {visibleStockRows.length === 0 ? (
              <p className="text-center py-8 text-sm text-gray-400">
                {stockRows.length === 0
                  ? "No fabrics found"
                  : "No fabrics match your search"}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Fabric</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Bought</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Sold</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">In Hand</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">In-Stock Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginatedStockRows.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-gray-900">{r.name}</p>
                          <p className="text-[11px] text-gray-400">
                            Buy ₹{r.buyRate.toFixed(2)}/m
                          </p>
                          {r.storedDrift && (
                            <p className="text-[10px] text-amber-600">
                              stored stock was {r.availableStored.toFixed(1)}m
                              (stale)
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <p className="font-medium text-gray-900">{r.totalMeters.toFixed(1)}m</p>
                          <p className="text-[11px] text-gray-400">{fmt(r.boughtValue, showAmount)}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <p className="font-medium text-gray-900">{r.soldMeters.toFixed(1)}m</p>
                          <p className="text-[11px] text-gray-400">{fmt(r.soldValue, showAmount)}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`font-semibold ${r.availableMeters < 2 ? "text-red-600" : "text-gray-900"}`}>
                            {r.availableMeters.toFixed(1)}m
                          </span>
                          {r.availableMeters < 2 && <span className="ml-1 text-[11px]">⚠️</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-green-700">
                          {fmt(r.inStockCostValue, showAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                    <tr>
                      <td className="px-4 py-2.5 text-gray-900">
                        Total ({stockTotals.fabrics} fabrics)
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-900">
                        {stockTotals.boughtMeters.toFixed(1)}m
                        <span className="block text-[11px] font-normal text-gray-400">
                          {fmt(stockTotals.boughtValue, showAmount)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-900">
                        {stockTotals.soldMeters.toFixed(1)}m
                        <span className="block text-[11px] font-normal text-gray-400">
                          {fmt(stockTotals.soldValue, showAmount)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-900">
                        {stockTotals.inStockMeters.toFixed(1)}m
                      </td>
                      <td className="px-4 py-2.5 text-right text-green-700">
                        {fmt(stockTotals.inStockCost, showAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                {stockTotalPages > 1 && (
                  <div className="border-t border-gray-100 py-3">
                    <Pagination
                      currentPage={stockPageSafe}
                      totalPages={stockTotalPages}
                      onPageChange={setStockPage}
                      totalItems={visibleStockRows.length}
                      label="fabrics"
                    />
                  </div>
                )}
              </div>
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
                      {f.available_meters?.toFixed(2)}m left
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
