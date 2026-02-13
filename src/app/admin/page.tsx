"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import ProfitabilityTab from "./components/ProfitabilityTab";
import PaymentsTab from "./components/PaymentsTab";
import InfoTab from "./components/InfoTab";

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

interface PendingPayoutGroup {
  providerId: string;
  providerName: string;
  providerVenmo: string | null;
  providerPayoutMethod: string | null;
  leads: {
    id: string;
    buyerName: string;
    vehicleInfo: string | null;
    providerNet: number;
    submittedAt: string;
  }[];
  totalNet: number;
}

interface AdminUser {
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
  payoutMethod: string | null;
  payoutVenmo: string | null;
  totalLeads: number;
  totalVolume: number;
}

interface OperatingCost {
  id: string;
  name: string;
  amount: number;
  frequency: "monthly" | "yearly" | "per_transaction";
  category: string;
  description: string | null;
}

interface ProfitabilityData {
  weekly: { completedRevenue: number; pendingRevenue: number; completedTxCount: number };
  monthly: { completedRevenue: number; pendingRevenue: number; completedTxCount: number };
  yearly: { completedRevenue: number; pendingRevenue: number; completedTxCount: number };
  venmoFees: number;
  venmoTxCount: number;
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
  payoutMethod: string | null;
  payoutVenmo: string | null;
  totalLeads: number;
  totalVolume: number;
  lastLeadAt: string | null;
  platformFeesEarned: number;
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

export default function AdminPanel() {
  const { currentUser, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"profitability" | "info" | "payments">("payments");

  // Inline login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail.trim().toLowerCase(),
          password: loginPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = "/admin";
      } else {
        setLoginError(data.error || "Invalid credentials");
        setLoginLoading(false);
      }
    } catch {
      setLoginError("Login failed. Please try again.");
      setLoginLoading(false);
    }
  };

  // Data state
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [revenueByDay, setRevenueByDay] = useState<RevenueDay[]>([]);
  const [recentLeads, setRecentLeads] = useState<AdminLead[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<PendingPayoutGroup[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState("");

  // Fee settings state
  const [platformFees, setPlatformFees] = useState<PlatformFees | null>(null);

  // New tab data state
  const [operatingCosts, setOperatingCosts] = useState<OperatingCost[]>([]);
  const [profitability, setProfitability] = useState<ProfitabilityData | null>(null);
  const [detailedUsers, setDetailedUsers] = useState<DetailedUser[]>([]);

  // Fetch data when authenticated as admin
  useEffect(() => {
    if (!isAuthenticated || !currentUser || currentUser.role !== "admin") return;
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const res = await fetch("/api/admin/stats");
        const data = await res.json();
        if (data.success) {
          setStats(data.stats);
          setRevenueByDay(data.revenueByDay);
          setRecentLeads(data.recentLeads);
          setPendingPayouts(data.pendingPayouts || []);
          setUsers(data.users || []);
          if (data.platformFees) {
            setPlatformFees(data.platformFees);
          }
          if (data.operatingCosts) setOperatingCosts(data.operatingCosts);
          if (data.profitability) setProfitability(data.profitability);
          if (data.detailedUsers) setDetailedUsers(data.detailedUsers);
        } else {
          setError(data.error || "Failed to load stats");
        }
      } catch (e) {
        console.error("Failed to fetch admin stats:", e);
        setError("Failed to load stats");
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [isAuthenticated, currentUser]);

  const refreshData = async () => {
    try {
      const res = await fetch("/api/admin/stats");
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setRevenueByDay(data.revenueByDay);
        setRecentLeads(data.recentLeads);
        setPendingPayouts(data.pendingPayouts || []);
        setUsers(data.users || []);
        if (data.platformFees) {
          setPlatformFees(data.platformFees);
        }
        if (data.operatingCosts) setOperatingCosts(data.operatingCosts);
        if (data.profitability) setProfitability(data.profitability);
        if (data.detailedUsers) setDetailedUsers(data.detailedUsers);
      }
    } catch (e) {
      console.error("Refresh failed:", e);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C5B358]"></div>
      </div>
    );
  }

  if (!isAuthenticated || !currentUser || currentUser.role !== "admin") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center p-4">
        <div className="bg-gray-900 p-8 rounded-2xl max-w-md w-full border border-gray-800">
          <div className="text-center mb-6">
            <Image src="/woml-logo.png" alt="WOML" width={200} height={60} className="mx-auto mb-4 h-14 w-auto object-contain" />
            <h1 className="text-2xl font-bold text-white mb-1">WOML Admin Portal</h1>
            <p className="text-gray-400 text-sm">Sign in to access the owner dashboard</p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {loginError}
            </div>
          )}

          <form onSubmit={handleAdminLogin} autoComplete="off" className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-1.5">Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="womleads@outlook.com"
                required
                disabled={loginLoading}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#C5B358]/40 focus:border-[#C5B358] transition disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1.5">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter admin password"
                required
                disabled={loginLoading}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#C5B358]/40 focus:border-[#C5B358] transition disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 bg-[#C5B358] hover:bg-[#b8a64e] text-black rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
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

          <Link href="/" className="block text-gray-500 hover:text-[#C5B358] mt-6 text-sm text-center transition">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/woml-logo.png" alt="WOML" width={120} height={36} className="h-9 w-auto object-contain" />
          </Link>
          <div>
            <h1 className="text-white font-bold text-lg">WOML Owner Portal</h1>
            <p className="text-gray-400 text-xs">{currentUser.email}</p>
          </div>
        </div>
        <button
          onClick={async () => { await logout(); window.location.href = "/auth/login"; }}
          className="text-gray-400 hover:text-[#C5B358] transition text-sm"
        >
          Sign Out
        </button>
      </nav>

      <main className="max-w-7xl mx-auto px-8 py-8">
        {statsLoading ? (
          <div className="flex justify-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#C5B358]"></div>
          </div>
        ) : error ? (
          <div className="text-center py-24">
            <p className="text-red-400 mb-4">{error}</p>
            <button onClick={refreshData} className="text-[#C5B358] hover:text-[#d4c462] underline">
              Try Again
            </button>
          </div>
        ) : stats ? (
          <>
            {/* Top Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                <div className="text-gray-400 text-sm mb-1">WOML Revenue</div>
                <div className="text-3xl font-bold text-[#C5B358]">${stats.completedRevenue.toFixed(2)}</div>
                <div className="text-gray-500 text-xs mt-1">collected fees</div>
              </div>
              <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                <div className="text-gray-400 text-sm mb-1">Awaiting Forward</div>
                <div className="text-3xl font-bold text-blue-400">{stats.processingLeads}</div>
                <div className="text-gray-500 text-xs mt-1">leads to forward</div>
              </div>
              <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                <div className="text-gray-400 text-sm mb-1">Total Leads</div>
                <div className="text-3xl font-bold text-white">{stats.totalLeads}</div>
                <div className="text-gray-500 text-xs mt-1">{stats.paidLeads} completed</div>
              </div>
              <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                <div className="text-gray-400 text-sm mb-1">Lead Volume</div>
                <div className="text-3xl font-bold text-purple-400">${stats.totalLeadVolume.toFixed(2)}</div>
                <div className="text-gray-500 text-xs mt-1">total transacted</div>
              </div>
            </div>

            {/* Marketplace Health */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800 flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.activeProviders}</div>
                  <div className="text-gray-400 text-sm">Providers</div>
                </div>
              </div>
              <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800 flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.activeBuyers}</div>
                  <div className="text-gray-400 text-sm">Businesses</div>
                </div>
              </div>
              <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800 flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-[#C5B358]/20 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-[#C5B358]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.activeConnections}</div>
                  <div className="text-gray-400 text-sm">Connections</div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {(["payments", "profitability", "info"] as const).map((tab) => {
                const labels: Record<string, string> = {
                  payments: "Payments", profitability: "Profitability",
                  info: "Users",
                };
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-lg font-medium transition relative ${
                      activeTab === tab
                        ? "bg-[#C5B358] text-black"
                        : "bg-gray-800 text-gray-400 hover:text-white"
                    }`}
                  >
                    {labels[tab]}
                    {tab === "payments" && pendingPayouts.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
                        {pendingPayouts.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ===== PROFITABILITY TAB ===== */}
            {activeTab === "profitability" && profitability && (
              <ProfitabilityTab
                operatingCosts={operatingCosts}
                profitability={profitability}
                onCostsChanged={refreshData}
                revenueByDay={revenueByDay}
                feeLabel={platformFees?.fee_type === "flat" ? `$${(platformFees?.fee_total ?? 2).toFixed(2)}/lead` : platformFees?.fee_type === "percent" ? `${platformFees.fee_percent}%` : ""}
              />
            )}

            {/* ===== PAYMENTS TAB ===== */}
            {activeTab === "payments" && platformFees && (
              <PaymentsTab
                platformFees={platformFees}
                onFeesSaved={(fees) => {
                  setPlatformFees(fees);
                  refreshData();
                }}
                pendingPayouts={pendingPayouts}
                completedRevenue={stats.completedRevenue}
                pendingRevenue={stats.pendingRevenue}
                onPayoutForwarded={refreshData}
              />
            )}

            {/* ===== INFO TAB ===== */}
            {activeTab === "info" && (
              <InfoTab
                detailedUsers={detailedUsers}
                recentLeads={recentLeads}
                onToggleUser={async (userId, isActive) => {
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
                      setUsers(prev => prev.map(u =>
                        u.id === userId ? { ...u, isActive } : u
                      ));
                    }
                  } catch (e) {
                    console.error("Toggle failed:", e);
                  }
                }}
              />
            )}
          </>
        ) : (
          <div className="text-center py-24">
            <p className="text-gray-400">Failed to load stats. Please try refreshing.</p>
          </div>
        )}
      </main>
    </div>
  );
}

// Provider Payout Group Component
