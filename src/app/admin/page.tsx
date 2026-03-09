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

interface TwilioStatus {
  configured: boolean;
  phoneNumber: string | null;
}

interface StripeStatus {
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  businessName: string | null;
  email: string | null;
}

type Tab = "users" | "data" | "platform";

interface HardDeleteTarget {
  id: string;
  email: string;
  role: string;
}

export default function AdminPanel() {
  const { currentUser, isLoading: authLoading, isAuthenticated, login, logout } = useAuth();
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
  const [twilioStatus, setTwilioStatus] = useState<TwilioStatus | null>(null);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState("");

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
          setTwilioStatus(statsData.twilioStatus || null);
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
        setTwilioStatus(data.twilioStatus || null);
      }
    } catch (e) {
      console.error("Refresh failed:", e);
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

  // --- Loading ---
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#152238] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8822A]"></div>
      </div>
    );
  }

  // --- Login Screen ---
  if (!isAuthenticated || !currentUser || currentUser.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#152238] flex items-center justify-center p-4">
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
    <div className="min-h-screen bg-[#152238]">
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
          onClick={async () => { await logout(); window.location.href = "/"; }}
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
              {(["users", "data", "platform"] as const).map((tab) => (
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
                            <td className="px-6 py-3 text-center">
                              {user.role !== "admin" && (
                                <div className="flex items-center justify-center gap-2">
                                  {user.disabledAt ? (
                                    <>
                                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-500/20 text-gray-400">
                                        Disabled
                                      </span>
                                      <button
                                        onClick={() => handleEnableAccount(user.id)}
                                        className="text-xs font-medium px-3 py-1 rounded transition bg-green-500/10 text-green-400 hover:bg-green-500/20"
                                      >
                                        Re-enable
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                        user.isActive
                                          ? "bg-green-500/20 text-green-400"
                                          : "bg-red-500/20 text-red-400"
                                      }`}>
                                        {user.isActive ? "Active" : "Suspended"}
                                      </span>
                                      <button
                                        onClick={() => handleToggleUser(user.id, !user.isActive)}
                                        className={`text-xs font-medium px-3 py-1 rounded transition ${
                                          user.isActive
                                            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                            : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                                        }`}
                                      >
                                        {user.isActive ? "Suspend" : "Reactivate"}
                                      </button>
                                    </>
                                  )}
                                  {/* Hard Delete — permanent, admin-only pre-launch cleanup */}
                                  <button
                                    onClick={() => {
                                      setHardDeleteError("");
                                      setHardDeleteTarget({ id: user.id, email: user.email, role: user.role });
                                    }}
                                    className="text-xs font-medium px-3 py-1 rounded transition border border-red-600/40 text-red-500 hover:bg-red-600/10"
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
            )}

            {/* ===== DATA TAB ===== */}
            {activeTab === "data" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <MetricCard label="Total Leads" value={stats.totalLeads} />
                  <MetricCard label="This Month" value={leadsThisMonth} />
                  <MetricCard label="Revenue" value={`$${Number(stats.completedRevenue).toFixed(2)}`} accent />
                  <MetricCard label="Active Providers" value={stats.activeProviders} />
                  <MetricCard label="Active Businesses" value={stats.activeBuyers} />
                </div>

                <div className="bg-white/10 rounded-xl border border-white/10 overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/10">
                    <h3 className="text-white font-semibold">Recent Leads</h3>
                  </div>
                  {recentLeads.length === 0 ? (
                    <div className="px-6 py-8 text-center text-gray-500">No leads yet</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="text-gray-400 text-xs uppercase tracking-wider">
                          <th className="px-6 py-3 text-left">Date</th>
                          <th className="px-6 py-3 text-left">Provider</th>
                          <th className="px-6 py-3 text-left">Business</th>
                          <th className="px-6 py-3 text-right">Amount</th>
                          <th className="px-6 py-3 text-right">Fee</th>
                          <th className="px-6 py-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {recentLeads.map((lead) => (
                          <tr key={lead.id} className="hover:bg-white/[0.02]">
                            <td className="px-6 py-3 text-gray-300 text-sm">
                              {new Date(lead.submittedAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-3 text-white text-sm">{lead.providerName}</td>
                            <td className="px-6 py-3 text-white text-sm">{lead.buyerName}</td>
                            <td className="px-6 py-3 text-white text-sm text-right">
                              ${Number(lead.payoutAmount).toFixed(2)}
                            </td>
                            <td className="px-6 py-3 text-[#E8822A] text-sm text-right">
                              ${Number(lead.platformFee).toFixed(2)}
                            </td>
                            <td className="px-6 py-3 text-right">
                              <StatusBadge status={lead.payoutStatus} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* 1099 Tracker — only renders if flagged providers exist */}
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
              </div>
            )}

            {/* ===== PLATFORM TAB ===== */}
            {activeTab === "platform" && (
              <div className="space-y-6">
                {/* Stripe + Twilio Status */}
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
                    <h3 className="text-white font-semibold mb-4">Twilio SMS</h3>
                    {twilioStatus ? (
                      <div className="space-y-3">
                        <StatusRow label="Configured" ok={twilioStatus.configured} />
                        {twilioStatus.phoneNumber && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Phone</span>
                            <span className="text-white">{twilioStatus.phoneNumber}</span>
                          </div>
                        )}
                        <p className="text-gray-500 text-xs mt-2">
                          Toll-free verification required for production SMS delivery
                        </p>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">Unable to fetch Twilio status</p>
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
