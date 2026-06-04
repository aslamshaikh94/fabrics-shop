'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Pencil, Trash2, X, Search, Package, AlertTriangle, ScanLine } from 'lucide-react';
import BarcodeScanner from './BarcodeScanner';
import ConfirmModal from './ConfirmModal';
import { useToast } from './Toast';

const emptyRow = { name: '', type: '', color: '', total_meters: '', purchase_price_per_meter: '', selling_price_per_meter: '', barcode: '' };
const emptyForm = { supplier_id: '', notes: '' };

export default function Fabrics() {
  const [fabrics, setFabrics] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const toast = useToast();
  const [formData, setFormData] = useState(emptyForm);
  const [rows, setRows] = useState([{ ...emptyRow }]);
  const [scanningRowIdx, setScanningRowIdx] = useState(null);

  useEffect(() => { fetchFabrics(); fetchSuppliers(); }, []);

  async function fetchFabrics() {
    try {
      const { data, error } = await supabase.from('fabrics').select('*, supplier:suppliers(*)').order('created_at', { ascending: false });
      if (error) throw error;
      setFabrics(data || []);
    } catch (err) {
      console.error('Error fetching fabrics:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSuppliers() {
    try {
      const { data } = await supabase.from('suppliers').select('*').order('name');
      setSuppliers(data || []);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
    }
  }

  function updateRow(idx, field, value) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingId) {
        const r = rows[0];
        const existing = fabrics.find(f => f.id === editingId);
        const oldTotal = existing?.total_meters || 0;
        const newTotal = parseFloat(r.total_meters) || 0;
        const diff = newTotal - oldTotal;
        const newAvailable = Math.max(0, (existing?.available_meters || 0) + diff);
        const payload = {
          name: r.name, type: r.type, color: r.color,
          purchase_price_per_meter: parseFloat(r.purchase_price_per_meter) || 0,
          selling_price_per_meter: parseFloat(r.selling_price_per_meter) || 0,
          total_meters: newTotal,
          available_meters: newAvailable,
          supplier_id: formData.supplier_id || null,
          notes: formData.notes,
          barcode: r.barcode || '',
        };
        const { error } = await supabase.from('fabrics').update(payload).eq('id', editingId);
        if (error) throw error;
        toast('Fabric updated');
      } else {
        const validRows = rows.filter(r => r.name.trim());
        const payloads = validRows.map(r => ({
          name: r.name, type: r.type, color: r.color,
          purchase_price_per_meter: parseFloat(r.purchase_price_per_meter) || 0,
          selling_price_per_meter: parseFloat(r.selling_price_per_meter) || 0,
          total_meters: parseFloat(r.total_meters) || 0,
          available_meters: parseFloat(r.total_meters) || 0,
          supplier_id: formData.supplier_id || null,
          notes: formData.notes,
          barcode: r.barcode || '',
        }));
        const { error } = await supabase.from('fabrics').insert(payloads);
        if (error) throw error;
        toast(`${payloads.length} fabric${payloads.length > 1 ? 's' : ''} added`);
      }
      setShowForm(false);
      setEditingId(null);
      setFormData(emptyForm);
      setRows([{ ...emptyRow }]);
      fetchFabrics();
    } catch (err) {
      console.error('Error saving fabric:', err);
      toast('Failed to save fabric', 'error');
    }
  }

  async function handleDelete(id) {
    try {
      const { error } = await supabase.from('fabrics').delete().eq('id', id);
      if (error) throw error;
      toast('Fabric deleted');
      fetchFabrics();
    } catch (err) {
      console.error('Error deleting fabric:', err);
      toast('Cannot delete fabric with associated sales', 'error');
    } finally {
      setConfirmDelete(null);
    }
  }

  function handleEdit(fabric) {
    setFormData({ supplier_id: fabric.supplier_id || '', notes: fabric.notes });
    setRows([{
      name: fabric.name, type: fabric.type, color: fabric.color,
      purchase_price_per_meter: fabric.purchase_price_per_meter.toString(),
      selling_price_per_meter: fabric.selling_price_per_meter.toString(),
      total_meters: fabric.total_meters.toString(),
      barcode: fabric.barcode || '',
    }]);
    setEditingId(fabric.id);
    setShowForm(true);
  }

  const filtered = fabrics.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.color.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStock = fabrics.filter(f => f.available_meters < 10);

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
          <h1 className="text-2xl font-bold text-gray-900">Fabrics</h1>
          <p className="text-gray-500 mt-1">Manage your fabric inventory</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setFormData(emptyForm); setRows([{ ...emptyRow }]); }} className="btn btn-primary">
          <Plus className="w-5 h-5 mr-2" />Add Fabric
        </button>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-warning-50 border border-warning-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning-600 mt-0.5" />
            <div>
              <p className="font-medium text-warning-800">Low Stock Alert</p>
              <p className="text-sm text-warning-700 mt-1">
                {lowStock.map(f => `${f.name} (${f.available_meters}m)`).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input type="text" placeholder="Search fabrics..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input pl-10" />
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg p-4 sm:p-6 m-4 sm:my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{editingId ? 'Edit Fabric' : 'Add Fabrics'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                  <select value={formData.supplier_id} onChange={e => setFormData({ ...formData, supplier_id: e.target.value })} className="input">
                    <option value="">Select supplier</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <input type="text" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="input" placeholder="Optional" />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Fabric Items</label>
                  {!editingId && (
                    <button type="button" onClick={() => setRows(prev => [...prev, { ...emptyRow }])} className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
                      <Plus className="w-3.5 h-3.5" /> Add row
                    </button>
                  )}
                </div>

                {rows.map((row, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Item {idx + 1}</span>
                      {rows.length > 1 && (
                        <button type="button" onClick={() => setRows(prev => prev.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500 p-1">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                      <input required className="input bg-white" value={row.name} onChange={e => updateRow(idx, 'name', e.target.value)} placeholder="Fabric name" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                        <input className="input bg-white" value={row.type} onChange={e => updateRow(idx, 'type', e.target.value)} placeholder="Cotton, Silk..." />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
                        <input className="input bg-white" value={row.color} onChange={e => updateRow(idx, 'color', e.target.value)} placeholder="Blue, Red..." />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Meters</label>
                        <input type="number" step="0.01" className="input bg-white" value={row.total_meters} onChange={e => updateRow(idx, 'total_meters', e.target.value)} placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Buy ₹/m</label>
                        <input type="number" step="0.01" className="input bg-white" value={row.purchase_price_per_meter} onChange={e => updateRow(idx, 'purchase_price_per_meter', e.target.value)} placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Sell ₹/m</label>
                        <input type="number" step="0.01" className="input bg-white" value={row.selling_price_per_meter} onChange={e => updateRow(idx, 'selling_price_per_meter', e.target.value)} placeholder="0" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Barcode</label>
                      <div className="flex gap-2">
                        <input className="input bg-white flex-1" value={row.barcode} onChange={e => updateRow(idx, 'barcode', e.target.value)} placeholder="Scan or type barcode" />
                        <button type="button" onClick={() => setScanningRowIdx(idx)} className="px-3 bg-white border border-gray-300 hover:bg-primary-50 hover:border-primary-400 rounded-lg text-gray-500 hover:text-primary-600 transition-colors">
                          <ScanLine className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn btn-primary flex-1">{editingId ? 'Update' : 'Add'} Fabric</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {scanningRowIdx !== null && (
        <BarcodeScanner
          onScan={(code) => { updateRow(scanningRowIdx, 'barcode', code); setScanningRowIdx(null); }}
          onClose={() => setScanningRowIdx(null)}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(fabric => (
          <div key={fabric.id} className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="bg-primary-100 p-2 rounded-lg">
                  <Package className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{fabric.name}</h3>
                  {fabric.type && <p className="text-sm text-gray-500">{fabric.type}</p>}
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleEdit(fabric)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => setConfirmDelete(fabric.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>

            {fabric.color && <p className="text-sm text-gray-600 mb-3"><span className="font-medium">Color:</span> {fabric.color}</p>}

            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-gray-500">Available</p>
                <p className={`font-semibold ${fabric.available_meters < 10 ? 'text-red-600' : 'text-gray-900'}`}>
                  {fabric.available_meters}m
                  {fabric.available_meters < 10 && <span className="ml-1 text-xs">⚠️</span>}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-gray-500">Total</p>
                <p className="font-semibold text-gray-900">{fabric.total_meters}m</p>
              </div>
            </div>

            <div className="flex justify-between text-sm border-t border-gray-100 pt-3">
              <div>
                <p className="text-gray-500">Buy</p>
                <p className="font-semibold text-gray-900">₹{fabric.purchase_price_per_meter}/m</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500">Margin</p>
                {fabric.purchase_price_per_meter > 0 ? (
                  <p className={`font-semibold text-sm ${ ((fabric.selling_price_per_meter - fabric.purchase_price_per_meter) / fabric.purchase_price_per_meter * 100) >= 0 ? 'text-accent-600' : 'text-red-500'}`}>
                    {((fabric.selling_price_per_meter - fabric.purchase_price_per_meter) / fabric.purchase_price_per_meter * 100).toFixed(0)}%
                  </p>
                ) : <p className="text-gray-400 text-sm">—</p>}
                <p className="text-xs text-gray-400">₹{(fabric.selling_price_per_meter - fabric.purchase_price_per_meter).toFixed(0)}/m</p>
              </div>
              <div className="text-right">
                <p className="text-gray-500">Sell</p>
                <p className="font-semibold text-accent-600">₹{fabric.selling_price_per_meter}/m</p>
              </div>
            </div>

            {fabric.supplier && <p className="text-xs text-gray-500 mt-2">Supplier: {fabric.supplier.name}</p>}
          </div>
        ))}
      </div>

      {confirmDelete && (
        <ConfirmModal
          message="This will permanently delete the fabric."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {searchTerm ? 'No fabrics found matching your search' : 'No fabrics added yet'}
        </div>
      )}
    </div>
  );
}
