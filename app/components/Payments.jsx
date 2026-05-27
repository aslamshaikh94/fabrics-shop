'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Calendar, Filter, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export default function Payments() {
  const [purchasePayments, setPurchasePayments] = useState([]);
  const [salePayments, setSalePayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');

  useEffect(() => { fetchPayments(); }, []);

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
    </div>
  );
}
