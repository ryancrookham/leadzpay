"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";

interface PlatformStats {
  totalLeads: number;
  paidLeads: number;
  processingLeads: number;
  totalLeadVolume: number;
  completedRevenue: number;
  pendingRevenue: number;
  activeConnections: number;
  activeProviders: number;
  activeBuyers: number;
}

interface AdminLead {
  id: string;
  providerName: string;
  buyerName: string;
  payoutAmount: number;
  platformFee: number;
  payoutStatus: string;
  submittedAt: string;
}

interface DetailedUser {
  id: string;
  email: string;
  username: string;
  role: string;
  displayName: string;
  businessName: string | null;
  phone: string | null;
  location: string | null;
  isActive: boolean;
  createdAt: string;
  totalLeads: number;
  totalVolume: number;
  lastLeadAt: string | null;
  yearlyEarnings: number;
  needs1099: boolean;
  disabledAt: string | null;
}

interface PlatformFees {
  fee_type: "flat" | "percent" | "mixed";
  fee_total: number;
  fee_buyer: number;
  fee_provider: number;
  fee_percent: number;
  fee_percent_buyer_share: number;
  fee_mixed_flat: number;
  fee_mixed_percent: number;
  fee_mixed_buyer_share: number;
}

interface SinchStatus {
  configured: boolean;
  phoneNumber: string | null;
}

interface StripeStatus {
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  businessName: string | null;
  email: string | null;
}

type Tab = "users" | "data" | "platform" | "health";

interface SystemHealthCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  details?: any;
  fixable?: boolean;
}

interface SystemHealth {
  status: "healthy" | "degraded" | "critical";
  timestamp: string;
  summary: { pass: number; warn: number; fail: number; fixable: number };
  checks: SystemHealthCheck[];
}

interface HardDeleteTarget {
  id: string;
  email: string;
  role: string;
}

interface BusinessHealth {
  business_id: string;
  display_name: string | null;
  business_name: string | null;
  email: string;
  is_active: boolean;
  disabled_at: string | null;
  total_leads: number;
  leads_this_month: number;
  contacted: number;
  quoted: number;
  sold: number;
  dead: number;
  last_lead_at: string | null;
  active_chasers: number;
  last_chaser_activity: string | null;
}

interface ProviderHealth {
  provider_id: string;
  display_name: string | null;
  email: string;
  is_active: boolean;
  disabled_at: string | null;
  total_leads: number;
  leads_this_month: number;
  leads_this_week: number;
  gross_earnings: number;
  fees_paid: number;
  net_earnings: number;
  last_submission: string | null;
}

interface PlatformFunnel {
  total_leads: number;
  total_contacted: number;
  total_quoted: number;
  total_sold: number;
  total_dead: number;
}

interface PlatformRevenue {
  revenue_this_week: number;
  revenue_this_month: number;
  revenue_this_year: number;
  revenue_all_time: number;
}

export default function AdminPanel() {
  const { currentUser, isLoading: authLoading, isAuthenticated, isSigningOut, login, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("users");

  // Hard delete confirmation modal state
  const [hardDeleteTarget, setHardDeleteTarget] = useState<HardDeleteTarget | null>(null);
  const [hardDeleteLoading, setHardDeleteLoading] = useState(false);
  const [hardDeleteError, setHardDeleteError] = useState("");

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const result = await login(loginEmail, loginPassword);
      if (!result.success) {
        setLoginError(result.error || "Invalid credentials");
        setLoginLoading(false);
        return;
      }
      if (result.role && result.role !== "admin") {
        setLoginError("This account does not have admin access.");
        setLoginLoading(false);
        return;
      }
      // Force full reload so useSession() picks up the new session cookie
      window.location.href = "/admin";
    } catch {
      setLoginError("Login failed. Please try again.");
      setLoginLoading(false);
    }
  };

  // Data state
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [recentLeads, setRecentLeads] = useState<AdminLead[]>([]);
  const [leadsThisMonth, setLeadsThisMonth] = useState(0);
  const [detailedUsers, setDetailedUsers] = useState<DetailedUser[]>([]);
  const [platformFees, setPlatformFees] = useState<PlatformFees | null>(null);
  const [sinchStatus, setSinchStatus] = useState<SinchStatus | null>(null);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState("");

  // Platform health state (Data tab)
  const [platformHealth, setPlatformHealth] = useState<{
    funnel: PlatformFunnel | null;
    trend: { date: string; leads: number; contacted: number; sold: number }[];
    businesses: BusinessHealth[];
    providers: ProviderHealth[];
    revenue: PlatformRevenue | null;
    growth: { leads_this_month: number; leads_last_month: number } | null;
  }>({ funnel: null, trend: [], businesses: [], providers: [], revenue: null, growth: null });
  const [healthLoading, setHealthLoading] = useState(false);

  // System health state (Health tab)
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [systemHealthLoading, setSystemHealthLoading] = useState(false);
  const [systemHealthError, setSystemHealthError] = useState("");
  const [fixLoading, setFixLoading] = useState<string | null>(null);
  const [fixResults, setFixResults] = useState<string[]>([]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser || currentUser.role !== "admin") return;
    const fetchData = async () => {
      setStatsLoading(true);
      try {
        const [statsRes, stripeRes] = await Promise.all([
          fetch("/api/admin/stats", { cache: "no-store" }),
          fetch("/api/admin/stripe-status", { cache: "no-store" }),
        ]);
        const statsData = await statsRes.json();
        if (statsData.success) {
          setStats(statsData.stats);
          setRecentLeads(statsData.recentLeads);
          setLeadsThisMonth(statsData.leadsThisMonth ?? 0);
          setDetailedUsers(statsData.detailedUsers || []);
          setPlatformFees(statsData.platformFees || null);
          setSinchStatus(statsData.sinchStatus || null);
        } else {
          setError(statsData.error || "Failed to load stats");
        }
        const stripeData = await stripeRes.json();
        if (stripeData.success) {
          setStripeStatus(stripeData);
        }
      } catch (e) {
        console.error("Failed to fetch admin data:", e);
        setError("Failed to load data");
      } finally {
        setStatsLoading(false);
      }
    };
    fetchData();
  }, [isAuthenticated, currentUser]);

  const refreshData = async () => {
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setRecentLeads(data.recentLeads);
        setLeadsThisMonth(data.leadsThisMonth ?? 0);
        setDetailedUsers(data.detailedUsers || []);
        setPlatformFees(data.platformFees || null);
        setSinchStatus(data.sinchStatus || null);
      }
    } catch (e) {
      console.error("Refresh failed:", e);
    }
  };

  // Fetch platform health when Data tab is active
  useEffect(() => {
    if (!isAuthenticated || !currentUser || currentUser.role !== "admin") return;
    if (activeTab !== "data") return;
    if (platformHealth.funnel) return; // already loaded
    setHealthLoading(true);
    fetch("/api/admin/platform-health", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setPlatformHealth({
            funnel: d.funnel,
            trend: d.trend,
            businesses: d.businesses,
            providers: d.providers,
            revenue: d.revenue,
            growth: d.growth ?? null,
          });
        }
      })
      .catch(() => {})
      .finally(() => setHealthLoading(false));
  }, [activeTab, isAuthenticated, currentUser, platformHealth.funnel]);

  // Fetch system health when Health tab is active
  useEffect(() => {
    if (!isAuthenticated || !currentUser || currentUser.role !== "admin") return;
    if (activeTab !== "health") return;
    fetchSystemHealth();
  }, [activeTab, isAuthenticated, currentUser]);

  const fetchSystemHealth = async () => {
    setSystemHealthLoading(true);
    setSystemHealthError("");
    try {
      const res = await fetch("/api/admin/health", { cache: "no-store" });
      const data = await res.json();
      setSystemHealth(data);
    } catch (e: any) {
      setSystemHealthError("Failed to run health checks");
    } finally {
      setSystemHealthLoading(false);
    }
  };

  const runFix = async (action: string) => {
    setFixLoading(action);
    try {
      const res = await fetch("/api/admin/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setFixResults(data.results);
        // Re-run health checks after fix
        await fetchSystemHealth();
      }
    } catch {
      setFixResults(["Fix failed — check console"]);
    } finally {
      setFixLoading(null);
    }
  };

  const handleToggleUser = async (userId: string, isActive: boolean) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isActive }),
      });
      if (res.ok) {
        setDetailedUsers(prev => prev.map(u =>
          u.id === userId ? { ...u, isActive } : u
        ));
      }
    } catch (e) {
      console.error("Toggle failed:", e);
    }
  };

  const handleEnableAccount = async (userId: string) => {
    try {
      const res = await fetch("/api/admin/account/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setDetailedUsers(prev => prev.map(u =>
          u.id === userId ? { ...u, disabledAt: null } : u
        ));
      }
    } catch (e) {
      console.error("Enable account failed:", e);
    }
  };

  const handleHardDelete = async () => {
    if (!hardDeleteTarget) return;
    setHardDeleteLoading(true);
    setHardDeleteError("");
    try {
      const res = await fetch("/api/admin/hard-delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: hardDeleteTarget.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setHardDeleteError(data.error || "Delete failed");
        setHardDeleteLoading(false);
        return;
      }
      // Remove from local state so the table updates instantly
      setDetailedUsers(prev => prev.filter(u => u.id !== hardDeleteTarget.id));
      if (data.stripeWarning) {
        // Still close modal but surface the Stripe warning in the error banner
        setError(`User deleted. Stripe warning: ${data.stripeWarning}`);
      }
      setHardDeleteTarget(null);
    } catch (e) {
      console.error("Hard delete failed:", e);
      setHardDeleteError("An error occurred. Please try again.");
    } finally {
      setHardDeleteLoading(false);
    }
  };

  // --- Loading / Signing Out ---
  if (authLoading || isSigningOut) {
    return (
      <div className="min-h-screen bg-[#212121] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8822A]"></div>
      </div>
    );
  }

  // --- Login Screen ---
  if (!isAuthenticated || !currentUser || currentUser.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#212121] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl max-w-md w-full border border-gray-200">
          <div className="text-center mb-6">
            <Image src="/woml-alt-orange.png" alt="WOML" width={800} height={240} className="mx-auto mb-4 h-56 w-auto object-contain" />
          </div>
          {loginError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {loginError}
            </div>
          )}
          <form onSubmit={handleAdminLogin} autoComplete="off" className="space-y-4">
            <div>
              <label className="block text-gray-600 text-sm mb-1.5">Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="womleads@outlook.com"
                required
                disabled={loginLoading}
                className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E8822A]/40 focus:border-[#E8822A] transition disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-gray-600 text-sm mb-1.5">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter admin password"
                required
                disabled={loginLoading}
                className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E8822A]/40 focus:border-[#E8822A] transition disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 bg-[#E8822A] hover:bg-[#D47526] text-black rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loginLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div>
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
          <Link href="/" className="block text-gray-500 hover:text-[#E8822A] mt-6 text-sm text-center transition">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // --- Dashboard ---
  return (
    <div className="min-h-screen bg-[#212121]">
      <nav className="flex items-center justify-between px-8 py-6 border-b border-white/20">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/woml-alt-white.png" alt="WOML" width={160} height={48} className="h-12 w-auto object-contain" />
          </Link>
          <div>
            <h1 className="text-white font-bold text-lg">Admin Portal</h1>
            <p className="text-gray-500 text-xs">{currentUser.email}</p>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="text-gray-500 hover:text-[#E8822A] transition text-sm"
        >
          Sign Out
        </button>
      </nav>

      <main className="max-w-7xl mx-auto px-8 py-8">
        {statsLoading ? (
          <div className="flex justify-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#E8822A]"></div>
          </div>
        ) : error ? (
          <div className="text-center py-24">
            <p className="text-red-400 mb-4">{error}</p>
            <button onClick={refreshData} className="text-[#E8822A] hover:text-[#D47526] underline">
              Try Again
            </button>
          </div>
        ) : stats ? (
          <>
            {/* Tabs */}
            <div className="flex gap-2 mb-8">
              {(["users", "data", "platform", "health"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-lg font-medium transition capitalize ${
                    activeTab === tab
                      ? "bg-white/20 text-white border border-white/30"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* ===== USERS TAB ===== */}
            {activeTab === "users" && (
              <>
                {/* Disabled accounts alert */}
                {(() => {
                  const selfDisabled = detailedUsers.filter(u => u.disabledAt);
                  if (selfDisabled.length === 0) return null;
                  return (
                    <div className="mb-4 p-4 bg-yellow-900/30 border border-yellow-700 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <span className="text-yellow-300 text-sm font-semibold">
                          {selfDisabled.length} account{selfDisabled.length > 1 ? "s" : ""} self-disabled
                        </span>
                      </div>
                      <div className="space-y-1">
                        {selfDisabled.map(u => (
                          <div key={u.id} className="flex items-center justify-between text-xs text-yellow-200/80">
                            <span>{u.displayName || u.email} ({u.role}) — disabled {new Date(u.disabledAt!).toLocaleDateString()}</span>
                            <button
                              onClick={() => handleEnableAccount(u.id)}
                              className="ml-4 px-2 py-0.5 rounded bg-yellow-700 hover:bg-yellow-600 text-white transition"
                            >
                              Re-enable
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              <div className="bg-white/10 rounded-xl border border-white/10 overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                  <h3 className="text-white font-semibold">All Users ({detailedUsers.length})</h3>
                </div>
                {detailedUsers.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500">No users</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-gray-400 text-xs uppercase tracking-wider">
                          <th className="px-6 py-3 text-left">Name</th>
                          <th className="px-6 py-3 text-left">Role</th>
                          <th className="px-6 py-3 text-left">Email</th>
                          <th className="px-6 py-3 text-left">Joined</th>
                          <th className="px-6 py-3 text-right">Leads</th>
                          <th className="px-6 py-3 text-right">Volume</th>
                          <th className="px-6 py-3 text-left">Last Active</th>
                          <th className="px-6 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {[...detailedUsers]
                          .sort((a, b) => {
                            const roleOrder: Record<string, number> = { buyer: 0, provider: 1, admin: 2 };
                            const roleDiff = (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3);
                            if (roleDiff !== 0) return roleDiff;
                            return a.displayName.localeCompare(b.displayName);
                          })
                          .map((user) => (
                          <tr key={user.id} className="hover:bg-white/[0.02]">
                            <td className="px-6 py-3 text-white text-sm">
                              {user.displayName}
                              {user.businessName && (
                                <span className="text-gray-500 text-xs block">{user.businessName}</span>
                              )}
                            </td>
                            <td className="px-6 py-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                user.role === "provider"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : user.role === "admin"
                                  ? "bg-purple-500/20 text-purple-400"
                                  : "bg-[#E8822A]/20 text-[#E8822A]"
                              }`}>
                                {user.role}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-gray-300 text-sm">{user.email}</td>
                            <td className="px-6 py-3 text-gray-400 text-sm">
                              {new Date(user.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-3 text-white text-sm text-right">{user.totalLeads}</td>
                            <td className="px-6 py-3 text-white text-sm text-right">
                              ${Number(user.totalVolume).toFixed(2)}
                            </td>
                            <td className="px-6 py-3 text-gray-400 text-sm">
                              {user.lastLeadAt
                                ? timeAgo(user.lastLeadAt)
                                : "Never"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {user.role !== "admin" && (
                                <div className="flex items-center justify-end gap-2 flex-wrap">
                                  {user.disabledAt ? (
                                    <>
                                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-900/40 text-yellow-300 border border-yellow-700">
                                        Self-Disabled
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {new Date(user.disabledAt).toLocaleDateString()}
                                      </span>
                                      <button
                                        onClick={() => handleEnableAccount(user.id)}
                                        className="px-3 py-1 rounded text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white transition"
                                      >
                                        Re-enable
                                      </button>
                                    </>
                                  ) : !user.isActive ? (
                                    <>
                                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-900/40 text-red-300 border border-red-700">
                                        Suspended
                                      </span>
                                      <button
                                        onClick={() => handleToggleUser(user.id, true)}
                                        className="px-3 py-1 rounded text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white transition"
                                      >
                                        Reactivate
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/40 text-emerald-300 border border-emerald-700">
                                        Active
                                      </span>
                                      <button
                                        onClick={() => handleToggleUser(user.id, false)}
                                        className="px-3 py-1 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white transition"
                                      >
                                        Suspend
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => {
                                      setHardDeleteError("");
                                      setHardDeleteTarget({ id: user.id, email: user.email, role: user.role });
                                    }}
                                    className="px-3 py-1 rounded text-xs font-medium bg-red-900 hover:bg-red-800 text-white transition"
                                    title="Permanently delete this account and all associated data"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              </>
            )}

            {/* ===== DATA TAB ===== */}
            {activeTab === "data" && (
              <div className="space-y-6">
                {healthLoading ? (
                  <div className="text-center py-12 text-gray-400">Loading platform health...</div>
                ) : (
                  <>
                    {/* ── WOML Revenue ───────────────────────────── */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: "This Week", value: platformHealth.revenue?.revenue_this_week ?? 0 },
                        { label: "This Month", value: platformHealth.revenue?.revenue_this_month ?? 0 },
                        { label: "This Year", value: platformHealth.revenue?.revenue_this_year ?? 0 },
                        { label: "All Time", value: platformHealth.revenue?.revenue_all_time ?? 0 },
                      ].map(item => (
                        <div key={item.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">WOML Revenue — {item.label}</p>
                          <p className="text-2xl font-bold text-[#E8822A]">${Number(item.value).toFixed(2)}</p>
                        </div>
                      ))}
                    </div>

                    {/* ── Quick Stats ───────────────────────────── */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <MetricCard label="Total Leads" value={stats.totalLeads} />
                      <MetricCard label="This Month" value={leadsThisMonth} />
                      <MetricCard label="Paid Leads" value={stats.paidLeads} />
                      <MetricCard label="Active Providers" value={stats.activeProviders} />
                      <MetricCard label="Active Businesses" value={stats.activeBuyers} />
                    </div>

                    {/* ── Month-over-Month Growth ───────────────────────────── */}
                    {platformHealth.growth && (() => {
                      const curr = platformHealth.growth!.leads_this_month;
                      const prev = platformHealth.growth!.leads_last_month;
                      const pctChange = prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);
                      const isUp = pctChange > 0;
                      const isFlat = pctChange === 0;
                      return (
                        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex items-center justify-between">
                          <div>
                            <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Month-over-Month Growth</p>
                            <p className="text-white text-sm">
                              <span className="font-semibold text-white">{curr} leads</span> this month vs{" "}
                              <span className="font-semibold text-white">{prev} leads</span> last month
                            </p>
                          </div>
                          <div className={`text-2xl font-bold ${isFlat ? "text-gray-400" : isUp ? "text-green-400" : "text-red-400"}`}>
                            {isFlat ? "—" : `${isUp ? "+" : ""}${pctChange}%`}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Platform Funnel ───────────────────────────── */}
                    {platformHealth.funnel && (() => {
                      const f = platformHealth.funnel!;
                      const total = f.total_leads || 1;
                      const stages = [
                        { label: "Leads", count: f.total_leads, color: "#ef4444", pct: 100 },
                        { label: "Contacted", count: f.total_contacted, color: "#f97316", pct: Math.round(f.total_contacted / total * 100) },
                        { label: "Quoted", count: f.total_quoted, color: "#ca8a04", pct: Math.round(f.total_quoted / total * 100) },
                        { label: "Sold", count: f.total_sold, color: "#16a34a", pct: Math.round(f.total_sold / total * 100) },
                        { label: "Dead", count: f.total_dead, color: "#374151", pct: Math.round(f.total_dead / total * 100) },
                      ];
                      return (
                        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                          <h3 className="text-sm font-semibold text-white mb-4">Platform Conversion Funnel (All Time)</h3>
                          <div className="space-y-3">
                            {stages.map(s => (
                              <div key={s.label} className="flex items-center gap-3">
                                <span className="text-xs text-gray-400 w-20 shrink-0">{s.label}</span>
                                <div className="flex-1 bg-gray-700 rounded-full h-4 overflow-hidden">
                                  <div
                                    className="h-4 rounded-full transition-all duration-500"
                                    style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                                  />
                                </div>
                                <span className="text-sm font-semibold text-white w-12 text-right">{s.pct}%</span>
                                <span className="text-xs text-gray-400 w-16 text-right">{s.count} leads</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── 30-Day Trend Chart ───────────────────────────── */}
                    {(() => {
                      // Build a full 30-day array, filling in zeros for days with no activity
                      const today = new Date();
                      const allDays = Array.from({ length: 30 }, (_, i) => {
                        const d = new Date(today);
                        d.setDate(d.getDate() - (29 - i));
                        return d.toISOString().split("T")[0];
                      });
                      const trendMap = new Map(platformHealth.trend.map(d => [d.date, d]));
                      const fullTrend = allDays.map(date => trendMap.get(date) || { date, leads: 0, contacted: 0, sold: 0 });
                      const maxLeads = Math.max(...fullTrend.map(d => d.leads), 1);
                      const hasAnyData = fullTrend.some(d => d.leads > 0);
                      return (
                        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-white">Lead Volume — Last 30 Days</h3>
                            <span className="text-sm text-gray-400">{fullTrend.reduce((s, d) => s + d.leads, 0)} leads total</span>
                          </div>
                          {hasAnyData ? (
                            <>
                              <div className="h-48 flex items-end gap-0.5">
                                {fullTrend.map(day => {
                                  const heightPct = (day.leads / maxLeads) * 100;
                                  const soldPct = (day.sold / maxLeads) * 100;
                                  const fmtDate = new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
                                  return (
                                    <div key={day.date} className="flex-1 flex flex-col justify-end" title={`${fmtDate}: ${day.leads} leads, ${day.sold} sold`}>
                                      {day.leads > 0 ? (
                                        <>
                                          <div className="w-full rounded-t-sm" style={{ height: `${soldPct}%`, minHeight: day.sold > 0 ? 8 : 0, backgroundColor: "#16a34a" }} />
                                          <div className="w-full" style={{ height: `${heightPct - soldPct}%`, minHeight: day.leads > 0 ? 8 : 0, backgroundColor: "#ef4444", opacity: 0.6 }} />
                                        </>
                                      ) : (
                                        <div className="w-full" style={{ height: "2px", backgroundColor: "#374151" }} />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="flex gap-0.5 mt-1">
                                {fullTrend.map((day, i) => (
                                  <div key={day.date} className="flex-1 text-center">
                                    {i % 5 === 0 ? (
                                      <span className="text-[10px] text-gray-500">
                                        {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                      </span>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="h-48 flex flex-col items-center justify-center text-gray-500 text-sm gap-2">
                              <span className="text-2xl">📊</span>
                              No lead activity in the last 30 days
                            </div>
                          )}
                          <div className="flex items-center gap-4 mt-3">
                            <span className="flex items-center gap-1 text-xs text-gray-400"><span className="w-3 h-3 rounded-sm bg-red-500/60 inline-block" /> Leads</span>
                            <span className="flex items-center gap-1 text-xs text-gray-400"><span className="w-3 h-3 rounded-sm bg-green-600 inline-block" /> Sold</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Per-Business Health Cards ───────────────────────────── */}
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-3">Business Health</h3>
                      <div className="space-y-3">
                        {platformHealth.businesses.length === 0 && (
                          <p className="text-gray-400 text-sm">No businesses yet.</p>
                        )}
                        {platformHealth.businesses.map(biz => {
                          const daysSinceLastLead = biz.last_lead_at
                            ? Math.floor((Date.now() - new Date(biz.last_lead_at).getTime()) / 86400000)
                            : 999;
                          const daysSinceChaser = biz.last_chaser_activity
                            ? Math.floor((Date.now() - new Date(biz.last_chaser_activity).getTime()) / 86400000)
                            : 999;

                          const isDisabled = !!biz.disabled_at || !biz.is_active;
                          const isHealthy = !isDisabled && daysSinceLastLead <= 7 && biz.leads_this_month > 0 && daysSinceChaser <= 7;
                          const isAtRisk = !isDisabled && !isHealthy && daysSinceLastLead <= 14;
                          const healthColor = isDisabled ? "#6b7280" : isHealthy ? "#16a34a" : isAtRisk ? "#ca8a04" : "#ef4444";
                          const healthLabel = isDisabled ? "Disabled" : isHealthy ? "Healthy" : isAtRisk ? "At Risk" : "Inactive";

                          const convRate = biz.total_leads > 0 ? Math.round(biz.sold / biz.total_leads * 100) : 0;

                          return (
                            <div key={biz.business_id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                              <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: healthColor }} />
                                    <span className="text-white font-semibold text-sm">{biz.business_name || biz.display_name || biz.email}</span>
                                    <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: healthColor + "33", color: healthColor }}>
                                      {healthLabel}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-400 mt-0.5">{biz.email}</p>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                                  <span><span className="text-white font-medium">{biz.leads_this_month}</span> leads this month</span>
                                  <span><span className="text-white font-medium">{convRate}%</span> conversion</span>
                                  <span><span className="text-white font-medium">{biz.active_chasers}</span> Lead Chasers active</span>
                                  <span>Last lead: <span className="text-white font-medium">{biz.last_lead_at ? `${daysSinceLastLead}d ago` : "never"}</span></span>
                                </div>
                              </div>

                              {biz.total_leads > 0 && (
                                <div className="mt-3 flex items-center gap-2">
                                  {[
                                    { label: "Leads", count: biz.total_leads, color: "#ef4444" },
                                    { label: "Contacted", count: biz.contacted, color: "#f97316" },
                                    { label: "Quoted", count: biz.quoted, color: "#ca8a04" },
                                    { label: "Sold", count: biz.sold, color: "#16a34a" },
                                    { label: "Dead", count: biz.dead, color: "#374151" },
                                  ].map((s, i) => (
                                    <div key={s.label} className="flex items-center gap-2">
                                      {i > 0 && <span className="text-gray-600 text-xs">&rarr;</span>}
                                      <div className="text-center">
                                        <div className="text-sm font-bold" style={{ color: s.color }}>{s.count}</div>
                                        <div className="text-[10px] text-gray-500">{s.label}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Per-Provider Activity ───────────────────────────── */}
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-3">Provider Activity</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-gray-400 border-b border-gray-700">
                              <th className="pb-2 pr-4">Provider</th>
                              <th className="pb-2 pr-4">This Week</th>
                              <th className="pb-2 pr-4">This Month</th>
                              <th className="pb-2 pr-4">All Time</th>
                              <th className="pb-2 pr-4">Gross</th>
                              <th className="pb-2 pr-4">Fees ($0.15 + 6.25%)</th>
                              <th className="pb-2 pr-4">Net Earnings</th>
                              <th className="pb-2 pr-4">Last Submission</th>
                              <th className="pb-2">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {platformHealth.providers.map(p => {
                              const daysSince = p.last_submission
                                ? Math.floor((Date.now() - new Date(p.last_submission).getTime()) / 86400000)
                                : 999;
                              const isDisabled = !!p.disabled_at || !p.is_active;
                              const activityColor = isDisabled ? "text-gray-500" : daysSince <= 3 ? "text-green-400" : daysSince <= 14 ? "text-yellow-400" : "text-red-400";
                              return (
                                <tr key={p.provider_id} className="border-b border-gray-700/50">
                                  <td className="py-2 pr-4">
                                    <div className="text-white font-medium">{p.display_name || p.email}</div>
                                    <div className="text-xs text-gray-500">{p.email}</div>
                                  </td>
                                  <td className="py-2 pr-4 text-white">{p.leads_this_week}</td>
                                  <td className="py-2 pr-4 text-white">{p.leads_this_month}</td>
                                  <td className="py-2 pr-4 text-white">{p.total_leads}</td>
                                  <td className="py-2 pr-4 text-gray-400">${Number(p.gross_earnings).toFixed(2)}</td>
                                  <td className="py-2 pr-4 text-red-400">-${Number(p.fees_paid).toFixed(2)}</td>
                                  <td className="py-2 pr-4 text-[#E8822A] font-semibold">${Number(p.net_earnings).toFixed(2)}</td>
                                  <td className={`py-2 pr-4 ${activityColor}`}>
                                    {p.last_submission ? `${daysSince}d ago` : "Never"}
                                  </td>
                                  <td className="py-2">
                                    {isDisabled ? (
                                      <span className="text-xs text-gray-400">{p.disabled_at ? "Self-disabled" : "Suspended"}</span>
                                    ) : (
                                      <span className="text-xs text-green-400">Active</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* ── 1099 Tracker ───────────────────────────── */}
                    {(() => {
                      const providers = detailedUsers.filter(u => u.role === "provider");
                      const flagged = providers.filter(u => u.yearlyEarnings >= 500);
                      if (flagged.length === 0) return null;
                      return (
                        <div className="bg-white/10 rounded-xl border border-white/10 overflow-hidden">
                          <div className="px-6 py-4 border-b border-white/10">
                            <h3 className="text-white font-semibold">1099 Tracker</h3>
                            <p className="text-gray-500 text-xs mt-1">
                              Providers at or approaching $600 in yearly earnings (requires Form 1099-NEC)
                            </p>
                          </div>
                          <table className="w-full">
                            <thead>
                              <tr className="text-gray-400 text-xs uppercase tracking-wider">
                                <th className="px-6 py-3 text-left">Provider</th>
                                <th className="px-6 py-3 text-left">Email</th>
                                <th className="px-6 py-3 text-right">Yearly Earnings</th>
                                <th className="px-6 py-3 text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {flagged.map((u) => (
                                <tr key={u.id} className="hover:bg-white/[0.02]">
                                  <td className="px-6 py-3 text-white text-sm">{u.displayName}</td>
                                  <td className="px-6 py-3 text-gray-300 text-sm">{u.email}</td>
                                  <td className="px-6 py-3 text-white text-sm text-right">
                                    ${Number(u.yearlyEarnings).toFixed(2)}
                                  </td>
                                  <td className="px-6 py-3 text-right">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                      u.needs1099
                                        ? "bg-red-500/20 text-red-400"
                                        : "bg-yellow-500/20 text-yellow-400"
                                    }`}>
                                      {u.needs1099 ? "1099 Required" : "Approaching"}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}

            {/* ===== PLATFORM TAB ===== */}
            {activeTab === "platform" && (
              <div className="space-y-6">
                {/* Stripe + Sinch Status */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white/10 rounded-xl border border-white/10 p-6">
                    <h3 className="text-white font-semibold mb-4">Stripe Connect</h3>
                    {stripeStatus ? (
                      <div className="space-y-3">
                        <StatusRow label="Charges" ok={stripeStatus.chargesEnabled} />
                        <StatusRow label="Payouts" ok={stripeStatus.payoutsEnabled} />
                        {stripeStatus.businessName && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Business</span>
                            <span className="text-white">{stripeStatus.businessName}</span>
                          </div>
                        )}
                        {stripeStatus.email && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Email</span>
                            <span className="text-gray-300">{stripeStatus.email}</span>
                          </div>
                        )}
                        <a
                          href="https://dashboard.stripe.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block mt-4 text-center text-sm text-[#E8822A] hover:text-[#D47526] transition"
                        >
                          Open Stripe Dashboard
                        </a>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">Unable to fetch Stripe status</p>
                    )}
                  </div>

                  <div className="bg-white/10 rounded-xl border border-white/10 p-6">
                    <h3 className="text-white font-semibold mb-4">Sinch SMS</h3>
                    {sinchStatus ? (
                      <div className="space-y-3">
                        <StatusRow label="Configured" ok={sinchStatus.configured} />
                        {sinchStatus.phoneNumber && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Phone</span>
                            <span className="text-white">{sinchStatus.phoneNumber}</span>
                          </div>
                        )}
                        <p className="text-gray-500 text-xs mt-2">
                          Toll-free or 10DLC verification required for production SMS delivery
                        </p>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">Unable to fetch Sinch status</p>
                    )}
                  </div>
                </div>

                {/* Fee Structure */}
                {platformFees && (
                  <div className="bg-white/10 rounded-xl border border-white/10 p-6">
                    <h3 className="text-white font-semibold mb-4">Fee Structure</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Type</div>
                        <div className="text-white font-medium capitalize">{platformFees.fee_type}</div>
                      </div>
                      {platformFees.fee_type === "flat" && (
                        <>
                          <div>
                            <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Total Fee</div>
                            <div className="text-white font-medium">${Number(platformFees.fee_total).toFixed(2)}/lead</div>
                          </div>
                          <div>
                            <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Split</div>
                            <div className="text-white font-medium">
                              Buyer: ${Number(platformFees.fee_buyer).toFixed(2)} / Provider: ${Number(platformFees.fee_provider).toFixed(2)}
                            </div>
                          </div>
                        </>
                      )}
                      {platformFees.fee_type === "percent" && (
                        <>
                          <div>
                            <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Rate</div>
                            <div className="text-white font-medium">{platformFees.fee_percent}%</div>
                          </div>
                          <div>
                            <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Buyer Share</div>
                            <div className="text-white font-medium">{platformFees.fee_percent_buyer_share}%</div>
                          </div>
                        </>
                      )}
                      {platformFees.fee_type === "mixed" && (
                        <>
                          <div>
                            <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Flat + %</div>
                            <div className="text-white font-medium">
                              ${Number(platformFees.fee_mixed_flat).toFixed(2)} + {platformFees.fee_mixed_percent}%
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Buyer Share</div>
                            <div className="text-white font-medium">{platformFees.fee_mixed_buyer_share}%</div>
                          </div>
                        </>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs mt-4">
                      To change fee structure, update directly in the database (platform_settings table)
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ===== HEALTH TAB ===== */}
            {activeTab === "health" && (
              <div className="space-y-6">
                {/* Header with refresh */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">System Health</h2>
                    <p className="text-gray-400 text-sm mt-1">
                      Real-time diagnostics for Stripe, database, webhooks, and data integrity
                    </p>
                  </div>
                  <button
                    onClick={fetchSystemHealth}
                    disabled={systemHealthLoading}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                  >
                    {systemHealthLoading ? "Scanning..." : "Re-scan"}
                  </button>
                </div>

                {/* Overall Status Banner */}
                {systemHealth && (
                  <div className={`p-4 rounded-xl border ${
                    systemHealth.status === "healthy"
                      ? "bg-green-500/10 border-green-500/30"
                      : systemHealth.status === "degraded"
                      ? "bg-yellow-500/10 border-yellow-500/30"
                      : "bg-red-500/10 border-red-500/30"
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full ${
                          systemHealth.status === "healthy"
                            ? "bg-green-400"
                            : systemHealth.status === "degraded"
                            ? "bg-yellow-400"
                            : "bg-red-400"
                        }`} />
                        <span className="text-white font-bold text-lg capitalize">{systemHealth.status}</span>
                      </div>
                      <div className="flex gap-4 text-sm">
                        <span className="text-green-400">{systemHealth.summary.pass} passed</span>
                        {systemHealth.summary.warn > 0 && (
                          <span className="text-yellow-400">{systemHealth.summary.warn} warnings</span>
                        )}
                        {systemHealth.summary.fail > 0 && (
                          <span className="text-red-400">{systemHealth.summary.fail} failures</span>
                        )}
                      </div>
                    </div>
                    <div className="text-gray-400 text-xs mt-2">
                      Last scan: {new Date(systemHealth.timestamp).toLocaleString()}
                    </div>
                  </div>
                )}

                {systemHealthLoading && !systemHealth && (
                  <div className="text-center py-16">
                    <div className="text-white/50 animate-pulse">Running health checks...</div>
                  </div>
                )}

                {systemHealthError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                    {systemHealthError}
                  </div>
                )}

                {/* Fix Results */}
                {fixResults.length > 0 && (
                  <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                    <div className="text-blue-400 font-medium mb-2">Fix Results</div>
                    {fixResults.map((r, i) => (
                      <div key={i} className="text-gray-300 text-sm">{r}</div>
                    ))}
                    <button
                      onClick={() => setFixResults([])}
                      className="text-blue-400 text-xs mt-2 hover:underline"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Auto-Fix Buttons */}
                {systemHealth && systemHealth.summary.fixable > 0 && (
                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                    <div className="text-white font-medium mb-3">Quick Fixes</div>
                    <div className="flex flex-wrap gap-2">
                      {systemHealth.checks.some(c => c.name === "Broken Stripe References" && c.status !== "pass") && (
                        <button
                          onClick={() => runFix("fix_broken_refs")}
                          disabled={fixLoading !== null}
                          className="px-3 py-1.5 bg-yellow-600/20 border border-yellow-600/40 text-yellow-400 rounded-lg text-xs font-medium hover:bg-yellow-600/30 transition disabled:opacity-50"
                        >
                          {fixLoading === "fix_broken_refs" ? "Fixing..." : "Fix Broken Stripe Refs"}
                        </button>
                      )}
                      {systemHealth.checks.some(c => c.name === "Stuck Processing Leads" && c.status !== "pass") && (
                        <button
                          onClick={() => runFix("fix_stuck_processing")}
                          disabled={fixLoading !== null}
                          className="px-3 py-1.5 bg-yellow-600/20 border border-yellow-600/40 text-yellow-400 rounded-lg text-xs font-medium hover:bg-yellow-600/30 transition disabled:opacity-50"
                        >
                          {fixLoading === "fix_stuck_processing" ? "Fixing..." : "Reset Stuck Leads"}
                        </button>
                      )}
                      {systemHealth.checks.some(c => c.name === "Webhook Processing" && c.status !== "pass") && (
                        <button
                          onClick={() => runFix("ensure_tables")}
                          disabled={fixLoading !== null}
                          className="px-3 py-1.5 bg-yellow-600/20 border border-yellow-600/40 text-yellow-400 rounded-lg text-xs font-medium hover:bg-yellow-600/30 transition disabled:opacity-50"
                        >
                          {fixLoading === "ensure_tables" ? "Creating..." : "Create Missing Tables"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Individual Checks */}
                {systemHealth && (
                  <div className="space-y-2">
                    {/* Failures first, then warnings, then passes */}
                    {[...systemHealth.checks]
                      .sort((a, b) => {
                        const order = { fail: 0, warn: 1, pass: 2 };
                        return order[a.status] - order[b.status];
                      })
                      .map((check, i) => (
                        <div
                          key={i}
                          className={`p-4 rounded-xl border ${
                            check.status === "pass"
                              ? "bg-white/5 border-white/10"
                              : check.status === "warn"
                              ? "bg-yellow-500/5 border-yellow-500/20"
                              : "bg-red-500/5 border-red-500/20"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1">
                              <div className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                check.status === "pass"
                                  ? "bg-green-400"
                                  : check.status === "warn"
                                  ? "bg-yellow-400"
                                  : "bg-red-400"
                              }`} />
                              <div className="flex-1">
                                <div className="text-white font-medium text-sm">{check.name}</div>
                                <div className="text-gray-400 text-sm mt-0.5">{check.message}</div>
                                {check.details && typeof check.details === "object" && !Array.isArray(check.details) && check.details.example && (
                                  <div className="text-gray-500 text-xs mt-1 font-mono">{check.details.example}</div>
                                )}
                                {check.details && Array.isArray(check.details) && check.details.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {check.details.slice(0, 5).map((d: any, j: number) => (
                                      <div key={j} className="text-gray-500 text-xs font-mono">
                                        {d.email || d.id || JSON.stringify(d)}
                                      </div>
                                    ))}
                                    {check.details.length > 5 && (
                                      <div className="text-gray-600 text-xs">+{check.details.length - 5} more</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded flex-shrink-0 ${
                              check.status === "pass"
                                ? "bg-green-500/20 text-green-400"
                                : check.status === "warn"
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-red-500/20 text-red-400"
                            }`}>
                              {check.status === "pass" ? "OK" : check.status === "warn" ? "WARN" : "FAIL"}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-24">
            <p className="text-gray-400">Failed to load data. Please try refreshing.</p>
          </div>
        )}
      </main>

      {/* ===== HARD DELETE CONFIRMATION MODAL ===== */}
      {hardDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a2d45] border border-red-500/30 rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-white text-lg font-bold mb-1">Permanently Delete Account?</h2>
            <p className="text-gray-400 text-sm mb-4">This cannot be undone.</p>

            <div className="bg-black/30 rounded-lg p-3 mb-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Email</span>
                <span className="text-white font-mono">{hardDeleteTarget.email}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Role</span>
                <span className="text-white capitalize">{hardDeleteTarget.role}</span>
              </div>
            </div>

            <p className="text-red-400 text-xs mb-4">
              ⚠️ Deletes all WOML records (leads, connections, invites) and their Stripe account/customer. No recovery possible.
            </p>

            {hardDeleteError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
                {hardDeleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setHardDeleteTarget(null); setHardDeleteError(""); }}
                disabled={hardDeleteLoading}
                className="flex-1 py-2.5 rounded-lg border border-white/20 text-gray-300 hover:bg-white/5 transition text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleHardDelete}
                disabled={hardDeleteLoading}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {hardDeleteLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Deleting…
                  </>
                ) : (
                  "Yes, Delete Permanently"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Helper Components ---

function MetricCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-white/10 p-5 rounded-xl border border-white/10">
      <div className="text-gray-400 text-sm mb-1">{label}</div>
      <div className={`text-3xl font-bold ${accent ? "text-[#E8822A]" : "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-500/20 text-green-400",
    processing: "bg-blue-500/20 text-blue-400",
    pending: "bg-yellow-500/20 text-yellow-400",
    failed: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${styles[status] || "bg-gray-500/20 text-gray-400"}`}>
      {status}
    </span>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-400">{label}</span>
      <span className={`font-medium ${ok ? "text-green-400" : "text-red-400"}`}>
        {ok ? "Enabled" : "Disabled"}
      </span>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
