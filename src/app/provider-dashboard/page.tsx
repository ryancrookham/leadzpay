"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth, useCurrentProvider } from "@/lib/auth-context";
import { useLeads, type Lead } from "@/lib/leads-context";
import { useConnections } from "@/lib/connection-context";
import { isProvider, LeadBuyer } from "@/lib/auth-types";
import { Connection, ConnectionRequest, formatPaymentTiming } from "@/lib/connection-types";

type Tab = "dashboard" | "connection" | "leads" | "earnings" | "profile";

export default function ProviderDashboard() {
  const router = useRouter();
  const { currentUser, isAuthenticated, isLoading, logout, updateUser, getUsersByRole } = useAuth();
  const currentProvider = useCurrentProvider();
  const { leads } = useLeads();
  const {
    getRequestsForProvider,
    getActiveConnectionForProvider,
    getConnectionsForProvider,
    sendConnectionRequest,
    acceptTerms,
    declineTerms,
  } = useConnections();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  // Redirect to login if not authenticated or not a provider
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !currentUser)) {
      router.push("/auth/login?role=provider");
    } else if (!isLoading && currentUser && !isProvider(currentUser)) {
      router.push("/business");
    }
  }, [isLoading, isAuthenticated, currentUser, router]);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  // Show loading while checking auth
  if (isLoading || !isAuthenticated || !currentUser || !isProvider(currentUser)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div>
      </div>
    );
  }

  // Get connection status
  const activeConnection = getActiveConnectionForProvider(currentUser.id);
  const myRequests = getRequestsForProvider(currentUser.id);
  const pendingTermsRequest = myRequests.find(r => r.status === "terms_set");
  const pendingRequest = myRequests.find(r => r.status === "pending");

  // Get provider's leads from active connection
  const myLeads = activeConnection
    ? leads.filter(l => l.providerId === currentUser.id)
    : [];
  const totalLeads = myLeads.length;
  const claimedLeads = myLeads.filter(l => l.status === "claimed").length;
  const totalEarnings = myLeads.reduce((sum, l) => sum + (l.payout || 0), 0);
  const pendingEarnings = myLeads.filter(l => l.status === "pending").reduce((sum, l) => sum + (l.payout || 0), 0);

  // Determine connection status message
  const getConnectionStatus = () => {
    if (activeConnection) return { status: "active", message: "Connected" };
    if (pendingTermsRequest) return { status: "terms_pending", message: "Terms Pending Review" };
    if (pendingRequest) return { status: "pending", message: "Awaiting Approval" };
    return { status: "none", message: "Not Connected" };
  };

  const connectionStatus = getConnectionStatus();

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Watermark Logo Background */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <Image
          src="/logo.jpg"
          alt=""
          width={600}
          height={600}
          className="opacity-[0.02] select-none"
          priority
        />
      </div>

      {/* Header */}
      <header className="relative z-10 bg-white/90 backdrop-blur-sm border-b border-gray-200 px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo.jpg"
                alt="LeadzPay Logo"
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
              />
              <span className="text-2xl font-bold text-[#1e3a5f]">LeadzPay</span>
            </Link>
            <span className="text-gray-300">|</span>
            <span className="text-[#1e3a5f] font-medium">Provider Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${
                connectionStatus.status === "active" ? "bg-emerald-500" :
                connectionStatus.status === "terms_pending" ? "bg-amber-500" :
                connectionStatus.status === "pending" ? "bg-blue-500" : "bg-gray-400"
              }`} />
              <span className="text-sm text-gray-500">{connectionStatus.message}</span>
            </div>
            <span className="text-gray-300">|</span>
            <span className="text-gray-600">{currentProvider?.displayName}</span>
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-[#1e3a5f] transition flex items-center gap-2"
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
        {/* Connection Required Banner */}
        {!activeConnection && (
          <div className={`mb-6 p-4 rounded-xl border ${
            pendingTermsRequest
              ? "bg-amber-50 border-amber-200"
              : pendingRequest
              ? "bg-blue-50 border-blue-200"
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
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-blue-800">Connection Request Pending</p>
                    <p className="text-blue-600 text-sm">Waiting for {pendingRequest.buyerBusinessName} to review your request and set terms.</p>
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
                    className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-4 py-2 rounded-lg font-medium transition"
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
                  ? "bg-[#1e3a5f] text-white shadow-md"
                  : "bg-white text-gray-600 hover:text-[#1e3a5f] hover:bg-gray-100 border border-gray-200"
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
          <DashboardTab
            activeConnection={activeConnection}
            myLeads={myLeads}
            totalLeads={totalLeads}
            claimedLeads={claimedLeads}
            totalEarnings={totalEarnings}
            pendingEarnings={pendingEarnings}
            currentProvider={currentProvider}
          />
        )}

        {/* Connection Tab */}
        {activeTab === "connection" && (
          <ConnectionTab
            currentUser={currentUser}
            currentProvider={currentProvider}
            activeConnection={activeConnection}
            pendingTermsRequest={pendingTermsRequest}
            pendingRequest={pendingRequest}
            myRequests={myRequests}
            getUsersByRole={getUsersByRole}
            sendConnectionRequest={sendConnectionRequest}
            acceptTerms={acceptTerms}
            declineTerms={declineTerms}
          />
        )}

        {/* Leads Tab */}
        {activeTab === "leads" && (
          <LeadsTab myLeads={myLeads} activeConnection={activeConnection} />
        )}

        {/* Earnings Tab */}
        {activeTab === "earnings" && (
          <EarningsTab
            myLeads={myLeads}
            totalLeads={totalLeads}
            totalEarnings={totalEarnings}
            pendingEarnings={pendingEarnings}
            activeConnection={activeConnection}
          />
        )}

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <ProfileTab provider={currentProvider} updateUser={updateUser} />
        )}
      </div>
    </div>
  );
}

// Dashboard Tab
function DashboardTab({
  activeConnection,
  myLeads,
  totalLeads,
  claimedLeads,
  totalEarnings,
  pendingEarnings,
  currentProvider,
}: {
  activeConnection: Connection | null;
  myLeads: Lead[];
  totalLeads: number;
  claimedLeads: number;
  totalEarnings: number;
  pendingEarnings: number;
  currentProvider: import("@/lib/auth-types").LeadProvider | null;
}) {
  return (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Leads" value={totalLeads.toString()} color="navy" />
        <StatCard title="Claimed Leads" value={claimedLeads.toString()} color="emerald" />
        <StatCard title="Total Earnings" value={`$${totalEarnings.toLocaleString()}`} color="blue" />
        <StatCard title="Pending" value={`$${pendingEarnings.toLocaleString()}`} color="amber" />
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        {activeConnection ? (
          <Link
            href="/submit-lead"
            className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md hover:border-[#1e3a5f]/30 transition group"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center group-hover:bg-[#1e3a5f]/20 transition">
                <svg className="w-6 h-6 text-[#1e3a5f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#1e3a5f]">Submit New Lead</h3>
                <p className="text-gray-500 text-sm">Earn ${activeConnection.terms.paymentTerms.ratePerLead} per lead</p>
              </div>
            </div>
          </Link>
        ) : (
          <div className="bg-gray-100 rounded-xl border border-gray-200 p-6 opacity-60">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-500">Submit New Lead</h3>
                <p className="text-gray-400 text-sm">Connect with a business first</p>
              </div>
            </div>
          </div>
        )}

        {/* Connection Status Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-[#1e3a5f] mb-4">Connection Status</h3>
          {activeConnection ? (
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-800">{activeConnection.buyerBusinessName}</p>
                <p className="text-gray-500 text-sm">${activeConnection.terms.paymentTerms.ratePerLead}/lead • {formatPaymentTiming(activeConnection.terms.paymentTerms.timing)}</p>
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
        <h3 className="text-lg font-semibold text-[#1e3a5f] mb-4">Recent Leads</h3>
        {myLeads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="pb-3 font-medium">Customer</th>
                  <th className="pb-3 font-medium">Vehicle</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Payout</th>
                  <th className="pb-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {myLeads.slice(0, 5).map((lead) => (
                  <tr key={lead.id} className="border-b border-gray-100">
                    <td className="py-4 text-gray-800 font-medium">{lead.customerName}</td>
                    <td className="py-4 text-gray-600">{lead.carModel}</td>
                    <td className="py-4">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="py-4 text-[#1e3a5f] font-medium">${lead.payout || 0}</td>
                    <td className="py-4 text-gray-500 text-sm">
                      {new Date(lead.createdAt).toLocaleDateString()}
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
  pendingTermsRequest,
  pendingRequest,
  myRequests,
  getUsersByRole,
  sendConnectionRequest,
  acceptTerms,
  declineTerms,
}: {
  currentUser: import("@/lib/auth-types").User;
  currentProvider: import("@/lib/auth-types").LeadProvider | null;
  activeConnection: Connection | null;
  pendingTermsRequest: ConnectionRequest | undefined;
  pendingRequest: ConnectionRequest | undefined;
  myRequests: ConnectionRequest[];
  getUsersByRole: (role: "buyer" | "provider") => import("@/lib/auth-types").User[];
  sendConnectionRequest: (
    providerId: string,
    providerName: string,
    providerEmail: string,
    buyerId: string,
    buyerBusinessName: string,
    message?: string
  ) => ConnectionRequest;
  acceptTerms: (requestId: string) => Connection | null;
  declineTerms: (requestId: string) => void;
}) {
  const [showBuyerList, setShowBuyerList] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [selectedBuyer, setSelectedBuyer] = useState<LeadBuyer | null>(null);

  const buyers = getUsersByRole("buyer") as LeadBuyer[];

  const handleSendRequest = () => {
    if (!selectedBuyer || !currentProvider) return;

    sendConnectionRequest(
      currentUser.id,
      currentProvider.displayName,
      currentProvider.email,
      selectedBuyer.id,
      selectedBuyer.businessName,
      requestMessage || undefined
    );

    setSelectedBuyer(null);
    setRequestMessage("");
    setShowBuyerList(false);
  };

  const handleAcceptTerms = () => {
    if (!pendingTermsRequest) return;
    acceptTerms(pendingTermsRequest.id);
  };

  const handleDeclineTerms = () => {
    if (!pendingTermsRequest) return;
    declineTerms(pendingTermsRequest.id);
  };

  // Show active connection
  if (activeConnection) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-3 w-3 rounded-full bg-emerald-500"></div>
            <h3 className="text-lg font-semibold text-[#1e3a5f]">Active Connection</h3>
          </div>

          <div className="flex items-center gap-6 mb-6">
            <div className="h-16 w-16 rounded-full bg-[#1e3a5f] flex items-center justify-center">
              <span className="text-2xl font-bold text-white">{activeConnection.buyerBusinessName.charAt(0)}</span>
            </div>
            <div>
              <h4 className="text-xl font-bold text-gray-800">{activeConnection.buyerBusinessName}</h4>
              <p className="text-gray-500">Connected since {new Date(activeConnection.acceptedAt).toLocaleDateString()}</p>
            </div>
          </div>

          {/* Terms Display */}
          <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
            <h4 className="font-semibold text-gray-800 mb-4">Your Agreement Terms</h4>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <p className="text-gray-500 text-sm">Rate per Lead</p>
                <p className="text-2xl font-bold text-[#1e3a5f]">${activeConnection.terms.paymentTerms.ratePerLead}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Payment Schedule</p>
                <p className="text-xl font-semibold text-gray-800">{formatPaymentTiming(activeConnection.terms.paymentTerms.timing)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Lead Types</p>
                <p className="text-xl font-semibold text-gray-800 capitalize">{activeConnection.terms.leadTypes.join(", ")}</p>
              </div>
            </div>
            {activeConnection.terms.notes && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-gray-500 text-sm">Notes</p>
                <p className="text-gray-700">{activeConnection.terms.notes}</p>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-[#1e3a5f]">{activeConnection.stats.totalLeads}</p>
              <p className="text-gray-500 text-sm">Total Leads</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-emerald-600">${activeConnection.stats.totalPaid}</p>
              <p className="text-gray-500 text-sm">Total Earned</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show pending terms to review
  if (pendingTermsRequest && pendingTermsRequest.proposedTerms) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border-2 border-amber-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-3 w-3 rounded-full bg-amber-500 animate-pulse"></div>
            <h3 className="text-lg font-semibold text-amber-700">Terms Ready for Your Review</h3>
          </div>

          <div className="flex items-center gap-6 mb-6">
            <div className="h-16 w-16 rounded-full bg-[#1e3a5f] flex items-center justify-center">
              <span className="text-2xl font-bold text-white">{pendingTermsRequest.buyerBusinessName.charAt(0)}</span>
            </div>
            <div>
              <h4 className="text-xl font-bold text-gray-800">{pendingTermsRequest.buyerBusinessName}</h4>
              <p className="text-gray-500">Has proposed the following terms</p>
            </div>
          </div>

          {/* Proposed Terms */}
          <div className="bg-amber-50 rounded-xl p-6 border border-amber-200 mb-6">
            <h4 className="font-semibold text-gray-800 mb-4">Proposed Agreement Terms</h4>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <p className="text-gray-500 text-sm">Rate per Lead</p>
                <p className="text-3xl font-bold text-[#1e3a5f]">${pendingTermsRequest.proposedTerms.paymentTerms.ratePerLead}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Payment Schedule</p>
                <p className="text-xl font-semibold text-gray-800">{formatPaymentTiming(pendingTermsRequest.proposedTerms.paymentTerms.timing)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Lead Types</p>
                <p className="text-xl font-semibold text-gray-800 capitalize">{pendingTermsRequest.proposedTerms.leadTypes.join(", ")}</p>
              </div>
            </div>
            {pendingTermsRequest.proposedTerms.paymentTerms.minimumPayoutThreshold && (
              <div className="mt-4">
                <p className="text-gray-500 text-sm">Minimum Payout Threshold</p>
                <p className="text-lg font-semibold text-gray-800">${pendingTermsRequest.proposedTerms.paymentTerms.minimumPayoutThreshold}</p>
              </div>
            )}
            {pendingTermsRequest.proposedTerms.notes && (
              <div className="mt-4 pt-4 border-t border-amber-200">
                <p className="text-gray-500 text-sm">Notes from Business</p>
                <p className="text-gray-700">{pendingTermsRequest.proposedTerms.notes}</p>
              </div>
            )}
          </div>

          <p className="text-gray-600 text-sm mb-6">
            By accepting these terms, you agree to submit leads to {pendingTermsRequest.buyerBusinessName} at the rate of ${pendingTermsRequest.proposedTerms.paymentTerms.ratePerLead} per qualified lead. You can terminate this agreement at any time with {pendingTermsRequest.proposedTerms.terminationNoticeDays} days notice.
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
        <div className="bg-white rounded-xl border border-blue-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-3 w-3 rounded-full bg-blue-500 animate-pulse"></div>
            <h3 className="text-lg font-semibold text-blue-700">Request Pending</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-xl font-bold text-blue-600">{pendingRequest.buyerBusinessName.charAt(0)}</span>
            </div>
            <div>
              <p className="font-semibold text-gray-800">{pendingRequest.buyerBusinessName}</p>
              <p className="text-gray-500 text-sm">Waiting for them to review your request and set terms</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-[#1e3a5f] mb-4">Connect with a Business</h3>
          <p className="text-gray-600 mb-6">Select a business to request a connection. They will set the payment terms for your partnership.</p>

          {buyers.length > 0 ? (
            <div className="space-y-4">
              {buyers.map((buyer) => {
                const existingRequest = myRequests.find(r => r.buyerId === buyer.id);
                const isDisabled = !!existingRequest;

                return (
                  <div
                    key={buyer.id}
                    className={`border rounded-xl p-4 transition ${
                      selectedBuyer?.id === buyer.id
                        ? "border-[#1e3a5f] bg-[#1e3a5f]/5"
                        : isDisabled
                        ? "border-gray-200 bg-gray-50 opacity-60"
                        : "border-gray-200 hover:border-[#1e3a5f]/50 cursor-pointer"
                    }`}
                    onClick={() => !isDisabled && setSelectedBuyer(buyer)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-[#1e3a5f] flex items-center justify-center">
                          <span className="text-xl font-bold text-white">{buyer.businessName.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{buyer.businessName}</p>
                          <p className="text-gray-500 text-sm capitalize">{buyer.businessType.replace("_", " ")}</p>
                        </div>
                      </div>
                      {existingRequest && (
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          existingRequest.status === "rejected" || existingRequest.status === "declined"
                            ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                          {existingRequest.status === "rejected" ? "Rejected" :
                           existingRequest.status === "declined" ? "Declined" :
                           existingRequest.status === "accepted" ? "Connected" : "Pending"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p>No businesses available yet</p>
            </div>
          )}

          {selectedBuyer && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="font-medium text-gray-800 mb-3">Send Request to {selectedBuyer.businessName}</h4>
              <textarea
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                placeholder="Add a message (optional)"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f] transition resize-none"
                rows={3}
              />
              <button
                onClick={handleSendRequest}
                className="mt-4 w-full bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white py-3 rounded-lg font-semibold transition"
              >
                Send Connection Request
              </button>
            </div>
          )}
        </div>
      )}

      {/* Request History */}
      {myRequests.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-[#1e3a5f] mb-4">Request History</h3>
          <div className="space-y-3">
            {myRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-800">{request.buyerBusinessName}</p>
                  <p className="text-gray-500 text-sm">{new Date(request.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  request.status === "accepted" ? "bg-emerald-100 text-emerald-700" :
                  request.status === "rejected" || request.status === "declined" ? "bg-red-100 text-red-700" :
                  request.status === "terms_set" ? "bg-amber-100 text-amber-700" :
                  "bg-blue-100 text-blue-700"
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
function LeadsTab({ myLeads, activeConnection }: { myLeads: Lead[]; activeConnection: Connection | null }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-[#1e3a5f]">All Leads ({myLeads.length})</h3>
        {activeConnection && (
          <Link
            href="/submit-lead"
            className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-4 py-2 rounded-lg transition flex items-center gap-2 font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Lead
          </Link>
        )}
      </div>
      {myLeads.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Customer</th>
                <th className="pb-3 font-medium">Contact</th>
                <th className="pb-3 font-medium">Vehicle</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Payout</th>
              </tr>
            </thead>
            <tbody>
              {myLeads.map((lead) => (
                <tr key={lead.id} className="border-b border-gray-100">
                  <td className="py-4 text-gray-500 text-sm">
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-4 text-gray-800 font-medium">{lead.customerName}</td>
                  <td className="py-4 text-gray-500 text-sm">
                    <div>{lead.email}</div>
                    <div>{lead.phone}</div>
                  </td>
                  <td className="py-4 text-gray-600">{lead.carModel} ({lead.carYear})</td>
                  <td className="py-4">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="py-4 text-[#1e3a5f] font-bold">${lead.payout || 0}</td>
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
  myLeads,
  totalLeads,
  totalEarnings,
  pendingEarnings,
  activeConnection,
}: {
  myLeads: Lead[];
  totalLeads: number;
  totalEarnings: number;
  pendingEarnings: number;
  activeConnection: Connection | null;
}) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">Total Earned</p>
          <p className="text-3xl font-bold text-emerald-600">${totalEarnings.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">Pending Payouts</p>
          <p className="text-3xl font-bold text-amber-600">${pendingEarnings.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">Avg per Lead</p>
          <p className="text-3xl font-bold text-[#1e3a5f]">
            ${totalLeads > 0 ? Math.round(totalEarnings / totalLeads) : activeConnection?.terms.paymentTerms.ratePerLead || 0}
          </p>
        </div>
      </div>

      {/* Earnings History */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#1e3a5f] mb-4">Earnings History</h3>
        {myLeads.length > 0 ? (
          <div className="space-y-3">
            {myLeads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-gray-800 font-medium">{lead.customerName}</p>
                  <p className="text-gray-500 text-sm">{new Date(lead.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[#1e3a5f] font-bold">${lead.payout || 0}</p>
                  <StatusBadge status={lead.status} />
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
  const [paymentMethod, setPaymentMethod] = useState(provider?.paymentMethod || "venmo");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (provider) {
      updateUser({
        displayName,
        phone,
        location,
        bio,
        paymentMethod: paymentMethod as "venmo" | "paypal" | "bank",
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Profile Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#1e3a5f] mb-6">Edit Profile</h3>

        {saved && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Profile saved successfully!
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition"
            />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition"
            />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, State"
              className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-[#1e3a5f] focus:outline-none transition"
            />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Tell businesses about yourself..."
              className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-[#1e3a5f] focus:outline-none transition resize-none"
            />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">Preferred Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as "venmo" | "paypal" | "bank")}
              className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition"
            >
              <option value="venmo">Venmo</option>
              <option value="paypal">PayPal</option>
              <option value="bank">Bank Transfer</option>
            </select>
          </div>
          <button
            onClick={handleSave}
            className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-6 py-2 rounded-lg transition font-semibold shadow-md"
          >
            Save Profile
          </button>
        </div>
      </div>

      {/* Baseball Card Preview */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#1e3a5f] mb-6">Your Baseball Card Preview</h3>

        <div className="border border-gray-200 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2a4a6f] p-6 text-white">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-2xl font-bold">{displayName?.charAt(0) || "?"}</span>
              </div>
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
                <p className="text-2xl font-bold text-[#1e3a5f]">{provider?.stats?.totalLeadsSubmitted || 0}</p>
                <p className="text-gray-500 text-xs uppercase tracking-wide">Leads</p>
              </div>
              <div className="text-center bg-gray-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-emerald-600">${provider?.stats?.totalEarnings || 0}</p>
                <p className="text-gray-500 text-xs uppercase tracking-wide">Earned</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-3">
              <span className="text-gray-500">Payment: {paymentMethod}</span>
              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                Active
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    navy: "text-[#1e3a5f]",
    emerald: "text-emerald-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <p className="text-gray-500 text-sm mb-1">{title}</p>
      <p className={`text-3xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    claimed: "bg-emerald-100 text-emerald-700",
    expired: "bg-red-100 text-red-700",
    converted: "bg-blue-100 text-blue-700",
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}
