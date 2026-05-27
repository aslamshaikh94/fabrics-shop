'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, Package, DollarSign, Users, AlertCircle, AlertTriangle } from 'lucide-react';

function pctChange(curr, prev) {
  if (!prev) return null;
  const diff = ((curr - prev) / prev) * 100;
  return { value: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`, type: diff >= 0 ? 'increase' : 'decrease' };
}

export default function Dashboard() {
  const [stats, setStats] = useState({ totalSales: 0, totalMargin: 0, pendingPurchasePayments: 0, pendingSalePayments: 0, totalFabrics: 0, totalCustomers: 0 });
  const [changes, setChanges] = useState({});
  const [lowStock, setLowStock] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, []);

  async function fetchStats() {
    try {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

      const [salesRes, purchasesRes, fabricsRes, customersRes, thisMoSales, prevMoSales, lowStockRes, recentRes] = await Promise.all([
        supabase.from('sales').select('total_amount, margin, remaining_amount'),
        supabase.from('purchases').select('total_amount, remaining_amount'),
        supabase.from('fabrics').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('sales').select('total_amount, margin').gte('sale_date', `${thisMonth}-01`),
        supabase.from('sales').select('total_amount, margin').gte('sale_date', `${prevMonth}-01`).lt('sale_date', `${thisMonth}-01`),
        supabase.from('fabrics').select('name, available_meters').lt('available_meters', 10),
        supabase.from('sales').select('sale_date, total_amount, notes, customer:customers(name)').order('sale_date', { ascending: false }).limit(5),
      ]);

      const currSales = thisMoSales.data?.reduce((s, r) => s + (r.total_amount || 0), 0) || 0;
      const prevSales = prevMoSales.data?.reduce((s, r) => s + (r.total_amount || 0), 0) || 0;
      const currProfit = thisMoSales.data?.reduce((s, r) => s + (r.margin || 0), 0) || 0;
      const prevProfit = prevMoSales.data?.reduce((s, r) => s + (r.margin || 0), 0) || 0;

      setStats({
        totalSales: salesRes.data?.reduce((s, r) => s + (r.total_amount || 0), 0) || 0,
        totalMargin: salesRes.data?.reduce((s, r) => s + (r.margin || 0), 0) || 0,
        pendingSalePayments: salesRes.data?.reduce((s, r) => s + (r.remaining_amount || 0), 0) || 0,
        pendingPurchasePayments: purchasesRes.data?.reduce((s, r) => s + (r.remaining_amount || 0), 0) || 0,
        totalFabrics: fabricsRes.count || 0,
        totalCustomers: customersRes.count || 0,
      });
      setChanges({ sales: pctChange(currSales, prevSales), profit: pctChange(currProfit, prevProfit) });
      setLowStock(lowStockRes.data || []);
      setRecentSales(recentRes.data || []);
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const cards = [
    { title: 'Total Sales', value: `₹${stats.totalSales.toLocaleString('en-IN')}`, change: changes.sales, icon: TrendingUp, color: 'bg-primary-500' },
    { title: 'Total Profit', value: `₹${stats.totalMargin.toLocaleString('en-IN')}`, change: changes.profit, icon: DollarSign, color: 'bg-accent-500' },
    { title: 'Pay to Suppliers', value: `₹${stats.pendingPurchasePayments.toLocaleString('en-IN')}`, subtitle: 'Pending payments', icon: AlertCircle, color: 'bg-warning-500' },
    { title: 'Receivables', value: `₹${stats.pendingSalePayments.toLocaleString('en-IN')}`, subtitle: 'Customer dues', icon: TrendingDown, color: 'bg-orange-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your CRMS</p>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-warning-50 border border-warning-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning-600 mt-0.5" />
            <div>
              <p className="font-medium text-warning-800">Low Stock Alert</p>
              <p className="text-sm text-warning-700 mt-1">{lowStock.map(f => `${f.name} (${f.available_meters}m)`).join(', ')}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">{card.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{card.value}</p>
                  {card.change && (
                    <p className={`text-sm mt-2 flex items-center gap-1 ${card.change.type === 'increase' ? 'text-accent-600' : 'text-red-600'}`}>
                      {card.change.type === 'increase' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {card.change.value} vs last month
                    </p>
                  )}
                  {card.subtitle && <p className="text-sm text-gray-500 mt-1">{card.subtitle}</p>}
                </div>
                <div className={`${card.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="bg-primary-100 p-4 rounded-xl"><Package className="w-8 h-8 text-primary-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Total Fabrics</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalFabrics}</p>
              <p className="text-sm text-gray-500 mt-1">Different varieties</p>
            </div>
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="bg-accent-100 p-4 rounded-xl"><Users className="w-8 h-8 text-accent-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Total Customers</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalCustomers}</p>
              <p className="text-sm text-gray-500 mt-1">Registered buyers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Sales */}
      <div className="card">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Recent Sales</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {recentSales.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">No sales yet</p>
          ) : recentSales.map(sale => (
            <div key={sale.id} className="px-6 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 text-sm">{sale.customer?.name || 'Walk-in'}</p>
                <p className="text-xs text-gray-500">{sale.notes?.split('|')[0]?.replace('Fabric:', '').trim()}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900 text-sm">₹{sale.total_amount.toLocaleString('en-IN')}</p>
                <p className="text-xs text-gray-500">{new Date(sale.sale_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
