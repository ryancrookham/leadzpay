"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth, useCurrentProvider } from "@/lib/auth-context";
import { useLeads, type Lead, type CustomerProfile } from "@/lib/leads-context";
import { useConnections, type ApiConnection } from "@/lib/connection-context";
import { isProvider, LeadBuyer } from "@/lib/auth-types";
import { formatPaymentTiming, type PaymentTiming } from "@/lib/connection-types";
import { calculateMultiCarrierQuotes, type QuoteResult, type MultiCarrierQuoteInput } from "@/lib/insurance-calculator";
import { PAYMENT_METHODS, calculateFee, type PaymentMethodType, DISCLAIMERS } from "@/lib/payment-types";

// Lead form data interface (basic info)
interface LeadFormData {
  customerName: string;
  email: string;
  phone: string;
  carYear: string;
  carMake: string;
  carModel: string;
  state: string;
}

// Extended form data for quote channel
interface ExtendedFormData extends LeadFormData {
  age: string;
  gender: "male" | "female" | "other";
  maritalStatus: "single" | "married" | "divorced" | "widowed";
  zipCode: string;
  creditScore: "excellent" | "good" | "fair" | "poor";
  homeOwner: boolean;
  yearsLicensed: string;
  drivingHistory: "clean" | "minor_violations" | "major_violations" | "accidents" | "dui";
  priorInsurance: boolean;
  annualMileage: string;
  vehicleOwnership: "owned" | "financed" | "leased";
  primaryUse: "commute" | "pleasure" | "business";
  garageType: "garage" | "carport" | "street" | "parking_lot";
  antiTheft: boolean;
  safetyFeatures: boolean;
  occupation: "standard" | "professional" | "military" | "student";
  coverageType: "liability" | "collision" | "comprehensive" | "full";
  deductible: 250 | 500 | 1000 | 2000;
}

// Chat message interface
interface ChatMessage {
  role: "user" | "ai";
  text: string;
  action?: { type: string; data?: QuoteResult };
}

// Lead submission channel
type LeadChannel = "asap" | "quote";

// Form step type
// ASAP flow: channel -> basic_info -> success (agent calls)
// Quote flow: channel -> license_upload -> plate_upload -> success (with plate verification)
type FormStep = "channel" | "basic_info" | "license_upload" | "plate_upload" | "state_confirm" | "extended_info" | "chatbot" | "quotes" | "payment" | "success";

// US States list
const US_STATES = [
  { value: "AL", label: "Alabama" }, { value: "AK", label: "Alaska" }, { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" }, { value: "CA", label: "California" }, { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" }, { value: "DE", label: "Delaware" }, { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" }, { value: "HI", label: "Hawaii" }, { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" }, { value: "IN", label: "Indiana" }, { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" }, { value: "KY", label: "Kentucky" }, { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" }, { value: "MD", label: "Maryland" }, { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" }, { value: "MN", label: "Minnesota" }, { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" }, { value: "MT", label: "Montana" }, { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" }, { value: "NH", label: "New Hampshire" }, { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" }, { value: "NY", label: "New York" }, { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" }, { value: "OH", label: "Ohio" }, { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" }, { value: "PA", label: "Pennsylvania" }, { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" }, { value: "SD", label: "South Dakota" }, { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" }, { value: "UT", label: "Utah" }, { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" }, { value: "WA", label: "Washington" }, { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" }, { value: "WY", label: "Wyoming" }, { value: "DC", label: "Washington DC" },
];

type Tab = "dashboard" | "connection" | "leads" | "earnings" | "profile";

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
  const { currentUser, isAuthenticated, isLoading, logout, updateUser } = useAuth();
  const currentProvider = useCurrentProvider();
  const { leads, addLead } = useLeads();
  const {
    getRequestsForProvider,
    getInvitationsForProvider,
    getActiveConnectionForProvider,
    sendConnectionRequest,
    acceptTerms,
    declineTerms,
    updateConnectionStats,
    fetchUsersByRole,
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
    router.replace("/");
  };

  // Show branded loading state during auth check
  if (isLoading || !isAuthenticated || !currentUser || !isProvider(currentUser)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Image src="/woml-logo.png" alt="WOML" width={200} height={60} className="mx-auto mb-4" priority />
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f] mx-auto"></div>
        </div>
      </div>
    );
  }

  // Get connection status
  const activeConnection = getActiveConnectionForProvider(currentUser.id);
  const myRequests = getRequestsForProvider(currentUser.id);
  // Also get invitations from businesses (requests where provider email matches and terms are already set)
  const myInvitations = getInvitationsForProvider(currentUser.email);
  const pendingTermsRequest = myRequests.find(r => r.status === "pending_provider_accept");
  const pendingRequest = myRequests.find(r => r.status === "pending_buyer_review");
  // Business invitations are also terms_set status but initiated by the business
  const pendingInvitation = myInvitations.length > 0 ? myInvitations[0] : null;

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
    if (pendingInvitation) return { status: "invitation", message: "New Invitation" };
    if (pendingRequest) return { status: "pending", message: "Awaiting Approval" };
    return { status: "none", message: "Not Connected" };
  };

  const connectionStatus = getConnectionStatus();

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Watermark Logo Background */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <Image
          src="/woml-logo.png"
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
            <Link href="/" className="flex items-center">
              <Image
                src="/woml-logo.png"
                alt="WOML - Word of Mouth Leads"
                width={240}
                height={70}
                className="h-16 w-auto object-contain"
              />
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
            onNavigateToConnection={() => setActiveTab("connection")}
          />
        )}

        {/* Connection Tab */}
        {activeTab === "connection" && (
          <ConnectionTab
            currentUser={currentUser}
            currentProvider={currentProvider}
            activeConnection={activeConnection}
            pendingTermsRequest={pendingTermsRequest}
            pendingInvitation={pendingInvitation}
            pendingRequest={pendingRequest}
            myRequests={myRequests}
            fetchUsersByRole={fetchUsersByRole}
            sendConnectionRequest={sendConnectionRequest}
            acceptTerms={acceptTerms}
            declineTerms={declineTerms}
            addLead={addLead}
            updateConnectionStats={updateConnectionStats}
          />
        )}

        {/* Leads Tab */}
        {activeTab === "leads" && (
          <LeadsTab myLeads={myLeads} activeConnection={activeConnection} onNavigateToConnection={() => setActiveTab("connection")} />
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
  onNavigateToConnection,
}: {
  activeConnection: ApiConnection | null;
  myLeads: Lead[];
  totalLeads: number;
  claimedLeads: number;
  totalEarnings: number;
  pendingEarnings: number;
  onNavigateToConnection: () => void;
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
          <button
            onClick={onNavigateToConnection}
            className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md hover:border-[#1e3a5f]/30 transition group text-left"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center group-hover:bg-[#1e3a5f]/20 transition">
                <svg className="w-6 h-6 text-[#1e3a5f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#1e3a5f]">Submit New Lead</h3>
                <p className="text-gray-500 text-sm">Earn ${activeConnection.rate_per_lead} per lead</p>
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
                <p className="text-gray-500 text-sm">${activeConnection.rate_per_lead}/lead • {formatPaymentTiming(activeConnection.payment_timing as PaymentTiming)}</p>
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
  pendingInvitation,
  pendingRequest,
  myRequests,
  fetchUsersByRole,
  sendConnectionRequest,
  acceptTerms,
  declineTerms,
  addLead,
  updateConnectionStats,
}: {
  currentUser: import("@/lib/auth-types").User;
  currentProvider: import("@/lib/auth-types").LeadProvider | null;
  activeConnection: ApiConnection | null;
  pendingTermsRequest: ApiConnection | undefined;
  pendingInvitation: ApiConnection | null;
  pendingRequest: ApiConnection | undefined;
  myRequests: ApiConnection[];
  fetchUsersByRole: (role: "buyer" | "provider") => Promise<import("@/lib/connection-context").DiscoveryUser[]>;
  sendConnectionRequest: (buyerId: string, message?: string) => Promise<ApiConnection | null>;
  acceptTerms: (connectionId: string) => Promise<boolean>;
  declineTerms: (connectionId: string) => Promise<boolean>;
  addLead: (lead: Omit<Lead, "id" | "createdAt">) => Lead;
  updateConnectionStats: (connectionId: string, leadPayout: number) => void;
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

  // Multi-step lead submission state
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [channel, setChannel] = useState<LeadChannel | null>(null);
  const [formStep, setFormStep] = useState<FormStep>("channel");
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [callStatus, setCallStatus] = useState<"idle" | "calling" | "completed" | "failed">("idle");

  // Form data
  const [formData, setFormData] = useState<ExtendedFormData>({
    customerName: "",
    email: "",
    phone: "",
    carYear: "",
    carMake: "",
    carModel: "",
    state: "PA",
    age: "35",
    gender: "other",
    maritalStatus: "single",
    zipCode: "",
    creditScore: "good",
    homeOwner: false,
    yearsLicensed: "10",
    drivingHistory: "clean",
    priorInsurance: true,
    annualMileage: "12000",
    vehicleOwnership: "owned",
    primaryUse: "commute",
    garageType: "garage",
    antiTheft: false,
    safetyFeatures: true,
    occupation: "standard",
    coverageType: "full",
    deductible: 500,
  });

  // Quote and chatbot state
  const [allQuotes, setAllQuotes] = useState<QuoteResult[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<QuoteResult | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Payment state
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethodType>("ach_bank");
  const [stateConfirmed, setStateConfirmed] = useState(false);

  // Simple quote form state (license upload flow)
  const [licenseImage, setLicenseImage] = useState<string | null>(null);
  const [quoteEmail, setQuoteEmail] = useState("");
  const [quotePhone, setQuotePhone] = useState("");
  const [extractedLicenseData, setExtractedLicenseData] = useState<{
    firstName: string;
    lastName: string;
    fullName: string;
    dateOfBirth: string;
    age: number;
    gender: "male" | "female" | "other";
    licenseNumber: string;
    licenseState: string;
    expirationDate: string;
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      fullAddress: string;
    };
    isExpired: boolean;
    isValid: boolean;
    daysUntilExpiration: number;
    validationNotes: string[];
    confidence: "high" | "medium" | "low";
  } | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // License plate verification state
  const [plateImage, setPlateImage] = useState<string | null>(null);
  const [plateNumber, setPlateNumber] = useState("");
  const [plateState, setPlateState] = useState("");
  const [isVerifyingPlate, setIsVerifyingPlate] = useState(false);
  const [plateVerificationResult, setPlateVerificationResult] = useState<{
    success: boolean;
    extractedPlate?: { plateNumber: string; state?: string; confidence: number };
    matchesManualEntry: boolean;
    mismatchDetails?: string;
    vehicle?: { verified: boolean; make?: string; model?: string; year?: number; color?: string };
  } | null>(null);
  const [plateError, setPlateError] = useState<string | null>(null);

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

  useEffect(() => {
    const loadBuyers = async () => {
      setLoadingBuyers(true);
      try {
        const users = await fetchUsersByRole("buyer");
        const buyerList = users.map((u) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName || u.email,
          businessName: u.businessName || "",
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
    setChannel(null);
    setFormStep("channel");
    setFormData({
      customerName: "", email: "", phone: "", carYear: "", carMake: "", carModel: "", state: "PA",
      age: "35", gender: "other", maritalStatus: "single", zipCode: "", creditScore: "good",
      homeOwner: false, yearsLicensed: "10", drivingHistory: "clean", priorInsurance: true,
      annualMileage: "12000", vehicleOwnership: "owned", primaryUse: "commute", garageType: "garage",
      antiTheft: false, safetyFeatures: true, occupation: "standard", coverageType: "full", deductible: 500,
    });
    setAllQuotes([]);
    setSelectedQuote(null);
    setChatMessages([]);
    setCallStatus("idle");
    setSelectedPaymentMethod("ach_bank");
    setStateConfirmed(false);
    // Reset simple quote form
    setLicenseImage(null);
    setQuoteEmail("");
    setQuotePhone("");
    setExtractedLicenseData(null);
    setIsExtracting(false);
    setExtractionError(null);
    // Reset plate verification
    setPlateImage(null);
    setPlateNumber("");
    setPlateState("");
    setIsVerifyingPlate(false);
    setPlateVerificationResult(null);
    setPlateError(null);
  };

  // Generate quotes using the insurance calculator
  const generateQuotes = () => {
    const input: MultiCarrierQuoteInput = {
      carModel: `${formData.carYear} ${formData.carMake} ${formData.carModel}`,
      state: formData.state,
      age: parseInt(formData.age) || 35,
      gender: formData.gender,
      maritalStatus: formData.maritalStatus,
      creditScore: formData.creditScore,
      homeOwner: formData.homeOwner,
      yearsLicensed: parseInt(formData.yearsLicensed) || 10,
      drivingHistory: formData.drivingHistory,
      priorInsurance: formData.priorInsurance,
      annualMileage: parseInt(formData.annualMileage) || 12000,
      vehicleOwnership: formData.vehicleOwnership,
      primaryUse: formData.primaryUse,
      garageType: formData.garageType,
      antiTheft: formData.antiTheft,
      safetyFeatures: formData.safetyFeatures,
      occupation: formData.occupation,
      coverageType: formData.coverageType,
      deductible: formData.deductible,
    };
    const quotes = calculateMultiCarrierQuotes(input);
    setAllQuotes(quotes);
    setSelectedQuote(quotes[0] || null);
    return quotes;
  };

  // Initialize chatbot with greeting
  const initializeChatbot = (quotes: QuoteResult[]) => {
    const bestQuote = quotes[0];
    if (!bestQuote) return;

    const firstName = formData.customerName.split(" ")[0] || "there";
    setChatMessages([{
      role: "ai",
      text: `Great news, ${firstName}! I've found some excellent rates for your ${formData.carYear} ${formData.carMake} ${formData.carModel}.\n\nBased on your profile, you qualify for multiple discounts!\n\n**Your BEST rate: $${bestQuote.monthlyPremium}/month with ${bestQuote.companyName}**\n\nThis rate includes ${bestQuote.totalDiscount}% in savings. Would you like me to lock this in for you today, or do you have any questions about the coverage?`
    }]);
  };

  // Handle chat messages
  const handleChatSend = async (message: string) => {
    if (!message.trim() || isAiLoading) return;

    setChatMessages(prev => [...prev, { role: "user", text: message }]);
    setChatInput("");
    setIsAiLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...chatMessages, { role: "user" as const, text: message }].map(m => ({
            role: m.role === "ai" ? "assistant" : m.role,
            content: m.text,
          })),
          customerProfile: {
            name: formData.customerName,
            vehicleInfo: `${formData.carYear} ${formData.carMake} ${formData.carModel}`,
            state: formData.state,
          },
          quotes: allQuotes,
          selectedQuote,
        }),
      });

      const data = await response.json();
      setChatMessages(prev => [...prev, { role: "ai", text: data.message, action: data.action }]);
    } catch {
      setChatMessages(prev => [...prev, {
        role: "ai",
        text: "I apologize, I'm having trouble connecting. Please try again or click 'View All Quotes' to see your options directly.",
      }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Handle ASAP submission - trigger call
  const handleAsapSubmit = async () => {
    if (!activeConnection || !currentProvider) return;

    // Check lead caps before submission
    const capStatus = checkLeadCaps(activeConnection);
    if (!capStatus.canSubmitLead) {
      alert(capStatus.message || "Lead cap reached. Unable to submit.");
      return;
    }

    setCallStatus("calling");
    const payout = activeConnection.rate_per_lead;

    // Create the lead
    const lead = addLead({
      providerId: currentUser.id,
      providerName: currentProvider.displayName,
      buyerId: activeConnection.buyerId,
      customerName: formData.customerName,
      email: formData.email,
      phone: formData.phone,
      carYear: parseInt(formData.carYear) || new Date().getFullYear(),
      carModel: `${formData.carMake} ${formData.carModel}`.trim(),
      quoteType: "asap",
      payout,
      connectionId: activeConnection.id,
      status: "pending",
    });

    // Update connection stats
    updateConnectionStats(activeConnection.id, payout);

    // Trigger Twilio call
    try {
      const response = await fetch("/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: formData.customerName,
          customerPhone: formData.phone,
          carModel: `${formData.carMake} ${formData.carModel}`,
          quoteType: "asap",
          leadId: lead.id,
        }),
      });

      const data = await response.json();
      if (data.success || data.simulated) {
        setCallStatus("completed");
        setFormStep("success");
        setLeadSubmitted(true);
      } else {
        setCallStatus("failed");
      }
    } catch {
      // Even if call fails, lead is still created
      setCallStatus("completed");
      setFormStep("success");
      setLeadSubmitted(true);
    }
  };

  // Handle Quote purchase
  const handlePurchase = () => {
    if (!activeConnection || !currentProvider || !selectedQuote) return;

    // Check lead caps before submission
    const capStatus = checkLeadCaps(activeConnection);
    if (!capStatus.canSubmitLead) {
      alert(capStatus.message || "Lead cap reached. Unable to submit.");
      return;
    }

    const payout = activeConnection.rate_per_lead;

    addLead({
      providerId: currentUser.id,
      providerName: currentProvider.displayName,
      buyerId: activeConnection.buyerId,
      customerName: formData.customerName,
      email: formData.email,
      phone: formData.phone,
      carYear: parseInt(formData.carYear) || new Date().getFullYear(),
      carModel: `${formData.carMake} ${formData.carModel}`.trim(),
      quoteType: "quote",
      payout,
      connectionId: activeConnection.id,
      status: "converted",
      quote: {
        monthlyPremium: selectedQuote.monthlyPremium,
        annualPremium: selectedQuote.annualPremium,
        coverageType: selectedQuote.coverageType,
        deductible: selectedQuote.deductible,
        provider: selectedQuote.companyName,
      },
    });

    updateConnectionStats(activeConnection.id, payout);
    setFormStep("success");
    setLeadSubmitted(true);
  };

  // Handle simple quote submission (license upload flow)
  const handleSimpleQuoteSubmit = async () => {
    if (!activeConnection || !currentProvider) return;
    if (!quoteEmail || !quotePhone) return;
    if (!plateImage || !plateNumber || !plateState) return;

    // Check lead caps before submission
    const capStatus = checkLeadCaps(activeConnection);
    if (!capStatus.canSubmitLead) {
      alert(capStatus.message || "Lead cap reached. Unable to submit.");
      return;
    }

    const payout = activeConnection.rate_per_lead;

    // Use extracted name if available, otherwise use email prefix as placeholder
    const customerName = extractedLicenseData?.fullName || quoteEmail.split("@")[0] || "Customer";

    // Build vehicle description from verification
    let carModel = "Pending Verification";
    let carYear = new Date().getFullYear();
    if (plateVerificationResult?.vehicle?.verified) {
      carModel = `${plateVerificationResult.vehicle.make || ""} ${plateVerificationResult.vehicle.model || ""}`.trim() || "Pending Verification";
      carYear = plateVerificationResult.vehicle.year || carYear;
    }

    // Create the lead
    const newLead = addLead({
      providerId: currentUser.id,
      providerName: currentProvider.displayName,
      buyerId: activeConnection.buyerId,
      customerName,
      email: quoteEmail,
      phone: quotePhone,
      carYear,
      carModel,
      quoteType: "quote",
      payout,
      connectionId: activeConnection.id,
      status: "pending",
      licenseImage: licenseImage || undefined,
      extractedLicenseData: extractedLicenseData ? {
        firstName: extractedLicenseData.firstName,
        lastName: extractedLicenseData.lastName,
        fullName: extractedLicenseData.fullName,
        dateOfBirth: extractedLicenseData.dateOfBirth,
        age: extractedLicenseData.age,
        gender: extractedLicenseData.gender,
        licenseNumber: extractedLicenseData.licenseNumber,
        licenseState: extractedLicenseData.licenseState,
        expirationDate: extractedLicenseData.expirationDate,
        address: extractedLicenseData.address,
        isExpired: extractedLicenseData.isExpired,
        isValid: extractedLicenseData.isValid,
      } : undefined,
      // Plate verification data
      plateImage,
      plateNumber,
      plateState,
      extractedPlateData: plateVerificationResult?.extractedPlate ? {
        plateNumber: plateVerificationResult.extractedPlate.plateNumber,
        confidence: plateVerificationResult.extractedPlate.confidence,
        matchesManualEntry: plateVerificationResult.matchesManualEntry,
      } : undefined,
      vehicleVerification: plateVerificationResult?.vehicle ? {
        verified: plateVerificationResult.vehicle.verified,
        make: plateVerificationResult.vehicle.make,
        model: plateVerificationResult.vehicle.model,
        year: plateVerificationResult.vehicle.year,
        color: plateVerificationResult.vehicle.color,
        lookupSource: "Plate Recognizer",
      } : undefined,
    });

    // Push to CRM with plate data
    try {
      await fetch("/api/crm/push-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseData: extractedLicenseData,
          email: quoteEmail,
          phone: quotePhone,
          providerId: currentUser.id,
          providerName: currentProvider.displayName,
          leadType: "quote",
          // Plate verification data for CRM
          plateNumber,
          plateState,
          plateVerified: plateVerificationResult?.matchesManualEntry || false,
          vehicle: plateVerificationResult?.vehicle?.verified ? {
            make: plateVerificationResult.vehicle.make,
            model: plateVerificationResult.vehicle.model,
            year: plateVerificationResult.vehicle.year,
            color: plateVerificationResult.vehicle.color,
          } : undefined,
        }),
      });
    } catch (err) {
      console.error("CRM push failed:", err);
      // Continue - lead is still saved locally
    }

    updateConnectionStats(activeConnection.id, payout);
    setFormStep("success");
    setLeadSubmitted(true);

    // Log for debugging
    console.log("Lead submitted:", newLead);
  };

  // Handle license image upload
  const handleLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be less than 5MB");
      return;
    }

    // Reset previous extraction
    setExtractedLicenseData(null);
    setExtractionError(null);
    setIsExtracting(true);

    // Convert to base64 for storage
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Image = reader.result as string;
      setLicenseImage(base64Image);

      // Extract license data using AI
      try {
        const response = await fetch("/api/extract-license", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ licenseImage: base64Image }),
        });

        const result = await response.json();

        if (result.success && result.data) {
          setExtractedLicenseData(result.data);
          setExtractionError(null);
        } else {
          setExtractionError(result.error || "Could not extract license data. You can still submit manually.");
        }
      } catch {
        setExtractionError("Failed to process license. You can still submit manually.");
      } finally {
        setIsExtracting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle plate image upload
  const handlePlateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be less than 5MB");
      return;
    }

    setPlateError(null);
    setPlateVerificationResult(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      setPlateImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Verify plate (OCR + vehicle lookup)
  const handleVerifyPlate = async () => {
    if (!plateImage || !plateNumber || !plateState) {
      setPlateError("Please upload a plate photo and enter the plate number and state");
      return;
    }

    setIsVerifyingPlate(true);
    setPlateError(null);

    try {
      const response = await fetch("/api/verify-plate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plateImage,
          plateNumber,
          plateState,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setPlateVerificationResult(result);
      } else {
        setPlateError(result.error || "Failed to verify plate");
      }
    } catch {
      setPlateError("Failed to verify plate. Please try again.");
    } finally {
      setIsVerifyingPlate(false);
    }
  };

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

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
                <p className="text-xl font-bold text-emerald-800">
                  {channel === "asap" ? "Agent Notified!" : "Lead Submitted Successfully!"}
                </p>
                <p className="text-emerald-600">You earned ${activeConnection.rate_per_lead} for this lead.</p>
              </div>
            </div>
            {channel === "asap" && (
              <p className="text-emerald-700 text-sm">An agent will call {formData.customerName} within 60 seconds.</p>
            )}
            <button
              onClick={resetForm}
              className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium transition"
            >
              Submit Another Lead
            </button>
          </div>
        )}

        {/* Connection Info Card - Always visible */}
        {formStep !== "success" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            {/* Check lead caps */}
            {(() => {
              const capStatus = checkLeadCaps(activeConnection);
              return (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${capStatus.canSubmitLead ? "bg-emerald-500" : "bg-amber-500"}`}></div>
                      <h3 className="text-lg font-semibold text-[#1e3a5f]">Active Connection</h3>
                    </div>
                    {!showLeadForm && (
                      capStatus.canSubmitLead ? (
                        <button
                          onClick={() => setShowLeadForm(true)}
                          className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"
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
              <div className="h-16 w-16 rounded-full bg-[#1e3a5f] flex items-center justify-center">
                <span className="text-2xl font-bold text-white">{activeConnection.buyerBusinessName.charAt(0)}</span>
              </div>
              <div>
                <h4 className="text-xl font-bold text-gray-800">{activeConnection.buyerBusinessName}</h4>
                <p className="text-gray-500">Connected since {new Date(activeConnection.accepted_at || activeConnection.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Terms Display */}
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h4 className="font-semibold text-gray-800 mb-4">Your Agreement Terms</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-500 text-sm">Rate per Lead</p>
                  <p className="text-2xl font-bold text-[#1e3a5f]">${activeConnection.rate_per_lead}</p>
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
                <p className="text-3xl font-bold text-[#1e3a5f]">{activeConnection.total_leads}</p>
                <p className="text-gray-500 text-sm">Total Leads</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-emerald-600">${activeConnection.total_paid}</p>
                <p className="text-gray-500 text-sm">Total Earned</p>
              </div>
            </div>
          </div>
        )}

        {/* Lead Submission Flow */}
        {showLeadForm && formStep !== "success" && (
          <div className="bg-white rounded-xl border-2 border-[#1e3a5f] p-6 shadow-lg">
            {/* Header with close button */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                {formStep !== "channel" && (
                  <button
                    onClick={() => {
                      if (formStep === "basic_info") setFormStep("channel");
                      else if (formStep === "license_upload") setFormStep("channel");
                      else if (formStep === "plate_upload") setFormStep("license_upload");
                      else if (formStep === "state_confirm") setFormStep("basic_info");
                      else if (formStep === "extended_info") setFormStep("state_confirm");
                      else if (formStep === "chatbot") setFormStep("extended_info");
                      else if (formStep === "quotes") setFormStep("chatbot");
                      else if (formStep === "payment") setFormStep("chatbot");
                    }}
                    className="text-gray-500 hover:text-[#1e3a5f] transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                <h3 className="text-lg font-semibold text-[#1e3a5f]">
                  {formStep === "channel" && "How can we help your customer?"}
                  {formStep === "basic_info" && (channel === "asap" ? "Quick Customer Info" : "Customer Information")}
                  {formStep === "license_upload" && "Step 1: Customer Contact Info"}
                  {formStep === "plate_upload" && "Step 2: Vehicle Verification"}
                  {formStep === "state_confirm" && "Confirm State of Residence"}
                  {formStep === "extended_info" && "Driver Profile Details"}
                  {formStep === "chatbot" && "Insurance Quote Assistant"}
                  {formStep === "quotes" && "Compare All Quotes"}
                  {formStep === "payment" && "Select Payment Method"}
                </h3>
              </div>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Step 1: Channel Selection */}
            {formStep === "channel" && (
              <div className="grid md:grid-cols-2 gap-4">
                <button
                  onClick={() => { setChannel("asap"); setFormStep("basic_info"); }}
                  className="bg-white border-2 border-gray-200 hover:border-red-500 rounded-xl p-6 text-left transition group"
                >
                  <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-4 group-hover:bg-red-200 transition">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-bold text-gray-800 mb-2">ASAP - Need Insurance Now</h4>
                  <p className="text-gray-600 text-sm mb-4">Customer needs coverage immediately. Agent calls within 60 seconds.</p>
                  <ul className="text-sm text-gray-500 space-y-1">
                    <li className="flex items-center gap-2"><span className="text-red-500">•</span> Quick info collection</li>
                    <li className="flex items-center gap-2"><span className="text-red-500">•</span> Immediate agent callback</li>
                    <li className="flex items-center gap-2"><span className="text-red-500">•</span> Best for urgent needs</li>
                  </ul>
                </button>

                <button
                  onClick={() => { setChannel("quote"); setFormStep("license_upload"); }}
                  className="bg-white border-2 border-gray-200 hover:border-blue-500 rounded-xl p-6 text-left transition group"
                >
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-4 group-hover:bg-blue-200 transition">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-bold text-gray-800 mb-2">Get Quote - Quick & Easy</h4>
                  <p className="text-gray-600 text-sm mb-4">Customer might need insurance. High-value passive lead.</p>
                  <ul className="text-sm text-gray-500 space-y-1">
                    <li className="flex items-center gap-2"><span className="text-blue-500">•</span> Just upload driver&apos;s license</li>
                    <li className="flex items-center gap-2"><span className="text-blue-500">•</span> Email &amp; phone only</li>
                    <li className="flex items-center gap-2"><span className="text-blue-500">•</span> High retention potential</li>
                  </ul>
                </button>
              </div>
            )}

            {/* Simple Quote Flow: Contact Info */}
            {formStep === "license_upload" && (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-blue-700 text-sm font-medium">
                    Step 1: Customer Contact Info
                  </p>
                  <p className="text-blue-600 text-xs mt-1">
                    You&apos;ll earn ${activeConnection?.rate_per_lead || 50} for this lead. Data is sent to CRM automatically.
                  </p>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    1. Email Address *
                  </label>
                  <input
                    type="email"
                    value={quoteEmail}
                    onChange={(e) => setQuoteEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-blue-500 focus:outline-none transition text-lg"
                    placeholder="customer@email.com"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    2. Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={quotePhone}
                    onChange={(e) => setQuotePhone(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-blue-500 focus:outline-none transition text-lg"
                    placeholder="(555) 123-4567"
                  />
                </div>

                {/* CRM Push Info */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-600 text-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Lead data will be automatically pushed to {activeConnection?.buyerBusinessName}&apos;s CRM</span>
                  </div>
                </div>

                {/* Continue to Plate Upload Button */}
                <button
                  onClick={() => setFormStep("plate_upload")}
                  disabled={!quoteEmail || !quotePhone}
                  className="w-full py-4 rounded-xl font-semibold text-lg transition flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white"
                >
                  Continue to Vehicle Verification
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                <p className="text-center text-gray-500 text-xs">
                  Next: Upload vehicle license plate for verification
                </p>
              </div>
            )}

            {/* Step: Plate Upload & Verification */}
            {formStep === "plate_upload" && (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-blue-700 text-sm font-medium">
                    Step 2: Vehicle Verification - Upload license plate photo and enter plate number
                  </p>
                </div>

                {/* Plate Photo Upload */}
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    1. Take a photo of the license plate *
                  </label>
                  <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePlateUpload}
                      className="hidden"
                    />
                    {plateImage ? (
                      <div className="relative w-full h-full">
                        <img src={plateImage} alt="License Plate" className="w-full h-full object-contain rounded-lg" />
                        <button
                          onClick={(e) => { e.preventDefault(); setPlateImage(null); setPlateVerificationResult(null); }}
                          className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 text-center">
                        <svg className="w-12 h-12 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <p className="text-gray-500">Tap to take photo of license plate</p>
                        <p className="text-gray-400 text-xs">or upload from gallery</p>
                      </div>
                    )}
                  </label>
                </div>

                {/* Manual Plate Entry */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      2. State *
                    </label>
                    <select
                      value={plateState}
                      onChange={(e) => setPlateState(e.target.value)}
                      className="w-full px-3 py-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-blue-500 focus:outline-none transition"
                    >
                      <option value="">Select</option>
                      {US_STATES.map((s) => (
                        <option key={s.value} value={s.value}>{s.value}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      3. Plate Number *
                    </label>
                    <input
                      type="text"
                      value={plateNumber}
                      onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                      placeholder="ABC1234"
                      className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-blue-500 focus:outline-none transition uppercase"
                    />
                  </div>
                </div>

                {/* Verify Button */}
                <button
                  onClick={handleVerifyPlate}
                  disabled={!plateImage || !plateNumber || !plateState || isVerifyingPlate}
                  className="w-full py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  {isVerifyingPlate ? (
                    <>
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Verifying plate...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Verify Plate
                    </>
                  )}
                </button>

                {/* Verification Result */}
                {plateVerificationResult && (
                  <div className={`border rounded-xl p-4 ${
                    plateVerificationResult.matchesManualEntry
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-amber-50 border-amber-200"
                  }`}>
                    <div className="flex items-center gap-2 mb-3">
                      {plateVerificationResult.matchesManualEntry ? (
                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      )}
                      <span className={`font-semibold ${plateVerificationResult.matchesManualEntry ? "text-emerald-700" : "text-amber-700"}`}>
                        {plateVerificationResult.matchesManualEntry ? "Plate Verified ✓" : "Plate Mismatch"}
                      </span>
                    </div>

                    {plateVerificationResult.mismatchDetails && (
                      <p className="text-amber-700 text-sm mb-3">{plateVerificationResult.mismatchDetails}</p>
                    )}

                    {plateVerificationResult.extractedPlate && (
                      <div className="text-sm mb-3">
                        <span className="text-gray-500">OCR detected: </span>
                        <span className="font-mono font-bold">{plateVerificationResult.extractedPlate.plateNumber}</span>
                        <span className="text-gray-400 ml-2">({Math.round(plateVerificationResult.extractedPlate.confidence * 100)}% confidence)</span>
                      </div>
                    )}

                    {plateVerificationResult.vehicle?.verified && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Vehicle Information</p>
                        <p className="font-bold text-gray-800 text-lg">
                          {plateVerificationResult.vehicle.year} {plateVerificationResult.vehicle.make} {plateVerificationResult.vehicle.model}
                        </p>
                        {plateVerificationResult.vehicle.color && (
                          <p className="text-gray-500 text-sm">Color: {plateVerificationResult.vehicle.color}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {plateError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-700 text-sm">{plateError}</p>
                  </div>
                )}

                {/* CRM Push Info */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-600 text-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Lead + vehicle data will be pushed to {activeConnection?.buyerBusinessName}&apos;s CRM</span>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleSimpleQuoteSubmit}
                  disabled={!plateImage || !plateNumber || !plateState || isVerifyingPlate}
                  className={`w-full py-4 rounded-xl font-semibold text-lg transition flex items-center justify-center gap-2 ${
                    plateVerificationResult?.matchesManualEntry === false
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : "bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white"
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  {plateVerificationResult?.matchesManualEntry === false ? "Submit Lead (Plate Mismatch)" : "Submit Lead"}
                </button>

                <p className="text-center text-gray-500 text-xs">
                  Lead will be sent to {activeConnection?.buyerBusinessName}. You&apos;ll be paid ${activeConnection?.rate_per_lead || 50} once they process it.
                </p>
              </div>
            )}

            {/* Step 2: Basic Info Form */}
            {formStep === "basic_info" && (
              <div className="space-y-4">
                <div className={`${channel === "asap" ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"} border rounded-lg p-3 mb-4`}>
                  <p className={`${channel === "asap" ? "text-red-700" : "text-blue-700"} text-sm font-medium`}>
                    {channel === "asap"
                      ? "Get the essentials - agent will call within 60 seconds"
                      : `You'll earn $${activeConnection.rate_per_lead} when this lead converts`}
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Customer Name *</label>
                    <input type="text" value={formData.customerName} onChange={(e) => setFormData({ ...formData, customerName: e.target.value })} required
                      className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition" placeholder="John Doe" />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Email *</label>
                    <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required
                      className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition" placeholder="john@example.com" />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">Phone *</label>
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} required
                    className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition" placeholder="(555) 123-4567" />
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Vehicle Year *</label>
                    <input type="text" value={formData.carYear} onChange={(e) => setFormData({ ...formData, carYear: e.target.value })} required
                      className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition" placeholder="2022" />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Make *</label>
                    <input type="text" value={formData.carMake} onChange={(e) => setFormData({ ...formData, carMake: e.target.value })} required
                      className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition" placeholder="Toyota" />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Model *</label>
                    <input type="text" value={formData.carModel} onChange={(e) => setFormData({ ...formData, carModel: e.target.value })} required
                      className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition" placeholder="Camry" />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">State *</label>
                  <select value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition">
                    {US_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                <div className="flex gap-4 pt-4">
                  {channel === "asap" ? (
                    <button onClick={handleAsapSubmit} disabled={callStatus === "calling" || !formData.customerName || !formData.phone}
                      className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2">
                      {callStatus === "calling" ? (
                        <><span className="animate-spin">⏳</span> Connecting Agent...</>
                      ) : (
                        <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg> Call Agent Now</>
                      )}
                    </button>
                  ) : (
                    <button onClick={() => setFormStep("state_confirm")} disabled={!formData.customerName || !formData.phone || !formData.carYear}
                      className="flex-1 bg-[#1e3a5f] hover:bg-[#2a4a6f] disabled:bg-gray-300 text-white py-3 rounded-lg font-semibold transition">
                      Continue to Get Best Rates
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* State Confirmation Step (Quote only) */}
            {formStep === "state_confirm" && channel === "quote" && (
              <div className="space-y-6">
                {/* State Verification Notice */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="font-semibold text-blue-800">Insurance Licensing Verification</p>
                      <p className="text-blue-700 text-sm mt-1">Insurance rates and regulations vary by state. Please confirm the customer&apos;s state of residence to ensure we provide accurate quotes from licensed carriers.</p>
                    </div>
                  </div>
                </div>

                {/* State Selection */}
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <label className="block text-gray-700 text-sm font-medium mb-2">State of Residence *</label>
                  <select
                    value={formData.state}
                    onChange={(e) => { setFormData({ ...formData, state: e.target.value }); setStateConfirmed(false); }}
                    className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition text-lg"
                  >
                    {US_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>

                  <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <p className="text-gray-600 text-sm">
                      Selected: <span className="font-semibold text-gray-800">{US_STATES.find(s => s.value === formData.state)?.label || formData.state}</span>
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      Quotes will be based on {formData.state} insurance requirements and rates.
                    </p>
                  </div>
                </div>

                {/* Confirmation Checkbox */}
                <label className="flex items-start gap-3 cursor-pointer p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                  <input
                    type="checkbox"
                    checked={stateConfirmed}
                    onChange={(e) => setStateConfirmed(e.target.checked)}
                    className="w-5 h-5 mt-0.5 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
                  />
                  <span className="text-gray-700 text-sm">
                    I confirm that the customer is seeking insurance coverage for a vehicle registered in <strong>{US_STATES.find(s => s.value === formData.state)?.label || formData.state}</strong>, and I understand that a licensed agent will finalize their policy.
                  </span>
                </label>

                {/* Compliance Disclaimer */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-amber-800 text-xs leading-relaxed">
                    <strong>Important:</strong> {DISCLAIMERS.leadGenDisclaimer}
                  </p>
                </div>

                <button
                  onClick={() => setFormStep("extended_info")}
                  disabled={!stateConfirmed}
                  className="w-full bg-[#1e3a5f] hover:bg-[#2a4a6f] disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition"
                >
                  Continue to Profile Details
                </button>
              </div>
            )}

            {/* Step 3: Extended Info Form (Quote only) */}
            {formStep === "extended_info" && channel === "quote" && (
              <div className="space-y-4">
                <p className="text-gray-600 text-sm mb-4">More details = better rates. These help us find the best discounts.</p>

                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Age</label>
                    <input type="number" value={formData.age} onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition" />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Gender</label>
                    <select value={formData.gender} onChange={(e) => setFormData({ ...formData, gender: e.target.value as ExtendedFormData["gender"] })}
                      className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition">
                      <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Marital Status</label>
                    <select value={formData.maritalStatus} onChange={(e) => setFormData({ ...formData, maritalStatus: e.target.value as ExtendedFormData["maritalStatus"] })}
                      className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition">
                      <option value="single">Single</option><option value="married">Married</option><option value="divorced">Divorced</option><option value="widowed">Widowed</option>
                    </select>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Years Licensed</label>
                    <input type="number" value={formData.yearsLicensed} onChange={(e) => setFormData({ ...formData, yearsLicensed: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition" />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Driving History</label>
                    <select value={formData.drivingHistory} onChange={(e) => setFormData({ ...formData, drivingHistory: e.target.value as ExtendedFormData["drivingHistory"] })}
                      className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition">
                      <option value="clean">Clean Record</option><option value="minor_violations">Minor Violations</option><option value="major_violations">Major Violations</option><option value="accidents">At-Fault Accidents</option><option value="dui">DUI/DWI</option>
                    </select>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Credit Score</label>
                    <select value={formData.creditScore} onChange={(e) => setFormData({ ...formData, creditScore: e.target.value as ExtendedFormData["creditScore"] })}
                      className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition">
                      <option value="excellent">Excellent (750+)</option><option value="good">Good (700-749)</option><option value="fair">Fair (650-699)</option><option value="poor">Poor (Below 650)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Annual Mileage</label>
                    <input type="number" value={formData.annualMileage} onChange={(e) => setFormData({ ...formData, annualMileage: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition" />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Coverage Type</label>
                    <select value={formData.coverageType} onChange={(e) => setFormData({ ...formData, coverageType: e.target.value as ExtendedFormData["coverageType"] })}
                      className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition">
                      <option value="liability">Liability Only</option><option value="collision">Liability + Collision</option><option value="comprehensive">Liability + Comprehensive</option><option value="full">Full Coverage</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Deductible</label>
                    <select value={formData.deductible} onChange={(e) => setFormData({ ...formData, deductible: parseInt(e.target.value) as ExtendedFormData["deductible"] })}
                      className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition">
                      <option value={250}>$250</option><option value={500}>$500</option><option value={1000}>$1,000</option><option value={2000}>$2,000</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.homeOwner} onChange={(e) => setFormData({ ...formData, homeOwner: e.target.checked })} className="w-4 h-4" />
                    <span className="text-sm text-gray-700">Homeowner</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.priorInsurance} onChange={(e) => setFormData({ ...formData, priorInsurance: e.target.checked })} className="w-4 h-4" />
                    <span className="text-sm text-gray-700">Currently Insured</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.antiTheft} onChange={(e) => setFormData({ ...formData, antiTheft: e.target.checked })} className="w-4 h-4" />
                    <span className="text-sm text-gray-700">Anti-Theft Device</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.safetyFeatures} onChange={(e) => setFormData({ ...formData, safetyFeatures: e.target.checked })} className="w-4 h-4" />
                    <span className="text-sm text-gray-700">Safety Features (ABS, Airbags)</span>
                  </label>
                </div>

                <button onClick={() => { const quotes = generateQuotes(); initializeChatbot(quotes); setFormStep("chatbot"); }}
                  className="w-full bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white py-3 rounded-lg font-semibold transition mt-4">
                  Get My Quotes
                </button>
              </div>
            )}

            {/* Step 4: Chatbot */}
            {formStep === "chatbot" && (
              <div className="flex flex-col h-[500px]">
                {/* Quote Header */}
                {selectedQuote && (
                  <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2a4a6f] rounded-t-xl p-4 text-white -mx-6 -mt-6 mb-4">
                    <div className="flex items-center justify-between px-2">
                      <div>
                        <p className="text-sm opacity-80">Best Rate for {formData.customerName.split(" ")[0]}</p>
                        <p className="text-3xl font-bold">${selectedQuote.monthlyPremium}/mo</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm opacity-80">{selectedQuote.companyName}</p>
                        <p className="text-sm text-emerald-300">Saving {selectedQuote.totalDiscount}%</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-xl px-4 py-3 ${msg.role === "user" ? "bg-[#1e3a5f] text-white" : "bg-gray-100 text-gray-800"}`}>
                        <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                      </div>
                    </div>
                  ))}
                  {isAiLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-xl px-4 py-3">
                        <div className="flex gap-1"><span className="animate-bounce">.</span><span className="animate-bounce delay-100">.</span><span className="animate-bounce delay-200">.</span></div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button onClick={() => handleChatSend("Yes, lock in this rate!")} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition">Lock In This Rate</button>
                  <button onClick={() => setFormStep("quotes")} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition">View All Quotes</button>
                  <button onClick={() => handleChatSend("What's included in my coverage?")} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition">What&apos;s Covered?</button>
                  <button onClick={() => handleChatSend("Can I get a lower price?")} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition">Lower Price Options</button>
                </div>

                {/* Chat Input */}
                <div className="flex gap-2">
                  <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleChatSend(chatInput)}
                    placeholder="Ask about coverage, discounts, or anything else..." className="flex-1 px-4 py-3 rounded-lg border border-gray-200 focus:border-[#1e3a5f] focus:outline-none" />
                  <button onClick={() => handleChatSend(chatInput)} className="bg-[#1e3a5f] text-white px-4 py-3 rounded-lg">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  </button>
                </div>

                {/* Purchase CTA */}
                {selectedQuote && (
                  <button onClick={() => setFormStep("payment")} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Purchase {selectedQuote.companyName} - ${selectedQuote.monthlyPremium}/mo
                  </button>
                )}
              </div>
            )}

            {/* Payment Method Selection Step */}
            {formStep === "payment" && selectedQuote && (
              <div className="space-y-6">
                {/* Selected Quote Summary */}
                <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2a4a6f] rounded-xl p-4 text-white -mx-6 -mt-6 mb-2">
                  <div className="flex items-center justify-between px-2">
                    <div>
                      <p className="text-sm opacity-80">Selected Policy</p>
                      <p className="text-2xl font-bold">${selectedQuote.monthlyPremium}/mo</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{selectedQuote.companyName}</p>
                      <p className="text-sm text-emerald-300">{selectedQuote.coverageType} coverage</p>
                    </div>
                  </div>
                </div>

                {/* Payment Methods */}
                <div>
                  <h4 className="font-semibold text-gray-800 mb-3">Choose Payment Method</h4>
                  <div className="space-y-3">
                    {PAYMENT_METHODS.map((method) => {
                      const fee = calculateFee(method, selectedQuote.monthlyPremium);
                      const total = selectedQuote.monthlyPremium + fee;
                      return (
                        <label
                          key={method.id}
                          className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition ${
                            selectedPaymentMethod === method.id
                              ? "border-[#1e3a5f] bg-[#1e3a5f]/5"
                              : "border-gray-200 hover:border-[#1e3a5f]/30"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="paymentMethod"
                              value={method.id}
                              checked={selectedPaymentMethod === method.id}
                              onChange={(e) => setSelectedPaymentMethod(e.target.value as PaymentMethodType)}
                              className="w-4 h-4 text-[#1e3a5f]"
                            />
                            <div className="text-2xl">{method.icon}</div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-800">{method.name}</span>
                                {method.recommended && (
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">Recommended</span>
                                )}
                              </div>
                              <p className="text-sm text-gray-500">{method.processingTime}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            {fee > 0 ? (
                              <>
                                <p className="font-semibold text-gray-800">${total.toFixed(2)}</p>
                                <p className="text-xs text-gray-500">+${fee.toFixed(2)} fee</p>
                              </>
                            ) : (
                              <>
                                <p className="font-semibold text-gray-800">${selectedQuote.monthlyPremium.toFixed(2)}</p>
                                <p className="text-xs text-emerald-600">No fee</p>
                              </>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Fee Breakdown */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <h5 className="font-medium text-gray-700 mb-3">Payment Summary</h5>
                  {(() => {
                    const method = PAYMENT_METHODS.find(m => m.id === selectedPaymentMethod);
                    const fee = method ? calculateFee(method, selectedQuote.monthlyPremium) : 0;
                    const total = selectedQuote.monthlyPremium + fee;
                    return (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Monthly Premium</span>
                          <span className="text-gray-800">${selectedQuote.monthlyPremium.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Processing Fee</span>
                          <span className={fee > 0 ? "text-gray-800" : "text-emerald-600"}>
                            {fee > 0 ? `$${fee.toFixed(2)}` : "Free"}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold">
                          <span className="text-gray-800">Total Due Today</span>
                          <span className="text-[#1e3a5f]">${total.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Fee Information */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <p className="text-blue-700 text-xs">
                    <strong>Lower fees with ACH:</strong> Bank transfers (ACH) have the lowest processing fees, capped at $5 max. Credit cards and digital wallets have higher fees but process instantly.
                  </p>
                </div>

                {/* Compliance Disclaimers */}
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-amber-800 text-xs leading-relaxed">
                      <strong>Quote Disclaimer:</strong> {DISCLAIMERS.quoteDisclaimer}
                    </p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <p className="text-gray-600 text-xs leading-relaxed">
                      {DISCLAIMERS.licenseVerification}
                    </p>
                  </div>
                </div>

                {/* Purchase Button */}
                <button
                  onClick={handlePurchase}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl font-bold transition flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Complete Purchase
                </button>

                <p className="text-center text-gray-500 text-xs">
                  A licensed insurance agent will contact you to finalize your policy.
                </p>
              </div>
            )}

            {/* Step 5: All Quotes Comparison */}
            {formStep === "quotes" && (
              <div className="space-y-4">
                <p className="text-gray-600 text-sm">Compare rates from all carriers. Click to select and purchase.</p>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {allQuotes.map((quote) => (
                    <button key={quote.companyId} onClick={() => { setSelectedQuote(quote); setFormStep("chatbot"); }}
                      className={`w-full p-4 rounded-xl border-2 text-left transition ${selectedQuote?.companyId === quote.companyId ? "border-[#1e3a5f] bg-[#1e3a5f]/5" : "border-gray-200 hover:border-[#1e3a5f]/50"}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-gray-800">{quote.companyName}</p>
                          <p className="text-sm text-gray-500">{quote.coverageType} coverage • ${quote.deductible} deductible</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-[#1e3a5f]">${quote.monthlyPremium}/mo</p>
                          <p className="text-sm text-emerald-600">{quote.totalDiscount}% savings</p>
                        </div>
                      </div>
                      {quote.discountsApplied.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {quote.discountsApplied.slice(0, 3).map((d, i) => (
                            <span key={i} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">{d}</span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <button onClick={() => setFormStep("chatbot")} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-lg font-medium transition">
                  Back to Chat
                </button>
              </div>
            )}
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
            <div className="h-16 w-16 rounded-full bg-[#1e3a5f] flex items-center justify-center">
              <span className="text-2xl font-bold text-white">{pendingInvitation.buyerBusinessName.charAt(0)}</span>
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
                <p className="text-3xl font-bold text-[#1e3a5f]">${pendingInvitation.rate_per_lead}</p>
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
            By accepting this invitation, you agree to submit leads to {pendingInvitation.buyerBusinessName} at the rate of ${pendingInvitation.rate_per_lead} per qualified lead. You can terminate this agreement at any time with {pendingInvitation.termination_notice_days || 7} days notice.
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
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-gray-500 text-sm">Rate per Lead</p>
                <p className="text-3xl font-bold text-[#1e3a5f]">${pendingTermsRequest.rate_per_lead}</p>
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
            By accepting these terms, you agree to submit leads to {pendingTermsRequest.buyerBusinessName} at the rate of ${pendingTermsRequest.rate_per_lead} per qualified lead. You can terminate this agreement at any time with {pendingTermsRequest.termination_notice_days || 7} days notice.
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
                          <p className="text-gray-500 text-sm">{buyer.location || "Insurance Agency"}</p>
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
function LeadsTab({ myLeads, activeConnection, onNavigateToConnection }: { myLeads: Lead[]; activeConnection: ApiConnection | null; onNavigateToConnection: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-[#1e3a5f]">All Leads ({myLeads.length})</h3>
        {activeConnection && (
          <button
            onClick={onNavigateToConnection}
            className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-4 py-2 rounded-lg transition flex items-center gap-2 font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Lead
          </button>
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
  activeConnection: ApiConnection | null;
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
            ${totalLeads > 0 ? Math.round(totalEarnings / totalLeads) : activeConnection?.rate_per_lead || 0}
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
