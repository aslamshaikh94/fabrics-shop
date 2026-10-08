"use client";
import { useCallback } from "react";
import { supabase } from "../lib/supabase";
import { TrendingUp } from "lucide-react";
import AccountLedger from "./shared/AccountLedger";

export default function CustomerLedger({ customer, onClose }) {
  const fetchData = useCallback(async () => {
    const [salesRes, paymentsRes] = await Promise.all([
      supabase
        .from("sales")
        .select("id, sale_group_id, total_amount, discount_amount, paid_amount, sale_date, notes")
        .eq("customer_id", customer.id)
        .order("sale_date", { ascending: false }),
      supabase
        .from("sale_payments")
        .select("id, sale_id, sale_group_id, amount, payment_date, payment_method")
        .order("payment_date", { ascending: false }),
    ]);
    const allSales = salesRes.data || [];
    const saleIds = allSales.map((s) => s.id);
    const saleGroupIds = new Set(
      allSales.map((s) => s.sale_group_id).filter(Boolean),
    );
    const relatedPayments = (paymentsRes.data || []).filter(
      (p) => saleIds.includes(p.sale_id) || saleGroupIds.has(p.sale_group_id),
    );
    return { entries: allSales, payments: relatedPayments };
  }, [customer.id]);

  return (
    <AccountLedger
      title={customer.name}
      subtitle="Customer Ledger"
      totalLabel="Total Billed"
      entryLabel="Sale"
      EntryIcon={TrendingUp}
      theme="primary"
      entryDateKey="sale_date"
      fetchData={fetchData}
      onClose={onClose}
    />
  );
}
