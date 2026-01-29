"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLeads, type Lead, type Provider } from "@/lib/leads-context";

type Tab = "dashboard" | "leads" | "providers" | "ledger" | "settings";

export default function BusinessPortal() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const { leads, providers, updateProvider, addProvider } = useLeads();

  // Check for existing session
  useEffect(() => {
    const session = localStorage.getItem("leadzpay_business_session");
    if (session === "authenticated") {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = () => {
    if (accessCode === "leadzpay2025" || accessCode === "business123") {
      setIsAuthenticated(true);
      localStorage.setItem("leadzpay_business_session", "authenticated");
      setError("");
    } else {
      setError("Invalid access code. Please try again.");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem("leadzpay_business_session");
    setAccessCode("");
  };

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background circuit lines */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-10 w-px h-32 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
          <div className="absolute top-40 right-20 w-px h-48 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
          <div className="absolute bottom-32 left-1/4 w-24 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
        </div>

        <div className="bg-[#0d2240] p-8 rounded-2xl border border-cyan-500/20 max-w-md w-full shadow-[0_0_30px_rgba(34,211,238,0.1)] relative z-10">
          <div className="text-center mb-8">
            <div className="h-16 w-16 rounded-2xl bg-cyan-500/20 flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(34,211,238,0.3)]">
              <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Business Portal</h1>
            <p className="text-slate-400">Enter your access code to continue</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">Access Code</label>
              <input
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="Enter your business access code"
                className="w-full px-4 py-3 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
              />
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] py-3 rounded-lg font-semibold transition shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)]"
            >
              Sign In
            </button>

            <Link href="/" className="block text-center text-slate-400 hover:text-cyan-400 text-sm transition">
              Back to Home
            </Link>
          </div>

          <div className="mt-8 pt-6 border-t border-cyan-500/20">
            <p className="text-slate-500 text-xs text-center">
              Demo access code: <span className="text-cyan-400">leadzpay2025</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate stats
  const totalLeads = leads.length;
  const claimedLeads = leads.filter(l => l.status === "claimed").length;
  const totalPayouts = leads.reduce((sum, l) => sum + (l.payout || 0), 0);
  const totalPoliciesSold = leads.filter(l => l.status === "claimed").length;
  const avgLeadValue = totalLeads > 0 ? totalPayouts / totalLeads : 0;

  // Get leads by provider for chart
  const leadsByProvider = providers.map(p => ({
    ...p,
    leadCount: leads.filter(l => l.providerId === p.id).length,
    totalPayout: leads.filter(l => l.providerId === p.id).reduce((sum, l) => sum + (l.payout || 0), 0),
  }));

  // Get leads by day for chart (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });

  const leadsByDay = last7Days.map(day => ({
    day: new Date(day).toLocaleDateString('en-US', { weekday: 'short' }),
    count: leads.filter(l => l.createdAt.split('T')[0] === day).length,
  }));

  return (
    <div className="min-h-screen bg-[#0a1628] relative">
      {/* Background circuit lines */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-20 left-10 w-px h-32 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        <div className="absolute top-40 right-20 w-px h-48 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        <div className="absolute bottom-32 left-1/4 w-24 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
        <div className="absolute top-1/2 right-1/3 w-32 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
      </div>

      {/* Header */}
      <header className="bg-[#0d2240]/80 border-b border-cyan-500/20 px-8 py-4 backdrop-blur-sm relative z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                <svg viewBox="0 0 40 40" className="w-6 h-6">
                  <defs>
                    <linearGradient id="logoGradBiz" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="100%" stopColor="#e0f7fa" />
                    </linearGradient>
                  </defs>
                  <path d="M8 8 L8 28 L18 28" fill="none" stroke="url(#logoGradBiz)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M22 8 L16 20 L22 20 L18 32" fill="none" stroke="url(#logoGradBiz)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M26 28 L26 8 L32 8 Q36 8 36 14 Q36 20 32 20 L26 20" fill="none" stroke="url(#logoGradBiz)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-white">LeadzPay</span>
            </Link>
            <span className="text-cyan-500/50">|</span>
            <span className="text-cyan-400 font-medium">Business Portal</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-cyan-400 transition flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-8 py-8 relative z-10">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto">
          {(["dashboard", "leads", "providers", "ledger", "settings"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-lg font-medium transition whitespace-nowrap ${
                activeTab === tab
                  ? "bg-cyan-500 text-[#0a1628] shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                  : "bg-[#0d2240] text-slate-400 hover:text-cyan-400 hover:bg-[#0d2240]/80 border border-cyan-500/20"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Total Leads" value={totalLeads.toString()} color="cyan" />
              <StatCard title="Policies Sold" value={claimedLeads.toString()} color="emerald" />
              <StatCard title="Total Payouts" value={`$${totalPayouts.toLocaleString()}`} color="blue" />
              <StatCard title="Avg Lead Value" value={`$${avgLeadValue.toFixed(0)}`} color="amber" />
            </div>

            {/* Charts Row */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Leads by Day Chart */}
              <div className="bg-[#0d2240] rounded-xl border border-cyan-500/20 p-6 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
                <h3 className="text-lg font-semibold text-white mb-4">Leads This Week</h3>
                <div className="flex items-end justify-between h-48 gap-2">
                  {leadsByDay.map((day, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div className="flex-1 w-full flex items-end">
                        <div
                          className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 rounded-t-lg transition-all shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                          style={{ height: `${Math.max(day.count * 20, 8)}%` }}
                        />
                      </div>
                      <span className="text-slate-400 text-xs mt-2">{day.day}</span>
                      <span className="text-white text-sm font-medium">{day.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Providers Chart */}
              <div className="bg-[#0d2240] rounded-xl border border-cyan-500/20 p-6 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
                <h3 className="text-lg font-semibold text-white mb-4">Top Providers</h3>
                <div className="space-y-4">
                  {leadsByProvider.slice(0, 5).map((provider, i) => (
                    <div key={provider.id} className="flex items-center gap-4">
                      <span className="text-cyan-400/50 w-6">{i + 1}.</span>
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="text-white font-medium">{provider.name}</span>
                          <span className="text-slate-400">{provider.leadCount} leads</span>
                        </div>
                        <div className="h-2 bg-[#0a1628] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                            style={{ width: `${(provider.leadCount / Math.max(...leadsByProvider.map(p => p.leadCount), 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {leadsByProvider.length === 0 && (
                    <p className="text-slate-500 text-center py-8">No providers yet</p>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Leads */}
            <div className="bg-[#0d2240] rounded-xl border border-cyan-500/20 p-6 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
              <h3 className="text-lg font-semibold text-white mb-4">Recent Leads</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-cyan-500/20">
                      <th className="pb-3 font-medium">Customer</th>
                      <th className="pb-3 font-medium">Vehicle</th>
                      <th className="pb-3 font-medium">Provider</th>
                      <th className="pb-3 font-medium">Quote</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.slice(0, 5).map((lead) => (
                      <LeadRow key={lead.id} lead={lead} />
                    ))}
                    {leads.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center text-slate-500 py-8">
                          No leads yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Leads Tab */}
        {activeTab === "leads" && (
          <div className="bg-[#0d2240] rounded-xl border border-cyan-500/20 p-6 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">All Leads ({leads.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-cyan-500/20">
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Contact</th>
                    <th className="pb-3 font-medium">Vehicle</th>
                    <th className="pb-3 font-medium">Provider</th>
                    <th className="pb-3 font-medium">Quote</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-cyan-500/10">
                      <td className="py-4 text-slate-400 text-sm">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-4 text-white font-medium">{lead.customerName}</td>
                      <td className="py-4 text-slate-400 text-sm">
                        <div>{lead.email}</div>
                        <div>{lead.phone}</div>
                      </td>
                      <td className="py-4 text-slate-300">{lead.carModel}</td>
                      <td className="py-4 text-slate-300">{lead.providerName}</td>
                      <td className="py-4 text-cyan-400">
                        {lead.quote ? `$${lead.quote.monthlyPremium}/mo` : "-"}
                      </td>
                      <td className="py-4">
                        <StatusBadge status={lead.status} />
                      </td>
                      <td className="py-4 text-white font-medium">${lead.payout || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Providers Tab */}
        {activeTab === "providers" && (
          <ProvidersTab providers={providers} leads={leads} updateProvider={updateProvider} addProvider={addProvider} />
        )}

        {/* Ledger Tab */}
        {activeTab === "ledger" && (
          <LedgerTab leads={leads} providers={providers} />
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="bg-[#0d2240] rounded-xl border border-cyan-500/20 p-6 max-w-2xl shadow-[0_0_20px_rgba(34,211,238,0.05)]">
            <h3 className="text-lg font-semibold text-white mb-6">Business Settings</h3>
            <div className="space-y-6">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Default Lead Payout Rate</label>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">$</span>
                  <input
                    type="number"
                    defaultValue={50}
                    className="w-32 px-4 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:border-cyan-400 focus:outline-none transition"
                  />
                  <span className="text-slate-400">per lead</span>
                </div>
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Business Name</label>
                <input
                  type="text"
                  defaultValue="My Insurance Agency"
                  className="w-full px-4 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:border-cyan-400 focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Notification Email</label>
                <input
                  type="email"
                  placeholder="business@example.com"
                  className="w-full px-4 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none transition"
                />
              </div>
              <button className="bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] px-6 py-2 rounded-lg transition font-semibold shadow-[0_0_15px_rgba(34,211,238,0.3)]">
                Save Settings
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    cyan: "text-cyan-400",
    emerald: "text-emerald-400",
    blue: "text-blue-400",
    amber: "text-amber-400",
  };

  const glowColors: Record<string, string> = {
    cyan: "shadow-[0_0_20px_rgba(34,211,238,0.1)]",
    emerald: "shadow-[0_0_20px_rgba(52,211,153,0.1)]",
    blue: "shadow-[0_0_20px_rgba(59,130,246,0.1)]",
    amber: "shadow-[0_0_20px_rgba(251,191,36,0.1)]",
  };

  return (
    <div className={`bg-[#0d2240] rounded-xl border border-cyan-500/20 p-6 ${glowColors[color]}`}>
      <p className="text-slate-400 text-sm mb-1">{title}</p>
      <p className={`text-3xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-400",
    claimed: "bg-emerald-500/20 text-emerald-400",
    expired: "bg-red-500/20 text-red-400",
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}

function LeadRow({ lead }: { lead: Lead }) {
  return (
    <tr className="border-b border-cyan-500/10">
      <td className="py-4 text-white font-medium">{lead.customerName}</td>
      <td className="py-4 text-slate-300">{lead.carModel}</td>
      <td className="py-4 text-slate-300">{lead.providerName}</td>
      <td className="py-4 text-cyan-400">
        {lead.quote ? `$${lead.quote.monthlyPremium}/mo` : "-"}
      </td>
      <td className="py-4">
        <StatusBadge status={lead.status} />
      </td>
      <td className="py-4 text-white font-medium">${lead.payout || 0}</td>
    </tr>
  );
}

function ProvidersTab({
  providers,
  leads,
  updateProvider,
  addProvider,
}: {
  providers: Provider[];
  leads: Lead[];
  updateProvider: (id: string, updates: Partial<Provider>) => void;
  addProvider: (provider: Omit<Provider, "id">) => Provider;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");
  const [newProviderEmail, setNewProviderEmail] = useState("");
  const [newProviderRate, setNewProviderRate] = useState("50");
  const [newProviderPayment, setNewProviderPayment] = useState<"venmo" | "paypal" | "bank">("venmo");

  const handleAddProvider = () => {
    if (newProviderName && newProviderEmail) {
      addProvider({
        name: newProviderName,
        email: newProviderEmail,
        payoutRate: parseInt(newProviderRate) || 50,
        status: "active",
        totalLeads: 0,
        totalEarnings: 0,
        paymentMethod: newProviderPayment,
      });
      setNewProviderName("");
      setNewProviderEmail("");
      setNewProviderRate("50");
      setShowAddModal(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Manage Providers ({providers.length})</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] px-4 py-2 rounded-lg transition flex items-center gap-2 font-semibold shadow-[0_0_15px_rgba(34,211,238,0.3)]"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Provider
        </button>
      </div>

      {/* Add Provider Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d2240] rounded-2xl max-w-md w-full p-6 border border-cyan-500/20 shadow-[0_0_30px_rgba(34,211,238,0.1)]">
            <h3 className="text-xl font-bold text-white mb-4">Add New Provider</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 text-sm mb-2">Provider Name</label>
                <input
                  type="text"
                  value={newProviderName}
                  onChange={(e) => setNewProviderName(e.target.value)}
                  placeholder="John Smith"
                  className="w-full px-4 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-slate-300 text-sm mb-2">Email</label>
                <input
                  type="email"
                  value={newProviderEmail}
                  onChange={(e) => setNewProviderEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full px-4 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-slate-300 text-sm mb-2">Payout Rate (per lead)</label>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">$</span>
                  <input
                    type="number"
                    value={newProviderRate}
                    onChange={(e) => setNewProviderRate(e.target.value)}
                    className="w-32 px-4 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:border-cyan-400 focus:outline-none transition"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-300 text-sm mb-2">Payment Method</label>
                <select
                  value={newProviderPayment}
                  onChange={(e) => setNewProviderPayment(e.target.value as "venmo" | "paypal" | "bank")}
                  className="w-full px-4 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:border-cyan-400 focus:outline-none transition"
                >
                  <option value="venmo">Venmo</option>
                  <option value="paypal">PayPal</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-[#0a1628] hover:bg-[#0a1628]/80 text-white py-2 rounded-lg transition border border-cyan-500/30"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddProvider}
                  className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] py-2 rounded-lg transition font-semibold"
                >
                  Add Provider
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Providers List */}
      <div className="grid gap-4">
        {providers.map((provider) => {
          const providerLeads = leads.filter(l => l.providerId === provider.id);
          const totalPayout = providerLeads.reduce((sum, l) => sum + (l.payout || 0), 0);

          return (
            <div key={provider.id} className="bg-[#0d2240] rounded-xl border border-cyan-500/20 p-6 shadow-[0_0_15px_rgba(34,211,238,0.05)]">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-cyan-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                    <span className="text-cyan-400 font-bold text-lg">
                      {provider.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-white font-semibold text-lg">{provider.name}</h4>
                    <p className="text-slate-400 text-sm">{provider.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        provider.status === "active"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-red-500/20 text-red-400"
                      }`}>
                        {provider.status}
                      </span>
                      <span className="text-slate-500 text-xs">
                        Payment: {provider.paymentMethod || "Not set"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-slate-400 text-sm">Payout Rate</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-cyan-400">$</span>
                    <input
                      type="number"
                      value={provider.payoutRate}
                      onChange={(e) => updateProvider(provider.id, { payoutRate: parseInt(e.target.value) || 0 })}
                      className="w-20 px-2 py-1 rounded bg-[#0a1628] border border-cyan-500/30 text-white text-right focus:border-cyan-400 focus:outline-none transition"
                    />
                    <span className="text-slate-400">/lead</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-cyan-500/20">
                <div>
                  <p className="text-slate-400 text-sm">Total Leads</p>
                  <p className="text-white text-xl font-bold">{providerLeads.length}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Total Earned</p>
                  <p className="text-cyan-400 text-xl font-bold">${totalPayout}</p>
                </div>
                <div className="flex items-end justify-end gap-2">
                  <button
                    onClick={() => updateProvider(provider.id, {
                      status: provider.status === "active" ? "inactive" : "active"
                    })}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      provider.status === "active"
                        ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                        : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                    }`}
                  >
                    {provider.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {providers.length === 0 && (
          <div className="bg-[#0d2240] rounded-xl border border-cyan-500/20 p-12 text-center">
            <p className="text-slate-500">No providers yet. Add your first provider above.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LedgerTab({ leads, providers }: { leads: Lead[]; providers: Provider[] }) {
  // Build transaction history from leads
  const transactions = leads.map(lead => {
    const provider = providers.find(p => p.id === lead.providerId);
    return {
      id: lead.id,
      date: lead.createdAt,
      type: "lead_payout" as const,
      description: `Lead payout to ${provider?.name || "Unknown"} for ${lead.customerName}`,
      amount: lead.payout || 0,
      provider: provider?.name || "Unknown",
      customer: lead.customerName,
      vehicle: lead.carModel,
      paymentMethod: provider?.paymentMethod || "pending",
      status: lead.status === "claimed" ? "completed" : "pending",
    };
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalPaid = transactions.filter(t => t.status === "completed").reduce((sum, t) => sum + t.amount, 0);
  const totalPending = transactions.filter(t => t.status === "pending").reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#0d2240] rounded-xl border border-cyan-500/20 p-6 shadow-[0_0_15px_rgba(34,211,238,0.05)]">
          <p className="text-slate-400 text-sm mb-1">Total Transactions</p>
          <p className="text-3xl font-bold text-white">{transactions.length}</p>
        </div>
        <div className="bg-[#0d2240] rounded-xl border border-cyan-500/20 p-6 shadow-[0_0_15px_rgba(52,211,153,0.1)]">
          <p className="text-slate-400 text-sm mb-1">Total Paid Out</p>
          <p className="text-3xl font-bold text-emerald-400">${totalPaid.toLocaleString()}</p>
        </div>
        <div className="bg-[#0d2240] rounded-xl border border-cyan-500/20 p-6 shadow-[0_0_15px_rgba(251,191,36,0.1)]">
          <p className="text-slate-400 text-sm mb-1">Pending Payouts</p>
          <p className="text-3xl font-bold text-amber-400">${totalPending.toLocaleString()}</p>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-[#0d2240] rounded-xl border border-cyan-500/20 p-6 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">Transaction Ledger</h3>
          <button className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-slate-400 border-b border-cyan-500/20">
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Provider</th>
                <th className="pb-3 font-medium">Customer</th>
                <th className="pb-3 font-medium">Vehicle</th>
                <th className="pb-3 font-medium">Payment Method</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-cyan-500/10">
                  <td className="py-4 text-slate-400 text-sm">
                    {new Date(tx.date).toLocaleDateString()} {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-4 text-white font-medium">{tx.provider}</td>
                  <td className="py-4 text-slate-300">{tx.customer}</td>
                  <td className="py-4 text-slate-300 text-sm">{tx.vehicle}</td>
                  <td className="py-4">
                    <PaymentMethodBadge method={tx.paymentMethod} />
                  </td>
                  <td className="py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      tx.status === "completed"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="py-4 text-cyan-400 font-bold text-right">${tx.amount}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500 py-12">
                    No transactions yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PaymentMethodBadge({ method }: { method: string }) {
  const styles: Record<string, { bg: string; text: string; icon: string }> = {
    venmo: { bg: "bg-cyan-500/20", text: "text-cyan-400", icon: "V" },
    paypal: { bg: "bg-indigo-500/20", text: "text-indigo-400", icon: "P" },
    bank: { bg: "bg-emerald-500/20", text: "text-emerald-400", icon: "B" },
    pending: { bg: "bg-slate-500/20", text: "text-slate-400", icon: "?" },
  };

  const style = styles[method] || styles.pending;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      <span className="font-bold">{style.icon}</span>
      {method.charAt(0).toUpperCase() + method.slice(1)}
    </span>
  );
}
