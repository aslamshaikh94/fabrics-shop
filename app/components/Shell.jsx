"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  DollarSign,
  CreditCard,
  Menu,
  X,
  TrendingUp,
  ChartBar as BarChart2,
  Package,
  Receipt,
  Sun,
  Moon,
  LogOut,
  Zap,
  ChevronRight,
} from "lucide-react";
import { getSupabase } from "../lib/supabase";
import { useAuth } from "./AuthGuard";

const ALL_NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "quicksale", label: "Quick Sale", icon: Zap },
  { id: "purchases", label: "Purchases", icon: ShoppingBag, adminOnly: true },
  { id: "sales", label: "Sales", icon: TrendingUp },
  { id: "payments", label: "Payments", icon: CreditCard },
  {
    id: "withdrawals",
    label: "Withdrawals",
    icon: DollarSign,
    adminOnly: true,
  },
  { id: "expenses", label: "Expenses", icon: Receipt, adminOnly: true },
  { id: "fabrics", label: "Fabrics", icon: Package, adminOnly: true },
  { id: "suppliers", label: "Suppliers", icon: DollarSign, adminOnly: true },
  { id: "customers", label: "Customers", icon: Users },
  { id: "reports", label: "Reports", icon: BarChart2 },
];

const BOTTOM_NAV = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard },
  { id: "quicksale", label: "Sale", icon: Zap },
  { id: "sales", label: "Sales", icon: TrendingUp },
  { id: "customers", label: "Customers", icon: Users },
  { id: "reports", label: "Reports", icon: BarChart2 },
];

export default function Shell({ children }) {
  const { isAdmin } = useAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const isDark = saved ? saved === "dark" : prefersDark;
    setDark(isDark);
  }, []);

  const navItems = ALL_NAV.filter((item) => !item.adminOnly || isAdmin);
  const bottomNavItems = BOTTOM_NAV.filter(
    (item) => !item.adminOnly || isAdmin,
  );

  const allowedIds = navItems.map((n) => n.id);
  const pathSegment = pathname.split("/")[1] || "";
  const activePage = allowedIds.includes(pathSegment)
    ? pathSegment
    : "dashboard";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const navSections = [
    {
      label: null,
      items: navItems.filter((n) => ["dashboard", "quicksale"].includes(n.id)),
    },
    {
      label: "Transactions",
      items: navItems.filter((n) =>
        ["sales", "purchases", "payments"].includes(n.id),
      ),
    },
    {
      label: "Management",
      items: navItems.filter((n) =>
        [
          "withdrawals",
          "fabrics",
          "suppliers",
          "customers",
          "expenses",
        ].includes(n.id),
      ),
    },
    { label: "Insights", items: navItems.filter((n) => n.id === "reports") },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile header */}
      <div className="lg:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-30 backdrop-blur-sm bg-white/90 dark:bg-gray-800/90">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-black">C</span>
          </div>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {ALL_NAV.find((n) => n.id === activePage)?.label || "CRMS"}
          </h1>
        </div>
        <div className="w-9" />
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-50 transform transition-transform duration-300 ease-out lg:translate-x-0 flex flex-col ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center shadow-sm shadow-primary-600/20">
              <span className="text-white text-sm font-black">C</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight">
                CRMS
              </h1>
              <p className="text-[10px] text-gray-400 leading-tight">
                Fabric Shop Manager
              </p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <nav className="flex-1 px-3 overflow-y-auto scrollbar-thin">
          {navSections.map((section, si) => {
            const filteredItems = section.items.filter((item) =>
              allowedIds.includes(item.id),
            );
            if (filteredItems.length === 0) return null;
            return (
              <div
                key={si}
                className={
                  si > 0
                    ? "mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50"
                    : ""
                }
              >
                {section.label && (
                  <p className="px-3 mb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                    {section.label}
                  </p>
                )}
                {filteredItems.map((item) => {
                  const Icon = item.icon;
                  const active = activePage === item.id;
                  return (
                    <Link
                      key={item.id}
                      href={`/${item.id}`}
                      onClick={() => setSidebarOpen(false)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 mb-0.5 text-sm group ${
                        active
                          ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-medium"
                          : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-200"
                      }`}
                    >
                      <Icon
                        className={`w-[18px] h-[18px] ${active ? "text-primary-600 dark:text-primary-400" : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"}`}
                      />
                      <span className="flex-1 text-left">{item.label}</span>
                      {active && (
                        <ChevronRight className="w-3.5 h-3.5 text-primary-400" />
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="px-3 pb-4 pt-2 border-t border-gray-100 dark:border-gray-700/50 space-y-0.5">
          <button
            onClick={() => setDark((d) => !d)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all text-sm"
          >
            {dark ? (
              <Sun className="w-[18px] h-[18px]" />
            ) : (
              <Moon className="w-[18px] h-[18px]" />
            )}
            <span>{dark ? "Light Mode" : "Dark Mode"}</span>
          </button>
          <button
            onClick={() => getSupabase().auth.signOut()}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-sm"
          >
            <LogOut className="w-[18px] h-[18px]" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64">
        <div className="p-4 pb-24 lg:pb-8 lg:p-8">
          <div key={activePage} className="animate-fade-in">
            {children}
          </div>
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 z-30 flex safe-bottom">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;
          return (
            <Link
              key={item.id}
              href={`/${item.id}`}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors relative ${
                active
                  ? "text-primary-600 dark:text-primary-400"
                  : "text-gray-400 dark:text-gray-500"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary-600 dark:bg-primary-400 rounded-b-full" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
