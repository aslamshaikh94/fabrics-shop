"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";
import {
  Pencil,
  Calendar,
  Paperclip,
  Plus,
  X,
  Save,
  XCircle,
  History,
} from "lucide-react";
import Modal from "./shared/Modal";
import FabricSelect from "./shared/FabricSelect";
import CustomerSelect from "./shared/CustomerSelect";
import FileUpload from "./FileUpload";
import { useToast } from "./Toast";
import { formatCustomerName } from "../utils/formatters";

const PAYMENT_BADGES = {
  cash: "bg-accent-100 text-accent-800",
  credit: "bg-warning-100 text-warning-800",
  partial: "bg-blue-100 text-blue-800",
};
const PAYMENT_LABELS = { cash: "Cash", credit: "Credit", partial: "Partial" };
function PaymentBadge({ type }) {
  return (
    <span className={`badge ${PAYMENT_BADGES[type] || ""}`}>
      {PAYMENT_LABELS[type] || type}
    </span>
  );
}

const EMPTY_EDIT_ITEM = {
  fabric_id: "",
  fabric_name: "",
  meters: "",
  price_per_meter: "",
  cost_price_per_meter: "",
};
const EMPTY_NEW_ITEM = {
  fabric_id: "",
  fabric_name: "",
  meters: "",
  price_per_meter: "",
  cost_price_per_meter: "",
};
const EMPTY_GROUP_FIELDS = {
  customer_id: "",
  customer_name: "",
  sale_date: "",
  payment_type: "cash",
  initial_payment: "",
  discount_amount: "",
  invoice_file: null,
};

export default function SaleDetailsModal({
  open,
  onClose,
  group,
  fabrics,
  customers,
  onSaleUpdated,
  onViewPayments,
}) {
  const toast = useToast();
  const [editingItemId, setEditingItemId] = useState(null);
  const [editItemForm, setEditItemForm] = useState({ ...EMPTY_EDIT_ITEM });
  const [savingEditItem, setSavingEditItem] = useState(false);
  const [showEditSaleInfo, setShowEditSaleInfo] = useState(false);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [newItemForm, setNewItemForm] = useState({ ...EMPTY_NEW_ITEM });
  const [editGroupFields, setEditGroupFields] = useState({
    ...EMPTY_GROUP_FIELDS,
  });
  const [savingGroupFields, setSavingGroupFields] = useState(false);
  const [customerTab, setCustomerTab] = useState("existing");

  if (!open || !group) return null;

  async function handleEditItemSave(itemId) {
    if (
      !editItemForm.meters ||
      !editItemForm.price_per_meter ||
      !editItemForm.fabric_name
    ) {
      toast("Please fill in all required fields", "error");
      return;
    }
    setSavingEditItem(true);
    try {
      await supabase
        .from("sales")
        .update({
          fabric_id: editItemForm.fabric_id || null,
          meters: parseFloat(editItemForm.meters) || 0,
          price_per_meter: parseFloat(editItemForm.price_per_meter) || 0,
          cost_price_per_meter:
            parseFloat(editItemForm.cost_price_per_meter) || 0,
          fabric_name: editItemForm.fabric_name,
          notes: `Fabric: ${editItemForm.fabric_name}`,
        })
        .eq("id", itemId);
      setEditingItemId(null);
      onSaleUpdated();
      toast("Item updated successfully");
    } catch (error) {
      toast("Failed to update item", "error");
    } finally {
      setSavingEditItem(false);
    }
  }

  async function handleEditGroupFieldsSave() {
    setSavingGroupFields(true);
    try {
      const saleIds = group.items.map((i) => i.id);
      let invoice_url = group.items[0]?.invoice_url || "";
      if (editGroupFields.invoice_file) {
        const ext = editGroupFields.invoice_file.name.split(".").pop();
        const path = `sales-invoices/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("sales-invoices")
          .upload(path, editGroupFields.invoice_file);
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from("sales-invoices").getPublicUrl(path);
        invoice_url = publicUrl;
      }
      const discountAmount = parseFloat(editGroupFields.discount_amount) || 0;
      const walkinName =
        !editGroupFields.customer_id &&
        editGroupFields.customer_name &&
        editGroupFields.customer_name !== "Walk-in Customer"
          ? editGroupFields.customer_name
          : null;

      // Auto-derive payment_type from initial_payment
      const initialPay = parseFloat(editGroupFields.initial_payment) || 0;
      const totalNet =
        group.items.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0) -
        discountAmount;
      const derivedPaymentType =
        initialPay <= 0
          ? "credit"
          : initialPay >= totalNet
            ? "cash"
            : "partial";
      editGroupFields.payment_type = derivedPaymentType;

      // Apply discount ONLY to first item (stores group-level discount)
      for (let idx = 0; idx < saleIds.length; idx++) {
        const saleId = saleIds[idx];
        const item = group.items[idx];
        if (!item) continue;

        const m = parseFloat(item.meters) || 0;
        const ppm = parseFloat(item.price_per_meter) || 0;
        const cpm = parseFloat(item.cost_price_per_meter) || 0;
        const preDiscountTotal = Math.round(m * ppm * 100) / 100;

        // Store discount only in first item, don't subtract from item remaining
        const itemDiscount = idx === 0 ? discountAmount : 0;

        let updatedNotes = item?.notes || "";
        if (walkinName) {
          // Replace or append walk-in name to notes
          if (updatedNotes.match(/\(Name:[^)]+\)/)) {
            updatedNotes = updatedNotes.replace(
              /\(Name:[^)]+\)/,
              `(Name: ${walkinName})`,
            );
          } else {
            updatedNotes = updatedNotes
              ? `${updatedNotes} (Name: ${walkinName})`
              : `(Name: ${walkinName})`;
          }
        } else if (!editGroupFields.customer_id) {
          // Remove walk-in name from notes if it was cleared
          updatedNotes = updatedNotes.replace(/\s*\(Name:[^)]+\)/g, "");
        }

        await supabase
          .from("sales")
          .update({
            customer_id: editGroupFields.customer_id || null,
            customer_name: !editGroupFields.customer_id
              ? editGroupFields.customer_name !== "Walk-in Customer"
                ? editGroupFields.customer_name
                : ""
              : "",
            sale_date: editGroupFields.sale_date,
            payment_type: editGroupFields.payment_type,
            invoice_url,
            discount_amount: itemDiscount,
            total_amount: preDiscountTotal,
            margin: Math.max(Math.round(m * (ppm - cpm) * 100) / 100, 0),
            remaining_amount: Math.max(
              preDiscountTotal - (parseFloat(item.paid_amount) || 0),
              0,
            ),
            notes: updatedNotes,
          })
          .eq("id", saleId);
      }
      for (const item of group.items) {
        await supabase.from("sale_payments").delete().eq("sale_id", item.id);
      }
      if (derivedPaymentType === "cash") {
        for (const [idx, item] of group.items.entries()) {
          const m = parseFloat(item.meters) || 0;
          const ppm = parseFloat(item.price_per_meter) || 0;
          const itemTotal = Math.round(m * ppm * 100) / 100;
          // Subtract discount from first item's payment
          const amount =
            idx === 0 ? Math.max(itemTotal - discountAmount, 0) : itemTotal;
          await supabase.from("sale_payments").insert([
            {
              sale_id: item.id,
              amount,
              payment_date: editGroupFields.sale_date,
              payment_method: "cash",
            },
          ]);
        }
      } else if (initialPay > 0) {
        let remaining = initialPay;
        for (const [idx, item] of group.items.entries()) {
          if (remaining <= 0) break;
          const m = parseFloat(item.meters) || 0;
          const ppm = parseFloat(item.price_per_meter) || 0;
          const itemTotal = Math.round(m * ppm * 100) / 100;
          // Subtract discount from first item's amount
          const rowAmount =
            idx === 0 ? Math.max(itemTotal - discountAmount, 0) : itemTotal;
          const pay = Math.min(remaining, rowAmount);
          if (pay > 0) {
            await supabase.from("sale_payments").insert([
              {
                sale_id: item.id,
                amount: pay,
                payment_date: editGroupFields.sale_date,
                payment_method: "cash",
              },
            ]);
            remaining -= pay;
          }
        }
      }
      onSaleUpdated();
      setShowEditSaleInfo(false);
      toast("Sale info updated successfully");
    } catch (error) {
      setShowEditSaleInfo(false);
      toast("Failed to update sale info", "error");
    } finally {
      setSavingGroupFields(false);
    }
  }

  async function handleAddItemToSale(e) {
    e.preventDefault();
    if (
      !newItemForm.meters ||
      !newItemForm.price_per_meter ||
      !newItemForm.fabric_name
    ) {
      toast("Please fill in all required fields", "error");
      return;
    }
    try {
      await supabase.from("sales").insert([
        {
          customer_id: group.customer_id || null,
          fabric_id: newItemForm.fabric_id || null,
          meters: parseFloat(newItemForm.meters) || 0,
          price_per_meter: parseFloat(newItemForm.price_per_meter) || 0,
          cost_price_per_meter:
            parseFloat(newItemForm.cost_price_per_meter) || 0,
          sale_date: group.sale_date,
          payment_type: group.payment_type,
          sale_group_id: group.id,
          fabric_name: newItemForm.fabric_name,
          notes: `Fabric: ${newItemForm.fabric_name}`,
        },
      ]);
      setShowAddItemForm(false);
      setNewItemForm({ ...EMPTY_NEW_ITEM });
      onSaleUpdated();
      toast("Item added successfully");
    } catch (error) {
      toast("Failed to add item", "error");
    }
  }

  const setEditForView = () => {
    // Extract walk-in name from notes if no customer_id
    const walkInName = !group.customer_id
      ? group.items[0]?.customer_name || ""
      : "";
    const isWalkin = !group.customer_id;
    setCustomerTab(isWalkin ? "walkin" : "existing");
    setEditGroupFields({
      customer_id: group.customer_id || "",
      customer_name:
        group.customer?.name ||
        walkInName ||
        (group.customer_id ? "" : "Walk-in Customer"),
      sale_date: group.sale_date,
      payment_type: group.payment_type,
      initial_payment:
        group.paid_amount > 0 ? group.paid_amount.toString() : "",
      discount_amount: (group.items[0]?.discount_amount || 0).toString(),
      invoice_file: null,
    });
    setShowEditSaleInfo(true);
  };

  return (
    <>
      <Modal open={open} onClose={onClose} maxWidth="max-w-3xl">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Sale Items
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {formatCustomerName(group)} •{" "}
              {new Date(group.sale_date).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "2-digit",
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-lg p-4 border border-primary-100">
            <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
              Customer
            </p>
            <p className="font-semibold text-gray-900">
              {formatCustomerName(group)}
            </p>
            {group.customer?.phone && (
              <p className="text-xs text-gray-500 mt-0.5">
                {group.customer.phone}
              </p>
            )}
          </div>
          <div className="bg-gradient-to-r from-accent-50 to-green-50 dark:from-accent-900/20 dark:to-green-900/20 rounded-lg p-4 border border-accent-100">
            <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
              Payment
            </p>
            <p className="font-semibold text-gray-900 mb-1">
              <PaymentBadge type={group.payment_type} />
            </p>
            <div className="flex justify-between text-xs text-gray-600">
              <span>
                Total:{" "}
                <span className="font-semibold">
                  ₹
                  {group.total_amount.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </span>
              <span>
                Remaining:{" "}
                <span
                  className={`font-semibold ${group.remaining_amount > 0 ? "text-warning-600" : "text-gray-500"}`}
                >
                  ₹
                  {group.remaining_amount.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </span>
            </div>
          </div>
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
              Details & Documents
            </p>
            <p className="text-sm text-gray-900">
              <Calendar className="w-3.5 h-3.5 inline mr-1 mb-0.5 text-gray-400" />
              {new Date(group.sale_date).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "2-digit",
              })}
            </p>
            {group.items[0]?.invoice_url ? (
              <a
                href={group.items[0].invoice_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-600 hover:underline mt-1 inline-flex items-center gap-1"
              >
                <Paperclip className="w-3 h-3" /> View Invoice
              </a>
            ) : (
              <p className="text-xs text-gray-400 mt-1">No invoice</p>
            )}
          </div>
        </div>

        <div className="flex justify-end mb-2">
          <button
            onClick={setEditForView}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit Sale Info
          </button>
        </div>

        <div className="border-t border-gray-200 my-4"></div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">
              Items ({group.items.length})
            </h3>
            <button
              onClick={() => setShowAddItemForm(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Plus className="w-4 h-4" /> Add Item
            </button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {group.items.map((item, idx) => {
              const discAmt = item.discount_amount || 0;
              return (
                <div
                  key={item.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-sm bg-white"
                >
                  {editingItemId === item.id ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-500 uppercase font-bold">
                          Editing Item {idx + 1}
                        </p>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditingItemId(null)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-600"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditItemSave(item.id)}
                            disabled={savingEditItem}
                            className="p-1.5 hover:bg-green-50 rounded-lg text-gray-400 hover:text-green-600"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <FabricSelect
                        value={editItemForm}
                        onChange={setEditItemForm}
                        fabrics={fabrics}
                        required
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs font-bold text-gray-900 mb-1">
                            Meters *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={editItemForm.meters}
                            onChange={(e) =>
                              setEditItemForm({
                                ...editItemForm,
                                meters: e.target.value,
                              })
                            }
                            className="input"
                            required
                            onWheel={(e) => e.target.blur()}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-900 mb-1">
                            Price ₹/m *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={editItemForm.price_per_meter}
                            onChange={(e) =>
                              setEditItemForm({
                                ...editItemForm,
                                price_per_meter: e.target.value,
                              })
                            }
                            className="input"
                            required
                            onWheel={(e) => e.target.blur()}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-900 mb-1">
                            Cost ₹/m
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={editItemForm.cost_price_per_meter}
                            onChange={(e) =>
                              setEditItemForm({
                                ...editItemForm,
                                cost_price_per_meter: e.target.value,
                              })
                            }
                            className="input"
                            onWheel={(e) => e.target.blur()}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-bold mb-0.5">
                            Item {idx + 1}
                          </p>
                          <p className="font-semibold text-gray-900">
                            {item.fabric_name || "N/A"}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            const n = item.fabric_name || "";
                            setEditItemForm({
                              fabric_id: item.fabric_id || "",
                              fabric_name: n,
                              meters: item.meters.toString(),
                              price_per_meter: item.price_per_meter.toString(),
                              cost_price_per_meter:
                                item.cost_price_per_meter.toString(),
                            });
                            setEditingItemId(item.id);
                          }}
                          className="p-2 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-5 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Meters</p>
                          <p className="font-semibold">{item.meters}m</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Price/M</p>
                          <p className="font-semibold">
                            ₹
                            {item.price_per_meter.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Total</p>
                          <p className="font-semibold">
                            ₹
                            {item.total_amount.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Disc.</p>
                          <p className="font-semibold text-primary-600">
                            {discAmt > 0
                              ? `-₹${discAmt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Margin</p>
                          <p className="font-semibold text-accent-600">
                            ₹
                            {item.margin.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
                Total Meters
              </p>
              <p className="text-xl font-bold">
                {group.items
                  .reduce((s, i) => s + (parseFloat(i.meters) || 0), 0)
                  .toFixed(2)}
                m
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
                Total Amount
              </p>
              <p className="text-xl font-bold">
                ₹
                {group.total_amount.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
                Total Margin
              </p>
              <p className="text-xl font-bold text-accent-600">
                ₹
                {group.margin.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
                Remaining
              </p>
              <p
                className={`text-xl font-bold ${group.remaining_amount > 0 ? "text-warning-600" : "text-gray-500"}`}
              >
                ₹
                {group.remaining_amount.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onViewPayments(group)}
            className="flex-1 btn btn-secondary"
          >
            <History className="w-4 h-4 mr-2" /> View Payments
          </button>
          <button onClick={onClose} className="flex-1 btn btn-primary">
            Close
          </button>
        </div>
      </Modal>

      <Modal
        open={showEditSaleInfo}
        onClose={() => setShowEditSaleInfo(false)}
        title="Edit Sale Info"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <CustomerSelect
            value={editGroupFields}
            onChange={setEditGroupFields}
            customers={customers}
            customerTab={customerTab}
          />
          <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Payment
            </span>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 space-y-1">
              <div className="flex justify-between">
                <span>Total Sale Amount</span>
                <span className="font-semibold">
                  ₹
                  {group.total_amount.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex justify-between text-green-700">
                <span>Already Paid (recorded)</span>
                <span className="font-semibold">
                  ₹
                  {group.paid_amount.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex justify-between border-t border-blue-200 pt-1 text-warning-700">
                <span>Outstanding</span>
                <span className="font-semibold">
                  ₹
                  {group.remaining_amount.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Total Payment Amount
                <span className="ml-1 text-gray-400 font-normal">
                  (will reset & reapply payments)
                </span>
              </label>
              <input
                type="number"
                step="0.01"
                value={editGroupFields.initial_payment}
                onChange={(e) =>
                  setEditGroupFields({
                    ...editGroupFields,
                    initial_payment: e.target.value,
                  })
                }
                className="input bg-white"
                placeholder="Enter amount received (0 for credit)"
                max={group.total_amount}
                onWheel={(e) => e.target.blur()}
              />
            </div>
            {parseFloat(editGroupFields.initial_payment) >= 0 &&
              editGroupFields.initial_payment !== "" && (
                <div className="flex justify-between text-xs px-1">
                  <span className="text-gray-500">New remaining balance</span>
                  <span
                    className={`font-semibold ${
                      group.total_amount -
                        (parseFloat(editGroupFields.initial_payment) || 0) >
                      0
                        ? "text-warning-600"
                        : "text-accent-600"
                    }`}
                  >
                    ₹
                    {Math.max(
                      0,
                      group.total_amount -
                        (parseFloat(editGroupFields.initial_payment) || 0),
                    ).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
          </div>
          <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Discount (Applied on Total)
            </span>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Discount Amount (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editGroupFields.discount_amount}
                onChange={(e) =>
                  setEditGroupFields({
                    ...editGroupFields,
                    discount_amount: e.target.value,
                  })
                }
                className="input bg-white"
                placeholder="e.g. 500"
                onWheel={(e) => e.target.blur()}
              />
            </div>
          </div>
          <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Details & Documents
            </span>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Sale Date
              </label>
              <input
                type="date"
                value={editGroupFields.sale_date}
                onChange={(e) =>
                  setEditGroupFields({
                    ...editGroupFields,
                    sale_date: e.target.value,
                  })
                }
                className="input bg-white"
              />
            </div>
            <FileUpload
              label="Bill/Invoice"
              file={editGroupFields.invoice_file}
              onFileChange={(f) =>
                setEditGroupFields({ ...editGroupFields, invoice_file: f })
              }
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowEditSaleInfo(false)}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleEditGroupFieldsSave}
              disabled={savingGroupFields}
              className="btn btn-primary flex-1"
            >
              {savingGroupFields ? (
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
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showAddItemForm}
        onClose={() => {
          setShowAddItemForm(false);
          setNewItemForm({ ...EMPTY_NEW_ITEM });
        }}
        title="Add Item to Sale"
        maxWidth="max-w-lg"
      >
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-900">
            Adding item for{" "}
            <span className="font-semibold">
              {group.customer?.name || "Walk-in"}
            </span>{" "}
            on{" "}
            <span className="font-semibold">
              {new Date(group.sale_date).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "2-digit",
              })}
            </span>
          </p>
        </div>
        <form onSubmit={handleAddItemToSale} className="space-y-4">
          <FabricSelect
            value={newItemForm}
            onChange={setNewItemForm}
            fabrics={fabrics}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Meters *
              </label>
              <input
                type="number"
                step="0.01"
                value={newItemForm.meters}
                onChange={(e) =>
                  setNewItemForm({ ...newItemForm, meters: e.target.value })
                }
                className="input bg-white"
                required
                onWheel={(e) => e.target.blur()}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Price/Meter ₹ *
              </label>
              <input
                type="number"
                step="0.01"
                value={newItemForm.price_per_meter}
                onChange={(e) =>
                  setNewItemForm({
                    ...newItemForm,
                    price_per_meter: e.target.value,
                  })
                }
                className="input bg-white"
                required
                onWheel={(e) => e.target.blur()}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Cost/Meter ₹
            </label>
            <input
              type="number"
              step="0.01"
              value={newItemForm.cost_price_per_meter}
              onChange={(e) =>
                setNewItemForm({
                  ...newItemForm,
                  cost_price_per_meter: e.target.value,
                })
              }
              className="input bg-white"
              onWheel={(e) => e.target.blur()}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowAddItemForm(false);
                setNewItemForm({ ...EMPTY_NEW_ITEM });
              }}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1">
              Add Item
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
