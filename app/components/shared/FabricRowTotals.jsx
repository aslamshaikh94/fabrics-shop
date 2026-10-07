"use client";
import { memo } from "react";
import { formatNumber2 } from "../../utils/formatters";

/**
 * Compact "Amt / Disc / Net" row for a fabric line in the purchase forms.
 * Replaces the identical inline-IIFE totals blocks in Purchases.jsx.
 */
const FabricRowTotals = memo(function FabricRowTotals({
  meters,
  rate,
  discount = 0,
  showNet = true,
  className = "",
}) {
  const mtrs = parseFloat(meters) || 0;
  const r = parseFloat(rate) || 0;
  const disc = parseFloat(discount) || 0;
  const total = mtrs * r;
  const net = total - disc;
  return (
    <div className={`flex gap-3 text-[11px] text-gray-500 ${className}`}>
      <span>
        Amt:{" "}
        <strong>
          ₹
          {formatNumber2(total)}
        </strong>
      </span>
      {disc > 0 && (
        <span>
          Disc:{" "}
          <strong>
            -₹
            {formatNumber2(disc)}
          </strong>
        </span>
      )}
      {showNet && (
        <span>
          Net:{" "}
          <strong>
            ₹
            {formatNumber2(net)}
          </strong>
        </span>
      )}
    </div>
  );
});

export default FabricRowTotals;
