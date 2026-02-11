"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface PlatformStats {
  totalLeads: number;
  paidLeads: number;
  totalLeadVolume: number;
  completedRevenue: number;
  pendingRevenue: number;
  activeConnections: number;
  activeProviders: number;
  activeBuyers: number;
}

interface RevenueDay {
  day: string;
  revenue: number;
  txCount: number;
}

interface AdminLead {
  id: string;
  providerName: string;
  buyerName: string;
  payoutAmount: number;
  buyerTotal: number;
  providerNet: number;
  platformFee: number;
  payoutStatus: string;
  submittedAt: string;
  vehicleInfo: string | null;
  customerState: string | null;
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<"overview" | "leads" | "revenue">("overview");
  const [accessCode, setAccessCode] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // DB-backed state
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [revenueByDay, setRevenueByDay] = useState<RevenueDay[]>([]);
  const [recentLeads, setRecentLeads] = useState<AdminLead[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: accessCode }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setIsAuthenticated(true);
      } else {
        setError(data.error || "Authentication failed");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth", { method: "DELETE" });
    } catch {
      // Continue with logout even if API fails
    }
    setIsAuthenticated(false);
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/admin/auth");
        const data = await response.json();
        setIsAuthenticated(data.authenticated === true);
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Fetch real stats from DB when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const res = await fetch("/api/admin/stats");
        const data = await res.json();
        if (data.success) {
          setStats(data.stats);
          setRevenueByDay(data.revenueByDay);
          setRecentLeads(data.recentLeads);
        }
      } catch (e) {
        console.error("Failed to fetch admin stats:", e);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [isAuthenticated]);

  // Revenue chart helpers
  const maxRevenue = Math.max(...revenueByDay.map(d => d.revenue), 1);

  if (isLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-2xl max-w-md w-full">
          <div className="text-center mb-6">
            <div className="h-16 w-16 rounded-xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white">WOML Marketplace</h1>
            <p className="text-slate-400 mt-2">Enter admin password to continue</p>
          </div>
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
          <input
            type="password"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Admin password"
            className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-600 text-white mb-4"
            disabled={isLoading}
          />
          <button
            onClick={handleLogin}
            disabled={isLoading || !accessCode}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Authenticating..." : "Access Dashboard"}
          </button>
          <Link href="/" className="block text-center text-slate-400 hover:text-white mt-4">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-emerald-500 flex items-center justify-center">
              <span className="text-white font-bold text-xl">W</span>
            </div>
          </Link>
          <div>
            <h1 className="text-white font-bold text-lg">WOML Marketplace</h1>
            <p className="text-slate-400 text-xs">Platform Analytics</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-slate-400 hover:text-white transition"
        >
          Logout
        </button>
      </nav>

      <main className="max-w-7xl mx-auto px-8 py-8">
        {statsLoading ? (
          <div className="flex justify-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-400"></div>
          </div>
        ) : stats ? (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                <div className="text-slate-400 text-sm mb-1">Platform Revenue</div>
                <div className="text-3xl font-bold text-emerald-400">${stats.completedRevenue.toFixed(2)}</div>
                <div className="text-slate-500 text-xs mt-1">from $2/lead fees</div>
              </div>
              <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                <div className="text-slate-400 text-sm mb-1">Pending Revenue</div>
                <div className="text-3xl font-bold text-amber-400">${stats.pendingRevenue.toFixed(2)}</div>
                <div className="text-slate-500 text-xs mt-1">awaiting payment</div>
              </div>
              <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                <div className="text-slate-400 text-sm mb-1">Total Leads</div>
                <div className="text-3xl font-bold text-white">{stats.totalLeads}</div>
                <div className="text-slate-500 text-xs mt-1">{stats.paidLeads} paid</div>
              </div>
              <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                <div className="text-slate-400 text-sm mb-1">Lead Volume</div>
                <div className="text-3xl font-bold text-blue-400">${stats.totalLeadVolume.toFixed(2)}</div>
                <div className="text-slate-500 text-xs mt-1">total transacted</div>
              </div>
            </div>

            {/* Marketplace Health */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.activeProviders}</div>
                  <div className="text-slate-400 text-sm">Active Providers</div>
                </div>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.activeBuyers}</div>
                  <div className="text-slate-400 text-sm">Active Businesses</div>
                </div>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.activeConnections}</div>
                  <div className="text-slate-400 text-sm">Active Connections</div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
              {(["overview", "leads", "revenue"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg font-medium transition capitalize ${
                    activeTab === tab
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Overview Tab — Revenue Chart */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
                  <h2 className="text-xl font-semibold text-white mb-2">Revenue — Last 30 Days</h2>
                  <p className="text-slate-400 text-sm mb-6">Platform fee revenue ($2/lead)</p>
                  {revenueByDay.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">No revenue data yet</p>
                  ) : (
                    <div className="flex items-end gap-1 h-48">
                      {revenueByDay.map((day) => (
                        <div key={day.day} className="flex-1 flex flex-col items-center gap-1 group relative">
                          <div className="hidden group-hover:block absolute -top-10 bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                            {new Date(day.day).toLocaleDateString()} — ${day.revenue.toFixed(2)} ({day.txCount} leads)
                          </div>
                          <div
                            className="w-full bg-emerald-500/80 rounded-t hover:bg-emerald-400 transition-colors"
                            style={{ height: `${Math.max((day.revenue / maxRevenue) * 100, 4)}%` }}
                          />
                          {revenueByDay.length <= 14 && (
                            <span className="text-slate-500 text-[10px]">
                              {new Date(day.day).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
                    <h3 className="text-lg font-semibold text-white mb-3">Fee Breakdown</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Fee per lead</span>
                        <span className="text-white font-medium">$2.00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">From buyer</span>
                        <span className="text-white">$1.00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">From provider</span>
                        <span className="text-white">$1.00</span>
                      </div>
                      <div className="border-t border-slate-600 pt-3 flex justify-between">
                        <span className="text-slate-300 font-medium">Total collected</span>
                        <span className="text-emerald-400 font-bold">${(stats.completedRevenue + stats.pendingRevenue).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
                    <h3 className="text-lg font-semibold text-white mb-3">Conversion</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Total leads</span>
                        <span className="text-white font-medium">{stats.totalLeads}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Paid leads</span>
                        <span className="text-emerald-400 font-medium">{stats.paidLeads}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Pending</span>
                        <span className="text-amber-400 font-medium">{stats.totalLeads - stats.paidLeads}</span>
                      </div>
                      <div className="border-t border-slate-600 pt-3 flex justify-between">
                        <span className="text-slate-300 font-medium">Payment rate</span>
                        <span className="text-blue-400 font-bold">
                          {stats.totalLeads > 0 ? Math.round((stats.paidLeads / stats.totalLeads) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Leads Tab */}
            {activeTab === "leads" && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Recent Leads ({recentLeads.length})</h2>
                {recentLeads.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">No leads yet</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-600">
                        <th className="text-left py-2 text-slate-400 text-sm">Date</th>
                        <th className="text-left py-2 text-slate-400 text-sm">Provider</th>
                        <th className="text-left py-2 text-slate-400 text-sm">Business</th>
                        <th className="text-left py-2 text-slate-400 text-sm">Vehicle</th>
                        <th className="text-right py-2 text-slate-400 text-sm">Lead Rate</th>
                        <th className="text-right py-2 text-slate-400 text-sm">WOML Fee</th>
                        <th className="text-center py-2 text-slate-400 text-sm">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentLeads.map((lead) => (
                        <tr key={lead.id} className="border-b border-slate-700/50">
                          <td className="py-3 text-slate-300 text-sm">
                            {new Date(lead.submittedAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 text-white font-medium">{lead.providerName}</td>
                          <td className="py-3 text-slate-300">{lead.buyerName}</td>
                          <td className="py-3 text-slate-400 text-sm">{lead.vehicleInfo || "-"}</td>
                          <td className="py-3 text-right text-white">${Number(lead.payoutAmount).toFixed(2)}</td>
                          <td className="py-3 text-right text-emerald-400 font-medium">${Number(lead.platformFee).toFixed(2)}</td>
                          <td className="py-3 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              lead.payoutStatus === "completed"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-amber-500/20 text-amber-400"
                            }`}>
                              {lead.payoutStatus === "completed" ? "Paid" : "Pending"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Revenue Tab */}
            {activeTab === "revenue" && (
              <div className="space-y-6">
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
                  <h2 className="text-xl font-semibold text-white mb-4">Revenue Breakdown</h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                      <div>
                        <div className="text-emerald-400 font-medium">Collected Revenue</div>
                        <div className="text-slate-400 text-sm">Fees from completed lead payments</div>
                      </div>
                      <div className="text-3xl font-bold text-emerald-400">${stats.completedRevenue.toFixed(2)}</div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                      <div>
                        <div className="text-amber-400 font-medium">Pending Revenue</div>
                        <div className="text-slate-400 text-sm">Fees from leads awaiting payment</div>
                      </div>
                      <div className="text-3xl font-bold text-amber-400">${stats.pendingRevenue.toFixed(2)}</div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <div>
                        <div className="text-blue-400 font-medium">Total Lead Volume</div>
                        <div className="text-slate-400 text-sm">Total value of all leads transacted</div>
                      </div>
                      <div className="text-3xl font-bold text-blue-400">${stats.totalLeadVolume.toFixed(2)}</div>
                    </div>
                  </div>
                </div>

                {/* Daily breakdown table */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
                  <h2 className="text-xl font-semibold text-white mb-4">Daily Revenue</h2>
                  {revenueByDay.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">No revenue data yet</p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-600">
                          <th className="text-left py-2 text-slate-400 text-sm">Date</th>
                          <th className="text-right py-2 text-slate-400 text-sm">Leads</th>
                          <th className="text-right py-2 text-slate-400 text-sm">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...revenueByDay].reverse().map((day) => (
                          <tr key={day.day} className="border-b border-slate-700/50">
                            <td className="py-2 text-slate-300">{new Date(day.day).toLocaleDateString()}</td>
                            <td className="py-2 text-right text-white">{day.txCount}</td>
                            <td className="py-2 text-right text-emerald-400 font-medium">${day.revenue.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-24">
            <p className="text-slate-400">Failed to load stats. Please try refreshing.</p>
          </div>
        )}
      </main>
    </div>
  );
}
