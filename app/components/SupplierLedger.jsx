'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Calendar, ShoppingBag, CreditCard } from 'lucide-react';

export default function SupplierLedger({ supplier, onClose }) {
  const [purchases, setPurchases] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchLedger(); }, [supplier.id]);

  async function fetchLedger() {
    try {
      const purchasesRes = await supabase.from('purchases').select('*').eq('supplier_id', supplier.id).order('purchase_date', { ascending: false });
      const allPurchases = purchasesRes.data || [];
      const purchaseIds = allPurchases.map(p => p.id);

      let relatedPayments = [];
      if (purchaseIds.length > 0) {
        const paymentsRes = await supabase.from('purchase_payments').select('*').in('purchase_id', purchaseIds).order('payment_date', { ascending: false });
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

  const timeline = [
    ...purchases.map(p => ({ type: 'purchase', date: p.purchase_date, amount: p.total_amount, notes: p.notes, id: p.id })),
    ...payments.map(p => ({ type: 'payment', date: p.payment_date, amount: p.amount, method: p.payment_method, id: p.id })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
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
            <div className="grid grid-cols-3 gap-4 p-6 border-b border-gray-100">
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total Purchased</p>
                <p className="text-xl font-bold text-gray-900 mt-1">₹{totalPurchased.toLocaleString('en-IN')}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total Paid</p>
                <p className="text-xl font-bold text-accent-600 mt-1">₹{totalPaid.toLocaleString('en-IN')}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Outstanding</p>
                <p className={`text-xl font-bold mt-1 ${outstanding > 0 ? 'text-warning-600' : 'text-accent-600'}`}>
                  ₹{outstanding.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-6">
              {timeline.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No transactions found</p>
              ) : (
                <div className="space-y-3">
                  {timeline.map(item => (
                    <div key={`${item.type}-${item.id}`} className={`flex items-start gap-4 p-4 rounded-lg border ${item.type === 'purchase' ? 'border-warning-100 bg-warning-50' : 'border-accent-100 bg-accent-50'}`}>
                      <div className={`p-2 rounded-lg ${item.type === 'purchase' ? 'bg-warning-100' : 'bg-accent-100'}`}>
                        {item.type === 'purchase'
                          ? <ShoppingBag className="w-4 h-4 text-warning-600" />
                          : <CreditCard className="w-4 h-4 text-accent-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">
                          {item.type === 'purchase' ? 'Purchase' : `Payment — ${item.method?.toUpperCase()}`}
                        </p>
                        {item.notes && <p className="text-xs text-gray-500 mt-0.5 truncate">{item.notes}</p>}
                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <p className={`font-semibold text-sm whitespace-nowrap ${item.type === 'purchase' ? 'text-warning-700' : 'text-accent-700'}`}>
                        {item.type === 'purchase' ? '+' : '-'}₹{item.amount.toLocaleString('en-IN')}
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
