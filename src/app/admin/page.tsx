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

type Tab = "overview" | "users" | "platform";

export default function AdminPanel() {
  const { currentUser, isLoading: authLoading, isAuthenticated, login, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

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

  // --- Loading ---
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0d1b2e] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8822A]"></div>
      </div>
    );
  }

  // --- Login Screen ---
  if (!isAuthenticated || !currentUser || currentUser.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#0d1b2e] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl max-w-md w-full border border-gray-200">
          <div className="text-center mb-6">
            <Image src="/woml-navy.png" alt="WOML" width={800} height={240} className="mx-auto mb-4 h-56 w-auto object-contain" />
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
    <div className="min-h-screen bg-[#0d1b2e]">
      <nav className="flex items-center justify-between px-8 py-6 border-b border-white/10">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/woml-navy.png" alt="WOML" width={160} height={48} className="h-12 w-auto object-contain" />
          </Link>
          <div>
            <h1 className="text-white font-bold text-lg">Admin Portal</h1>
            <p className="text-gray-500 text-xs">{currentUser.email}</p>
          </div>
        </div>
        <button
          onClick={async () => { await logout(); window.location.href = "/auth/login"; }}
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
              {(["overview", "users", "platform"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-lg font-medium transition capitalize ${
                    activeTab === tab
                      ? "bg-[#E8822A] text-white"
                      : "bg-white/5 text-gray-400 hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* ===== OVERVIEW TAB ===== */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <MetricCard label="Total Leads" value={stats.totalLeads} />
                  <MetricCard label="This Month" value={leadsThisMonth} />
                  <MetricCard label="Revenue" value={`$${stats.completedRevenue.toFixed(2)}`} accent />
                  <MetricCard label="Active Providers" value={stats.activeProviders} />
                  <MetricCard label="Active Businesses" value={stats.activeBuyers} />
                </div>

                <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
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
                              ${lead.payoutAmount.toFixed(2)}
                            </td>
                            <td className="px-6 py-3 text-[#E8822A] text-sm text-right">
                              ${lead.platformFee.toFixed(2)}
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
              </div>
            )}

            {/* ===== USERS TAB ===== */}
            {activeTab === "users" && (
              <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
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
                          <th className="px-6 py-3 text-left">Email</th>
                          <th className="px-6 py-3 text-left">Role</th>
                          <th className="px-6 py-3 text-left">Joined</th>
                          <th className="px-6 py-3 text-right">Leads</th>
                          <th className="px-6 py-3 text-right">Volume</th>
                          <th className="px-6 py-3 text-left">Last Active</th>
                          <th className="px-6 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {detailedUsers.map((user) => (
                          <tr key={user.id} className="hover:bg-white/[0.02]">
                            <td className="px-6 py-3 text-white text-sm">
                              {user.displayName}
                              {user.businessName && (
                                <span className="text-gray-500 text-xs block">{user.businessName}</span>
                              )}
                            </td>
                            <td className="px-6 py-3 text-gray-300 text-sm">{user.email}</td>
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
                            <td className="px-6 py-3 text-gray-400 text-sm">
                              {new Date(user.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-3 text-white text-sm text-right">{user.totalLeads}</td>
                            <td className="px-6 py-3 text-white text-sm text-right">
                              ${user.totalVolume.toFixed(2)}
                            </td>
                            <td className="px-6 py-3 text-gray-400 text-sm">
                              {user.lastLeadAt
                                ? timeAgo(user.lastLeadAt)
                                : "Never"}
                            </td>
                            <td className="px-6 py-3 text-center">
                              {user.role !== "admin" && (
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

            {/* ===== PLATFORM TAB ===== */}
            {activeTab === "platform" && (
              <div className="space-y-6">
                {/* Stripe + Twilio Status */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white/5 rounded-xl border border-white/10 p-6">
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

                  <div className="bg-white/5 rounded-xl border border-white/10 p-6">
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
                  <div className="bg-white/5 rounded-xl border border-white/10 p-6">
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
                            <div className="text-white font-medium">${platformFees.fee_total.toFixed(2)}/lead</div>
                          </div>
                          <div>
                            <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Split</div>
                            <div className="text-white font-medium">
                              Buyer: ${platformFees.fee_buyer.toFixed(2)} / Provider: ${platformFees.fee_provider.toFixed(2)}
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
                              ${platformFees.fee_mixed_flat.toFixed(2)} + {platformFees.fee_mixed_percent}%
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

                {/* 1099 Tracker */}
                {(() => {
                  const providers = detailedUsers.filter(u => u.role === "provider");
                  const flagged = providers.filter(u => u.yearlyEarnings >= 500);
                  if (flagged.length === 0) return (
                    <div className="bg-white/5 rounded-xl border border-white/10 p-6">
                      <h3 className="text-white font-semibold mb-2">1099 Tracker</h3>
                      <p className="text-gray-500 text-sm">No providers approaching the $600 threshold this year</p>
                    </div>
                  );
                  return (
                    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
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
                                ${u.yearlyEarnings.toFixed(2)}
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
          </>
        ) : (
          <div className="text-center py-24">
            <p className="text-gray-400">Failed to load data. Please try refreshing.</p>
          </div>
        )}
      </main>
    </div>
  );
}

// --- Helper Components ---

function MetricCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-white/5 p-5 rounded-xl border border-white/10">
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
