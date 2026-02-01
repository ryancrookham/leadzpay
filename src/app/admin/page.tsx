"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLeads } from "@/lib/leads-context";

export default function AdminPanel() {
  const { leads, providers } = useLeads();
  const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "users" | "settings">("overview");
  const [accessCode, setAccessCode] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Simple access code for demo (in production, use proper auth)
  const ADMIN_CODE = "leadzpay2025";

  const handleLogin = () => {
    if (accessCode === ADMIN_CODE) {
      setIsAuthenticated(true);
      localStorage.setItem("admin_auth", "true");
    }
  };

  useEffect(() => {
    if (localStorage.getItem("admin_auth") === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  const handleClearAllData = () => {
    if (confirm("Are you sure you want to clear ALL data? This cannot be undone.")) {
      localStorage.removeItem("leadzpay_leads");
      localStorage.removeItem("leadzpay_providers");
      localStorage.removeItem("leadzpay_transactions");
      alert("All data cleared. Refreshing...");
      window.location.reload();
    }
  };

  const handleExportData = () => {
    const data = {
      leads,
      providers,
      transactions: JSON.parse(localStorage.getItem("leadzpay_transactions") || "[]"),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leadzpay-export-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
  };

  // Calculate metrics
  const totalLeads = leads.length;
  const claimedLeads = leads.filter(l => l.status === "claimed").length;
  const totalRevenue = leads.reduce((sum, l) => sum + l.payout, 0);
  const conversionRate = totalLeads > 0 ? Math.round((claimedLeads / totalLeads) * 100) : 0;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-2xl max-w-md w-full">
          <div className="text-center mb-6">
            <div className="h-16 w-16 rounded-xl bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white">Admin Access</h1>
            <p className="text-slate-400 mt-2">Enter access code to continue</p>
          </div>
          <input
            type="password"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Access code"
            className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-600 text-white mb-4"
          />
          <button
            onClick={handleLogin}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg font-medium transition"
          >
            Access Admin Panel
          </button>
          <Link href="/" className="block text-center text-slate-400 hover:text-white mt-4">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-red-900">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-emerald-500 flex items-center justify-center">
              <span className="text-white font-bold text-xl">L</span>
            </div>
            
          </Link>
          <span className="px-3 py-1 bg-red-500/20 text-red-400 text-sm rounded-full">Admin</span>
        </div>
        <button
          onClick={() => { localStorage.removeItem("admin_auth"); setIsAuthenticated(false); }}
          className="text-slate-400 hover:text-white transition"
        >
          Logout
        </button>
      </nav>

      <main className="max-w-7xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
          <p className="text-slate-400">Manage platform data, users, and settings</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
            <div className="text-slate-400 text-sm">Total Leads</div>
            <div className="text-2xl font-bold text-white">{totalLeads}</div>
          </div>
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
            <div className="text-slate-400 text-sm">Claimed</div>
            <div className="text-2xl font-bold text-emerald-400">{claimedLeads}</div>
          </div>
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
            <div className="text-slate-400 text-sm">Conversion Rate</div>
            <div className="text-2xl font-bold text-blue-400">{conversionRate}%</div>
          </div>
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
            <div className="text-slate-400 text-sm">Total Payouts</div>
            <div className="text-2xl font-bold text-purple-400">${totalRevenue}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(["overview", "transactions", "users", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium transition capitalize ${
                activeTab === tab
                  ? "bg-red-500 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Recent Activity */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Recent Leads</h2>
              {leads.length === 0 ? (
                <p className="text-slate-400">No leads yet</p>
              ) : (
                <div className="space-y-3">
                  {leads.slice(0, 5).map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                      <div>
                        <div className="text-white font-medium">{lead.customerName}</div>
                        <div className="text-slate-400 text-sm">{lead.carModel}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm ${lead.status === "claimed" ? "text-emerald-400" : "text-amber-400"}`}>
                          {lead.status}
                        </div>
                        <div className="text-slate-500 text-xs">
                          {new Date(lead.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Provider Performance */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Provider Performance</h2>
              {providers.map((provider) => (
                <div key={provider.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                  <div>
                    <div className="text-white font-medium">{provider.name}</div>
                    <div className="text-slate-400 text-sm">{provider.email}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-emerald-400 font-medium">${provider.totalEarnings} earned</div>
                    <div className="text-slate-500 text-sm">{provider.totalLeads} leads</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transactions Tab */}
        {activeTab === "transactions" && (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Transaction History</h2>
            <p className="text-slate-400 mb-4">All financial transactions on the platform</p>

            {leads.filter(l => l.payout > 0).length === 0 ? (
              <p className="text-slate-500">No transactions yet</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-600">
                    <th className="text-left py-2 text-slate-400 text-sm">Date</th>
                    <th className="text-left py-2 text-slate-400 text-sm">Type</th>
                    <th className="text-left py-2 text-slate-400 text-sm">Lead</th>
                    <th className="text-left py-2 text-slate-400 text-sm">Provider</th>
                    <th className="text-right py-2 text-slate-400 text-sm">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.filter(l => l.payout > 0).map((lead) => (
                    <tr key={lead.id} className="border-b border-slate-700">
                      <td className="py-3 text-slate-300">{lead.claimedAt ? new Date(lead.claimedAt).toLocaleDateString() : "-"}</td>
                      <td className="py-3"><span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded">Payout</span></td>
                      <td className="py-3 text-white">{lead.customerName}</td>
                      <td className="py-3 text-slate-400">{lead.providerName}</td>
                      <td className="py-3 text-right text-emerald-400 font-medium">${lead.payout}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Registered Providers</h2>
              {providers.map((provider) => (
                <div key={provider.id} className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg mb-3">
                  <div>
                    <div className="text-white font-medium">{provider.name}</div>
                    <div className="text-slate-400 text-sm">{provider.email}</div>
                    <div className="text-slate-500 text-xs">ID: {provider.id}</div>
                  </div>
                  <div className="text-right">
                    <div className={`px-2 py-1 rounded text-xs ${
                      provider.status === "active" ? "bg-emerald-500/20 text-emerald-400" :
                      provider.status === "suspended" ? "bg-amber-500/20 text-amber-400" :
                      "bg-red-500/20 text-red-400"
                    }`}>
                      {provider.status}
                    </div>
                    <div className="text-slate-400 text-sm mt-1">${provider.payoutRate}/lead</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Access Management</h2>
              <p className="text-slate-400 mb-4">Share this link with strategic partners:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={typeof window !== "undefined" ? window.location.origin : ""}
                  readOnly
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(window.location.origin)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition"
                >
                  Copy
                </button>
              </div>
              <p className="text-slate-500 text-sm mt-2">
                Admin access code: <code className="bg-slate-700 px-2 py-1 rounded">{ADMIN_CODE}</code>
              </p>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Data Management</h2>

              <div className="space-y-4">
                <button
                  onClick={handleExportData}
                  className="w-full p-4 bg-blue-500/20 border border-blue-500/50 rounded-lg text-left hover:bg-blue-500/30 transition"
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <div>
                      <div className="text-white font-medium">Export All Data</div>
                      <div className="text-blue-300 text-sm">Download leads, providers, and transactions as JSON</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={handleClearAllData}
                  className="w-full p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-left hover:bg-red-500/30 transition"
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <div>
                      <div className="text-white font-medium">Clear All Data</div>
                      <div className="text-red-300 text-sm">Delete all leads, providers, and transaction history</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Platform Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-slate-300 text-sm mb-2">Default Payout Rate ($/lead)</label>
                  <input type="number" defaultValue={50} className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white" />
                </div>
                <div>
                  <label className="block text-slate-300 text-sm mb-2">ASAP Call Number</label>
                  <input type="tel" defaultValue="+12158205172" className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white" />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
