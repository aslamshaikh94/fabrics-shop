'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Calendar, ShoppingBag, CreditCard, TrendingDown } from 'lucide-react';

function fmt(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }

export default function SupplierLedger({ supplier, onClose }) {
  const [purchases, setPurchases] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchLedger(); }, [supplier.id]);

  async function fetchLedger() {
    try {
      const purchasesRes = await supabase.from('purchases').select('*').eq('supplier_id', supplier.id).order('purchase_date', { ascending: true });
      const allPurchases = purchasesRes.data || [];
      const purchaseIds = allPurchases.map(p => p.id);

      let relatedPayments = [];
      if (purchaseIds.length > 0) {
        const paymentsRes = await supabase.from('purchase_payments').select('*').in('purchase_id', purchaseIds).order('payment_date', { ascending: true });
        relatedPayments = paymentsRes.data || [];
      }

      setPurchases(allPurchases);
      setPayments(relatedPayments);
    } catch (err) {
      console.error('Error fetching supplier ledger:', err);
    } finally {
      setLoading(false);
    }
  }

  const totalPurchased = purchases.reduce((s, r) => s + (r.total_amount || 0), 0);
  const totalPaid = payments.reduce((s, r) => s + (r.amount || 0), 0);
  const outstanding = totalPurchased - totalPaid;

  // Build timeline with running balance
  const timeline = [
    ...purchases.map(p => ({ type: 'purchase', date: p.purchase_date, amount: p.total_amount, notes: p.notes, id: p.id })),
    ...payments.map(p => ({ type: 'payment', date: p.payment_date, amount: p.amount, method: p.payment_method, id: p.id })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Calculate running balance
  let balance = 0;
  const timelineWithBalance = timeline.map(item => {
    if (item.type === 'purchase') balance += item.amount;
    else balance -= item.amount;
    return { ...item, balance };
  }).reverse(); // Show latest first

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl m-4 my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{supplier.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Supplier Ledger</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 p-4 sm:p-6 border-b border-gray-100 shrink-0">
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total Purchased</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{fmt(totalPurchased)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total Paid</p>
                <p className="text-lg font-bold text-accent-600 mt-1">{fmt(totalPaid)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Outstanding</p>
                <p className={`text-lg font-bold mt-1 ${outstanding > 0 ? 'text-warning-600' : 'text-accent-600'}`}>
                  {fmt(outstanding)}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            {totalPurchased > 0 && (
              <div className="px-4 sm:px-6 py-3 border-b border-gray-100 shrink-0">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                  <div className="h-2 bg-accent-500" style={{ width: `${(totalPaid / totalPurchased) * 100}%` }} />
                  <div className="h-2 bg-warning-400" style={{ width: `${(outstanding / totalPurchased) * 100}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>{((totalPaid / totalPurchased) * 100).toFixed(0)}% paid</span>
                  <span>{((outstanding / totalPurchased) * 100).toFixed(0)}% pending</span>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-6">
              {timelineWithBalance.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No transactions found</p>
              ) : (
                <div className="space-y-2">
                  {/* Table header */}
                  <div className="grid grid-cols-4 gap-2 text-xs font-medium text-gray-400 uppercase px-2 mb-3">
                    <span className="col-span-2">Transaction</span>
                    <span className="text-right">Amount</span>
                    <span className="text-right">Balance</span>
                  </div>
                  {timelineWithBalance.map(item => (
                    <div key={`${item.type}-${item.id}`} className={`grid grid-cols-4 gap-2 items-center p-3 rounded-lg border ${item.type === 'purchase' ? 'border-warning-100 bg-warning-50' : 'border-accent-100 bg-accent-50'}`}>
                      <div className="col-span-2 flex items-center gap-3 min-w-0">
                        <div className={`p-1.5 rounded-lg shrink-0 ${item.type === 'purchase' ? 'bg-warning-100' : 'bg-accent-100'}`}>
                          {item.type === 'purchase'
                            ? <ShoppingBag className="w-3.5 h-3.5 text-warning-600" />
                            : <CreditCard className="w-3.5 h-3.5 text-accent-600" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-xs">
                            {item.type === 'purchase' ? 'Purchase' : `Payment — ${item.method?.toUpperCase()}`}
                          </p>
                          {item.notes && <p className="text-xs text-gray-400 truncate">{item.notes}</p>}
                          <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            {new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </div>
                      </div>
                      <p className={`text-right font-semibold text-sm ${item.type === 'purchase' ? 'text-warning-700' : 'text-accent-700'}`}>
                        {item.type === 'purchase' ? '+' : '-'}{fmt(item.amount)}
                      </p>
                      <p className={`text-right font-semibold text-sm ${item.balance > 0 ? 'text-warning-600' : 'text-accent-600'}`}>
                        {fmt(item.balance)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
