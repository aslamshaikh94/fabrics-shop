'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag } from 'lucide-react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [topFabrics, setTopFabrics] = useState([]);
  const [summary, setSummary] = useState({ totalSales: 0, totalProfit: 0, totalPurchases: 0, totalReceivables: 0 });
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => { fetchAll(); }, [year]);

  async function fetchAll() {
    setLoading(true);
    try {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const [salesRes, purchasesRes] = await Promise.all([
        supabase.from('sales').select('sale_date, total_amount, margin, remaining_amount, notes, customer:customers(name)').gte('sale_date', startDate).lte('sale_date', endDate),
        supabase.from('purchases').select('purchase_date, total_amount, remaining_amount').gte('purchase_date', startDate).lte('purchase_date', endDate),
      ]);

      const sales = salesRes.data || [];
      const purchases = purchasesRes.data || [];

      // Monthly aggregation
      const monthly = Array.from({ length: 12 }, (_, i) => ({
        month: MONTHS[i], sales: 0, profit: 0, purchases: 0,
      }));
      sales.forEach(s => {
        const m = new Date(s.sale_date).getMonth();
        monthly[m].sales += s.total_amount || 0;
        monthly[m].profit += s.margin || 0;
      });
      purchases.forEach(p => {
        const m = new Date(p.purchase_date).getMonth();
        monthly[m].purchases += p.total_amount || 0;
      });
      setMonthlyData(monthly);

      // Summary
      setSummary({
        totalSales: sales.reduce((s, r) => s + (r.total_amount || 0), 0),
        totalProfit: sales.reduce((s, r) => s + (r.margin || 0), 0),
        totalPurchases: purchases.reduce((s, r) => s + (r.total_amount || 0), 0),
        totalReceivables: sales.reduce((s, r) => s + (r.remaining_amount || 0), 0),
      });

      // Top customers
      const custMap = {};
      sales.forEach(s => {
        const name = s.customer?.name || 'Walk-in';
        custMap[name] = (custMap[name] || 0) + (s.total_amount || 0);
      });
      setTopCustomers(
        Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, total]) => ({ name, total }))
      );

      // Top fabrics from notes
      const fabricMap = {};
      sales.forEach(s => {
        const match = s.notes?.match(/Fabric:\s*([^|(\n]+)/);
        const name = match ? match[1].trim() : 'Unknown';
        fabricMap[name] = (fabricMap[name] || 0) + (s.total_amount || 0);
      });
      setTopFabrics(
        Object.entries(fabricMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, total]) => ({ name, total }))
      );
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  }

  const summaryCards = [
    { title: 'Total Sales', value: fmt(summary.totalSales), icon: TrendingUp, color: 'bg-primary-500' },
    { title: 'Total Profit', value: fmt(summary.totalProfit), icon: DollarSign, color: 'bg-accent-500' },
    { title: 'Total Purchases', value: fmt(summary.totalPurchases), icon: ShoppingBag, color: 'bg-warning-500' },
    { title: 'Receivables', value: fmt(summary.totalReceivables), icon: TrendingDown, color: 'bg-orange-500' },
  ];

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
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-500 mt-1">Business performance overview</p>
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input w-32">
          {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">{card.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{card.value}</p>
                </div>
                <div className={`${card.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Monthly Sales & Profit Chart */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Sales & Profit</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={45} />
            <Tooltip formatter={v => fmt(v)} />
            <Legend />
            <Bar dataKey="sales" name="Sales" fill="#2563eb" radius={[4,4,0,0]} />
            <Bar dataKey="profit" name="Profit" fill="#16a34a" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Purchases Trend */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Purchases Trend</h2>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={monthlyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={45} />
            <Tooltip formatter={v => fmt(v)} />
            <Line type="monotone" dataKey="purchases" name="Purchases" stroke="#d97706" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top Customers & Top Fabrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top 5 Customers</h2>
          {topCustomers.length === 0 ? (
            <p className="text-gray-500 text-sm">No data for this year</p>
          ) : (
            <div className="space-y-3">
              {topCustomers.map((c, i) => {
                const pct = Math.round((c.total / topCustomers[0].total) * 100);
                return (
                  <div key={c.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-800">#{i + 1} {c.name}</span>
                      <span className="text-gray-600">{fmt(c.total)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-primary-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top 5 Fabrics by Sales</h2>
          {topFabrics.length === 0 ? (
            <p className="text-gray-500 text-sm">No data for this year</p>
          ) : (
            <div className="space-y-3">
              {topFabrics.map((f, i) => {
                const pct = Math.round((f.total / topFabrics[0].total) * 100);
                return (
                  <div key={f.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-800">#{i + 1} {f.name}</span>
                      <span className="text-gray-600">{fmt(f.total)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-accent-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
