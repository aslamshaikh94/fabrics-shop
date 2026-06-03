'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Receipt, Users } from 'lucide-react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmt(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }
function fmtShort(n) {
  n = Number(n || 0);
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n}`;
}

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [topFabrics, setTopFabrics] = useState([]);
  const [summary, setSummary] = useState({ totalSales: 0, totalProfit: 0, netProfit: 0, totalPurchases: 0, totalReceivables: 0, totalExpenses: 0 });
  const [year, setYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState([new Date().getFullYear()]);
  const [chartView, setChartView] = useState('sales');

  useEffect(() => { fetchYears(); }, []);
  useEffect(() => { fetchAll(); }, [year]);

  async function fetchYears() {
    const { data } = await supabase.from('sales').select('sale_date').order('sale_date');
    if (data?.length) {
      const years = [...new Set(data.map(s => new Date(s.sale_date).getFullYear()))];
      const cur = new Date().getFullYear();
      if (!years.includes(cur)) years.push(cur);
      setAvailableYears(years.sort((a, b) => b - a));
    }
  }

  async function fetchAll() {
    setLoading(true);
    try {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const [salesRes, purchasesRes, expensesRes] = await Promise.all([
        supabase.from('sales').select('sale_date, total_amount, margin, remaining_amount, notes, customer:customers(name)').gte('sale_date', startDate).lte('sale_date', endDate),
        supabase.from('purchases').select('purchase_date, total_amount').gte('purchase_date', startDate).lte('purchase_date', endDate),
        supabase.from('expenses').select('amount').gte('expense_date', startDate).lte('expense_date', endDate),
      ]);

      const sales = salesRes.data || [];
      const purchases = purchasesRes.data || [];
      const totalExpenses = (expensesRes.data || []).reduce((s, r) => s + (r.amount || 0), 0);
      const totalMargin = sales.reduce((s, r) => s + (r.margin || 0), 0);

      const monthly = Array.from({ length: 12 }, (_, i) => ({ month: MONTHS[i], sales: 0, profit: 0, purchases: 0 }));
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

      setSummary({
        totalSales: sales.reduce((s, r) => s + (r.total_amount || 0), 0),
        totalProfit: totalMargin,
        netProfit: totalMargin - totalExpenses,
        totalPurchases: purchases.reduce((s, r) => s + (r.total_amount || 0), 0),
        totalReceivables: sales.reduce((s, r) => s + (r.remaining_amount || 0), 0),
        totalExpenses,
      });

      const custMap = {};
      sales.forEach(s => {
        const name = s.customer?.name || 'Walk-in';
        custMap[name] = (custMap[name] || 0) + (s.total_amount || 0);
      });
      setTopCustomers(Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, total]) => ({ name, total })));

      const fabricMap = {};
      sales.forEach(s => {
        const match = s.notes?.match(/Fabric:\s*([^|(\n]+)/);
        const name = match ? match[1].trim() : 'Unknown';
        fabricMap[name] = (fabricMap[name] || 0) + (s.total_amount || 0);
      });
      setTopFabrics(Object.entries(fabricMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, total]) => ({ name, total })));
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  }

  const cards = [
    { title: 'Total Sales', value: summary.totalSales, icon: TrendingUp, bg: 'bg-blue-50', iconBg: 'bg-blue-500', text: 'text-blue-700' },
    { title: 'Gross Profit', value: summary.totalProfit, icon: DollarSign, bg: 'bg-green-50', iconBg: 'bg-green-500', text: 'text-green-700' },
    { title: 'Total Expenses', value: summary.totalExpenses, icon: Receipt, bg: 'bg-red-50', iconBg: 'bg-red-500', text: 'text-red-600' },
    { title: 'Net Profit', value: summary.netProfit, icon: DollarSign, bg: summary.netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50', iconBg: summary.netProfit >= 0 ? 'bg-emerald-500' : 'bg-red-500', text: summary.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600' },
    { title: 'Total Purchases', value: summary.totalPurchases, icon: ShoppingBag, bg: 'bg-orange-50', iconBg: 'bg-orange-500', text: 'text-orange-700' },
    { title: 'Receivables', value: summary.totalReceivables, icon: Users, bg: 'bg-purple-50', iconBg: 'bg-purple-500', text: 'text-purple-700' },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-500 mt-0.5 text-sm">Business performance — {year}</p>
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input w-28">
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary Cards — 2 cols mobile, 3 cols sm, 6 cols lg */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.title} className={`rounded-xl p-3 ${card.bg} border border-gray-100`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500 leading-tight">{card.title}</p>
                <div className={`${card.iconBg} p-1.5 rounded-lg shrink-0`}>
                  <Icon className="w-3 h-3 text-white" />
                </div>
              </div>
              <p className={`text-base font-bold ${card.text}`}>{fmtShort(card.value)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{fmt(card.value)}</p>
            </div>
          );
        })}
      </div>

      {/* Combined Chart */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Monthly Overview</h2>
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
            {[['sales', 'Sales & Profit'], ['purchases', 'Purchases']].map(([v, l]) => (
              <button key={v} onClick={() => setChartView(v)}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${chartView === v ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          {chartView === 'sales' ? (
            <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={42} />
              <Tooltip formatter={v => fmt(v)} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="sales" name="Sales" fill="#2563eb" radius={[3,3,0,0]} />
              <Bar dataKey="profit" name="Profit" fill="#16a34a" radius={[3,3,0,0]} />
            </BarChart>
          ) : (
            <LineChart data={monthlyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={42} />
              <Tooltip formatter={v => fmt(v)} />
              <Line type="monotone" dataKey="purchases" name="Purchases" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Top Customers & Fabrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[
          { title: 'Top 5 Customers', data: topCustomers, color: 'bg-blue-500' },
          { title: 'Top 5 Fabrics by Sales', data: topFabrics, color: 'bg-accent-500' },
        ].map(({ title, data, color }) => (
          <div key={title} className="card p-4">
            <h2 className="font-semibold text-gray-900 mb-4">{title}</h2>
            {data.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">No data for {year}</p>
            ) : (
              <div className="space-y-3">
                {data.map((item, i) => {
                  const pct = Math.round((item.total / data[0].total) * 100);
                  return (
                    <div key={item.name}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`shrink-0 w-5 h-5 rounded-full ${color} text-white text-xs flex items-center justify-center font-bold`}>{i + 1}</span>
                          <span className="font-medium text-gray-800 truncate">{item.name}</span>
                        </div>
                        <span className="text-gray-600 shrink-0 ml-2">{fmtShort(item.total)}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
