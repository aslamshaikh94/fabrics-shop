"use client";
import { useState } from "react";
import Modal from "./shared/Modal";
import { CreditCard } from "lucide-react";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "check", label: "Check" },
  { value: "other", label: "Other" },
];

const INITIAL_PAYMENT = {
  amount: "",
  payment_date: new Date().toISOString().split("T")[0],
  payment_method: "cash",
  reference_number: "",
  notes: "",
};

export default function SalePaymentModal({
  open,
  onClose,
  selectedSale,
  onPaymentSubmit,
}) {
  const [paymentData, setPaymentData] = useState({ ...INITIAL_PAYMENT });

  if (!open || !selectedSale) return null;

  return (
    <Modal open={open} onClose={onClose} title="Receive Payment">
      <div className="bg-gray-50 rounded-lg p-3 mb-4">
        <p className="text-sm text-gray-600">
          Customer:{" "}
          <span className="font-medium">
            {selectedSale.customer?.name || "Walk-in"}
          </span>
        </p>
        <p className="text-sm text-gray-600 mt-1 italic">
          {selectedSale.items?.map((it) => it.fabric_name || "Item").join(", ")}
        </p>
        <p className="text-sm text-gray-600 mt-2">
          Remaining:{" "}
          <span className="font-semibold text-warning-600">
            ₹
            {selectedSale.remaining_amount.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </p>
      </div>
      <form
        onSubmit={(e) =>
          onPaymentSubmit(e, paymentData, setPaymentData, INITIAL_PAYMENT)
        }
        className="space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Amount *
          </label>
          <input
            type="number"
            step="0.01"
            required
            max={selectedSale.remaining_amount}
            value={paymentData.amount}
            onChange={(e) =>
              setPaymentData({ ...paymentData, amount: e.target.value })
            }
            className="input"
            placeholder="0.00"
            onWheel={(e) => e.target.blur()}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment Date
          </label>
          <input
            type="date"
            value={paymentData.payment_date}
            onChange={(e) =>
              setPaymentData({ ...paymentData, payment_date: e.target.value })
            }
            className="input w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment Method
          </label>
          <select
            value={paymentData.payment_method}
            onChange={(e) =>
              setPaymentData({ ...paymentData, payment_method: e.target.value })
            }
            className="input"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reference Number
          </label>
          <input
            type="text"
            value={paymentData.reference_number}
            onChange={(e) =>
              setPaymentData({
                ...paymentData,
                reference_number: e.target.value,
              })
            }
            className="input"
            placeholder="Transaction ID / Check No."
          />
        </div>
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary flex-1"
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-accent flex-1">
            <CreditCard className="w-5 h-5 mr-2" /> Receive Payment
          </button>
        </div>
      </form>
    </Modal>
  );
}
