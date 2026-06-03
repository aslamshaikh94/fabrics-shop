'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Calendar, Filter, ArrowDownLeft, ArrowUpRight, ShoppingBag } from 'lucide-react';

export default function Payments() {
  const [purchasePayments, setPurchasePayments] = useState([]);
  const [salePayments, setSalePayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  const [supplierSummary, setSupplierSummary] = useState([]);
  const [activeTab, setActiveTab] = useState('suppliers');

  useEffect(() => { fetchPayments(); fetchSupplierSummary(); }, []);

  async function fetchSupplierSummary() {
    try {
      const { data } = await supabase
        .from('purchases')
        .select('supplier:suppliers(name), total_amount, paid_amount, remaining_amount');
      if (!data) return;
      const map = {};
      data.forEach(p => {
        const name = p.supplier?.name || 'Unknown';
        if (!map[name]) map[name] = { name, total: 0, paid: 0, pending: 0 };
        map[name].total += p.total_amount || 0;
        map[name].paid += p.paid_amount || 0;
        map[name].pending += p.remaining_amount || 0;
      });
      setSupplierSummary(Object.values(map).sort((a, b) => b.pending - a.pending));
    } catch (err) {
      console.error('Error fetching supplier summary:', err);
    }
  }

  async function fetchPayments() {
    try {
      const [purchaseRes, saleRes] = await Promise.all([
        supabase.from('purchase_payments').select('*, purchase:purchases(supplier_id, suppliers(name))').order('payment_date', { ascending: false }),
        supabase.from('sale_payments').select('*, sale:sales(customer_id, customers(name))').order('payment_date', { ascending: false }),
      ]);
      setPurchasePayments(purchaseRes.data || []);
      setSalePayments(saleRes.data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  }

  const filterByDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    switch (dateFilter) {
      case 'today': {
        const d = new Date(date); d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime();
      }
      case 'week': { const w = new Date(today); w.setDate(w.getDate() - 7); return date >= w; }
      case 'month': { const m = new Date(today); m.setMonth(m.getMonth() - 1); return date >= m; }
      case 'custom':
        if (customDateStart && date < new Date(customDateStart)) return false;
        if (customDateEnd && date > new Date(customDateEnd)) return false;
        return true;
      default: return true;
    }
  };

  const paymentsMade = purchasePayments
    .filter(p => filterByDate(p.payment_date))
    .map(p => ({
      id: p.id, type: 'paid', amount: p.amount, date: p.payment_date,
      method: p.payment_method, reference: p.reference_number,
      party: p.purchase?.suppliers?.name || 'Unknown', notes: p.notes,
    }));

  const paymentsReceived = salePayments
    .filter(p => filterByDate(p.payment_date))
    .map(p => ({
      id: p.id, type: 'received', amount: p.amount, date: p.payment_date,
      method: p.payment_method, reference: p.reference_number,
      party: p.sale?.customers?.name || 'Walk-in', notes: p.notes,
    }));

  const allPayments = [...paymentsMade, ...paymentsReceived]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter(p => {
      if (paymentTypeFilter !== 'all' && p.type !== paymentTypeFilter) return false;
      if (searchTerm) return p.party.toLowerCase().includes(searchTerm.toLowerCase());
      return true;
    });

  const totalPaid = paymentsMade.reduce((sum, p) => sum + p.amount, 0);
  const totalReceived = paymentsReceived.reduce((sum, p) => sum + p.amount, 0);
  const netFlow = totalReceived - totalPaid;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <p className="text-gray-500 mt-1">Track all payment transactions</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button onClick={() => setActiveTab('suppliers')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'suppliers' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Supplier Summary</button>
        <button onClick={() => setActiveTab('transactions')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'transactions' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Transactions</button>
      </div>

      {/* Supplier Summary Tab */}
      {activeTab === 'suppliers' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: '480px' }}>
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Total Purchased</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {supplierSummary.map(s => (
                  <tr key={s.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-warning-100 p-1.5 rounded-lg shrink-0"><ShoppingBag className="w-4 h-4 text-warning-600" /></div>
                        <span className="font-medium text-gray-900">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">₹{s.total.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-accent-600">₹{s.paid.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      <span className={s.pending > 0 ? 'font-semibold text-warning-600' : 'text-gray-400'}>₹{s.pending.toLocaleString('en-IN')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {supplierSummary.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">₹{supplierSummary.reduce((s, r) => s + r.total, 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-accent-600">₹{supplierSummary.reduce((s, r) => s + r.paid, 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-warning-600">₹{supplierSummary.reduce((s, r) => s + r.pending, 0).toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {supplierSummary.length === 0 && <p className="text-center py-10 text-gray-500 text-sm">No supplier data found</p>}
        </div>
      )}

      {/* Transactions Tab */}
      {activeTab === 'transactions' && <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Payments Made</p>
              <p className="text-2xl font-bold text-red-600 mt-1">₹{totalPaid.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-red-100 p-3 rounded-lg"><ArrowUpRight className="w-6 h-6 text-red-600" /></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Payments Received</p>
              <p className="text-2xl font-bold text-accent-600 mt-1">₹{totalReceived.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-accent-100 p-3 rounded-lg"><ArrowDownLeft className="w-6 h-6 text-accent-600" /></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Net Cash Flow</p>
              <p className={`text-2xl font-bold mt-1 ${netFlow >= 0 ? 'text-accent-600' : 'text-red-600'}`}>₹{netFlow.toLocaleString('en-IN')}</p>
            </div>
            <div className={`${netFlow >= 0 ? 'bg-accent-100' : 'bg-red-100'} p-3 rounded-lg`}>
              <Filter className={`w-6 h-6 ${netFlow >= 0 ? 'text-accent-600' : 'text-red-600'}`} />
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input type="text" placeholder="Search by party name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input pl-10" />
            </div>
            <select value={paymentTypeFilter} onChange={(e) => setPaymentTypeFilter(e.target.value)} className="input">
              <option value="all">All Payments</option>
              <option value="paid">Payments Made</option>
              <option value="received">Payments Received</option>
            </select>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="input">
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          {dateFilter === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={customDateStart} onChange={(e) => setCustomDateStart(e.target.value)} className="input" />
              <input type="date" value={customDateEnd} onChange={(e) => setCustomDateEnd(e.target.value)} className="input" />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {allPayments.map((payment) => (
          <div key={`${payment.type}-${payment.id}`} className={`card p-4 border-l-4 ${payment.type === 'received' ? 'border-l-accent-500' : 'border-l-red-500'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-lg ${payment.type === 'received' ? 'bg-accent-100' : 'bg-red-100'}`}>
                  {payment.type === 'received' ? <ArrowDownLeft className="w-5 h-5 text-accent-600" /> : <ArrowUpRight className="w-5 h-5 text-red-600" />}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{payment.party}</p>
                  <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(payment.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="badge bg-gray-200 text-gray-700 uppercase">{payment.method}</span>
                    {payment.reference && <span className="text-xs text-gray-400">Ref: {payment.reference}</span>}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${payment.type === 'received' ? 'text-accent-600' : 'text-red-600'}`}>
                  {payment.type === 'received' ? '+' : '-'}₹{payment.amount.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-gray-500 mt-1">{payment.type === 'received' ? 'Received' : 'Paid'}</p>
              </div>
            </div>
            {payment.notes && <p className="text-sm text-gray-500 mt-2 pl-12 italic">{payment.notes}</p>}
          </div>
        ))}
      </div>

      {allPayments.length === 0 && <div className="text-center py-12 text-gray-500">No payments found matching your filters</div>}
      </>}
    </div>
  );
}
