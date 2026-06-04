'use client';

import { useState, useEffect } from 'react';
import {
  LayoutDashboard, ShoppingBag, Users, DollarSign, CreditCard,
  Menu, X, TrendingUp, BarChart2, Package, Receipt, Sun, Moon, LogOut, Zap,
} from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import { useAuth } from './AuthGuard';
import Dashboard from './Dashboard';
import Purchases from './Purchases';
import Sales from './Sales';
import Suppliers from './Suppliers';
import Customers from './Customers';
import Payments from './Payments';
import Reports from './Reports';
import Fabrics from './Fabrics';
import QuickSale from './QuickSale';
import Expenses from './Expenses';

const ALL_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'quicksale', label: 'Quick Sale', icon: Zap },
  { id: 'purchases', label: 'Purchases', icon: ShoppingBag, adminOnly: true },
  { id: 'sales', label: 'Sales', icon: TrendingUp },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'expenses', label: 'Expenses', icon: Receipt, adminOnly: true },
  { id: 'fabrics', label: 'Fabrics', icon: Package, adminOnly: true },
  { id: 'suppliers', label: 'Suppliers', icon: DollarSign, adminOnly: true },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'reports', label: 'Reports', icon: BarChart2 },
];

const BOTTOM_NAV = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'quicksale', label: 'Quick Sale', icon: Zap },
  { id: 'sales', label: 'Sales', icon: TrendingUp },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'reports', label: 'Reports', icon: BarChart2 },
];

const pages = {
  dashboard: <Dashboard />,
  quicksale: <QuickSale />,
  purchases: <Purchases />,
  sales: <Sales />,
  suppliers: <Suppliers />,
  customers: <Customers />,
  payments: <Payments />,
  reports: <Reports />,
  fabrics: <Fabrics />,
  expenses: <Expenses />,
};

export default function Shell() {
  const { isAdmin } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark';
    }
    return false;
  });

  const navItems = ALL_NAV.filter(item => !item.adminOnly || isAdmin);
  const bottomNavItems = BOTTOM_NAV.filter(item => !item.adminOnly || isAdmin);

  const allowedIds = navItems.map(n => n.id);
  const activePage = allowedIds.includes(currentPage) ? currentPage : 'dashboard';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  function navigate(id) {
    if (!allowedIds.includes(id)) return;
    setCurrentPage(id);
    setSidebarOpen(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile header */}
      <div className="lg:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Menu className="w-6 h-6 text-gray-600" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{ALL_NAV.find(n => n.id === activePage)?.label || 'CRMS'}</h1>
        <div className="w-10" />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-50 transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">CRMS</h1>
              <p className="text-xs text-gray-500 mt-1">Fabric Shop Manager</p>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>
        <nav className="px-3 pb-4 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 mb-1 ${activePage === item.id ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="px-3 pb-6 space-y-1">
          <button
            onClick={() => setDark(d => !d)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all"
          >
            {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span>{dark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button
            onClick={() => getSupabase().auth.signOut()}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64">
        <div className="p-4 pb-24 lg:pb-8 lg:p-8">
          {pages[activePage]}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-30 flex">
        {bottomNavItems.map(item => {
          const Icon = item.icon;
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                active ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-primary-600' : ''}`} />
              <span className="text-[10px] font-medium">{item.label}</span>
              {active && <span className="absolute bottom-0 w-8 h-0.5 bg-primary-600 rounded-t-full" />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
