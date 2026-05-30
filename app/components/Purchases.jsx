'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, CreditCard, X, Search, Calendar, Eye, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { useToast } from './Toast';

const PAGE_SIZE = 10;

export default function Purchases() {
  const toast = useToast();
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [payments, setPayments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const emptyItem = { description: '', hsn: '520811', meters: '', rate: '' };
  const [formData, setFormData] = useState({
    supplier_id: '',
    purchase_date: new Date().toISOString().split('T')[0], notes: '',
  });
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [paymentData, setPaymentData] = useState({
    amount: '', payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash', reference_number: '', notes: '',
  });

  useEffect(() => { fetchPurchases(); fetchSuppliers(); }, []);

  async function fetchPurchases() {
    try {
      const { data, error } = await supabase.from('purchases').select('*, supplier:suppliers(*)').order('purchase_date', { ascending: false });
      if (error) throw error;
      setPurchases(data || []);
    } catch (error) {
      console.error('Error fetching purchases:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSuppliers() {
    try {
      const { data } = await supabase.from('suppliers').select('*').order('name');
      setSuppliers(data || []);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  }

  function itemAmount(item) {
    return (parseFloat(item.meters) || 0) * (parseFloat(item.rate) || 0);
  }
  function subtotal() { return items.reduce((s, i) => s + itemAmount(i), 0); }
  function gstAmount() { return subtotal() * 0.05; }
  function grandTotal() { return subtotal() + gstAmount(); }

  function updateItem(idx, field, value) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const { data: purchase, error } = await supabase
        .from('purchases')
        .insert([{ supplier_id: formData.supplier_id, total_amount: grandTotal(), purchase_date: formData.purchase_date, notes: formData.notes, status: 'pending' }])
        .select('id')
        .single();
      if (error) throw error;
      const itemRows = items.filter(i => i.description && parseFloat(i.meters) > 0).map(i => ({
        purchase_id: purchase.id, description: i.description, hsn: i.hsn,
        meters: parseFloat(i.meters), rate: parseFloat(i.rate),
      }));
      if (itemRows.length) await supabase.from('purchase_items').insert(itemRows);
      setShowForm(false);
      setFormData({ supplier_id: '', purchase_date: new Date().toISOString().split('T')[0], notes: '' });
      setItems([{ ...emptyItem }]);
      fetchPurchases();
      toast('Purchase added successfully');
    } catch (error) {
      console.error('Error saving purchase:', error);
      toast('Failed to save purchase', 'error');
    }
  }

  async function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!selectedPurchase) return;
    try {
      const { error } = await supabase.from('purchase_payments').insert([{
        purchase_id: selectedPurchase.id,
        amount: parseFloat(paymentData.amount),
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        reference_number: paymentData.reference_number,
        notes: paymentData.notes,
      }]);
      if (error) throw error;
      setShowPaymentForm(false);
      setPaymentData({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'cash', reference_number: '', notes: '' });
      fetchPurchases();
      fetchPayments(selectedPurchase.id);
      toast('Payment added');
    } catch (error) {
      console.error('Error saving payment:', error);
      toast('Failed to save payment', 'error');
    }
  }

  async function fetchPayments(purchaseId) {
    try {
      const { data } = await supabase.from('purchase_payments').select('*').eq('purchase_id', purchaseId).order('payment_date', { ascending: false });
      setPayments(data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
    }
  }

  function handleViewPayments(purchase) {
    setSelectedPurchase(purchase);
    fetchPayments(purchase.id);
  }

  function handleAddPayment(purchase) {
    setSelectedPurchase(purchase);
    setShowPaymentForm(true);
  }

  async function handleDelete(id) {
    try {
      const { error } = await supabase.from('purchases').delete().eq('id', id);
      if (error) throw error;
      toast('Purchase deleted');
      fetchPurchases();
    } catch (err) {
      console.error('Error deleting purchase:', err);
      toast('Failed to delete purchase', 'error');
    } finally {
      setConfirmDelete(null);
    }
  }

  const filteredPurchases = purchases.filter(p => {
    const matchesSearch = p.supplier?.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchesFrom = !dateFrom || p.purchase_date >= dateFrom;
    const matchesTo = !dateTo || p.purchase_date <= dateTo;
    return matchesSearch && matchesStatus && matchesFrom && matchesTo;
  });

  const totalPages = Math.ceil(filteredPurchases.length / PAGE_SIZE);
  const paginated = filteredPurchases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusBadge = (status) => {
    const styles = { pending: 'badge-pending', partial: 'badge-warning', paid: 'badge-success' };
    const labels = { pending: 'Pending', partial: 'Partial', paid: 'Paid' };
    return <span className={`badge ${styles[status]}`}>{labels[status]}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
          <p className="text-gray-500 mt-1">Track purchases and payments to suppliers</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          <Plus className="w-5 h-5 mr-2" />New Purchase
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Search by supplier or fabric..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input pl-10" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input w-full sm:w-40">
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input w-full sm:w-36" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input w-full sm:w-36" />
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-3xl p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">New Purchase</h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
                  <select required value={formData.supplier_id} onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })} className="input">
                    <option value="">Select supplier</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                  <input type="date" value={formData.purchase_date} onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })} className="input" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Items</label>
                  <button type="button" onClick={() => setItems(prev => [...prev, { ...emptyItem }])} className="text-xs text-primary-600 hover:underline">+ Add row</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: '520px' }}>
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <th className="px-2 py-1 text-left">Description</th>
                        <th className="px-2 py-1 text-left w-24">HSN</th>
                        <th className="px-2 py-1 text-right w-20">Meters</th>
                        <th className="px-2 py-1 text-right w-24">Rate (₹)</th>
                        <th className="px-2 py-1 text-right w-24">Amount</th>
                        <th className="w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-1 py-1"><input className="input py-1 text-sm" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Fabric name" /></td>
                          <td className="px-1 py-1"><input className="input py-1 text-sm" value={item.hsn} onChange={e => updateItem(idx, 'hsn', e.target.value)} /></td>
                          <td className="px-1 py-1"><input type="number" step="0.01" className="input py-1 text-sm text-right" value={item.meters} onChange={e => updateItem(idx, 'meters', e.target.value)} placeholder="0" /></td>
                          <td className="px-1 py-1"><input type="number" step="0.01" className="input py-1 text-sm text-right" value={item.rate} onChange={e => updateItem(idx, 'rate', e.target.value)} placeholder="0" /></td>
                          <td className="px-2 py-1 text-right font-medium">₹{itemAmount(item).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="px-1 py-1">
                            {items.length > 1 && <button type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-sm text-right space-y-0.5 text-gray-600">
                  <p>Subtotal: <span className="font-medium">₹{subtotal().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></p>
                  <p>IGST @5%: <span className="font-medium">₹{gstAmount().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></p>
                  <p className="text-base font-semibold text-gray-900">Total: ₹{grandTotal().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input" rows={2} placeholder="Invoice no., remarks..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn btn-primary flex-1">Add Purchase</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPaymentForm && selectedPurchase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Add Payment</h2>
              <button onClick={() => setShowPaymentForm(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-600">Supplier: <span className="font-medium">{selectedPurchase.supplier?.name}</span></p>
              <p className="text-sm text-gray-600">Remaining: <span className="font-semibold text-warning-600">₹{selectedPurchase.remaining_amount.toLocaleString('en-IN')}</span></p>
            </div>
            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <input type="number" step="0.01" required max={selectedPurchase.remaining_amount} value={paymentData.amount} onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })} className="input" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                <input type="date" value={paymentData.payment_date} onChange={(e) => setPaymentData({ ...paymentData, payment_date: e.target.value })} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select value={paymentData.payment_method} onChange={(e) => setPaymentData({ ...paymentData, payment_method: e.target.value })} className="input">
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="check">Check</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                <input type="text" value={paymentData.reference_number} onChange={(e) => setPaymentData({ ...paymentData, reference_number: e.target.value })} className="input" placeholder="Transaction ID / Check No." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={paymentData.notes} onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })} className="input" rows={2} />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowPaymentForm(false)} className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn btn-accent flex-1">Add Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedPurchase && !showPaymentForm && payments.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Payment History</h2>
              <button onClick={() => { setSelectedPurchase(null); setPayments([]); }} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm">Supplier: <span className="font-medium">{selectedPurchase.supplier?.name}</span></p>
              <p className="text-sm text-gray-600 mt-1">{selectedPurchase.notes}</p>
              <div className="flex justify-between mt-2 pt-2 border-t border-gray-200">
                <span className="text-sm">Total: <span className="font-semibold">₹{selectedPurchase.total_amount.toLocaleString('en-IN')}</span></span>
                <span className="text-sm">Remaining: <span className="font-semibold text-warning-600">₹{selectedPurchase.remaining_amount.toLocaleString('en-IN')}</span></span>
              </div>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {payments.map((payment) => (
                <div key={payment.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900">₹{payment.amount.toLocaleString('en-IN')}</p>
                      <p className="text-sm text-gray-500">{new Date(payment.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <div className="text-right">
                      <span className="badge bg-gray-200 text-gray-700">{payment.payment_method.toUpperCase()}</span>
                      {payment.reference_number && <p className="text-xs text-gray-500 mt-1">{payment.reference_number}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {selectedPurchase.remaining_amount > 0 && (
              <button onClick={() => setShowPaymentForm(true)} className="btn btn-accent w-full mt-4">
                <CreditCard className="w-5 h-5 mr-2" />Add Payment
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: '600px' }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier / Fabric</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Remaining</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((purchase) => (
                <tr key={purchase.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{purchase.supplier?.name}</p>
                    {purchase.notes && <p className="text-sm text-gray-500 max-w-xs truncate">{purchase.notes}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-gray-600 text-sm">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {new Date(purchase.purchase_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 text-sm">₹{purchase.total_amount.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-right text-gray-600 text-sm">₹{purchase.paid_amount.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span className={purchase.remaining_amount > 0 ? 'text-warning-600 font-semibold' : 'text-gray-500'}>
                      ₹{purchase.remaining_amount.toLocaleString('en-IN')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">{statusBadge(purchase.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleViewPayments(purchase)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700" title="View payments"><Eye className="w-4 h-4" /></button>
                      {purchase.remaining_amount > 0 && (
                        <button onClick={() => handleAddPayment(purchase)} className="p-1.5 hover:bg-accent-50 rounded-lg text-gray-500 hover:text-accent-600" title="Add payment"><CreditCard className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => setConfirmDelete(purchase.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600" title="Delete purchase"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-gray-500">{filteredPurchases.length} records — page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          message="This will permanently delete the purchase and all its payments."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {filteredPurchases.length === 0 && <div className="text-center py-12 text-gray-500">No purchases found</div>}
    </div>
  );
}
