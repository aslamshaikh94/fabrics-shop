"use client";
import { memo } from "react";

const PAYMENT_BADGES = {
  cash: "bg-accent-100 text-accent-800",
  credit: "bg-warning-100 text-warning-800",
  partial: "bg-blue-100 text-blue-800",
};

const PAYMENT_LABELS = { cash: "Cash", credit: "Credit", partial: "Partial" };

const PaymentBadge = memo(function PaymentBadge({ type }) {
  return (
    <span className={`badge ${PAYMENT_BADGES[type] || ""}`}>
      {PAYMENT_LABELS[type] || type}
    </span>
  );
});

export default PaymentBadge;
