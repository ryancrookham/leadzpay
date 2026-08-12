"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useAuth, useCurrentProvider } from "@/lib/auth-context";

// Type for leads returned by GET /api/leads
interface ApiLead {
  id: string;
  providerId: string;
  buyerId: string;
  connectionId: string;
  status: string;
  customerName: string;
  customerState: string | null;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  payoutAmount: number;
  payoutStatus: "pending" | "approved" | "processing" | "completed" | "failed" | "rejected";
  payoutCompletedAt: string | null;
  submittedAt: string;
  providerName: string | null;
  buyerName: string | null;
  buyerBusinessName: string | null;
  rejectionReason?: string | null;
}
import { useConnections, type ApiConnection } from "@/lib/connection-context";
import { isProvider } from "@/lib/auth-types";
import { formatPaymentTiming, type PaymentTiming } from "@/lib/connection-types";
import { calculateFeeBreakdown, type FeeSettings } from "@/lib/platform-fees";

// Lead form data interface (basic info for simple lead submission)
interface LeadFormData {
  customerName: string;
  email: string;
  phone: string;
  notes: string;
}

// Form step type for lead submission
type FormStep = "form" | "success" | "duplicate";

type Tab = "dashboard" | "connection" | "leads" | "earnings" | "profile";

// Error boundary to catch tab rendering errors and show message instead of white screen
class TabErrorBoundary extends React.Component<
  { children: React.ReactNode; tabName: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; tabName: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error) {
    console.error(`[${this.props.tabName}] Tab crash:`, error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <p className="text-red-600 font-medium mb-2">Something went wrong loading this tab.</p>
          <p className="text-red-400 text-sm mb-4">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Helper function to check lead caps for ApiConnection
function checkLeadCaps(connection: ApiConnection): {
  weeklyCapReached: boolean;
  monthlyCapReached: boolean;
  canSubmitLead: boolean;
  message?: string;
} {
  // With the new API structure, we track total_leads but not per-period counts yet
  // For now, allow submissions - cap enforcement can be added later with proper tracking
  return {
    weeklyCapReached: false,
    monthlyCapReached: false,
    canSubmitLead: true,
  };
}

export default function ProviderDashboard() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const { currentUser, isAuthenticated, isLoading, isSigningOut, logout, updateUser } = useAuth();
  const currentProvider = useCurrentProvider();
  // Fetch leads from database API (not localStorage)
  const [dbLeads, setDbLeads] = useState<ApiLead[]>([]);
  const [dbLeadsLoading, setDbLeadsLoading] = useState(true);

  // "Who do you represent?" backfill for pre-existing providers who signed up
  // before the required signup field existed. Hidden banner until we know
  // whether their profile is missing business_name.
  const [needsBusinessName, setNeedsBusinessName] = useState(false);
  const [businessNameInput, setBusinessNameInput] = useState("");
  const [savingBusinessName, setSavingBusinessName] = useState(false);
  const [businessNameError, setBusinessNameError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.profile) return;
        if (!data.profile.businessName || String(data.profile.businessName).trim() === "") {
          setNeedsBusinessName(true);
        }
      })
      .catch(() => { /* non-blocking */ });
    return () => { cancelled = true; };
  }, []);

  async function saveBusinessName() {
    const val = businessNameInput.trim();
    if (!val) { setBusinessNameError("Please enter who you represent."); return; }
    setSavingBusinessName(true);
    setBusinessNameError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: val }),
      });
      if (!res.ok) throw new Error("Save failed");
      setNeedsBusinessName(false);
    } catch (err) {
      setBusinessNameError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingBusinessName(false);
    }
  }

  // Platform fee settings (fetched from API)
  const [feeSettings, setFeeSettings] = useState<FeeSettings | undefined>(undefined);

  const {
    getRequestsForProvider,
    getInvitationsForProvider,
    getActiveConnectionForProvider,
    getActiveConnectionsForProvider,
    sendConnectionRequest,
    acceptTerms,
    declineTerms,
    updateConnectionStats,
    fetchUsersByRole,
    refreshConnections,
  } = useConnections();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  // Track whether we've given the session enough time to hydrate after a fresh sign-in.
  // After a redirect from signup, the JWT cookie exists but useSession() may still
  // report "loading" or "unauthenticated" for a brief moment. We verify against the
  // server session endpoint before kicking the user back to login.
  const [sessionVerified, setSessionVerified] = useState(false);
  const sessionCheckRef = useRef(false);

  useEffect(() => {
    if (isSigningOut) return;
    if (isLoading) return; // still loading — wait
    if (isAuthenticated && currentUser) {
      setSessionVerified(true);
      return;
    }
    // Not authenticated according to client — but the cookie may just not be hydrated yet.
    // Check the server session endpoint once before giving up.
    if (sessionCheckRef.current) return; // already checking
    sessionCheckRef.current = true;

    const verifySession = async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const data = await res.json();
        if (data?.user?.role) {
          // Session exists on the server — force a full page reload so useSession picks it up
          window.location.reload();
          return;
        }
      } catch {
        // Server check failed — fall through to redirect
      }
      // Truly not authenticated — redirect to login
      router.push("/auth/login?role=provider");
    };
    verifySession();
  }, [isLoading, isAuthenticated, isSigningOut, currentUser, router]);

  // Redirect to login if not authenticated or not a provider.
  // Guard: skip entirely while signing out — NextAuth's callbackUrl redirect wins.
  useEffect(() => {
    if (isSigningOut) return;
    if (!isLoading && isAuthenticated && currentUser && !isProvider(currentUser)) {
      router.push("/business");
    } else if (!isLoading && currentUser && isProvider(currentUser) && session?.user?.onboardingComplete === false) {
      // Session may be stale — verify against DB before bouncing provider back to onboarding
      fetch("/api/provider-onboarding")
        .then(r => r.json())
        .then(async data => {
          if (data.complete) {
            // DB says complete but session is stale — refresh JWT and stay on dashboard
            await update();
          } else {
            router.push("/provider-onboarding");
          }
        })
        .catch(() => {
          // If API fails, fall back to session value
          router.push("/provider-onboarding");
        });
    }
  }, [isLoading, isAuthenticated, isSigningOut, currentUser, router, session, update]);

  // Fetch leads from database API
  useEffect(() => {
    if (!currentUser) return;
    const fetchLeads = async () => {
      try {
        const res = await fetch("/api/leads", { cache: "no-store" });
        const data = await res.json();
        if (data.success) {
          setDbLeads(data.leads);
        }
      } catch (err) {
        console.error("Failed to fetch leads:", err);
      } finally {
        setDbLeadsLoading(false);
      }
    };
    fetchLeads();
    // Fetch platform fee settings
    fetch("/api/platform-fees").then(r => r.json()).then(d => {
      if (d.success) setFeeSettings(d.settings);
    }).catch(() => {});
  }, [currentUser]);

  const handleLogout = () => logout();

  // Redirect admin users to their own dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated && currentUser && currentUser.role === "admin") {
      router.replace("/admin");
    }
  }, [isLoading, isAuthenticated, currentUser, router]);

  // Show branded loading state during auth check
  if (isLoading || !isAuthenticated || !currentUser || !isProvider(currentUser)) {
    return (
      <div className="min-h-screen bg-[#212121] flex items-center justify-center">
        <div className="text-center">
          <Image src="/woml-alt-white.png" alt="WOML" width={200} height={60} className="mx-auto mb-4" priority />
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
        </div>
      </div>
    );
  }

  // Get connection status
  const activeConnection = getActiveConnectionForProvider(currentUser.id);
  const activeConnections = getActiveConnectionsForProvider(currentUser.id);
  const myRequests = getRequestsForProvider(currentUser.id);
  // Also get invitations from businesses (requests where provider email matches and terms are already set)
  const myInvitations = getInvitationsForProvider(currentUser.email);
  const pendingTermsRequest = myRequests.find(r => r.status === "pending_provider_accept");
  const pendingRequest = myRequests.find(r => r.status === "pending_buyer_review");
  // Business invitations are also terms_set status but initiated by the business
  const pendingInvitation = myInvitations.length > 0 ? myInvitations[0] : null;

  // Calculate stats from DB leads (net amounts after platform fee)
  const totalLeads = dbLeads.length;
  const paidLeads = dbLeads.filter(l => l.payoutStatus === "completed").length;
  const totalEarnings = dbLeads.filter(l => l.payoutStatus !== "rejected").reduce((sum, l) => sum + calculateFeeBreakdown(l.payoutAmount || 0, feeSettings).providerNet, 0);
  const pendingEarnings = dbLeads.filter(l => l.payoutStatus === "pending" || l.payoutStatus === "processing").reduce((sum, l) => sum + calculateFeeBreakdown(l.payoutAmount || 0, feeSettings).providerNet, 0);
  const providerFeeDisplay = feeSettings ? calculateFeeBreakdown(activeConnection?.rate_per_lead || 50, feeSettings).providerFee : 1;

  // Determine connection status message
  const getConnectionStatus = () => {
    if (activeConnection) return { status: "active", message: "Connected" };
    if (pendingTermsRequest) return { status: "terms_pending", message: "Terms Pending Review" };
    if (pendingInvitation) return { status: "invitation", message: "New Invitation" };
    if (pendingRequest) return { status: "pending", message: "Awaiting Approval" };
    return { status: "none", message: "Not Connected" };
  };

  const connectionStatus = getConnectionStatus();

  return (
    <div className="min-h-screen bg-[#f8f9fc] relative">

      {/* Header */}
      <header className="relative z-10 bg-[#212121] border-b border-white/10 px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center">
              <Image
                src="/woml-alt-white.png"
                alt="WOML - Word of Mouth Leads"
                width={140}
                height={42}
                className="h-10 w-auto object-contain"
              />
            </Link>
            <span className="text-white/30">|</span>
            <span className="text-white font-medium">Provider Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${
                connectionStatus.status === "active" ? "bg-emerald-500" :
                connectionStatus.status === "terms_pending" ? "bg-amber-500" :
                connectionStatus.status === "pending" ? "bg-orange-500" : "bg-gray-400"
              }`} />
              <span className="text-sm text-white/70">{connectionStatus.message}</span>
            </div>
            <span className="text-white/30">|</span>
            <span className="text-white/90">{currentProvider?.displayName}</span>
            <button
              onClick={handleLogout}
              className="text-white/70 hover:text-white transition flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 max-w-7xl mx-auto px-8 py-8">

        {/* Complete-your-profile banner: only if business_name is missing */}
        {needsBusinessName && (
          <div className="mb-6 bg-amber-50 border border-amber-300 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-3">
              <svg className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-sm font-bold text-amber-900">Complete your profile</h3>
                <p className="text-xs text-amber-800 mt-0.5">Tell us who you represent so every lead you submit is attributed correctly. This appears on the business&apos;s tracker for each lead.</p>
              </div>
            </div>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <input
                  type="text"
                  value={businessNameInput}
                  onChange={(e) => setBusinessNameInput(e.target.value)}
                  placeholder="e.g., ABC Motors, Bristol Auto Tags, Smith Insurance Referrals"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-500"
                />
                {businessNameError && <p className="text-xs text-red-700 mt-1">{businessNameError}</p>}
              </div>
              <button
                onClick={saveBusinessName}
                disabled={savingBusinessName || !businessNameInput.trim()}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg shrink-0"
              >
                {savingBusinessName ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* Connection Required Banner */}
        {!activeConnection && (
          <div className={`mb-6 p-4 rounded-xl border ${
            pendingTermsRequest
              ? "bg-amber-50 border-amber-200"
              : pendingRequest
              ? "bg-orange-50 border-orange-200"
              : "bg-gray-50 border-gray-200"
          }`}>
            <div className="flex items-center gap-3">
              {pendingTermsRequest ? (
                <>
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-amber-800">Terms Ready for Review</p>
                    <p className="text-amber-600 text-sm">{pendingTermsRequest.buyerBusinessName} has set terms for your connection. Review and accept to start submitting leads.</p>
                  </div>
                  <button
                    onClick={() => setActiveTab("connection")}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition"
                  >
                    Review Terms
                  </button>
                </>
              ) : pendingRequest ? (
                <>
                  <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-orange-800">Connection Request Pending</p>
                    <p className="text-orange-600 text-sm">Waiting for {pendingRequest.buyerBusinessName} to review your request and set terms.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">No Active Connection</p>
                    <p className="text-gray-600 text-sm">Connect with a business to start submitting leads and earning money.</p>
                  </div>
                  <button
                    onClick={() => setActiveTab("connection")}
                    className="bg-[#E8822A] hover:bg-[#D47526] text-white px-4 py-2 rounded-lg font-medium transition"
                  >
                    Find a Business
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto">
          {(["dashboard", "connection", "leads", "earnings", "profile"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-lg font-medium transition whitespace-nowrap ${
                activeTab === tab
                  ? "bg-[#E77500] text-white shadow-md"
                  : "text-[#212121]/55 hover:text-[#212121] hover:bg-[#212121]/8"
              }`}
            >
              {tab === "connection" ? "Connection" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === "connection" && pendingTermsRequest && (
                <span className="ml-2 px-2 py-0.5 bg-amber-500 text-white text-xs rounded-full">!</span>
              )}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <TabErrorBoundary tabName="Dashboard">
            <DashboardTab
              activeConnection={activeConnection}
              dbLeads={dbLeads}
              totalLeads={totalLeads}
              paidLeads={paidLeads}
              totalEarnings={totalEarnings}
              pendingEarnings={pendingEarnings}
              onNavigateToConnection={() => setActiveTab("connection")}
              feeSettings={feeSettings}
              providerFeeDisplay={providerFeeDisplay}
            />
          </TabErrorBoundary>
        )}

        {/* Connection Tab */}
        {activeTab === "connection" && (
          <TabErrorBoundary tabName="Connection">
            <ConnectionTab
              currentUser={currentUser}
              currentProvider={currentProvider}
              activeConnection={activeConnection}
              activeConnections={activeConnections}
              pendingTermsRequest={pendingTermsRequest}
              pendingInvitation={pendingInvitation}
              pendingRequest={pendingRequest}
              myRequests={myRequests}
              fetchUsersByRole={fetchUsersByRole}
              sendConnectionRequest={sendConnectionRequest}
              acceptTerms={acceptTerms}
              declineTerms={declineTerms}
              onLeadSubmitted={async () => {
                try {
                  const res = await fetch("/api/leads", { cache: "no-store" });
                  const data = await res.json();
                  if (data.success) setDbLeads(data.leads);
                } catch {}
                refreshConnections();
              }}
              updateConnectionStats={updateConnectionStats}
              feeSettings={feeSettings}
              providerFeeDisplay={providerFeeDisplay}
              dbLeads={dbLeads}
            />
          </TabErrorBoundary>
        )}

        {/* Leads Tab */}
        {activeTab === "leads" && (
          <TabErrorBoundary tabName="Leads">
            <LeadsTab dbLeads={dbLeads} dbLeadsLoading={dbLeadsLoading} activeConnection={activeConnection} onNavigateToConnection={() => setActiveTab("connection")} feeSettings={feeSettings} />
          </TabErrorBoundary>
        )}

        {/* Earnings Tab */}
        {activeTab === "earnings" && (
          <TabErrorBoundary tabName="Earnings">
            <EarningsTab
              dbLeads={dbLeads}
              totalLeads={totalLeads}
              totalEarnings={totalEarnings}
              pendingEarnings={pendingEarnings}
              activeConnection={activeConnection}
              feeSettings={feeSettings}
            />
          </TabErrorBoundary>
        )}

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <TabErrorBoundary tabName="Profile">
            <ProfileTab provider={currentProvider} updateUser={updateUser} />
          </TabErrorBoundary>
        )}
      </div>
    </div>
  );
}

// Dashboard Tab
function DashboardTab({
  activeConnection,
  dbLeads,
  totalLeads,
  paidLeads,
  totalEarnings,
  pendingEarnings,
  onNavigateToConnection,
  feeSettings,
  providerFeeDisplay,
}: {
  activeConnection: ApiConnection | null;
  dbLeads: ApiLead[];
  totalLeads: number;
  paidLeads: number;
  totalEarnings: number;
  pendingEarnings: number;
  onNavigateToConnection: () => void;
  feeSettings?: FeeSettings;
  providerFeeDisplay: number;
}) {
  return (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Leads" value={totalLeads.toString()} color="navy" />
        <StatCard title="Paid Leads" value={paidLeads.toString()} color="emerald" />
        <StatCard title="Total Earnings" value={`$${totalEarnings.toFixed(2)}`} color="blue" />
        <StatCard title="Pending" value={`$${pendingEarnings.toFixed(2)}`} color="amber" />
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        {activeConnection ? (
          <button
            onClick={onNavigateToConnection}
            className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md hover:border-[#E8822A]/30 transition group text-left"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-[#E8822A]/10 flex items-center justify-center group-hover:bg-[#E8822A]/20 transition">
                <svg className="w-6 h-6 text-[#E8822A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#E8822A]">Submit New Lead</h3>
                <p className="text-gray-500 text-sm">Earn ${calculateFeeBreakdown(activeConnection.rate_per_lead || 0, feeSettings).providerNet.toFixed(2)}/lead <span className="text-gray-400 text-xs">(${Number(activeConnection.rate_per_lead || 0).toFixed(2)} rate − ${providerFeeDisplay.toFixed(2)} WOML fee: $0.15 flat + 6.25%)</span></p>
              </div>
            </div>
          </button>
        ) : (
          <button
            onClick={onNavigateToConnection}
            className="bg-gray-100 rounded-xl border border-gray-200 p-6 text-left"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-600">Connect with a Business</h3>
                <p className="text-gray-400 text-sm">Establish a connection to start earning</p>
              </div>
            </div>
          </button>
        )}

        {/* Connection Status Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-[#E8822A] mb-4">Connection Status</h3>
          {activeConnection ? (
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-800">{activeConnection.buyerBusinessName}</p>
                <p className="text-gray-500 text-sm">${calculateFeeBreakdown(activeConnection.rate_per_lead || 0, feeSettings).providerNet.toFixed(2)}/lead <span className="text-gray-400 text-xs">(${Number(activeConnection.rate_per_lead || 0).toFixed(2)} − ${providerFeeDisplay.toFixed(2)} WOML fee)</span> • {formatPaymentTiming(activeConnection.payment_timing as PaymentTiming)}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-500">No Active Connection</p>
                <p className="text-gray-400 text-sm">Find a business to connect with</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Leads */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#E8822A] mb-4">Recent Leads</h3>
        {dbLeads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="pb-3 font-medium">Customer</th>
                  <th className="pb-3 font-medium">Vehicle</th>
                  <th className="pb-3 font-medium">Payment</th>
                  <th className="pb-3 font-medium">Net Payout</th>
                  <th className="pb-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {dbLeads.slice(0, 5).map((lead) => (
                  <tr key={lead.id} className="border-b border-gray-100">
                    <td className="py-4 text-gray-800 font-medium">{lead.customerName}</td>
                    <td className="py-4 text-gray-600">
                      {[lead.vehicleYear, lead.vehicleMake, lead.vehicleModel].filter(Boolean).join(" ") || "-"}
                    </td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        lead.payoutStatus === "completed" ? "bg-emerald-100 text-emerald-700" :
                        lead.payoutStatus === "rejected" ? "bg-red-100 text-red-700" :
                        lead.payoutStatus === "approved" ? "bg-blue-100 text-blue-700" :
                        lead.payoutStatus === "processing" ? "bg-orange-100 text-orange-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {lead.payoutStatus === "completed" ? "Paid" : lead.payoutStatus === "rejected" ? "Rejected" : lead.payoutStatus === "approved" ? "Approved" : lead.payoutStatus === "processing" ? "Processing" : "Pending"}
                      </span>
                      {lead.payoutStatus === "rejected" && lead.rejectionReason && (
                        <p className="text-red-600 text-xs mt-1 font-medium">Reason: {lead.rejectionReason}</p>
                      )}
                    </td>
                    <td className={`py-4 font-medium ${lead.payoutStatus === "rejected" ? "text-gray-400 line-through" : "text-[#E8822A]"}`}>${calculateFeeBreakdown(lead.payoutAmount || 0, feeSettings).providerNet.toFixed(2)}</td>
                    <td className="py-4 text-gray-500 text-sm">
                      {new Date(lead.submittedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-gray-400 py-8">
            {activeConnection ? "No leads yet. Submit your first lead to get started." : "Connect with a business to start submitting leads."}
          </p>
        )}
      </div>
    </div>
  );
}

// Connection Tab
function ConnectionTab({
  currentUser,
  currentProvider,
  activeConnection,
  activeConnections,
  pendingTermsRequest,
  pendingInvitation,
  pendingRequest,
  myRequests,
  fetchUsersByRole,
  sendConnectionRequest,
  acceptTerms,
  declineTerms,
  onLeadSubmitted,
  updateConnectionStats,
  feeSettings,
  providerFeeDisplay,
  dbLeads,
}: {
  currentUser: import("@/lib/auth-types").User;
  currentProvider: import("@/lib/auth-types").LeadProvider | null;
  activeConnection: ApiConnection | null;
  activeConnections: ApiConnection[];
  pendingTermsRequest: ApiConnection | undefined;
  pendingInvitation: ApiConnection | null;
  pendingRequest: ApiConnection | undefined;
  myRequests: ApiConnection[];
  fetchUsersByRole: (role: "buyer" | "provider") => Promise<import("@/lib/connection-context").DiscoveryUser[]>;
  sendConnectionRequest: (buyerId: string, message?: string) => Promise<ApiConnection | null>;
  acceptTerms: (connectionId: string) => Promise<boolean>;
  declineTerms: (connectionId: string) => Promise<boolean>;
  onLeadSubmitted: () => Promise<void>;
  updateConnectionStats: (connectionId: string, leadPayout: number) => void;
  feeSettings?: FeeSettings;
  providerFeeDisplay: number;
  dbLeads: ApiLead[];
}) {
  const [requestMessage, setRequestMessage] = useState("");
  const [selectedBuyer, setSelectedBuyer] = useState<{
    id: string;
    email: string;
    displayName: string;
    businessName: string;
    location: string;
    licensedStates: string[];
    isConnected: boolean;
    connectionStatus?: string;
  } | null>(null);
  const [, setShowBuyerList] = useState(false);
  // Channel picker state — when provider has multiple active connections
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    activeConnections.length === 1 ? activeConnections[0].id : null
  );
  // Effective active connection: selected or the single one
  const effectiveConnection = selectedConnectionId
    ? (activeConnections.find((c) => c.id === selectedConnectionId) || activeConnection)
    : activeConnection;

  // Lead submission state
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [formStep, setFormStep] = useState<FormStep>("form");
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);

  // Form data
  const [formData, setFormData] = useState<LeadFormData>({
    customerName: "",
    email: "",
    phone: "",
    notes: "",
  });

  // Term proposal state
  type ProposalField = { field_type: string; label: string; option_a: string | null; option_b: string | null; is_mandatory: boolean };
  const [pendingTermProposal, setPendingTermProposal] = useState<{
    proposal: { id: string; proposed_at: string };
    proposedCriteria: { payout_per_lead: number; weekly_cap: number | null; monthly_cap: number | null; payment_timing: string | null; termination_notice_days: number | null; require_verified_call: boolean; call_phone_number: string | null };
    currentCriteria: { payout_per_lead: number; weekly_cap: number | null; monthly_cap: number | null; payment_timing: string | null; termination_notice_days: number | null; require_verified_call: boolean; call_phone_number: string | null } | null;
    proposedFields: ProposalField[];
    currentFields: ProposalField[];
  } | null>(null);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [proposalResponding, setProposalResponding] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  // Criteria fields state
  const [criteriaFields, setCriteriaFields] = useState<{
    id: string;
    field_type: "PHOTO" | "TEXT" | "BINARY";
    label: string;
    option_a: string | null;
    option_b: string | null;
    is_mandatory: boolean;
    sort_order: number;
  }[]>([]);
  const [criteriaFieldValues, setCriteriaFieldValues] = useState<Record<string, string>>({});
  const [criteriaLoaded, setCriteriaLoaded] = useState(false);
  const [requireVerifiedCall, setRequireVerifiedCall] = useState(false);

  // Verified call state
  type CallGateStatus = "idle" | "initiating" | "calling" | "verified" | "failed";
  const [callGateStatus, setCallGateStatus] = useState<CallGateStatus>("idle");
  const [callSessionId, setCallSessionId] = useState<string | null>(null);
  const [callGateError, setCallGateError] = useState<string | null>(null);
  const pollIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch buyers from API
  type DiscoveryBuyer = {
    id: string;
    email: string;
    displayName: string;
    businessName: string;
    location: string;
    licensedStates: string[];
    isConnected: boolean;
    connectionStatus?: string;
  };
  const [buyers, setBuyers] = useState<DiscoveryBuyer[]>([]);
  const [loadingBuyers, setLoadingBuyers] = useState(true);

  // Fetch criteria fields + pending proposal when connection exists
  useEffect(() => {
    if (!activeConnection) return;
    const fetchCriteria = async () => {
      try {
        const buyerId = activeConnection.buyer_id || (activeConnection as any).buyerId;
        const res = await fetch(`/api/business-criteria/by-business/${buyerId}`);
        const data = await res.json();
        if (data.fields && Array.isArray(data.fields)) {
          const hasCallField = data.fields.some((f: { field_type: string }) => f.field_type === 'PHONE_CALL');
          if (hasCallField || data.criteria?.require_verified_call) {
            setRequireVerifiedCall(true);
          }
          const regularFields = data.fields.filter((f: { field_type: string }) => f.field_type !== 'PHONE_CALL');
          if (regularFields.length > 0) {
            setCriteriaFields(regularFields);
          }
        }
      } catch {
        // silently fail
      } finally {
        setCriteriaLoaded(true);
      }
    };
    const fetchProposal = async () => {
      try {
        const res = await fetch(`/api/connections/${activeConnection.id}/pending-proposal`);
        if (res.ok) {
          const data = await res.json();
          if (data.proposal) {
            setPendingTermProposal({
              proposal: data.proposal,
              proposedCriteria: data.proposedCriteria,
              currentCriteria: data.currentCriteria,
              proposedFields: data.proposedFields || [],
              currentFields: data.currentFields || [],
            });
          } else {
            setPendingTermProposal(null);
          }
        }
      } catch { /* ignore */ }
    };
    fetchCriteria();
    fetchProposal();
  }, [activeConnection]);

  useEffect(() => {
    const loadBuyers = async () => {
      setLoadingBuyers(true);
      try {
        const users = await fetchUsersByRole("buyer");
        // Only show connected buyers (API is already connection-scoped)
        const buyerList = users.map((u) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName || u.email,
          businessName: u.businessName || u.displayName || u.email,
          location: u.location || "",
          licensedStates: u.licensedStates || [],
          isConnected: u.isConnected,
          connectionStatus: u.connectionStatus,
        }));
        setBuyers(buyerList);
      } catch (err) {
        console.error("Failed to fetch buyers:", err);
      } finally {
        setLoadingBuyers(false);
      }
    };
    loadBuyers();
  }, [fetchUsersByRole]);

  // Reset form when closing
  const resetForm = () => {
    setShowLeadForm(false);
    setFormStep("form");
    setFormData({
      customerName: "",
      email: "",
      phone: "",
      notes: "",
    });
    setCriteriaFieldValues({});
    setLeadSubmitted(false);
    // Clear call gate state
    setCallGateStatus("idle");
    setCallSessionId(null);
    setCallGateError(null);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Initiate verified call
  const handleStartVerifiedCall = async () => {
    if (!activeConnection) return;
    setCallGateStatus("initiating");
    setCallGateError(null);
    try {
      const res = await fetch("/api/sinch-voice/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: (effectiveConnection || activeConnection).id }),
      });
      const data = await res.json();
      if (!res.ok || !data.callSessionId) {
        setCallGateStatus("failed");
        setCallGateError(data.error || "Failed to initiate call. Please try again.");
        return;
      }
      setCallSessionId(data.callSessionId);
      setCallGateStatus("calling");
      // Poll every 5 seconds until verified or failed
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/sinch-voice/status/${data.callSessionId}`);
          const statusData = await statusRes.json();
          if (statusData.verified) {
            setCallGateStatus("verified");
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          } else if (statusData.status === "failed") {
            setCallGateStatus("failed");
            setCallGateError("Call failed. Please try again.");
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        } catch {
          // Polling error — keep trying
        }
      }, 5000);
    } catch {
      setCallGateStatus("failed");
      setCallGateError("Network error. Please try again.");
    }
  };

  // Handle lead submission
  const handleSubmitLead = async () => {
    if (isSubmittingLead) return;
    if (!activeConnection || !currentProvider) return;
    if (!formData.customerName || !formData.email || !formData.phone) return;

    setIsSubmittingLead(true);

    // Check lead caps before submission
    const capStatus = checkLeadCaps(activeConnection);
    if (!capStatus.canSubmitLead) {
      alert(capStatus.message || "Lead cap reached. Unable to submit.");
      setIsSubmittingLead(false);
      return;
    }

    const payout = activeConnection.rate_per_lead;

    // Build criteria fields data for submission
    const criteriaFieldsData = criteriaFields.length > 0
      ? criteriaFields.map(f => ({
          fieldId: f.id,
          fieldType: f.field_type,
          label: f.label,
          value: criteriaFieldValues[f.id] || "",
        }))
      : undefined;

    // Submit lead to API (database)
    try {
      const apiRes = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: (effectiveConnection || activeConnection).id,
          customerData: {
            name: formData.customerName,
            email: formData.email,
            phone: formData.phone,
            notes: formData.notes || undefined,
          },
          criteriaFieldsData,
          callSessionId: callSessionId || undefined,
        }),
      });
      const apiData = await apiRes.json();
      if (!apiData.success) {
        if (apiRes.status === 409) {
          // Duplicate lead detected
          setFormStep("duplicate");
          setIsSubmittingLead(false);
          return;
        }
        alert("Lead submission failed: " + (apiData.error || "Unknown error. Please try again."));
        setIsSubmittingLead(false);
        return;
      }

      // Lead created successfully
      onLeadSubmitted();
      updateConnectionStats(activeConnection.id, payout);
      setFormStep("success");
      setLeadSubmitted(true);
    } catch (err) {
      console.error("Lead API call failed:", err);
      alert("Lead submission failed. Please check your connection and try again.");
    } finally {
      setIsSubmittingLead(false);
    }
  };

  const handleSendRequest = async () => {
    if (!selectedBuyer || !currentProvider) return;

    await sendConnectionRequest(selectedBuyer.id, requestMessage || undefined);

    setSelectedBuyer(null);
    setRequestMessage("");
    setShowBuyerList(false);
  };

  const handleAcceptTerms = async () => {
    if (!pendingTermsRequest) return;
    await acceptTerms(pendingTermsRequest.id);
  };

  const handleDeclineTerms = async () => {
    if (!pendingTermsRequest) return;
    await declineTerms(pendingTermsRequest.id);
  };

  // Show active connection
  if (activeConnection) {
    return (
      <div className="space-y-6">
        {/* Channel Picker — only shown when provider has multiple active connections */}
        {activeConnections.length > 1 && !selectedConnectionId && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-[#E8822A] mb-2">Which business is this lead for?</h3>
            <p className="text-gray-500 text-sm mb-4">Select the channel you want to submit a lead to.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeConnections.map((conn) => (
                <button
                  key={conn.id}
                  onClick={() => setSelectedConnectionId(conn.id)}
                  className="border-2 border-gray-200 hover:border-[#E8822A] rounded-xl p-4 text-left transition group"
                >
                  <div className="h-10 w-10 rounded-full bg-[#E8822A] flex items-center justify-center mb-2">
                    <span className="text-white font-bold">{(conn.buyer_name || conn.buyerBusinessName || "B").charAt(0)}</span>
                  </div>
                  <p className="font-semibold text-gray-800 group-hover:text-[#E8822A] transition">{conn.buyer_name || conn.buyerBusinessName || "Business"}</p>
                  <p className="text-sm text-gray-500">${Number(conn.rate_per_lead).toFixed(2)}/lead</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pending Term Proposal Banner */}
        {pendingTermProposal && (
          <div
            className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 cursor-pointer hover:bg-amber-100 transition"
            onClick={() => setShowProposalModal(true)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-amber-200 flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                </div>
                <div>
                  <p className="text-amber-800 font-semibold text-sm">{activeConnection.buyerBusinessName || "Your business"} has proposed new contract terms</p>
                  <p className="text-amber-600 text-xs mt-0.5">Review and respond to continue submitting leads under updated terms</p>
                </div>
              </div>
              <span className="text-amber-700 text-sm font-medium shrink-0">Review &rarr;</span>
            </div>
          </div>
        )}

        {/* Proposal Review Modal */}
        {showProposalModal && pendingTermProposal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowProposalModal(false); setShowRejectInput(false); setRejectNote(""); }}>
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-800">Proposed Term Changes</h3>
                <p className="text-gray-500 text-sm mt-1">{activeConnection.buyerBusinessName || "Business"} wants to update your agreement</p>
              </div>
              <div className="p-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Current Terms */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Current Terms</h4>
                    <div className="space-y-3 bg-gray-50 rounded-xl p-4">
                      <div>
                        <p className="text-gray-400 text-xs">Rate per Lead</p>
                        <p className="text-lg font-bold text-gray-800">${Number(activeConnection.rate_per_lead || 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Payment</p>
                        <p className="text-sm text-gray-700">{formatPaymentTiming(activeConnection.payment_timing as PaymentTiming)}</p>
                      </div>
                      {(activeConnection.weekly_lead_cap || activeConnection.monthly_lead_cap) && (
                        <div>
                          <p className="text-gray-400 text-xs">Caps</p>
                          {activeConnection.weekly_lead_cap && <p className="text-sm text-gray-700">{activeConnection.weekly_lead_cap}/week</p>}
                          {activeConnection.monthly_lead_cap && <p className="text-sm text-gray-700">{activeConnection.monthly_lead_cap}/month</p>}
                        </div>
                      )}
                      <div>
                        <p className="text-gray-400 text-xs">Termination Notice</p>
                        <p className="text-sm text-gray-700">{activeConnection.termination_notice_days ?? 0} days</p>
                      </div>
                    </div>
                  </div>
                  {/* Proposed Terms */}
                  <div>
                    <h4 className="text-sm font-semibold text-amber-600 uppercase tracking-wide mb-3">Proposed Terms</h4>
                    <div className="space-y-3 bg-amber-50 rounded-xl p-4 border border-amber-200">
                      <div>
                        <p className="text-amber-500 text-xs">Rate per Lead</p>
                        <p className={`text-lg font-bold ${Number(pendingTermProposal.proposedCriteria.payout_per_lead) !== Number(activeConnection.rate_per_lead) ? "text-amber-700" : "text-gray-800"}`}>
                          ${Number(pendingTermProposal.proposedCriteria.payout_per_lead).toFixed(2)}
                          {Number(pendingTermProposal.proposedCriteria.payout_per_lead) !== Number(activeConnection.rate_per_lead) && (
                            <span className="text-xs ml-1">(was ${Number(activeConnection.rate_per_lead).toFixed(2)})</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-amber-500 text-xs">Payment</p>
                        <p className={`text-sm ${pendingTermProposal.proposedCriteria.payment_timing !== activeConnection.payment_timing ? "text-amber-700 font-medium" : "text-gray-700"}`}>
                          {formatPaymentTiming((pendingTermProposal.proposedCriteria.payment_timing || "instant") as PaymentTiming)}
                        </p>
                      </div>
                      {(pendingTermProposal.proposedCriteria.weekly_cap || pendingTermProposal.proposedCriteria.monthly_cap) && (
                        <div>
                          <p className="text-amber-500 text-xs">Caps</p>
                          {pendingTermProposal.proposedCriteria.weekly_cap && <p className="text-sm text-amber-700">{pendingTermProposal.proposedCriteria.weekly_cap}/week</p>}
                          {pendingTermProposal.proposedCriteria.monthly_cap && <p className="text-sm text-amber-700">{pendingTermProposal.proposedCriteria.monthly_cap}/month</p>}
                        </div>
                      )}
                      <div>
                        <p className="text-amber-500 text-xs">Termination Notice</p>
                        <p className={`text-sm ${(pendingTermProposal.proposedCriteria.termination_notice_days ?? 0) !== (activeConnection.termination_notice_days ?? 0) ? "text-amber-700 font-medium" : "text-gray-700"}`}>
                          {pendingTermProposal.proposedCriteria.termination_notice_days ?? 0} days
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Required Fields Comparison */}
                {(pendingTermProposal.currentFields.length > 0 || pendingTermProposal.proposedFields.length > 0) && (() => {
                  const fieldKey = (f: ProposalField) => `${f.field_type}:${f.label}`;
                  const currentKeys = new Set(pendingTermProposal.currentFields.map(fieldKey));
                  const proposedKeys = new Set(pendingTermProposal.proposedFields.map(fieldKey));
                  const badge = (type: string) => {
                    const cfg: Record<string, { color: string; label: string }> = {
                      PHOTO: { color: "bg-purple-100 text-purple-700", label: "Photo" },
                      TEXT: { color: "bg-blue-100 text-blue-700", label: "Text" },
                      BINARY: { color: "bg-amber-100 text-amber-700", label: "Yes/No" },
                      PHONE_CALL: { color: "bg-green-100 text-green-700", label: "📞 Call" },
                    };
                    const { color, label } = cfg[type] || { color: "bg-gray-100 text-gray-600", label: type };
                    return <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${color}`}>{label}</span>;
                  };
                  // Removed fields = in current but not in proposed
                  const removedFields = pendingTermProposal.currentFields.filter(f => !proposedKeys.has(fieldKey(f)));
                  return (
                    <div className="grid md:grid-cols-2 gap-6 mt-4 pt-4 border-t border-gray-200">
                      {/* Current Fields */}
                      <div>
                        <p className="text-gray-400 text-xs mb-2">Required Fields</p>
                        {pendingTermProposal.currentFields.length === 0 ? (
                          <p className="text-gray-300 text-xs italic">None</p>
                        ) : (
                          <div className="space-y-1.5">
                            {pendingTermProposal.currentFields.map((f, i) => (
                              <div key={i} className="flex items-center gap-2">
                                {badge(f.field_type)}
                                <span className="text-sm text-gray-700">{f.label}</span>
                                {f.field_type === "BINARY" && f.option_a && (
                                  <span className="text-[10px] text-gray-400">({f.option_a}/{f.option_b})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Proposed Fields */}
                      <div>
                        <p className="text-amber-500 text-xs mb-2">Required Fields</p>
                        {pendingTermProposal.proposedFields.length === 0 && removedFields.length === 0 ? (
                          <p className="text-gray-300 text-xs italic">None</p>
                        ) : (
                          <div className="space-y-1.5">
                            {pendingTermProposal.proposedFields.map((f, i) => {
                              const isNew = !currentKeys.has(fieldKey(f));
                              return (
                                <div key={i} className={`flex items-center gap-2 ${isNew ? "bg-emerald-50 rounded px-1.5 py-0.5 -mx-1.5" : ""}`}>
                                  {badge(f.field_type)}
                                  <span className={`text-sm ${isNew ? "text-emerald-700 font-medium" : "text-gray-700"}`}>{f.label}</span>
                                  {f.field_type === "BINARY" && f.option_a && (
                                    <span className="text-[10px] text-gray-400">({f.option_a}/{f.option_b})</span>
                                  )}
                                  {isNew && <span className="text-[10px] text-emerald-600 font-medium">NEW</span>}
                                </div>
                              );
                            })}
                            {removedFields.map((f, i) => (
                              <div key={`rm-${i}`} className="flex items-center gap-2 bg-red-50 rounded px-1.5 py-0.5 -mx-1.5">
                                {badge(f.field_type)}
                                <span className="text-sm text-red-400 line-through">{f.label}</span>
                                <span className="text-[10px] text-red-500 font-medium">REMOVED</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {pendingTermProposal.proposedFields.some(f => f.field_type === "PHONE_CALL") && pendingTermProposal.proposedCriteria.call_phone_number && (
                          <p className="text-xs text-green-600 mt-2">Calls directed to: {pendingTermProposal.proposedCriteria.call_phone_number}</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Reject note input */}
                {showRejectInput && (
                  <div className="mt-4">
                    <label className="block text-sm text-gray-600 mb-1">Reason for declining (optional)</label>
                    <textarea
                      value={rejectNote}
                      onChange={e => setRejectNote(e.target.value)}
                      placeholder="Let them know why you're declining..."
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm resize-none focus:ring-2 focus:ring-red-300 focus:border-transparent"
                      rows={2}
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                  {!showRejectInput ? (
                    <>
                      <button
                        onClick={async () => {
                          setProposalResponding(true);
                          try {
                            const res = await fetch(`/api/connections/${activeConnection.id}/respond-terms`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ proposalId: pendingTermProposal.proposal.id, action: "accept" }),
                            });
                            if (res.ok) {
                              setPendingTermProposal(null);
                              setShowProposalModal(false);
                              // Reload to get updated terms
                              window.location.reload();
                            } else {
                              const data = await res.json();
                              alert(data.error || "Failed to accept");
                            }
                          } catch { alert("Failed to accept terms"); }
                          finally { setProposalResponding(false); }
                        }}
                        disabled={proposalResponding}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
                      >
                        {proposalResponding ? "Processing..." : "Accept New Terms"}
                      </button>
                      <button
                        onClick={() => setShowRejectInput(true)}
                        className="flex-1 border border-red-300 text-red-600 hover:bg-red-50 py-3 rounded-lg font-semibold transition"
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={async () => {
                          setProposalResponding(true);
                          try {
                            const res = await fetch(`/api/connections/${activeConnection.id}/respond-terms`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ proposalId: pendingTermProposal.proposal.id, action: "reject", note: rejectNote.trim() || undefined }),
                            });
                            if (res.ok) {
                              setPendingTermProposal(null);
                              setShowProposalModal(false);
                              setShowRejectInput(false);
                              setRejectNote("");
                            } else {
                              const data = await res.json();
                              alert(data.error || "Failed to reject");
                            }
                          } catch { alert("Failed to reject terms"); }
                          finally { setProposalResponding(false); }
                        }}
                        disabled={proposalResponding}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
                      >
                        {proposalResponding ? "Processing..." : "Confirm Reject"}
                      </button>
                      <button
                        onClick={() => { setShowRejectInput(false); setRejectNote(""); }}
                        className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-3 rounded-lg font-semibold transition"
                      >
                        Back
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Duplicate Lead Flagged */}
        {formStep === "duplicate" && (
          <div className="bg-red-50 border border-red-300 rounded-xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold text-red-800">Duplicate Lead Flagged</p>
                <p className="text-red-700 text-sm mt-1">This individual has already been submitted on the WOML platform. Duplicate leads are never compensable — the same person cannot be paid for twice, regardless of timing.</p>
              </div>
            </div>
            <div className="bg-red-100 rounded-lg p-4 mb-4 text-sm text-red-800">
              <p className="font-semibold mb-1">Why was this flagged?</p>
              <p>The email address or phone number you entered matches a lead that already exists in the system. This applies platform-wide — not just to your submissions.</p>
            </div>
            <button
              onClick={() => { setFormStep("form"); setIsSubmittingLead(false); }}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium transition"
            >
              Go Back &amp; Edit
            </button>
          </div>
        )}

        {/* Success Message */}
        {leadSubmitted && formStep === "success" && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold text-emerald-800">Lead Submitted Successfully!</p>
                {(() => { const bd = calculateFeeBreakdown(activeConnection.rate_per_lead || 0, feeSettings); return (
                  <>
                    <p className="text-emerald-600">You earned <span className="font-bold">${bd.providerNet.toFixed(2)}</span> for this lead.</p>
                    <p className="text-emerald-500 text-sm">${Number(activeConnection?.rate_per_lead || 0).toFixed(2)} rate − ${bd.providerFee.toFixed(2)} WOML fee ($0.15 flat + 6.25%)</p>
                  </>
                ); })()}
              </div>
            </div>
            <button
              onClick={resetForm}
              className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium transition"
            >
              Submit Another Lead
            </button>
          </div>
        )}

        {/* Connection Info Card - Always visible */}
        {formStep !== "success" && formStep !== "duplicate" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            {/* Check lead caps */}
            {(() => {
              const capStatus = checkLeadCaps(activeConnection);
              return (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${capStatus.canSubmitLead ? "bg-emerald-500" : "bg-amber-500"}`}></div>
                      <h3 className="text-lg font-semibold text-[#E8822A]">Active Connection</h3>
                    </div>
                    {!showLeadForm && (
                      capStatus.canSubmitLead ? (
                        <button
                          onClick={() => setShowLeadForm(true)}
                          className="bg-[#E8822A] hover:bg-[#D47526] text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Submit Lead
                        </button>
                      ) : (
                        <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded-lg font-medium flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Cap Reached
                        </div>
                      )
                    )}
                  </div>

                  {/* Cap Status Banner */}
                  {!capStatus.canSubmitLead && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                      <div className="flex items-start gap-3">
                        <svg className="w-6 h-6 text-amber-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                          <p className="font-semibold text-amber-800">Lead Cap Reached</p>
                          <p className="text-amber-700 text-sm mt-1">{capStatus.message}</p>
                          <p className="text-amber-600 text-xs mt-2">The buyer has set limits to manage lead volume. You can submit more leads when the cap resets.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            <div className="flex items-center gap-6 mb-6">
              <div className="h-16 w-16 rounded-full bg-[#E8822A] flex items-center justify-center">
                <span className="text-2xl font-bold text-white">{(activeConnection.buyerBusinessName || "?").charAt(0)}</span>
              </div>
              <div>
                <h4 className="text-xl font-bold text-gray-800">{activeConnection.buyerBusinessName || "Business"}</h4>
                <p className="text-gray-500">Connected since {(activeConnection.accepted_at || activeConnection.created_at) ? new Date(activeConnection.accepted_at || activeConnection.created_at).toLocaleDateString() : "N/A"}</p>
              </div>
            </div>

            {/* Terms Display */}
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h4 className="font-semibold text-gray-800 mb-4">Your Agreement Terms</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-500 text-sm">Rate per Lead</p>
                  <p className="text-2xl font-bold text-[#E8822A]">${Number(activeConnection?.rate_per_lead || 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Payment Schedule</p>
                  <p className="text-xl font-semibold text-gray-800">{formatPaymentTiming(activeConnection.payment_timing as PaymentTiming)}</p>
                </div>
              </div>

              {/* Lead Cap Status */}
              {(activeConnection.weekly_lead_cap || activeConnection.monthly_lead_cap) && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-gray-500 text-sm mb-2">Lead Volume Limits</p>
                  <div className="flex flex-wrap gap-3">
                    {activeConnection.weekly_lead_cap && (
                      <div className="bg-white px-3 py-2 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-500">Weekly Cap</p>
                        <p className="font-semibold text-gray-800">{activeConnection.weekly_lead_cap} leads</p>
                      </div>
                    )}
                    {activeConnection.monthly_lead_cap && (
                      <div className="bg-white px-3 py-2 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-500">Monthly Cap</p>
                        <p className="font-semibold text-gray-800">{activeConnection.monthly_lead_cap} leads</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-[#E8822A]">{activeConnection.total_leads}</p>
                <p className="text-gray-500 text-sm">Total Leads</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-emerald-600">${dbLeads.filter(l => l.payoutStatus === "completed").reduce((sum, l) => sum + calculateFeeBreakdown(l.payoutAmount || 0, feeSettings).providerNet, 0).toFixed(2)}</p>
                <p className="text-gray-500 text-sm">Total Earned</p>
              </div>
            </div>
          </div>
        )}

        {/* Call Gate — shown before lead form when require_verified_call is true */}
        {showLeadForm && requireVerifiedCall && callGateStatus !== "verified" && formStep !== "success" && formStep !== "duplicate" && (
          <div className="bg-white rounded-xl border-2 border-blue-300 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-blue-800">Verified Call Required</h3>
                  <p className="text-blue-600 text-sm">{activeConnection?.buyerBusinessName} requires a phone call before you can submit a lead</p>
                </div>
              </div>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {callGateStatus === "idle" && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
                  <p className="font-semibold mb-1">How it works:</p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-600">
                    <li>Click &quot;Start Verified Call&quot; below</li>
                    <li>WOML will call your phone — answer it</li>
                    <li>You&apos;ll be connected to {activeConnection?.buyerBusinessName}</li>
                    <li>Speak for at least 30 seconds</li>
                    <li>Return here to submit your lead</li>
                  </ol>
                </div>
                <button
                  onClick={handleStartVerifiedCall}
                  className="w-full py-4 rounded-xl font-semibold text-lg bg-blue-600 hover:bg-blue-700 text-white transition flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Start Verified Call
                </button>
              </div>
            )}

            {callGateStatus === "initiating" && (
              <div className="text-center py-6">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-blue-700 font-medium">Setting up your call...</p>
              </div>
            )}

            {callGateStatus === "calling" && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="h-3 w-3 bg-blue-500 rounded-full animate-pulse"></div>
                    <p className="text-blue-700 font-semibold">Call in progress</p>
                  </div>
                  <p className="text-blue-600 text-sm">WOML is calling your phone. Answer and speak with {activeConnection?.buyerBusinessName} for at least 30 seconds, then come back here.</p>
                </div>
                <p className="text-gray-500 text-xs text-center">Checking call status automatically every 5 seconds...</p>
              </div>
            )}

            {callGateStatus === "failed" && (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                  <p className="font-semibold mb-1">Call failed</p>
                  <p>{callGateError || "Something went wrong. Please try again."}</p>
                </div>
                <button
                  onClick={() => { setCallGateStatus("idle"); setCallGateError(null); }}
                  className="w-full py-3 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700 text-white transition"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Lead Submission Form — only show when call gate is satisfied */}
        {showLeadForm && (!requireVerifiedCall || callGateStatus === "verified") && formStep !== "success" && formStep !== "duplicate" && (
          <div className="bg-white rounded-xl border-2 border-[#E8822A] p-6 shadow-lg">
            {/* Header with close button */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-[#E8822A]">Submit a Lead</h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Call Verified Banner */}
              {requireVerifiedCall && callGateStatus === "verified" && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2 text-emerald-700 text-sm">
                  <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span><strong>Call verified.</strong> You spoke with {activeConnection?.buyerBusinessName}. You may now submit your lead.</span>
                </div>
              )}

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                {(() => { const bd = calculateFeeBreakdown(activeConnection.rate_per_lead || 0, feeSettings); return (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-orange-700 text-sm font-semibold">You&apos;ll earn ${bd.providerNet.toFixed(2)} for this lead</p>
                      <p className="text-orange-500 text-xs mt-0.5">Rate ${Number(activeConnection.rate_per_lead || 0).toFixed(2)} − WOML fee ${bd.providerFee.toFixed(2)} ($0.15 flat + 6.25%)</p>
                    </div>
                    <span className="text-2xl font-bold text-orange-300">${bd.providerNet.toFixed(2)}</span>
                  </div>
                ); })()}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">Customer Name *</label>
                  <input
                    type="text"
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    required
                    className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#E8822A] focus:outline-none transition"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">Phone *</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                    className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#E8822A] focus:outline-none transition"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className={`w-full px-4 py-3 rounded-lg bg-gray-50 border text-gray-900 focus:outline-none transition ${
                    formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(formData.email)
                      ? "border-red-400 focus:border-red-500"
                      : "border-gray-200 focus:border-[#E8822A]"
                  }`}
                  placeholder="customer@email.com"
                />
                {formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(formData.email) && (
                  <p className="text-red-500 text-xs mt-1">Enter a valid email (e.g. name@gmail.com)</p>
                )}
              </div>

              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  Notes <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#E8822A] focus:outline-none transition resize-none"
                  placeholder="Any additional details about this lead..."
                />
              </div>

              {/* Dynamic Criteria Fields (deduplicate fields already collected above) */}
              {(() => {
                const DEFAULT_LABELS = ["name", "customer name", "email", "phone", "phone number"];
                const filtered = criteriaFields.filter(f => !DEFAULT_LABELS.includes(f.label.trim().toLowerCase()));
                return criteriaLoaded && filtered.length > 0 && (
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Additional Required Information</p>
                  <div className="space-y-4">
                    {filtered.map(field => (
                      <div key={field.id}>
                        <label className="block text-gray-700 text-sm font-medium mb-2">
                          {field.label} {field.is_mandatory && <span className="text-red-500">*</span>}
                        </label>
                        {field.field_type === "TEXT" && (
                          <input
                            type="text"
                            value={criteriaFieldValues[field.id] || ""}
                            onChange={e => setCriteriaFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                            className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#E8822A] focus:outline-none transition"
                          />
                        )}
                        {field.field_type === "PHOTO" && (
                          <div>
                            {criteriaFieldValues[field.id] ? (
                              <div className="relative inline-block">
                                <img src={criteriaFieldValues[field.id]} alt={field.label} className="max-h-32 rounded-lg border" />
                                <button
                                  onClick={() => setCriteriaFieldValues(prev => ({ ...prev, [field.id]: "" }))}
                                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                                >&#10005;</button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {/* Take Photo — opens camera directly on mobile */}
                                <label className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#E8822A] transition">
                                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                  <span className="text-gray-500 text-sm">📷 Take Photo</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    onChange={e => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      if (file.size > 10 * 1024 * 1024) { alert("Image must be less than 10MB"); return; }
                                      const reader = new FileReader();
                                      reader.onload = () => setCriteriaFieldValues(prev => ({ ...prev, [field.id]: reader.result as string }));
                                      reader.readAsDataURL(file);
                                    }}
                                  />
                                </label>
                                {/* Upload from Gallery — choose existing photo */}
                                <label className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#E8822A] transition">
                                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  <span className="text-gray-500 text-sm">🖼️ Upload from Gallery</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      if (file.size > 10 * 1024 * 1024) { alert("Image must be less than 10MB"); return; }
                                      const reader = new FileReader();
                                      reader.onload = () => setCriteriaFieldValues(prev => ({ ...prev, [field.id]: reader.result as string }));
                                      reader.readAsDataURL(file);
                                    }}
                                  />
                                </label>
                              </div>
                            )}
                          </div>
                        )}
                        {field.field_type === "BINARY" && (
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => setCriteriaFieldValues(prev => ({ ...prev, [field.id]: field.option_a || "Yes" }))}
                              className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition ${
                                criteriaFieldValues[field.id] === (field.option_a || "Yes")
                                  ? "bg-[#E8822A] text-white border-[#E8822A]"
                                  : "bg-gray-50 text-gray-700 border-gray-200 hover:border-[#E8822A]"
                              }`}
                            >
                              {field.option_a || "Yes"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setCriteriaFieldValues(prev => ({ ...prev, [field.id]: field.option_b || "No" }))}
                              className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition ${
                                criteriaFieldValues[field.id] === (field.option_b || "No")
                                  ? "bg-[#E8822A] text-white border-[#E8822A]"
                                  : "bg-gray-50 text-gray-700 border-gray-200 hover:border-[#E8822A]"
                              }`}
                            >
                              {field.option_b || "No"}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
              })()}

              {/* Submit Button */}
              <button
                onClick={handleSubmitLead}
                disabled={isSubmittingLead || !formData.customerName || !formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(formData.email) || !formData.phone}
                className="w-full py-4 rounded-xl font-semibold text-lg transition flex items-center justify-center gap-2 bg-[#E8822A] hover:bg-[#D47526] disabled:bg-gray-300 disabled:cursor-not-allowed text-white"
              >
                {isSubmittingLead ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Submitting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Submit Lead
                  </>
                )}
              </button>

              <p className="text-center text-gray-500 text-xs">
                Lead will be sent to {activeConnection?.buyerBusinessName}. You&apos;ll be paid ${Number(activeConnection?.rate_per_lead || 50).toFixed(2)} once they process it.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Show pending invitation from business
  if (pendingInvitation) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border-2 border-emerald-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></div>
            <h3 className="text-lg font-semibold text-emerald-700">New Invitation from a Business</h3>
          </div>

          <div className="flex items-center gap-6 mb-6">
            <div className="h-16 w-16 rounded-full bg-[#E8822A] flex items-center justify-center">
              <span className="text-2xl font-bold text-white">{(pendingInvitation.buyerBusinessName || "?").charAt(0)}</span>
            </div>
            <div>
              <h4 className="text-xl font-bold text-gray-800">{pendingInvitation.buyerBusinessName}</h4>
              <p className="text-gray-500">Has invited you to become a lead provider</p>
            </div>
          </div>

          {pendingInvitation.message && (
            <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-200">
              <p className="text-gray-500 text-sm mb-1">Message from {pendingInvitation.buyerBusinessName}</p>
              <p className="text-gray-700 italic">&quot;{pendingInvitation.message}&quot;</p>
            </div>
          )}

          {/* Proposed Terms */}
          <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-200 mb-6">
            <h4 className="font-semibold text-gray-800 mb-4">Offered Agreement Terms</h4>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-gray-500 text-sm">Rate per Lead</p>
                <p className="text-3xl font-bold text-[#E8822A]">${Number(pendingInvitation.rate_per_lead || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Payment Schedule</p>
                <p className="text-xl font-semibold text-gray-800">{formatPaymentTiming(pendingInvitation.payment_timing as PaymentTiming)}</p>
              </div>
            </div>
            {(pendingInvitation.weekly_lead_cap || pendingInvitation.monthly_lead_cap) && (
              <div className="mt-4 pt-4 border-t border-emerald-200 grid md:grid-cols-2 gap-4">
                {pendingInvitation.weekly_lead_cap && (
                  <div>
                    <p className="text-gray-500 text-sm">Weekly Lead Cap</p>
                    <p className="text-lg font-semibold text-gray-800">{pendingInvitation.weekly_lead_cap} leads</p>
                  </div>
                )}
                {pendingInvitation.monthly_lead_cap && (
                  <div>
                    <p className="text-gray-500 text-sm">Monthly Lead Cap</p>
                    <p className="text-lg font-semibold text-gray-800">{pendingInvitation.monthly_lead_cap} leads</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-gray-600 text-sm mb-6">
            By accepting this invitation, you agree to submit leads to {pendingInvitation.buyerBusinessName} at the rate of ${Number(pendingInvitation.rate_per_lead || 0).toFixed(2)} per qualified lead. You can terminate this agreement at any time with {pendingInvitation.termination_notice_days ?? 0} days notice.
          </p>

          <div className="flex gap-4">
            <button
              onClick={async () => {
                const success = await acceptTerms(pendingInvitation.id);
                if (success) {
                  alert(`Welcome! You are now connected with ${pendingInvitation.buyerBusinessName}. You can start submitting leads.`);
                }
              }}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-semibold transition"
            >
              Accept Invitation
            </button>
            <button
              onClick={async () => {
                if (confirm("Are you sure you want to decline this invitation?")) {
                  await declineTerms(pendingInvitation.id);
                }
              }}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold transition border border-gray-200"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show pending terms to review (from a request the provider initiated)
  if (pendingTermsRequest) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border-2 border-amber-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-3 w-3 rounded-full bg-amber-500 animate-pulse"></div>
            <h3 className="text-lg font-semibold text-amber-700">Terms Ready for Your Review</h3>
          </div>

          <div className="flex items-center gap-6 mb-6">
            <div className="h-16 w-16 rounded-full bg-[#E8822A] flex items-center justify-center">
              <span className="text-2xl font-bold text-white">{(pendingTermsRequest.buyerBusinessName || "?").charAt(0)}</span>
            </div>
            <div>
              <h4 className="text-xl font-bold text-gray-800">{pendingTermsRequest.buyerBusinessName}</h4>
              <p className="text-gray-500">Has proposed the following terms</p>
            </div>
          </div>

          {/* Proposed Terms */}
          <div className="bg-amber-50 rounded-xl p-6 border border-amber-200 mb-6">
            <h4 className="font-semibold text-gray-800 mb-4">Proposed Agreement Terms</h4>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-gray-500 text-sm">Rate per Lead</p>
                <p className="text-3xl font-bold text-[#E8822A]">${Number(pendingTermsRequest.rate_per_lead || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Payment Schedule</p>
                <p className="text-xl font-semibold text-gray-800">{formatPaymentTiming(pendingTermsRequest.payment_timing as PaymentTiming)}</p>
              </div>
            </div>
            {(pendingTermsRequest.weekly_lead_cap || pendingTermsRequest.monthly_lead_cap) && (
              <div className="mt-4 pt-4 border-t border-amber-200 grid md:grid-cols-2 gap-4">
                {pendingTermsRequest.weekly_lead_cap && (
                  <div>
                    <p className="text-gray-500 text-sm">Weekly Lead Cap</p>
                    <p className="text-lg font-semibold text-gray-800">{pendingTermsRequest.weekly_lead_cap} leads</p>
                  </div>
                )}
                {pendingTermsRequest.monthly_lead_cap && (
                  <div>
                    <p className="text-gray-500 text-sm">Monthly Lead Cap</p>
                    <p className="text-lg font-semibold text-gray-800">{pendingTermsRequest.monthly_lead_cap} leads</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-gray-600 text-sm mb-6">
            By accepting these terms, you agree to submit leads to {pendingTermsRequest.buyerBusinessName} at the rate of ${Number(pendingTermsRequest.rate_per_lead || 0).toFixed(2)} per qualified lead. You can terminate this agreement at any time with {pendingTermsRequest.termination_notice_days ?? 0} days notice.
          </p>

          <div className="flex gap-4">
            <button
              onClick={handleAcceptTerms}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-semibold transition"
            >
              Accept Terms
            </button>
            <button
              onClick={handleDeclineTerms}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold transition border border-gray-200"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show pending request or find business
  return (
    <div className="space-y-6">
      {pendingRequest ? (
        <div className="bg-white rounded-xl border border-orange-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-3 w-3 rounded-full bg-orange-500 animate-pulse"></div>
            <h3 className="text-lg font-semibold text-orange-700">Request Pending</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
              <span className="text-xl font-bold text-orange-600">{(pendingRequest.buyerBusinessName || "?").charAt(0)}</span>
            </div>
            <div>
              <p className="font-semibold text-gray-800">{pendingRequest.buyerBusinessName}</p>
              <p className="text-gray-500 text-sm">Waiting for them to review your request and set terms</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#E8822A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">No Active Channels Yet</h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            You connect with businesses via invite links. Ask a business to share their invite link with you to get started.
          </p>
        </div>
      )}

      {/* Request History */}
      {myRequests.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-[#E8822A] mb-4">Request History</h3>
          <div className="space-y-3">
            {myRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-800">{request.buyerBusinessName}</p>
                  <p className="text-gray-500 text-sm">{request.createdAt ? new Date(request.createdAt).toLocaleDateString() : "N/A"}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  request.status === "accepted" ? "bg-emerald-100 text-emerald-700" :
                  request.status === "rejected" || request.status === "declined" ? "bg-red-100 text-red-700" :
                  request.status === "terms_set" ? "bg-amber-100 text-amber-700" :
                  "bg-orange-100 text-orange-700"
                }`}>
                  {request.status === "terms_set" ? "Terms Ready" : request.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Leads Tab
function LeadsTab({ dbLeads, dbLeadsLoading, activeConnection, onNavigateToConnection, feeSettings }: { dbLeads: ApiLead[]; dbLeadsLoading: boolean; activeConnection: ApiConnection | null; onNavigateToConnection: () => void; feeSettings?: FeeSettings }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-[#E8822A]">All Leads ({dbLeads.length})</h3>
        {activeConnection && (
          <button
            onClick={onNavigateToConnection}
            className="bg-[#E8822A] hover:bg-[#D47526] text-white px-4 py-2 rounded-lg transition flex items-center gap-2 font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Lead
          </button>
        )}
      </div>
      {dbLeadsLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8822A]"></div>
        </div>
      ) : dbLeads.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Customer</th>
                <th className="pb-3 font-medium">Vehicle</th>
                <th className="pb-3 font-medium">Payment</th>
                <th className="pb-3 font-medium">Net Payout</th>
              </tr>
            </thead>
            <tbody>
              {dbLeads.map((lead) => (
                <tr key={lead.id} className="border-b border-gray-100">
                  <td className="py-4 text-gray-500 text-sm">
                    {new Date(lead.submittedAt).toLocaleDateString()}
                  </td>
                  <td className="py-4 text-gray-800 font-medium">{lead.customerName}</td>
                  <td className="py-4 text-gray-600">
                    {[lead.vehicleYear, lead.vehicleMake, lead.vehicleModel].filter(Boolean).join(" ") || "-"}
                  </td>
                  <td className="py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      lead.payoutStatus === "completed" ? "bg-emerald-100 text-emerald-700" :
                      lead.payoutStatus === "rejected" ? "bg-red-100 text-red-700" :
                      lead.payoutStatus === "approved" ? "bg-blue-100 text-blue-700" :
                      lead.payoutStatus === "processing" ? "bg-orange-100 text-orange-700" :
                      "bg-amber-100 text-amber-700"
                    }`}>
                      {lead.payoutStatus === "completed" ? "Paid" : lead.payoutStatus === "rejected" ? "Rejected" : lead.payoutStatus === "approved" ? "Approved" : lead.payoutStatus === "processing" ? "Processing" : "Pending"}
                    </span>
                    {lead.payoutStatus === "rejected" && lead.rejectionReason && (
                      <p className="text-red-600 text-xs mt-1 font-medium">Reason: {lead.rejectionReason}</p>
                    )}
                  </td>
                  <td className={`py-4 font-bold ${lead.payoutStatus === "rejected" ? "text-gray-400 line-through" : "text-[#E8822A]"}`}>${calculateFeeBreakdown(lead.payoutAmount || 0, feeSettings).providerNet.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-center text-gray-400 py-12">
          {activeConnection ? "No leads yet" : "Connect with a business to start submitting leads"}
        </p>
      )}
    </div>
  );
}

// Earnings Tab
function EarningsTab({
  dbLeads,
  totalLeads,
  totalEarnings,
  pendingEarnings,
  activeConnection,
  feeSettings,
}: {
  dbLeads: ApiLead[];
  totalLeads: number;
  totalEarnings: number;
  pendingEarnings: number;
  activeConnection: ApiConnection | null;
  feeSettings?: FeeSettings;
}) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">Total Earned (net)</p>
          <p className="text-3xl font-bold text-emerald-600">${totalEarnings.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">Pending Payouts</p>
          <p className="text-3xl font-bold text-amber-600">${pendingEarnings.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">Avg per Lead</p>
          <p className="text-3xl font-bold text-[#E8822A]">
            {(() => { const nonRejected = dbLeads.filter(l => l.payoutStatus !== "rejected").length; return nonRejected > 0 ? `$${(totalEarnings / nonRejected).toFixed(2)}` : "—"; })()}
          </p>
        </div>
      </div>

      {/* Earnings History */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#E8822A] mb-4">Earnings History</h3>
        {dbLeads.length > 0 ? (
          <div className="space-y-3">
            {dbLeads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-gray-800 font-medium">{lead.customerName}</p>
                  <p className="text-gray-500 text-sm">{new Date(lead.submittedAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  {(() => { const bd = calculateFeeBreakdown(lead.payoutAmount || 0, feeSettings); return (
                    <>
                      <p className={`font-bold ${lead.payoutStatus === "rejected" ? "text-gray-400 line-through" : "text-[#E8822A]"}`}>${bd.providerNet.toFixed(2)}</p>
                      {lead.payoutStatus !== "rejected" && (
                        <p className="text-gray-400 text-xs">${Number(lead.payoutAmount || 0).toFixed(2)} − ${bd.providerFee.toFixed(2)} fee</p>
                      )}
                    </>
                  ); })()}
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    lead.payoutStatus === "completed" ? "bg-emerald-100 text-emerald-700" :
                    lead.payoutStatus === "rejected" ? "bg-red-100 text-red-700" :
                    lead.payoutStatus === "approved" ? "bg-blue-100 text-blue-700" :
                    lead.payoutStatus === "processing" ? "bg-orange-100 text-orange-700" :
                    "bg-amber-100 text-amber-700"
                  }`}>
                    {lead.payoutStatus === "completed" ? "Paid" : lead.payoutStatus === "rejected" ? "Rejected" : lead.payoutStatus === "approved" ? "Approved" : lead.payoutStatus === "processing" ? "Processing" : "Pending"}
                  </span>
                  {lead.payoutStatus === "rejected" && lead.rejectionReason && (
                    <p className="text-red-600 text-xs mt-1 font-medium">Reason: {lead.rejectionReason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-400 py-8">No earnings yet</p>
        )}
      </div>
    </div>
  );
}

// Profile Tab
function ProfileTab({
  provider,
  updateUser,
}: {
  provider: import("@/lib/auth-types").LeadProvider | null;
  updateUser: (updates: Partial<import("@/lib/auth-types").User>) => void;
}) {
  const [displayName, setDisplayName] = useState(provider?.displayName || "");
  const [phone, setPhone] = useState(provider?.phone || "");
  const [location, setLocation] = useState(provider?.location || "");
  const [bio, setBio] = useState(provider?.bio || "");
  const [profilePicture, setProfilePicture] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<"not_connected" | "pending" | "connected">("not_connected");
  const [stripeLoading, setStripeLoading] = useState(false);

  // Fetch full profile (including payout details) and Stripe status on mount
  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data = await res.json();
          const p = data.profile;
          if (p.profilePictureUrl) setProfilePicture(p.profilePictureUrl);
          // Stripe Connect status
          if (p.stripeOnboardingComplete) {
            setStripeStatus("connected");
          } else if (p.stripeAccountId) {
            setStripeStatus("pending");
          }
        }
      } catch (e) {
        console.error("Failed to load profile:", e);
      }
      setProfileLoaded(true);
    }
    loadProfile();
  }, []);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = document.createElement("img");
      const reader = new FileReader();
      reader.onloadend = () => {
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxSize = 400;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; }
          } else {
            if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("Canvas not supported")); return; }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const handlePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setProfilePicture(compressed);
      } catch {
        console.error("Failed to process image");
      }
    }
  };

  const handleSave = async () => {
    if (!provider) return;
    setSaving(true);
    await updateUser({
      displayName,
      phone,
      location,
      bio,
      profilePictureUrl: profilePicture || undefined,
    } as any);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };


  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Profile Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#E8822A] mb-6">Edit Profile</h3>

        {saved && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Profile saved successfully!
          </div>
        )}

        <div className="space-y-4">
          {/* Profile Picture */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {profilePicture ? (
                <img src={profilePicture} alt="Profile" className="h-20 w-20 rounded-full object-cover border-2 border-gray-200" />
              ) : (
                <div className="h-20 w-20 rounded-full bg-[#E8822A] flex items-center justify-center border-2 border-gray-200">
                  <span className="text-2xl font-bold text-white">{displayName?.charAt(0) || "?"}</span>
                </div>
              )}
            </div>
            <div>
              <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition inline-block">
                Upload Photo
                <input type="file" accept="image/*" onChange={handlePictureChange} className="hidden" />
              </label>
              {profilePicture && (
                <button onClick={() => setProfilePicture("")} className="ml-2 text-red-500 hover:text-red-700 text-sm">Remove</button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#E8822A] focus:outline-none transition"
            />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#E8822A] focus:outline-none transition"
            />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, State"
              className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-[#E8822A] focus:outline-none transition"
            />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Tell businesses about yourself..."
              className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-[#E8822A] focus:outline-none transition resize-none"
            />
          </div>

          {/* Stripe Connect — Direct Payouts */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-[#635BFF]" viewBox="0 0 24 24" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.19l-.897 5.555C5.014 22.77 7.862 24 11.422 24c2.58 0 4.711-.636 6.25-1.872 1.69-1.349 2.498-3.34 2.498-5.777 0-4.116-2.503-5.834-6.194-7.2z"/></svg>
                <span className="text-sm font-semibold text-gray-800">Stripe Connect</span>
              </div>
              {stripeStatus === "connected" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Connected
                </span>
              )}
              {stripeStatus === "pending" && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  Pending
                </span>
              )}
            </div>
            <p className="text-gray-500 text-xs mb-3">
              {stripeStatus === "connected"
                ? "Your bank account is connected. Payouts from Stripe-paying businesses go directly to your bank."
                : "Connect your bank account to receive automatic payouts when businesses pay via Stripe."}
            </p>
            <button
              onClick={async () => {
                setStripeLoading(true);
                try {
                  const res = await fetch("/api/stripe/connect", { method: "POST" });
                  const data = await res.json();
                  if (data.onboardingUrl) {
                    window.location.href = data.onboardingUrl;
                  } else if (data.dashboardUrl) {
                    window.open(data.dashboardUrl, "_blank");
                  } else if (data.error) {
                    alert(data.error);
                  }
                } catch (e) {
                  console.error("Stripe Connect error:", e);
                  alert("Failed to connect Stripe. Please try again.");
                } finally {
                  setStripeLoading(false);
                }
              }}
              disabled={stripeLoading}
              className={`text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50 ${
                stripeStatus === "connected"
                  ? "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200"
                  : "bg-[#635BFF] hover:bg-[#5248e5] text-white"
              }`}
            >
              {stripeLoading ? "Loading..." : stripeStatus === "connected" ? "Open Stripe Dashboard" : stripeStatus === "pending" ? "Complete Setup" : "Connect Bank Account"}
            </button>
          </div>


          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#E8822A] hover:bg-[#D47526] text-white px-6 py-2 rounded-lg transition font-semibold shadow-md disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>

      {/* Baseball Card Preview */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#E8822A] mb-6">Your Baseball Card Preview</h3>

        <div className="border border-gray-200 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-[#E8822A] to-[#D47526] p-6 text-white">
            <div className="flex items-center gap-4">
              {profilePicture ? (
                <img src={profilePicture} alt="Profile" className="h-16 w-16 rounded-full object-cover border-2 border-white/30" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-2xl font-bold">{displayName?.charAt(0) || "?"}</span>
                </div>
              )}
              <div>
                <h4 className="text-xl font-bold">{displayName || "Your Name"}</h4>
                <p className="text-white/70">@{provider?.username}</p>
                {location && <p className="text-white/60 text-sm">{location}</p>}
              </div>
            </div>
          </div>

          <div className="p-6">
            {bio && (
              <p className="text-gray-600 text-sm mb-4 italic">&ldquo;{bio}&rdquo;</p>
            )}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center bg-gray-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-[#E8822A]">{provider?.stats?.totalLeadsSubmitted || 0}</p>
                <p className="text-gray-500 text-xs uppercase tracking-wide">Leads</p>
              </div>
              <div className="text-center bg-gray-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-emerald-600">${Number(provider?.stats?.totalEarnings || 0).toFixed(2)}</p>
                <p className="text-gray-500 text-xs uppercase tracking-wide">Earned</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-3">
              <span className="text-gray-500">Payment: Stripe</span>
              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Disable Account (Danger Zone) ────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mt-6">
        <h3 className="text-sm font-semibold text-red-700 mb-2">Danger Zone</h3>
        <p className="text-gray-500 text-sm mb-4">
          Disabling your account prevents login and hides your profile. Your data is preserved and an admin can re-enable your account if you contact{' '}
          <a href="mailto:support@womleads.com" className="text-[#E8822A] underline">support@womleads.com</a>.
        </p>
        <ProviderDisableButton />
      </div>
    </div>
  );
}

function ProviderDisableButton() {
  const [confirmText, setConfirmText] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDisable = async () => {
    setDisabling(true);
    setError(null);
    try {
      const res = await fetch("/api/account/disable", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        window.location.href = "/auth/login";
      } else {
        setError(data.error || "Failed to disable account.");
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setDisabling(false);
    }
  };

  if (!showConfirm) {
    return (
      <div>
        <button
          onClick={() => setShowConfirm(true)}
          className="border border-red-300 text-red-600 hover:bg-red-50 px-5 py-2 rounded-lg text-sm font-medium transition"
        >
          Disable My Account
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      <p className="text-red-800 text-sm font-semibold mb-1">Are you sure?</p>
      <p className="text-red-700 text-sm mb-4">
        Type <strong>DISABLE</strong> below to confirm. You will be logged out immediately.
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder="Type DISABLE to confirm"
        className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-red-300"
      />
      <div className="flex gap-3">
        <button
          onClick={handleDisable}
          disabled={confirmText !== "DISABLE" || disabling}
          className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {disabling ? "Disabling..." : "Confirm Disable"}
        </button>
        <button
          onClick={() => { setShowConfirm(false); setConfirmText(""); setError(null); }}
          className="text-gray-500 hover:text-gray-700 text-sm px-4 py-2"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    navy: "text-[#E8822A]",
    emerald: "text-emerald-600",
    blue: "text-orange-600",
    amber: "text-amber-600",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <p className="text-gray-500 text-sm mb-1">{title}</p>
      <p className={`text-3xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}
