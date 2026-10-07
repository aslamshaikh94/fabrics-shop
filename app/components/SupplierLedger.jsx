"use client";
import { useCallback } from "react";
import { supabase } from "../lib/supabase";
import { ShoppingBag } from "lucide-react";
import AccountLedger from "./shared/AccountLedger";

export default function SupplierLedger({ supplier, onClose }) {
  const fetchData = useCallback(async () => {
    const purchasesRes = await supabase
      .from("purchases")
      .select("*")
      .eq("supplier_id", supplier.id)
      .order("purchase_date", { ascending: true });
    const allPurchases = purchasesRes.data || [];
    const purchaseIds = allPurchases.map((p) => p.id);

    let relatedPayments = [];
    if (purchaseIds.length > 0) {
      const paymentsRes = await supabase
        .from("purchase_payments")
        .select("*")
        .in("purchase_id", purchaseIds)
        .order("payment_date", { ascending: true });
      relatedPayments = paymentsRes.data || [];
    }

    return { entries: allPurchases, payments: relatedPayments };
  }, [supplier.id]);

  return (
    <AccountLedger
      title={supplier.name}
      subtitle="Supplier Ledger"
      totalLabel="Total Purchased"
      entryLabel="Purchase"
      EntryIcon={ShoppingBag}
      theme="warning"
      entryDateKey="purchase_date"
      showBalance
      fetchData={fetchData}
      onClose={onClose}
    />
  );
}
