"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { useLeads, type Provider } from "@/lib/leads-context";
import { useAuth, useCurrentBuyer } from "@/lib/auth-context";
import { useConnections, type ApiConnection, type DiscoveryUser } from "@/lib/connection-context";
import { isBuyer } from "@/lib/auth-types";
import { ContractTerms, getDefaultContractTerms, formatPaymentTiming } from "@/lib/connection-types";
import { calculateFeeBreakdown, type FeeSettings } from "@/lib/platform-fees";
import dynamic from "next/dynamic";
import { loadStripe } from "@stripe/stripe-js";
import InviteTab, { type InviteToken, type SavedCriteria, type SavedField } from "./components/InviteTab";

const DashboardChart = dynamic(() => import("./components/DashboardChart"), { ssr: false });

// Module-level Stripe.js promise (NOT a hook — safe outside component)
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

// Type for leads returned by GET /api/leads
interface ApiLead {
  id: string;
  providerId: string;
  buyerId: string;
  connectionId: string;
  status: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerLicenseImage?: string | null;
  customerMaritalStatus?: string | null;
  customerHasInsurance?: string | null;
  customerState: string | null;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  payoutAmount: number;
  payoutStatus: "pending" | "approved" | "processing" | "completed" | "failed" | "rejected";
  payoutCompletedAt: string | null;
  submittedAt: string;
  providerName: string | null;
  providerEmail: string | null;
  providerPhone: string | null;
  buyerName: string | null;
  buyerBusinessName: string | null;
  criteriaFieldsData?: {
    fieldId: string;
    fieldType: "PHOTO" | "TEXT" | "BINARY";
    label: string;
    value: string;
  }[] | null;
  quoteCompleted: boolean;
  pipelineStatus: string;
  contactType: string | null;
  pipelineNotes: string | null;
  contactedAt: string | null;
  quotedAt: string | null;
  soldAt: string | null;
  deadAt: string | null;
  contactedSubStatus: string | null;
  deadReason: string | null;
  assignedTo: string | null;
  followUpDate: string | null;
  rejectionReason: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
}

type Tab = "dashboard" | "pipeline" | "connections" | "leaderboard" | "marketing" | "invite" | "settings";

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

// Stage ordering — higher number = further along. Terminal stages cannot be changed.
const STAGE_ORDER: Record<string, number> = {
  new: 0, contacted: 1, quoted: 2, sold: 3, dead: 3,
};
const TERMINAL_STAGES = new Set(["sold", "dead"]);

function getAvailableStages(currentStatus: string): { value: string; label: string; color: string }[] {
  const allStages = [
    { value: "contacted", label: "Contacted", color: "#f97316" },
    { value: "quoted",    label: "Quoted",    color: "#ca8a04" },
    { value: "sold",      label: "Sold",      color: "#16a34a" },
    { value: "dead",      label: "Dead",      color: "#111827" },
  ];
  if (TERMINAL_STAGES.has(currentStatus)) return [];
  const currentOrder = STAGE_ORDER[currentStatus] ?? 0;
  return allStages.filter(s => STAGE_ORDER[s.value] > currentOrder);
}

function BusinessPortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, isAuthenticated, isLoading, isSigningOut, logout } = useAuth();
  const { update: updateSession } = useSession();
  const currentBuyer = useCurrentBuyer();

  // Portal role gate state
  const [portalRole, setPortalRole] = useState<"owner" | "chaser" | null>(null);
  const [pinEntry, setPinEntry] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinVerifying, setPinVerifying] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

  // Get initial tab from URL query param
  const urlTab = searchParams.get("tab") as Tab | null;
  const allTabs: Tab[] = ["dashboard", "pipeline", "connections", "leaderboard", "marketing", "invite", "settings"];
  const chaserTabs: Tab[] = ["pipeline", "leaderboard", "marketing"];
  const validTabs: Tab[] = portalRole === "chaser" ? chaserTabs : allTabs;
  const initialTab = urlTab && validTabs.includes(urlTab) ? urlTab : validTabs[0];
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [pipelineFilter, setPipelineFilter] = useState<string>("all");
  const [pipelineSearch, setPipelineSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [providerInfoDrawer, setProviderInfoDrawer] = useState<string | null>(null);
  const [pipelineSort, setPipelineSort] = useState<"newest" | "oldest">("newest");
  const [activityDrawer, setActivityDrawer] = useState<string | null>(null);
  const [detailsDrawer, setDetailsDrawer] = useState<string | null>(null);
  const [activityCache, setActivityCache] = useState<Record<string, { actor_name: string; action: string; from_value: string | null; to_value: string | null; note: string | null; created_at: string }[]>>({});
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [expandedModalLead, setExpandedModalLead] = useState<ApiLead | null>(null);

  // Excel upload state for Dashboard analytics

  const { providers, updateProvider, addProvider } = useLeads();
  const {
    getRequestsForBuyer,
    getConnectionsForBuyer,
    setTermsForRequest,
    rejectRequest,
    updateConnectionTerms,
    terminateConnection,
    sendInvitationToProvider,
  } = useConnections();

  // Fetch all dashboard data from unified endpoint
  const [dbLeads, setDbLeads] = useState<ApiLead[]>([]);
  const [dbLeadsLoading, setDbLeadsLoading] = useState(true);
  const [feeSettings, setFeeSettings] = useState<FeeSettings | undefined>(undefined);
  const [inviteTokens, setInviteTokens] = useState<InviteToken[]>([]);
  const [savedCriteria, setSavedCriteria] = useState<SavedCriteria | null>(null);
  const [savedFields, setSavedFields] = useState<SavedField[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [batchMarkingPaid, setBatchMarkingPaid] = useState(false);

  // Stripe setup enforcement
  const [stripeSetupChecked, setStripeSetupChecked] = useState(false);
  const [stripeSetupComplete, setStripeSetupComplete] = useState(true); // default true to avoid flash
  const [stripeOverlayLoading, setStripeOverlayLoading] = useState(false);
  const [overlayAgreementChecked, setOverlayAgreementChecked] = useState(false);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [funnelTargets, setFunnelTargets] = useState({ contacted: 80, quoted: 50, sold: 30, dead: 20 });

  // Payout mode — loaded at top level so Leads tab can show instant-mode banner
  const [isInstantMode, setIsInstantMode] = useState(false);
  const [leadsPayNowLoading, setLeadsPayNowLoading] = useState(false);
  const [leadsPayNowResult, setLeadsPayNowResult] = useState<string | null>(null);

  // SMS agents loaded from settings (for attribution)
  const [smsAgents, setSmsAgents] = useState<{ name: string; phone: string }[]>([]);

  // Attribution modal state
  const [attributionModal, setAttributionModal] = useState<{
    leadId: string;
    leadName: string;
    date: string;
  } | null>(null);
  const [attrStage, setAttrStage] = useState<string>("");
  const [attrAgent, setAttrAgent] = useState<string>("");
  const [attrStep, setAttrStep] = useState<1 | 2 | 3>(1);
  const [attrDate, setAttrDate] = useState<string>("");

  // Session recovery ref — prevents infinite reload loop after cross-site redirect
  const sessionCheckRef = useRef(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/business/dashboard", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setDbLeads(data.leads);
        setFeeSettings(data.feeSettings);
        setInviteTokens(data.inviteTokens);
        setSavedCriteria(data.criteria);
        setSavedFields(data.criteriaFields);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard:", err);
    } finally {
      setDbLeadsLoading(false);
    }
  }, []);

  // Also keep a leads-only refetcher for post-payment refresh
  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/leads", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setDbLeads(data.leads);
      }
    } catch (err) {
      console.error("Failed to fetch leads:", err);
    }
  }, []);

  // Restore portal role from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem("portalRole");
    if (stored === "owner" || stored === "chaser") {
      setPortalRole(stored);
    }
  }, []);

  // Reset active tab when role changes and current tab is no longer valid
  useEffect(() => {
    if (portalRole && !validTabs.includes(activeTab)) {
      setActiveTab(validTabs[0]);
    }
  }, [portalRole, validTabs, activeTab]);

  useEffect(() => {
    if (!currentUser) return;
    fetchDashboard().then(() => {
      // Non-blocking auto-dead sweep
      fetch("/api/business/pipeline/auto-dead", { method: "POST" }).catch(() => {});
    });
  }, [currentUser, fetchDashboard]);

  // Load payout mode so Leads tab can show instant-mode banner
  useEffect(() => {
    if (!currentUser) return;
    fetch("/api/business/auto-pay-settings")
      .then(r => r.json())
      .then(data => {
        const s = data.settings ?? data;
        setIsInstantMode(s.autoPayEnabled === true && s.autoPaySchedule === "instant");
      })
      .catch(() => {});
  }, [currentUser]);

  // Check Stripe setup status for buyer
  useEffect(() => {
    if (!currentUser) return;
    fetch("/api/stripe/setup-status")
      .then(r => r.json())
      .then(data => {
        setStripeSetupComplete(data.complete === true);
        setStripeSetupChecked(true);
      })
      .catch(() => {
        setStripeSetupChecked(true); // Allow through on error to avoid permanent lockout
      });
  }, [currentUser]);

  // Fetch funnel targets from business settings
  useEffect(() => {
    fetch("/api/business/settings")
      .then(r => r.json())
      .then(data => {
        if (data.success && data.settings) {
          setFunnelTargets({
            contacted: data.settings.funnel_target_contacted ?? 80,
            quoted:    data.settings.funnel_target_quoted    ?? 50,
            sold:      data.settings.funnel_target_sold      ?? 30,
            dead:      data.settings.funnel_target_dead      ?? 20,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Load SMS agents (lead chasers) for attribution
  useEffect(() => {
    fetch("/api/business/sms-alerts")
      .then(r => r.json())
      .then(data => {
        if (data.success && data.leadChasers && Array.isArray(data.leadChasers)) {
          setSmsAgents(
            data.leadChasers.map((c: { name: string; phone: string }) => ({
              name: c.name,
              phone: c.phone.replace(/^\+1/, ""),
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Re-fetch when tab regains focus
  useEffect(() => {
    if (!currentUser) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchDashboard();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [currentUser, fetchDashboard]);

  // Handle Stripe payment return (legacy Checkout Session flow)
  useEffect(() => {
    const payment = searchParams.get("payment");
    if (payment === "success") {
      setActiveTab("pipeline");

      const sessionId = searchParams.get("session_id");
      const verifyAndContinue = async () => {
        if (sessionId) {
          try {
            await fetch("/api/stripe/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId }),
            });
          } catch { /* webhook will handle it */ }
        }
        await fetchLeads();
        setPaymentNotice("Payment successful! Leads are being processed.");
        setTimeout(() => setPaymentNotice(null), 8000);
      };
      verifyAndContinue();

      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.toString());
    } else if (payment === "cancelled") {
      setPaymentNotice("Payment was cancelled. No charges were made.");
      setActiveTab("pipeline");
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      window.history.replaceState({}, "", url.toString());
      setTimeout(() => setPaymentNotice(null), 5000);
    }

    // Handle Stripe setup return (bank account connection)
    const stripeParam = searchParams.get("stripe");
    if (stripeParam === "success") {
      setPaymentNotice("Bank account connected successfully!");
      fetch("/api/stripe/mark-setup-complete", { method: "POST" })
        .then(() => {
          setStripeSetupComplete(true);
          updateSession();
        })
        .catch(() => {});
      setActiveTab("settings");
      const url = new URL(window.location.href);
      url.searchParams.delete("stripe");
      window.history.replaceState({}, "", url.toString());
      setTimeout(() => setPaymentNotice(null), 8000);
    } else if (stripeParam === "cancel") {
      setPaymentNotice("Bank setup was cancelled. You can connect later in Settings.");
      setActiveTab("settings");
      const url = new URL(window.location.href);
      url.searchParams.delete("stripe");
      window.history.replaceState({}, "", url.toString());
      setTimeout(() => setPaymentNotice(null), 5000);
    }
  }, [searchParams]);

  const myConnections = currentUser ? getConnectionsForBuyer(currentUser.id) : [];
  // Active connections (finalized, terms accepted)
  const activeConnections = myConnections.filter(c => c.status === "active");

  // Session recovery + auth redirect.
  // After cross-site redirect from Stripe, the session cookie may not be hydrated yet.
  // Verify against the server session endpoint before kicking user to login.
  useEffect(() => {
    if (isSigningOut) return;
    if (isLoading) return;
    if (isAuthenticated && currentUser) {
      // Authenticated — check role
      if (!isBuyer(currentUser) && !searchParams.get("stripe")) {
        router.push(currentUser.role === "admin" ? "/admin" : "/provider-dashboard");
      }
      return;
    }
    // Not authenticated according to client — but cookie may not be hydrated yet.
    // Check server session endpoint once before giving up.
    if (sessionCheckRef.current) return;
    sessionCheckRef.current = true;

    const verifySession = async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const data = await res.json();
        if (data?.user) {
          if (data.user.role === "buyer") {
            window.location.reload();
            return;
          }
          // Wrong role — redirect appropriately
          router.push(data.user.role === "admin" ? "/admin" : "/provider-dashboard");
          return;
        }
      } catch {
        // Server check failed — fall through
      }

      // If returning from Stripe, cookie may need a moment to propagate.
      // Retry up to 3 times with 1-second delays before giving up.
      if (searchParams.get("stripe")) {
        const maxRetries = 3;
        for (let i = 0; i < maxRetries; i++) {
          await new Promise(r => setTimeout(r, 1000));
          try {
            const res = await fetch("/api/auth/session", { cache: "no-store" });
            const data = await res.json();
            if (data?.user?.role === "buyer") {
              window.location.reload();
              return;
            }
          } catch {}
        }
        router.push("/auth/login?role=buyer");
      } else {
        router.push("/auth/login?role=buyer");
      }
    };
    verifySession();
  }, [isLoading, isAuthenticated, isSigningOut, currentUser, router, searchParams]);

  // Escape key closes lightbox and modal
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxSrc) setLightboxSrc(null);
        else if (expandedModalLead) setExpandedModalLead(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxSrc, expandedModalLead]);

  const handleLogout = () => logout();

  const handlePinVerify = async () => {
    setPinError("");
    if (!/^\d{4}$/.test(pinEntry)) {
      setPinError("PIN must be 4 digits");
      return;
    }
    setPinVerifying(true);
    try {
      const res = await fetch("/api/business/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinEntry }),
      });
      const data = await res.json();
      if (data.valid) {
        setPortalRole("owner");
        sessionStorage.setItem("portalRole", "owner");
        setShowPinModal(false);
        setPinEntry("");
      } else {
        setPinError("Incorrect PIN");
      }
    } catch {
      setPinError("Verification failed. Try again.");
    } finally {
      setPinVerifying(false);
    }
  };

  const handleSelectChaser = () => {
    setPortalRole("chaser");
    sessionStorage.setItem("portalRole", "chaser");
    // Reset to first valid chaser tab
    setActiveTab("pipeline");
  };

  const handleSwitchRole = () => {
    setPortalRole(null);
    sessionStorage.removeItem("portalRole");
    setPinEntry("");
    setPinError("");
    setShowPinModal(false);
  };

  // Pending leads computed at component level (used by payment bar + batch logic)
  // CRITICAL: These useMemo hooks MUST be above early returns to avoid React hook ordering violations
  const pendingLeadsAll = useMemo(() => dbLeads.filter(l => l.payoutStatus === "pending"), [dbLeads]);

  // Approved leads (auto-approved, ready for payment)
  const approvedLeadsAll = useMemo(() => dbLeads.filter(l => l.payoutStatus === "approved"), [dbLeads]);

  // Payable leads = pending + approved (both can be paid)
  const payableLeadsAll = useMemo(() => dbLeads.filter(l => l.payoutStatus === "pending" || l.payoutStatus === "approved"), [dbLeads]);

  // Group payable leads (pending + approved) by provider for batch payment
  const pendingByProvider = useMemo(() => {
    const map = new Map<string, { providerId: string; providerName: string; leads: ApiLead[]; totalBuyerAmount: number }>();
    payableLeadsAll.forEach(l => {
      const existing = map.get(l.providerId) || { providerId: l.providerId, providerName: l.providerName || "Unknown", leads: [], totalBuyerAmount: 0 };
      existing.leads.push(l);
      existing.totalBuyerAmount += calculateFeeBreakdown(l.payoutAmount || 0, feeSettings).buyerTotal;
      map.set(l.providerId, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.leads.length - a.leads.length);
  }, [payableLeadsAll, feeSettings]);

  // Unique providers for dropdown filter
  const uniqueProviders = useMemo(() => {
    const map = new Map<string, string>();
    dbLeads.forEach(l => { if (!map.has(l.providerId)) map.set(l.providerId, l.providerName || "Unknown"); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [dbLeads]);

  // Lead rejection state
  const [rejectModal, setRejectModal] = useState<{ leadId: string; leadName: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectCustomReason, setRejectCustomReason] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<"all" | "pending" | "completed" | "rejected">("all");

  // Show branded loading state during auth check
  if (isLoading || !isAuthenticated || !currentUser || !isBuyer(currentUser) || !stripeSetupChecked) {
    return (
      <div className="min-h-screen bg-[#212121] flex items-center justify-center">
        <div className="text-center">
          <Image src="/woml-alt-white.png" alt="WOML" width={200} height={60} className="mx-auto mb-4" priority />
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
        </div>
      </div>
    );
  }

  // Calculate stats from DB leads
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const leadsToday = dbLeads.filter(l => l.submittedAt.startsWith(today));
  const leadsThisMonth = dbLeads.filter(l => {
    const d = new Date(l.submittedAt);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const statusCount = (arr: ApiLead[], status: string) =>
    arr.filter(l => (l.pipelineStatus || "new") === status).length;

  const isToday = (ts: string | null) => !!ts && ts.startsWith(today);
  const isThisMonth = (ts: string | null) => {
    if (!ts) return false;
    const d = new Date(ts);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  };
  const isThisYear = (ts: string | null) => !!ts && new Date(ts).getFullYear() === currentYear;

  const leadsThisYear = dbLeads.filter(l => new Date(l.submittedAt).getFullYear() === currentYear);

  // TODAY stats — timestamp-based (how many reached each stage today)
  const todayContacted = dbLeads.filter(l => isToday(l.contactedAt)).length;
  const todayQuoted    = dbLeads.filter(l => isToday(l.quotedAt)).length;
  const todaySold      = dbLeads.filter(l => isToday(l.soldAt)).length;
  const todayDead      = dbLeads.filter(l => isToday(l.deadAt)).length;

  // MONTH stats — timestamp-based (how many reached each stage this month)
  const monthContacted = dbLeads.filter(l => isThisMonth(l.contactedAt)).length;
  const monthQuoted    = dbLeads.filter(l => isThisMonth(l.quotedAt)).length;
  const monthSold      = dbLeads.filter(l => isThisMonth(l.soldAt)).length;
  const monthDead      = dbLeads.filter(l => isThisMonth(l.deadAt)).length;

  // YEAR stats — timestamp-based
  const yearContacted = dbLeads.filter(l => isThisYear(l.contactedAt)).length;
  const yearQuoted    = dbLeads.filter(l => isThisYear(l.quotedAt)).length;
  const yearSold      = dbLeads.filter(l => isThisYear(l.soldAt)).length;
  const yearDead      = dbLeads.filter(l => isThisYear(l.deadAt)).length;

  // Get leads by provider for chart
  const leadsByProvider = (() => {
    const providerMap = new Map<string, { id: string; name: string; leadCount: number; totalPayout: number }>();
    dbLeads.forEach(l => {
      const key = l.providerId;
      const existing = providerMap.get(key) || { id: key, name: l.providerName || "Unknown", leadCount: 0, totalPayout: 0 };
      existing.leadCount++;
      existing.totalPayout += l.payoutAmount;
      providerMap.set(key, existing);
    });
    return Array.from(providerMap.values()).sort((a, b) => b.leadCount - a.leadCount);
  })();

  // Batch payment handler — charges saved payment method server-side
  const handleBatchPayment = async (leadIds: string[]) => {
    if (leadIds.length === 0) return;
    setBatchMarkingPaid(true);
    setPaymentNotice(null);

    try {
      const res = await fetch("/api/stripe/batch-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds }),
      });

      const data = await res.json();

      // No saved payment method — tell user to set up via Settings (DON'T redirect to Stripe)
      if (data.needsSetup) {
        setPaymentNotice("No payment method on file. Please go to the Settings tab to connect your card or bank account, then try again.");
        setTimeout(() => setPaymentNotice(null), 12000);
        setBatchMarkingPaid(false);
        return;
      }

      if (!res.ok) {
        setPaymentNotice(data.error || "Payment failed. Please try again.");
        setTimeout(() => setPaymentNotice(null), 8000);
        setBatchMarkingPaid(false);
        return;
      }

      const results: { providerId: string; providerName: string; status: string; leadCount: number; amountCents: number; clientSecret?: string; paymentIntentId?: string; error?: string }[] = data.results || [];

      // Handle 3D Secure if any require action
      const requires3ds = results.filter(r => r.status === "requires_action");
      if (requires3ds.length > 0) {
        const stripeInstance = await stripePromise;
        if (stripeInstance) {
          for (const r of requires3ds) {
            if (!r.clientSecret) continue;
            setPaymentNotice(`Confirming payment for ${r.providerName}...`);
            const { error } = await stripeInstance.confirmCardPayment(r.clientSecret);
            if (error) {
              r.status = "failed";
              r.error = error.message || "3D Secure authentication failed";
            } else {
              // Confirm on server — claim leads + create transactions
              try {
                await fetch("/api/stripe/confirm-payment-intent", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ paymentIntentId: r.paymentIntentId }),
                });
                r.status = "succeeded";
              } catch {
                r.status = "failed";
                r.error = "Server confirmation failed (webhook will retry)";
              }
            }
          }
        }
      }

      // Refresh leads
      await fetchLeads();

      // Show summary
      const succeeded = results.filter(r => r.status === "succeeded").length;
      const failed = results.filter(r => r.status === "failed").length;
      const totalProviders = results.length;

      if (failed === 0) {
        setPaymentNotice(`All ${succeeded} provider${succeeded !== 1 ? "s" : ""} paid successfully!`);
      } else if (succeeded > 0) {
        setPaymentNotice(`${succeeded} of ${totalProviders} providers paid. ${failed} failed — please retry.`);
      } else {
        const errorMsg = results.find(r => r.error)?.error || "All payments failed";
        setPaymentNotice(`Payment failed: ${errorMsg}`);
      }
      setTimeout(() => setPaymentNotice(null), 8000);
    } catch (e) {
      console.error("Batch payment failed:", e);
      setPaymentNotice("Payment failed. Please try again.");
      setTimeout(() => setPaymentNotice(null), 8000);
    } finally {
      setBatchMarkingPaid(false);
    }
  };

  // Legacy Stripe Checkout redirect (fallback for single-provider pay via redirect)
  const handleStripePayment = async (ids: string[]) => {
    setBatchMarkingPaid(true);
    try {
      const res = await fetch("/api/stripe/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ids }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create payment session");
      }
    } catch (e) {
      console.error("Stripe payment failed:", e);
      alert("Failed to create payment session. Please try again.");
    } finally {
      setBatchMarkingPaid(false);
    }
  };

  // Reject a lead
  const handleRejectLead = async () => {
    if (!rejectModal) return;
    const finalReason = rejectReason === "Other" ? rejectCustomReason.trim() : rejectReason;
    if (!finalReason) return;
    setRejectLoading(true);
    try {
      const res = await fetch(`/api/leads/${rejectModal.leadId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason, customReason: rejectReason === "Other" ? rejectCustomReason.trim() : undefined }),
      });
      if (res.ok) {
        setToast({ message: "Lead rejected", type: "success" });
        setTimeout(() => setToast(null), 3000);
        fetchDashboard();
      } else {
        const data = await res.json();
        setToast({ message: data.error || "Failed to reject lead", type: "error" });
        setTimeout(() => setToast(null), 5000);
      }
    } catch {
      setToast({ message: "Failed to reject lead", type: "error" });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setRejectLoading(false);
      setRejectModal(null);
      setRejectReason("");
      setRejectCustomReason("");
    }
  };

  // Optimistic lead field update
  const updateLeadField = async (leadId: string, fields: Record<string, unknown>) => {
    // Save previous state for rollback
    const prev = dbLeads.map(l => ({ ...l }));

    // Optimistic update
    setDbLeads(leads =>
      leads.map(l => {
        if (l.id !== leadId) return l;
        const updated = { ...l };
        if (fields.pipeline_status !== undefined) updated.pipelineStatus = fields.pipeline_status as string;
        if (fields.contact_type !== undefined) updated.contactType = fields.contact_type as string | null;
        if (fields.pipeline_notes !== undefined) updated.pipelineNotes = fields.pipeline_notes as string | null;
        if (fields.contacted_sub_status !== undefined) updated.contactedSubStatus = fields.contacted_sub_status as string | null;
        if (fields.dead_reason !== undefined) updated.deadReason = fields.dead_reason as string | null;
        if (fields.assigned_to !== undefined) updated.assignedTo = fields.assigned_to as string | null;
        if (fields.follow_up_date !== undefined) updated.followUpDate = fields.follow_up_date as string | null;
        return updated;
      })
    );

    try {
      const res = await fetch(`/api/business/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      // Revert on error
      setDbLeads(prev);
      setToast({ message: "Failed to update lead", type: "error" });
      setTimeout(() => setToast(null), 4000);
    }
  };

  const fetchActivity = async (leadId: string) => {
    if (activityCache[leadId]) return;
    try {
      const res = await fetch(`/api/business/leads/${leadId}/activity`);
      const data = await res.json();
      if (data.success) {
        setActivityCache(prev => ({ ...prev, [leadId]: data.entries }));
      }
    } catch {
      // Ignore
    }
  };

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
            <span className="text-white font-medium">{currentBuyer?.businessName || "Business Dashboard"}</span>
          </div>
          <div className="flex items-center gap-3">
            {portalRole && (
              <>
                <span className="text-xs font-medium bg-white/20 text-white px-2 py-1 rounded">
                  {portalRole === "owner" ? "Owner" : "Lead Chaser"}
                </span>
                <button
                  onClick={handleSwitchRole}
                  className="text-white/70 hover:text-white transition text-sm font-medium"
                >
                  Switch Role
                </button>
                <span className="text-white/30">|</span>
              </>
            )}
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

      {/* Role Gate Overlay */}
      {!portalRole && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          {!showPinModal ? (
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center">
              <div className="w-16 h-16 bg-[#E8822A]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#E8822A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Select Your Role</h2>
              <p className="text-gray-500 text-sm mb-6">How are you accessing the portal today?</p>
              <div className="space-y-3">
                <button
                  onClick={() => setShowPinModal(true)}
                  className="w-full py-3 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-semibold transition"
                >
                  Owner
                </button>
                <button
                  onClick={handleSelectChaser}
                  className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition"
                >
                  Lead Chaser
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center relative">
              <button
                onClick={() => { setShowPinModal(false); setPinEntry(""); setPinError(""); }}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="w-16 h-16 bg-[#E8822A]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#E8822A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Enter Owner PIN</h2>
              <p className="text-gray-500 text-sm mb-6">Enter your 4-digit PIN to access the full portal</p>
              {pinError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{pinError}</div>
              )}
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinEntry}
                onChange={(e) => setPinEntry(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => { if (e.key === "Enter" && pinEntry.length === 4) handlePinVerify(); }}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition text-center text-2xl tracking-[0.5em] font-mono mb-4"
                placeholder="----"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowPinModal(false); setPinEntry(""); setPinError(""); }}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition"
                >
                  Back
                </button>
                <button
                  onClick={handlePinVerify}
                  disabled={pinVerifying || pinEntry.length !== 4}
                  className="flex-1 py-3 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-semibold transition disabled:opacity-50"
                >
                  {pinVerifying ? "Verifying..." : "Unlock"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="relative z-10 max-w-7xl mx-auto px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto">
          {validTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-lg font-medium transition whitespace-nowrap ${
                activeTab === tab
                  ? "bg-[#E77500] text-white shadow-md"
                  : "text-[#212121]/55 hover:text-[#212121] hover:bg-[#212121]/8"
              }`}
            >
              {tab === "marketing" ? "Outreach" : tab === "leaderboard" ? "Leaderboard" : tab === "pipeline" ? "Leads" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Toast notification */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
          }`}>
            {toast.message}
          </div>
        )}

        {/* Attribution Modal — 3-Step Flow */}
        {attributionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">

              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-4">
                {[1, 2, 3].map(n => (
                  <div key={n} className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition ${
                    attrStep === n ? "bg-[#E8822A] text-white" : attrStep > n ? "bg-green-500 text-white" : "bg-gray-100 text-gray-400"
                  }`}>{attrStep > n ? "\u2713" : n}</div>
                ))}
                <span className="text-xs text-gray-500 ml-1">
                  {attrStep === 1 ? "Select Stage" : attrStep === 2 ? "Select Date" : "Who gets credit?"}
                </span>
              </div>

              <h3 className="text-base font-bold text-gray-900 mb-1">Log Activity</h3>
              <p className="text-sm text-gray-500 mb-4">{attributionModal.leadName}</p>

              {/* Step 1: Choose stage */}
              {attrStep === 1 && (() => {
                const lead = dbLeads.find(l => l.id === attributionModal.leadId);
                const cs = lead?.pipelineStatus || "new";
                const available = getAvailableStages(cs);
                return (
                  <>
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">What stage is this lead entering?</p>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {available.map(s => (
                        <button
                          key={s.value}
                          onClick={() => {
                            setAttrStage(s.value);
                            setAttrStep(2);
                          }}
                          className="px-3 py-3 rounded-lg text-sm font-semibold border-2 transition border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <button onClick={() => setAttributionModal(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition">
                        Cancel
                      </button>
                    </div>
                  </>
                );
              })()}

              {/* Step 2: Choose date */}
              {attrStep === 2 && (
                <>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">When did this happen?</p>
                  <input
                    type="date"
                    value={attrDate}
                    max={new Date().toISOString().split("T")[0]}
                    onChange={e => setAttrDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-[#E8822A] mb-4"
                  />
                  <div className="flex items-center justify-between">
                    <button onClick={() => setAttrStep(1)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition">
                      &larr; Back
                    </button>
                    <button
                      disabled={!attrDate}
                      onClick={() => {
                        if (smsAgents.length > 0) {
                          setAttrStep(3);
                        } else {
                          updateLeadField(attributionModal.leadId, {
                            follow_up_date: attrDate,
                            pipeline_status: attrStage,
                          });
                          setAttributionModal(null);
                        }
                      }}
                      className="px-5 py-2 bg-[#E8822A] text-white text-sm font-medium rounded-lg hover:bg-[#d4721f] transition disabled:opacity-40"
                    >
                      Next &rarr;
                    </button>
                  </div>
                </>
              )}

              {/* Step 3: Choose Lead Chaser + Confirm */}
              {attrStep === 3 && (
                <>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Who&apos;s logging this?</p>
                  <p className="text-xs text-gray-400 mb-3">Select the Lead Chaser responsible for this move.</p>
                  <div className="flex flex-col gap-2 mb-4">
                    {smsAgents.map(a => (
                      <button
                        key={a.phone}
                        onClick={() => setAttrAgent(a.name)}
                        className={`px-3 py-2.5 rounded-lg text-sm font-medium border-2 transition text-left ${
                          attrAgent === a.name
                            ? "border-[#E8822A] bg-orange-50 text-gray-900"
                            : "border-gray-200 text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        {a.name}
                        <span className="text-gray-400 text-xs ml-2">{a.phone}</span>
                      </button>
                    ))}
                  </div>

                  {/* Summary */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs text-gray-600 space-y-1">
                    <div><span className="font-medium">Stage:</span> {attrStage.charAt(0).toUpperCase() + attrStage.slice(1)}</div>
                    <div><span className="font-medium">Date:</span> {new Date(attrDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                    {attrAgent && <div><span className="font-medium">Lead Chaser:</span> {attrAgent}</div>}
                  </div>

                  <div className="flex items-center justify-between">
                    <button onClick={() => setAttrStep(2)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition">
                      &larr; Back
                    </button>
                    <button
                      onClick={() => {
                        updateLeadField(attributionModal.leadId, {
                          follow_up_date: attrDate,
                          pipeline_status: attrStage,
                          actor_name: attrAgent || undefined,
                          assigned_to: attrAgent || undefined,
                        });
                        setAttributionModal(null);
                      }}
                      className="px-5 py-2 bg-[#E8822A] text-white text-sm font-semibold rounded-lg hover:bg-[#d4721f] transition"
                    >
                      Confirm
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        )}

        {/* Rejection Modal */}
        {rejectModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setRejectModal(null); setRejectReason(""); setRejectCustomReason(""); }}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-800 mb-1">Reject Lead</h3>
              <p className="text-sm text-gray-500 mb-4">Rejecting <span className="font-medium text-gray-700">{rejectModal.leadName}</span>. This cannot be undone.</p>
              <div className="space-y-2 mb-4">
                {["Unresponsive number", "Bad/fake data", "Duplicate lead", "Wrong area/state", "Incomplete information", "Other"].map(reason => (
                  <label key={reason} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition">
                    <input
                      type="radio"
                      name="rejectReason"
                      value={reason}
                      checked={rejectReason === reason}
                      onChange={() => setRejectReason(reason)}
                      className="w-4 h-4 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm text-gray-700">{reason}</span>
                  </label>
                ))}
              </div>
              {rejectReason === "Other" && (
                <textarea
                  value={rejectCustomReason}
                  onChange={e => setRejectCustomReason(e.target.value)}
                  placeholder="Describe the reason (required, max 200 chars)"
                  maxLength={200}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm mb-4 focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                  rows={2}
                />
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setRejectModal(null); setRejectReason(""); setRejectCustomReason(""); }}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectLead}
                  disabled={rejectLoading || !rejectReason || (rejectReason === "Other" && !rejectCustomReason.trim())}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {rejectLoading ? "Rejecting..." : "Confirm Reject"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Photo Lightbox */}
        {lightboxSrc && (
          <div
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setLightboxSrc(null)}
          >
            <button
              onClick={() => setLightboxSrc(null)}
              className="absolute top-6 right-6 text-white/80 hover:text-white transition"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <img
              src={lightboxSrc}
              alt="Enlarged view"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}

        {/* Full-Screen Lead Modal (Mid-Call View) */}
        {expandedModalLead && (() => {
          const ml = expandedModalLead;
          const mlStatus = ml.pipelineStatus || "new";
          const mlColors: Record<string, { bg: string; text: string; dot: string }> = {
            new: { bg: "bg-red-100", text: "text-red-700", dot: "#ef4444" },
            contacted: { bg: "bg-orange-100", text: "text-orange-700", dot: "#f97316" },
            quoted: { bg: "bg-yellow-100", text: "text-yellow-800", dot: "#ca8a04" },
            sold: { bg: "bg-green-100", text: "text-green-700", dot: "#16a34a" },
            dead: { bg: "bg-gray-200", text: "text-gray-700", dot: "#111827" },
          };
          const mlSteps = ["new", "contacted", "quoted", "sold"] as const;
          const mlStepIdx = mlSteps.indexOf(mlStatus as typeof mlSteps[number]);
          const mlIsDead = mlStatus === "dead";
          const mlBreakdown = calculateFeeBreakdown(ml.payoutAmount || 0, feeSettings);
          return (
            <div className="fixed inset-0 z-40 bg-white overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h2 className="text-2xl font-bold text-gray-800">{ml.customerName}</h2>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${mlColors[mlStatus]?.bg || "bg-gray-100"} ${mlColors[mlStatus]?.text || "text-gray-700"}`}>
                    {mlStatus === "new" ? "Lead" : mlStatus.charAt(0).toUpperCase() + mlStatus.slice(1)}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-600 text-[10px] font-medium uppercase tracking-wide">Mid-Call View</span>
                </div>
                <button
                  onClick={() => setExpandedModalLead(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 transition"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Content */}
              <div className="max-w-4xl mx-auto p-8">
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-6">
                    {/* Contact Card */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                      <h3 className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-4">Contact</h3>
                      <div className="space-y-4">
                        {ml.customerPhone && (
                          <div className="flex items-center gap-3">
                            <a href={`tel:${ml.customerPhone}`} className="flex items-center gap-2 text-blue-600 hover:underline text-lg font-medium">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                              {ml.customerPhone}
                            </a>
                            <a href={`sms:${ml.customerPhone}`} className="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition">SMS</a>
                          </div>
                        )}
                        {ml.customerEmail && (
                          <a href={`mailto:${ml.customerEmail}`} className="flex items-center gap-2 text-blue-600 hover:underline text-lg">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            {ml.customerEmail}
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Vehicle Info */}
                    {(ml.vehicleYear || ml.vehicleMake || ml.vehicleModel) && (
                      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                        <h3 className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-3">Vehicle</h3>
                        <p className="text-gray-800 text-lg font-medium">
                          {[ml.vehicleYear, ml.vehicleMake, ml.vehicleModel].filter(Boolean).join(" ")}
                        </p>
                        {ml.customerState && <p className="text-gray-500 text-sm mt-1">State: {ml.customerState}</p>}
                      </div>
                    )}

                    {/* Lead Source */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                      <h3 className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-3">Lead Source</h3>
                      <p className="text-gray-800 font-medium">{ml.providerName || "Unknown"}</p>
                      <p className="text-gray-500 text-sm mt-1">Submitted {new Date(ml.submittedAt).toLocaleDateString()} at {new Date(ml.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-6">
                    {/* Pipeline Status + Progress Bar */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                      <h3 className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-4">Pipeline Status</h3>
                      <div className="flex items-center gap-1">
                        {mlSteps.map((step, i) => {
                          const isActive = !mlIsDead && mlStepIdx >= i;
                          const color = isActive ? (mlColors[step]?.dot || "#e5e7eb") : "#e5e7eb";
                          return (
                            <div key={step} className="flex flex-col items-center" style={{ flex: 1 }}>
                              <div className="w-full h-3 rounded-full" style={{ backgroundColor: color }} />
                              <span className={`text-xs mt-1 ${isActive ? "text-gray-600 font-medium" : "text-gray-300"}`}>
                                {step === "new" ? "Lead" : step.charAt(0).toUpperCase() + step.slice(1)}
                              </span>
                            </div>
                          );
                        })}
                        {mlIsDead && (
                          <span className="ml-2 px-3 py-1 rounded bg-gray-800 text-white text-xs font-medium">DEAD</span>
                        )}
                      </div>
                    </div>

                    {/* Custom Lead Fields */}
                    {ml.criteriaFieldsData && ml.criteriaFieldsData.length > 0 && (
                      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                        <h3 className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-4">Custom Lead Fields</h3>
                        <div className="space-y-3">
                          {ml.criteriaFieldsData.map((field, idx) => (
                            <div key={idx}>
                              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{field.label}</p>
                              {field.fieldType === "PHOTO" && field.value ? (() => {
                                const photoSrc = field.value.startsWith("data:") ? field.value : `data:image/jpeg;base64,${field.value}`;
                                return (
                                  <div>
                                    <img
                                      src={photoSrc}
                                      alt={field.label}
                                      className="max-h-48 rounded-lg border-2 border-gray-200 hover:border-orange-400 shadow-sm cursor-pointer transition"
                                      onClick={() => setLightboxSrc(photoSrc)}
                                    />
                                    <p className="text-gray-400 text-[10px] mt-1">Tap to enlarge</p>
                                  </div>
                                );
                              })() : field.fieldType === "BINARY" ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                  {field.value || "—"}
                                </span>
                              ) : (
                                <p className="text-gray-800">{field.value || "—"}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Driver's License */}
                    {ml.customerLicenseImage && (() => {
                      const licSrc = ml.customerLicenseImage.startsWith("data:") ? ml.customerLicenseImage : `data:image/jpeg;base64,${ml.customerLicenseImage}`;
                      return (
                        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                          <h3 className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-3">Driver&apos;s License</h3>
                          <img
                            src={licSrc}
                            alt="License"
                            className="max-h-64 rounded-lg border-2 border-gray-200 hover:border-orange-400 shadow-sm cursor-pointer transition"
                            onClick={() => setLightboxSrc(licSrc)}
                          />
                          <p className="text-gray-400 text-[10px] mt-1">Tap to enlarge</p>
                        </div>
                      );
                    })()}

                    {/* Payout Status */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                      <h3 className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-3">Payout</h3>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-800 text-lg font-bold">${mlBreakdown.buyerTotal.toFixed(2)}</span>
                        {ml.payoutStatus === "completed" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 text-sm font-medium">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Completed
                          </span>
                        ) : ml.payoutStatus === "processing" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Processing</span>
                        ) : (
                          <span className="text-amber-600 text-sm font-medium">Unpaid</span>
                        )}
                      </div>
                      <p className="text-gray-400 text-xs mt-1">${Number(ml.payoutAmount || 0).toFixed(2)} + ${mlBreakdown.buyerFee.toFixed(2)} fee</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <div className="space-y-8">
            {/* Five Dual-Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "Leads Received", color: "#ef4444", todayVal: leadsToday.length, monthVal: leadsThisMonth.length, yearVal: leadsThisYear.length },
                { label: "Contacted", color: "#f97316", todayVal: todayContacted, monthVal: monthContacted, yearVal: yearContacted },
                { label: "Quoted",    color: "#ca8a04", todayVal: todayQuoted,    monthVal: monthQuoted,    yearVal: yearQuoted },
                { label: "Sold",      color: "#16a34a", todayVal: todaySold,      monthVal: monthSold,      yearVal: yearSold },
                { label: "Dead",      color: "#111827", todayVal: todayDead,      monthVal: monthDead,      yearVal: yearDead },
              ].map(card => (
                <div key={card.label} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <p className="text-gray-500 text-[10px] uppercase tracking-wide font-medium text-center pt-3 pb-2">{card.label}</p>
                  <div className="grid grid-cols-3 divide-x divide-gray-100 pb-3">
                    <div className="flex flex-col items-center justify-center px-2">
                      <p className="text-2xl font-bold" style={{ color: card.color }}>{card.todayVal}</p>
                      <p className="text-[10px] text-gray-400 uppercase mt-0.5">Today</p>
                    </div>
                    <div className="flex flex-col items-center justify-center px-2">
                      <p className="text-2xl font-bold" style={{ color: card.color }}>{card.monthVal}</p>
                      <p className="text-[10px] text-gray-400 uppercase mt-0.5">Month</p>
                    </div>
                    <div className="flex flex-col items-center justify-center px-2">
                      <p className="text-2xl font-bold" style={{ color: card.color }}>{card.yearVal}</p>
                      <p className="text-[10px] text-gray-400 uppercase mt-0.5">Year</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* This Year's Conversion */}
            {(() => {
              const yrLeads = leadsThisYear.length;
              const pctNum = (n: number) => yrLeads > 0 ? (n / yrLeads) * 100 : 0;

              const stages = [
                { label: "Leads", color: "#ef4444", actual: 100, target: null as number | null, count: yrLeads },
                { label: "Contacted", color: "#f97316", actual: pctNum(yearContacted), target: funnelTargets.contacted, count: yearContacted },
                { label: "Quoted", color: "#ca8a04", actual: pctNum(yearQuoted), target: funnelTargets.quoted, count: yearQuoted },
                { label: "Sold", color: "#16a34a", actual: pctNum(yearSold), target: funnelTargets.sold, count: yearSold },
                { label: "Dead", color: "#111827", actual: pctNum(yearDead), target: funnelTargets.dead, count: yearDead },
              ];

              return (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-gray-500 text-xs font-medium mb-3 uppercase tracking-wide">This Year&apos;s Conversion</p>
                  <div className="grid grid-cols-5 gap-4">
                    {stages.map(s => {
                      const onTarget = s.target === null || s.actual >= s.target;
                      return (
                        <div key={s.label} className="text-center">
                          <p className="text-2xl font-bold" style={{ color: s.color }}>
                            {s.target === null ? "100%" : `${s.actual.toFixed(1)}%`}
                          </p>
                          <p className="text-sm font-medium text-gray-700">{s.label}</p>
                          <p className="text-[11px] text-gray-400">{s.count} leads</p>
                          {s.target !== null && (
                            <p className={`text-[11px] font-medium mt-0.5 ${onTarget ? "text-emerald-600" : "text-red-500"}`}>
                              {onTarget ? "\u2713" : "\u2193"} Target: {s.target}%
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Pipeline Activity Chart */}
            <DashboardChart leads={dbLeads} />

            {/* Recent Leads */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[#E8822A]">Recent Leads</h3>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600">Lead</span>
                  <span>&rarr;</span>
                  <span className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-600">Contacted</span>
                  <span>&rarr;</span>
                  <span className="px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700">Quoted</span>
                  <span>&rarr;</span>
                  <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-600">Sold</span>
                  <span>/</span>
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">Dead</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="pb-3 font-medium">Customer</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbLeads.slice(0, 8).map((lead) => {
                      const status = lead.pipelineStatus || "new";
                      const pillStyles: Record<string, string> = {
                        new: "bg-red-100 text-red-700",
                        contacted: "bg-orange-100 text-orange-700",
                        quoted: "bg-yellow-100 text-yellow-800",
                        sold: "bg-green-100 text-green-700",
                        dead: "bg-gray-200 text-gray-700",
                      };
                      const pillLabels: Record<string, string> = {
                        new: "Lead",
                        contacted: "Contacted",
                        quoted: "Quoted",
                        sold: "Sold",
                        dead: "Dead",
                      };
                      const relTime = (() => {
                        const ms = Date.now() - new Date(lead.submittedAt).getTime();
                        const mins = Math.floor(ms / 60000);
                        if (mins < 60) return `${mins}m ago`;
                        const hrs = Math.floor(mins / 60);
                        if (hrs < 24) return `${hrs}h ago`;
                        const days = Math.floor(hrs / 24);
                        return `${days}d ago`;
                      })();
                      return (
                        <tr key={lead.id} className="border-b border-gray-100">
                          <td className="py-3">
                            <span className="text-gray-800 font-medium">{lead.customerName}</span>
                            <span className="text-gray-400 text-xs ml-2">{relTime}</span>
                          </td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${pillStyles[status] || pillStyles.new}`}>
                              {pillLabels[status] || "Lead"}
                            </span>
                          </td>
                          <td className="py-3 text-gray-800 font-medium">${calculateFeeBreakdown(lead.payoutAmount || 0, feeSettings).buyerTotal.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                    {dbLeads.length === 0 && (
                      <tr>
                        <td colSpan={3} className="text-center text-gray-400 py-8">
                          No leads yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Providers */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-[#E8822A] mb-4">Top Providers</h3>
              <div className="space-y-4">
                {leadsByProvider.slice(0, 5).map((provider, i) => (
                  <div key={provider.id} className="flex items-center gap-4">
                    <span className="text-gray-400 w-6">{i + 1}.</span>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-800 font-medium">{provider.name}</span>
                        <span className="text-gray-500">{provider.leadCount} leads</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#E8822A] rounded-full"
                          style={{ width: `${(provider.leadCount / Math.max(...leadsByProvider.map(p => p.leadCount), 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {leadsByProvider.length === 0 && (
                  <p className="text-gray-400 text-center py-8">No providers yet</p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* Connections Tab */}
        {activeTab === "connections" && (
          <TabErrorBoundary tabName="Connections">
            <ConnectionsTab
              buyerId={currentUser.id}
              buyerBusinessName={currentBuyer?.businessName || ""}
              myConnections={myConnections}
              updateConnectionTerms={updateConnectionTerms}
              terminateConnection={terminateConnection}
              feeSettings={feeSettings}
            />
          </TabErrorBoundary>
        )}



        {/* Pipeline Tab */}
        {activeTab === "pipeline" && (() => {
          const pipeStages = ["new", "contacted", "quoted", "sold", "dead"] as const;
          const pipeColors: Record<string, { bg: string; text: string; dot: string }> = {
            new: { bg: "bg-red-100", text: "text-red-700", dot: "#ef4444" },
            contacted: { bg: "bg-orange-100", text: "text-orange-700", dot: "#f97316" },
            quoted: { bg: "bg-yellow-100", text: "text-yellow-800", dot: "#ca8a04" },
            sold: { bg: "bg-green-100", text: "text-green-700", dot: "#16a34a" },
            dead: { bg: "bg-gray-200", text: "text-gray-700", dot: "#111827" },
          };
          const stageCounts = Object.fromEntries(
            pipeStages.map(s => [s, dbLeads.filter(l => (l.pipelineStatus || "new") === s).length])
          );

          // Filter
          let filtered = pipelineFilter === "all"
            ? dbLeads
            : dbLeads.filter(l => (l.pipelineStatus || "new") === pipelineFilter);

          // Search leads
          if (pipelineSearch.trim()) {
            const q = pipelineSearch.toLowerCase();
            filtered = filtered.filter(l =>
              l.customerName.toLowerCase().includes(q) ||
              (l.customerPhone || "").toLowerCase().includes(q) ||
              (l.customerEmail || "").toLowerCase().includes(q) ||
              (l.assignedTo || "").toLowerCase().includes(q)
            );
          }

          // Filter by provider
          if (providerFilter !== "all") {
            filtered = filtered.filter(l => l.providerId === providerFilter);
          }

          // Filter by payment status
          if (paymentFilter === "pending") {
            filtered = filtered.filter(l => l.payoutStatus === "pending" || l.payoutStatus === "approved");
          } else if (paymentFilter === "completed") {
            filtered = filtered.filter(l => l.payoutStatus === "completed");
          } else if (paymentFilter === "rejected") {
            filtered = filtered.filter(l => l.payoutStatus === "rejected");
          }

          // Sort
          filtered = [...filtered].sort((a, b) => {
            if (pipelineSort === "newest") return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
            if (pipelineSort === "oldest") return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
            return 0;
          });

          const relTime = (iso: string) => {
            const ms = Date.now() - new Date(iso).getTime();
            const mins = Math.floor(ms / 60000);
            if (mins < 60) return `${mins}m ago`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h ago`;
            const days = Math.floor(hrs / 24);
            return `${days}d ago`;
          };

          // Progress bar helper
          const progressSteps = ["new", "contacted", "quoted", "sold"] as const;
          const stepIdx = (s: string) => progressSteps.indexOf(s as typeof progressSteps[number]);

          const paidOutLeads = dbLeads.filter(l => l.payoutStatus === "completed" || l.payoutStatus === "processing");
          const totalPaidOut = paidOutLeads.reduce((sum, l) => sum + calculateFeeBreakdown(l.payoutAmount || 0, feeSettings).buyerTotal, 0);
          const amountPending = payableLeadsAll.reduce((sum, l) => sum + calculateFeeBreakdown(l.payoutAmount || 0, feeSettings).buyerTotal, 0);
          const avgPayout = paidOutLeads.length > 0 ? totalPaidOut / paidOutLeads.length : 0;

          const stageLabels: Record<string, string> = { new: "Lead", contacted: "Contacted", quoted: "Quoted", sold: "Sold", dead: "Dead" };

          return (
          <div className="space-y-4">
            {/* Financial Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-gray-500 text-xs mb-1">Total Paid Out</p>
                <p className="text-2xl font-bold text-emerald-600">${totalPaidOut.toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-gray-500 text-xs mb-1">Amount Pending</p>
                <p className="text-2xl font-bold text-amber-600">${amountPending.toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-gray-500 text-xs mb-1">Avg Payout Per Lead</p>
                <p className="text-2xl font-bold text-[#E8822A]">${avgPayout.toFixed(2)}</p>
              </div>
            </div>

            {/* Payment Notice */}
            {paymentNotice && (
              <div className={`rounded-xl border p-4 shadow-sm flex items-center gap-3 ${paymentNotice.includes("successful") ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {paymentNotice.includes("successful") ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  )}
                </svg>
                <span className="text-sm font-medium">{paymentNotice}</span>
                <button onClick={() => setPaymentNotice(null)} className="ml-auto text-current opacity-50 hover:opacity-100">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}

            {/* Pending Payments — Provider-Grouped */}
            {payableLeadsAll.length > 0 && (
              <div className="space-y-2">
                {/* Summary bar — instant mode gets its own banner */}
                {isInstantMode ? (
                  <div className="bg-orange-50 border border-orange-300 rounded-xl px-5 py-4 flex items-start justify-between flex-wrap gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <svg className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <div>
                        <p className="text-orange-800 text-sm font-semibold">Instant mode is on — these leads should have been paid automatically</p>
                        <p className="text-orange-700 text-xs mt-0.5">
                          These {payableLeadsAll.length} lead{payableLeadsAll.length !== 1 ? "s" : ""} ({`$${amountPending.toFixed(2)}`}) were submitted before Instant mode was enabled, or a provider&apos;s Stripe account isn&apos;t fully connected yet. Pay them now to clear the queue — future leads will be instant automatically.
                        </p>
                        {leadsPayNowResult && (
                          <p className={`text-xs mt-2 font-medium ${leadsPayNowResult.startsWith("Error") ? "text-red-600" : "text-emerald-700"}`}>
                            {leadsPayNowResult}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        setLeadsPayNowLoading(true);
                        setLeadsPayNowResult(null);
                        try {
                          const res = await fetch("/api/business/pay-now", { method: "POST" });
                          const data = await res.json();
                          if (res.ok) {
                            setLeadsPayNowResult(data.message || "Payment processed.");
                            await fetchLeads();
                          } else {
                            setLeadsPayNowResult(`Error: ${data.error}`);
                          }
                        } catch {
                          setLeadsPayNowResult("Error: Failed to process payment.");
                        } finally {
                          setLeadsPayNowLoading(false);
                        }
                      }}
                      disabled={leadsPayNowLoading}
                      className="inline-flex items-center gap-2 bg-[#E77500] hover:bg-[#D47526] text-white px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      {leadsPayNowLoading ? "Paying…" : `Pay $${amountPending.toFixed(2)} Now`}
                    </button>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-3">
                    <span className="text-amber-800 text-sm font-medium">
                      {payableLeadsAll.length} unpaid lead{payableLeadsAll.length !== 1 ? "s" : ""} across {pendingByProvider.length} provider{pendingByProvider.length !== 1 ? "s" : ""} &middot; ${amountPending.toFixed(2)} total
                    </span>
                    <div className="flex items-center gap-2">
                      {pendingByProvider.length > 1 && (
                        <button
                          onClick={() => handleBatchPayment(payableLeadsAll.map(l => l.id))}
                          disabled={batchMarkingPaid}
                          className="inline-flex items-center gap-1.5 text-white bg-[#635BFF] hover:bg-[#5248e5] px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.19l-.897 5.555C5.014 22.77 7.862 24 11.422 24c2.58 0 4.711-.636 6.25-1.872 1.69-1.349 2.498-3.34 2.498-5.777 0-4.116-2.503-5.834-6.194-7.2z"/></svg>
                          {batchMarkingPaid ? "Processing..." : `Pay All Providers ($${amountPending.toFixed(2)})`}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Per-provider cards — hidden in instant mode (banner handles it) */}
                {!isInstantMode && pendingByProvider.map(group => (
                  <div key={group.providerId} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-2 shadow-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#E8822A]/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-[#E8822A]">{(group.providerName || "?")[0].toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{group.providerName}</p>
                        <p className="text-xs text-gray-500">{group.leads.length} lead{group.leads.length !== 1 ? "s" : ""} &middot; ${group.totalBuyerAmount.toFixed(2)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleBatchPayment(group.leads.map(l => l.id))}
                      disabled={batchMarkingPaid}
                      className="inline-flex items-center gap-1.5 text-white bg-[#635BFF] hover:bg-[#5248e5] px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50 shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.19l-.897 5.555C5.014 22.77 7.862 24 11.422 24c2.58 0 4.711-.636 6.25-1.872 1.69-1.349 2.498-3.34 2.498-5.777 0-4.116-2.503-5.834-6.194-7.2z"/></svg>
                      {batchMarkingPaid ? "Processing..." : `Pay $${group.totalBuyerAmount.toFixed(2)}`}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-xl font-bold text-[#212121]">Leads</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Filter pills */}
                {[{ key: "all", label: "All" }, ...pipeStages.map(s => ({ key: s, label: stageLabels[s] || s }))].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setPipelineFilter(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      pipelineFilter === f.key ? "bg-[#E77500] text-white shadow-md" : "text-[#212121]/60 hover:text-[#212121] hover:bg-gray-100"
                    }`}
                  >{f.label}</button>
                ))}
                {/* Sort */}
                <select
                  value={pipelineSort}
                  onChange={e => setPipelineSort(e.target.value as typeof pipelineSort)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-[#212121] border border-gray-200 focus:outline-none"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
                {/* Search leads */}
                <input
                  type="text"
                  placeholder="Search leads..."
                  value={pipelineSearch}
                  onChange={e => setPipelineSearch(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-white text-[#212121] border border-gray-200 placeholder-gray-400 focus:outline-none w-36"
                />
                {/* Provider filter */}
                <select
                  value={providerFilter}
                  onChange={e => setProviderFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-[#212121] border border-gray-200 focus:outline-none w-40"
                >
                  <option value="all" className="text-gray-800">All Providers</option>
                  {uniqueProviders.map(([id, name]) => (
                    <option key={id} value={id} className="text-gray-800">{name}</option>
                  ))}
                </select>
                {/* Payment status filter */}
                <div className="flex items-center gap-1 ml-1 border-l border-gray-200 pl-2">
                  {([
                    { key: "all", label: "All" },
                    { key: "pending", label: "Unpaid" },
                    { key: "completed", label: "Paid" },
                    { key: "rejected", label: "Rejected" },
                  ] as const).map(f => (
                    <button
                      key={f.key}
                      onClick={() => setPaymentFilter(f.key)}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                        paymentFilter === f.key ? "bg-[#E77500] text-white shadow-sm" : "text-[#212121]/60 hover:text-[#212121] hover:bg-gray-100"
                      }`}
                    >{f.label}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary badges */}
            <div className="flex gap-2 flex-wrap">
              {pipeStages.map(s => (
                <button
                  key={s}
                  onClick={() => setPipelineFilter(pipelineFilter === s ? "all" : s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${pipeColors[s].bg} ${pipeColors[s].text}`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pipeColors[s].dot }} />
                  {stageLabels[s] || s}: {stageCounts[s]}
                </button>
              ))}
            </div>

            {/* Lead Cards */}
            <div className="space-y-3">
              {filtered.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-12 shadow-sm text-center text-gray-400">
                  No leads match this filter
                </div>
              )}
              {filtered.map(lead => {
                const currentStatus = lead.pipelineStatus || "new";
                const isDead = currentStatus === "dead";
                const currentStep = isDead ? -1 : stepIdx(currentStatus);
                const isExpanded = activityDrawer === lead.id;

                return (
                <div key={lead.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start gap-4 flex-wrap">
                      {/* Left: Customer Info */}
                      <div className="flex-1 min-w-[180px]">
                        <p className="text-sm">
                          <span className="font-semibold text-gray-800">{lead.customerName}</span>
                          {lead.customerPhone && (
                            <>
                              <span className="text-gray-400">: </span>
                              <a href={`tel:${lead.customerPhone}`} className="text-blue-600 hover:underline">{lead.customerPhone}</a>
                            </>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{relTime(lead.submittedAt)}</p>
                      </div>

                      {/* Payment status badge + actions */}
                      {(lead.payoutStatus === "pending" || lead.payoutStatus === "approved") && (
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedLeads.has(lead.id)}
                              onChange={() => {
                                setSelectedLeads(prev => {
                                  const next = new Set(prev);
                                  if (next.has(lead.id)) next.delete(lead.id);
                                  else next.add(lead.id);
                                  return next;
                                });
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-[#E8822A] focus:ring-[#E8822A]"
                            />
                            <span className={`text-xs font-medium ${lead.payoutStatus === "approved" ? "text-blue-600" : "text-amber-600"}`}>
                              {lead.payoutStatus === "approved" ? "Approved" : "Pending"}
                            </span>
                          </label>
                          {lead.payoutStatus === "pending" && portalRole === "owner" && (
                            <button
                              onClick={() => setRejectModal({ leadId: lead.id, leadName: lead.customerName })}
                              className="text-[10px] text-red-500 hover:text-red-700 font-medium transition"
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      )}
                      {lead.payoutStatus === "rejected" && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">Rejected</span>
                          {lead.rejectionReason && (
                            <span className="text-[10px] text-red-400 max-w-[120px] truncate" title={lead.rejectionReason}>{lead.rejectionReason}</span>
                          )}
                        </div>
                      )}

                      {/* Middle: Progress Bar */}
                      <div className="flex-1 min-w-[200px] flex items-center gap-1 pt-1">
                        {progressSteps.map((step, i) => {
                          const isActive = !isDead && currentStep >= i;
                          const color = isActive ? pipeColors[step].dot : "#e5e7eb";
                          return (
                            <React.Fragment key={step}>
                              <div className="flex flex-col items-center" style={{ flex: 1 }}>
                                <div
                                  className="w-full h-2 rounded-full"
                                  style={{ backgroundColor: color }}
                                />
                                <span className={`text-[10px] mt-0.5 ${isActive ? "text-gray-600 font-medium" : "text-gray-300"}`}>
                                  {step === "new" ? "Lead" : step.charAt(0).toUpperCase() + step.slice(1)}
                                </span>
                              </div>
                              {i < progressSteps.length - 1 && <div className="w-1" />}
                            </React.Fragment>
                          );
                        })}
                        {isDead && (
                          <span className="ml-2 px-2 py-0.5 rounded bg-gray-800 text-white text-[10px] font-medium">DEAD</span>
                        )}
                      </div>

                      {/* Right: Controls */}
                      <div className="flex flex-col gap-2 min-w-[180px]">
                        {/* Expand to mid-call view */}
                        <button
                          onClick={() => setExpandedModalLead(lead)}
                          className="self-end p-1 text-gray-400 hover:text-[#E8822A] transition"
                          title="Open mid-call view"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" /></svg>
                        </button>
                        {/* Change Lead Status button */}
                        {(() => {
                          const cs = lead.pipelineStatus || "new";
                          const isTerminal = TERMINAL_STAGES.has(cs);
                          const available = getAvailableStages(cs);
                          return (
                            <button
                              disabled={isTerminal || available.length === 0}
                              onClick={() => {
                                const today = new Date().toISOString().split("T")[0];
                                setAttrStep(1);
                                setAttrStage("");
                                setAttrDate(today);
                                setAttrAgent("");
                                setAttributionModal({ leadId: lead.id, leadName: lead.customerName, date: today });
                              }}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                                isTerminal
                                  ? "border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed"
                                  : "border-[#E8822A] text-[#E8822A] hover:bg-orange-50 active:bg-orange-100"
                              }`}
                            >
                              {isTerminal
                                ? cs === "sold" ? "\u2713 Sold" : "\u2717 Dead"
                                : "Change Lead Status"}
                            </button>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Lead Info / Provider Info / Activity toggles */}
                    <div className="mt-2 flex items-center gap-4">
                      <button
                        onClick={() => setDetailsDrawer(detailsDrawer === lead.id ? null : lead.id)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition"
                      >
                        <svg className={`w-3 h-3 transition-transform ${detailsDrawer === lead.id ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        Lead Info
                      </button>
                      <button
                        onClick={() => setProviderInfoDrawer(providerInfoDrawer === lead.id ? null : lead.id)}
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-600 transition"
                      >
                        <svg className={`w-3 h-3 transition-transform ${providerInfoDrawer === lead.id ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        Provider Info
                      </button>
                      <button
                        onClick={() => {
                          const nextId = isExpanded ? null : lead.id;
                          setActivityDrawer(nextId);
                          if (nextId) fetchActivity(nextId);
                        }}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition"
                      >
                        <svg className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        Activity
                      </button>
                    </div>
                  </div>

                  {/* Details Drawer */}
                  {detailsDrawer === lead.id && (
                    <div className="bg-gray-50 border-t border-gray-200 px-4 py-4">
                      <div className="flex gap-6 flex-wrap">
                        {/* License photo */}
                        {lead.customerLicenseImage && (() => {
                          const src = lead.customerLicenseImage.startsWith("data:") ? lead.customerLicenseImage : `data:image/jpeg;base64,${lead.customerLicenseImage}`;
                          return (
                            <div className="shrink-0">
                              <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">License Photo</p>
                              <img
                                src={src}
                                alt="License"
                                className="max-h-32 rounded-lg border-2 border-gray-200 hover:border-orange-400 shadow-sm cursor-pointer transition"
                                onClick={() => setLightboxSrc(src)}
                              />
                              <p className="text-gray-400 text-[10px] mt-1">Tap to enlarge</p>
                            </div>
                          );
                        })()}
                        {/* Contact info */}
                        <div className="space-y-2 min-w-[200px]">
                          <div>
                            <p className="text-gray-500 text-[10px] uppercase tracking-wide">Name</p>
                            <p className="text-gray-800 text-sm font-medium">{lead.customerName}</p>
                          </div>
                          {lead.customerEmail && (
                            <div>
                              <p className="text-gray-500 text-[10px] uppercase tracking-wide">Email</p>
                              <a href={`mailto:${lead.customerEmail}`} className="text-blue-600 text-sm hover:underline">{lead.customerEmail}</a>
                            </div>
                          )}
                          {lead.customerPhone && (
                            <div>
                              <p className="text-gray-500 text-[10px] uppercase tracking-wide">Phone</p>
                              <a href={`tel:${lead.customerPhone}`} className="text-blue-600 text-sm hover:underline">{lead.customerPhone}</a>
                            </div>
                          )}
                        </div>
                        {/* Optional fields */}
                        <div className="space-y-2 min-w-[150px]">
                          {lead.customerMaritalStatus && (
                            <div>
                              <p className="text-gray-500 text-[10px] uppercase tracking-wide">Marital Status</p>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 capitalize">
                                {lead.customerMaritalStatus}
                              </span>
                            </div>
                          )}
                          {lead.customerHasInsurance && (
                            <div>
                              <p className="text-gray-500 text-[10px] uppercase tracking-wide">Currently Insured?</p>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${lead.customerHasInsurance === "yes" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                {lead.customerHasInsurance === "yes" ? "Yes" : "No"}
                              </span>
                            </div>
                          )}
                          {lead.customerState && (
                            <div>
                              <p className="text-gray-500 text-[10px] uppercase tracking-wide">State</p>
                              <p className="text-gray-800 text-sm">{lead.customerState}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Criteria Fields Data */}
                      {lead.criteriaFieldsData && lead.criteriaFieldsData.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-3">Custom Lead Fields</p>
                          <div className="flex gap-6 flex-wrap">
                            {lead.criteriaFieldsData.map((field, idx) => (
                              <div key={idx} className="min-w-[150px]">
                                <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">{field.label}</p>
                                {field.fieldType === "PHOTO" && field.value ? (() => {
                                  const photoSrc = field.value.startsWith("data:") ? field.value : `data:image/jpeg;base64,${field.value}`;
                                  return (
                                    <div>
                                      <img
                                        src={photoSrc}
                                        alt={field.label}
                                        className="max-h-32 rounded-lg border-2 border-gray-200 hover:border-orange-400 shadow-sm cursor-pointer transition"
                                        onClick={() => setLightboxSrc(photoSrc)}
                                      />
                                      <p className="text-gray-400 text-[10px] mt-1">Tap to enlarge</p>
                                    </div>
                                  );
                                })() : field.fieldType === "BINARY" ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                    {field.value || "—"}
                                  </span>
                                ) : (
                                  <p className="text-gray-800 text-sm">{field.value || "—"}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Payout Status */}
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-2">Payout</p>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-800 text-sm font-medium">${calculateFeeBreakdown(lead.payoutAmount || 0, feeSettings).buyerTotal.toFixed(2)}</span>
                          {lead.payoutStatus === "completed" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              Completed
                            </span>
                          ) : lead.payoutStatus === "rejected" ? (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">Rejected</span>
                              {lead.rejectionReason && <span className="text-[10px] text-red-400">{lead.rejectionReason}</span>}
                            </div>
                          ) : lead.payoutStatus === "approved" ? (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">Approved</span>
                              <button
                                onClick={() => handleStripePayment([lead.id])}
                                disabled={batchMarkingPaid}
                                className="inline-flex items-center gap-1 text-white bg-[#635BFF] hover:bg-[#5248e5] px-2.5 py-1 rounded-lg text-xs font-medium transition disabled:opacity-50"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.19l-.897 5.555C5.014 22.77 7.862 24 11.422 24c2.58 0 4.711-.636 6.25-1.872 1.69-1.349 2.498-3.34 2.498-5.777 0-4.116-2.503-5.834-6.194-7.2z"/></svg>
                                {batchMarkingPaid ? "..." : "Pay via Stripe"}
                              </button>
                            </div>
                          ) : lead.payoutStatus === "processing" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">Processing</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-amber-600 text-xs font-medium">Unpaid</span>
                              <button
                                onClick={() => handleStripePayment([lead.id])}
                                disabled={batchMarkingPaid}
                                className="inline-flex items-center gap-1 text-white bg-[#635BFF] hover:bg-[#5248e5] px-2.5 py-1 rounded-lg text-xs font-medium transition disabled:opacity-50"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.19l-.897 5.555C5.014 22.77 7.862 24 11.422 24c2.58 0 4.711-.636 6.25-1.872 1.69-1.349 2.498-3.34 2.498-5.777 0-4.116-2.503-5.834-6.194-7.2z"/></svg>
                                {batchMarkingPaid ? "..." : "Pay via Stripe"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Provider Info Drawer */}
                  {providerInfoDrawer === lead.id && (
                    <div className="bg-blue-50 border-t border-blue-200 px-4 py-4">
                      <p className="text-blue-700 text-[10px] uppercase tracking-wide font-semibold mb-3">Provider Info</p>
                      <div className="flex gap-6 flex-wrap">
                        <div className="space-y-2 min-w-[150px]">
                          <div>
                            <p className="text-blue-500 text-[10px] uppercase tracking-wide">Name</p>
                            <p className="text-gray-800 text-sm font-medium">{lead.providerName || "Unknown"}</p>
                          </div>
                          {lead.providerEmail && (
                            <div>
                              <p className="text-blue-500 text-[10px] uppercase tracking-wide">Email</p>
                              <a href={`mailto:${lead.providerEmail}`} className="text-blue-600 text-sm hover:underline">{lead.providerEmail}</a>
                            </div>
                          )}
                          {lead.providerPhone && (
                            <div>
                              <p className="text-blue-500 text-[10px] uppercase tracking-wide">Phone</p>
                              <a href={`tel:${lead.providerPhone}`} className="text-blue-600 text-sm hover:underline">{lead.providerPhone}</a>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2 min-w-[150px]">
                          <div>
                            <p className="text-blue-500 text-[10px] uppercase tracking-wide">Submitted</p>
                            <p className="text-gray-800 text-sm">{new Date(lead.submittedAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Activity Drawer */}
                  {isExpanded && (
                    <div className="bg-gray-50 border-t border-gray-200 px-4 py-3">
                      {!activityCache[lead.id] ? (
                        <p className="text-xs text-gray-400">Loading...</p>
                      ) : activityCache[lead.id].length === 0 ? (
                        <p className="text-xs text-gray-400">No activity yet</p>
                      ) : (
                        <div className="space-y-2">
                          {activityCache[lead.id].map((entry, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className="text-gray-400 whitespace-nowrap">
                                {new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <span className="text-gray-600 font-medium">{entry.actor_name}</span>
                              <span className="text-gray-500">
                                {entry.action === "status_change" && `changed status from ${entry.from_value} to ${entry.to_value}`}
                                {entry.action === "assigned" && `assigned to ${entry.to_value || "unassigned"}`}
                                {entry.action === "follow_up_set" && `set follow-up to ${entry.to_value}`}
                                {entry.action === "note" && entry.note}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
          );
        })()}

        {/* Leaderboard Tab */}
        {activeTab === "leaderboard" && (
          <LeaderboardTab smsAgents={smsAgents} />
        )}

        {/* Marketing Tab */}
        {activeTab === "marketing" && (
          <MarketingTab />
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <TabErrorBoundary tabName="Settings">
            <SettingsTab currentBuyer={currentBuyer} feeSettings={feeSettings} onPayoutModeChange={setIsInstantMode} />
          </TabErrorBoundary>
        )}

        {/* Invite Tab */}
        {activeTab === "invite" && (
          <TabErrorBoundary tabName="Invite">
            <InviteTab
              businessName={currentBuyer?.businessName || "Your Business"}
              initialTokens={inviteTokens}
              initialCriteria={savedCriteria}
              initialFields={savedFields}
            />
          </TabErrorBoundary>
        )}
      </div>
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    claimed: "bg-emerald-100 text-emerald-700",
    expired: "bg-red-100 text-red-700",
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}


function ProvidersTab({
  fetchUsersByRole,
  sendInvitationToProvider,
  updateConnectionTerms,
  terminateConnection,
  activeConnections,
  feeSettings,
}: {
  fetchUsersByRole: (role: "buyer" | "provider") => Promise<DiscoveryUser[]>;
  sendInvitationToProvider: (email: string, terms: { ratePerLead: number; paymentTiming?: string; weeklyLeadCap?: number; monthlyLeadCap?: number; terminationNoticeDays?: number }, message?: string) => Promise<ApiConnection | null>;
  updateConnectionTerms: (id: string, terms: { ratePerLead?: number; paymentTiming?: string; weeklyLeadCap?: number | null; monthlyLeadCap?: number | null; terminationNoticeDays?: number }) => Promise<boolean>;
  terminateConnection: (id: string) => Promise<boolean>;
  activeConnections: ApiConnection[];
  feeSettings?: FeeSettings;
}) {
  const [allProviders, setAllProviders] = useState<DiscoveryUser[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<DiscoveryUser | null>(null);
  const [showTermsForm, setShowTermsForm] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Terms form state
  const [ratePerLead, setRatePerLead] = useState(50);
  const [paymentTiming, setPaymentTiming] = useState<"per_lead" | "weekly" | "biweekly" | "monthly">("per_lead");
  const [enableLeadCaps, setEnableLeadCaps] = useState(false);
  const [weeklyLeadCap, setWeeklyLeadCap] = useState<number | undefined>(undefined);
  const [monthlyLeadCap, setMonthlyLeadCap] = useState<number | undefined>(undefined);
  const [terminationDays, setTerminationDays] = useState(0);
  const [inviteMessage, setInviteMessage] = useState("");

  // Edit terms modal state
  const [editingConnection, setEditingConnection] = useState<ApiConnection | null>(null);
  const [editRate, setEditRate] = useState(50);
  const [editPaymentTiming, setEditPaymentTiming] = useState<"per_lead" | "weekly" | "biweekly" | "monthly">("per_lead");
  const [editEnableLeadCaps, setEditEnableLeadCaps] = useState(false);
  const [editWeeklyLeadCap, setEditWeeklyLeadCap] = useState<number | undefined>(undefined);
  const [editMonthlyLeadCap, setEditMonthlyLeadCap] = useState<number | undefined>(undefined);
  const [editTerminationDays, setEditTerminationDays] = useState(0);

  // Invite new provider state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [invitePersonalMessage, setInvitePersonalMessage] = useState("");
  const [inviteRate, setInviteRate] = useState(50);
  const [invitePaymentTiming, setInvitePaymentTiming] = useState<"per_lead" | "weekly" | "biweekly" | "monthly">("per_lead");
  const [inviteEnableLeadCaps, setInviteEnableLeadCaps] = useState(false);
  const [inviteWeeklyLeadCap, setInviteWeeklyLeadCap] = useState<number | undefined>(undefined);
  const [inviteMonthlyLeadCap, setInviteMonthlyLeadCap] = useState<number | undefined>(undefined);
  const [inviteTerminationDays, setInviteTerminationDays] = useState(0);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // Pending invites tracking
  const [pendingInvites, setPendingInvites] = useState<Array<{
    id: string;
    invite_code: string;
    provider_name: string | null;
    provider_email: string | null;
    provider_phone: string | null;
    rate_per_lead: number;
    status: string;
    created_at: string;
    expires_at: string;
  }>>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(true);

  // Fetch providers on mount
  useEffect(() => {
    loadProviders();
    loadInvites();
  }, []);

  const loadProviders = async () => {
    setIsLoadingProviders(true);
    try {
      const users = await fetchUsersByRole("provider");
      setAllProviders(users);
    } catch (error) {
      console.error("Failed to fetch providers:", error);
    } finally {
      setIsLoadingProviders(false);
    }
  };

  const loadInvites = async () => {
    setIsLoadingInvites(true);
    try {
      const res = await fetch("/api/invites");
      const data = await res.json();
      if (data.success) {
        setPendingInvites(data.invites || []);
      }
    } catch (error) {
      console.error("Failed to fetch invites:", error);
    } finally {
      setIsLoadingInvites(false);
    }
  };

  const handleCreateInvite = async () => {
    if (!inviteName.trim()) {
      setNotification({ type: "error", message: "Please enter the provider's name." });
      setTimeout(() => setNotification(null), 5000);
      return;
    }
    setIsCreatingInvite(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName: inviteName,
          providerEmail: inviteEmail || undefined,
          providerPhone: invitePhone || undefined,
          ratePerLead: inviteRate,
          paymentTiming: invitePaymentTiming,
          weeklyLeadCap: inviteEnableLeadCaps ? inviteWeeklyLeadCap : undefined,
          monthlyLeadCap: inviteEnableLeadCaps ? inviteMonthlyLeadCap : undefined,
          terminationNoticeDays: inviteTerminationDays,
          message: invitePersonalMessage || undefined,
        }),
      });
      const data = await res.json();

      if (data.error === "provider_exists") {
        // Provider already registered — use existing connections flow
        setShowInviteModal(false);
        setNotification({ type: "error", message: "This provider is already registered. Use the Providers tab to send them connection terms." });
        setTimeout(() => setNotification(null), 5000);
        return;
      }

      if (data.success) {
        setShowInviteModal(false);
        setNotification({
          type: "success",
          message: data.emailSent
            ? `Invite created and email sent to ${inviteEmail}! Link: ${data.inviteUrl}`
            : `Invite link created! Share it with ${inviteName}.`,
        });
        // Copy to clipboard
        try { await navigator.clipboard.writeText(data.inviteUrl); } catch {}
        // Reset form
        setInviteEmail("");
        setInviteName("");
        setInvitePhone("");
        setInvitePersonalMessage("");
        setInviteRate(50);
        setInvitePaymentTiming("per_lead");
        setInviteEnableLeadCaps(false);
        setInviteWeeklyLeadCap(undefined);
        setInviteMonthlyLeadCap(undefined);
        setInviteTerminationDays(7);
        // Refresh invites list
        await loadInvites();
      } else {
        setNotification({ type: "error", message: data.error || "Failed to create invite." });
      }
    } catch {
      setNotification({ type: "error", message: "Failed to create invite. Please try again." });
    } finally {
      setIsCreatingInvite(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!confirm("Cancel this invite? The link will stop working.")) return;
    try {
      const res = await fetch(`/api/invites?id=${inviteId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setNotification({ type: "success", message: "Invite cancelled." });
        await loadInvites();
      } else {
        setNotification({ type: "error", message: "Failed to cancel invite." });
      }
    } catch {
      setNotification({ type: "error", message: "Failed to cancel invite." });
    }
    setTimeout(() => setNotification(null), 5000);
  };

  const copyInviteLink = async (inviteCode: string) => {
    const siteUrl = "https://www.womleads.com";
    const url = `${siteUrl}/auth/register?invite=${inviteCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInviteId(inviteCode);
      setTimeout(() => setCopiedInviteId(null), 2000);
    } catch {
      setNotification({ type: "error", message: "Failed to copy link." });
      setTimeout(() => setNotification(null), 5000);
    }
  };

  // Filter providers by search
  const filteredProviders = allProviders.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (p.displayName || "").toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q) ||
      (p.location && p.location.toLowerCase().includes(q))
    );
  });

  const nonActiveProviders = filteredProviders.filter((p) => p.connectionStatus !== "active");
  const activeProviders = filteredProviders.filter((p) => p.connectionStatus === "active");

  const getStatusBadge = (provider: DiscoveryUser) => {
    if (!provider.connectionStatus) return { label: "Not Connected", bg: "bg-gray-100", text: "text-gray-600" };
    switch (provider.connectionStatus) {
      case "pending_provider_accept": return { label: "Invitation Sent", bg: "bg-amber-100", text: "text-amber-700" };
      case "pending_buyer_review": return { label: "Requested Connection", bg: "bg-orange-100", text: "text-orange-700" };
      case "active": return { label: "Connected", bg: "bg-emerald-100", text: "text-emerald-700" };
      case "terminated": return { label: "Previously Terminated", bg: "bg-gray-100", text: "text-gray-600" };
      case "declined_by_provider": return { label: "Declined", bg: "bg-red-100", text: "text-red-600" };
      case "rejected_by_buyer": return { label: "Rejected", bg: "bg-red-100", text: "text-red-600" };
      default: return { label: provider.connectionStatus, bg: "bg-gray-100", text: "text-gray-600" };
    }
  };

  const getPayoutLabel = (method: string | null | undefined) => {
    if (!method) return null;
    switch (method) {
      case "paypal": return "PayPal";
      case "cashapp": return "CashApp";
      case "bank": return "Bank Transfer";
      default: return method;
    }
  };

  const canSendTerms = (provider: DiscoveryUser) => {
    return !provider.connectionStatus || provider.connectionStatus === "terminated" || provider.connectionStatus === "declined_by_provider" || provider.connectionStatus === "rejected_by_buyer";
  };

  const handleSendTerms = async () => {
    if (!selectedProvider) return;
    setIsSending(true);
    try {
      const terms = {
        ratePerLead,
        paymentTiming,
        weeklyLeadCap: enableLeadCaps ? weeklyLeadCap : undefined,
        monthlyLeadCap: enableLeadCaps ? monthlyLeadCap : undefined,
        terminationNoticeDays: terminationDays,
      };
      const result = await sendInvitationToProvider(selectedProvider.email, terms, inviteMessage || undefined);
      if (result) {
        setNotification({ type: "success", message: `Terms sent to ${selectedProvider.displayName}! They will see your offer when they sign in.` });
        setSelectedProvider(null);
        setShowTermsForm(false);
        resetTermsForm();
        await loadProviders();
      } else {
        setNotification({ type: "error", message: "Failed to send terms. Please try again." });
      }
    } catch {
      setNotification({ type: "error", message: "Failed to send terms. Please try again." });
    } finally {
      setIsSending(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const resetTermsForm = () => {
    setRatePerLead(50);
    setPaymentTiming("per_lead");
    setEnableLeadCaps(false);
    setWeeklyLeadCap(undefined);
    setMonthlyLeadCap(undefined);
    setTerminationDays(7);
    setInviteMessage("");
  };

  const openEditTerms = (connection: ApiConnection) => {
    setEditingConnection(connection);
    setEditRate(connection.rate_per_lead);
    setEditPaymentTiming((connection.payment_timing as typeof editPaymentTiming) || "per_lead");
    setEditEnableLeadCaps(!!(connection.weekly_lead_cap || connection.monthly_lead_cap));
    setEditWeeklyLeadCap(connection.weekly_lead_cap || undefined);
    setEditMonthlyLeadCap(connection.monthly_lead_cap || undefined);
    setEditTerminationDays(connection.termination_notice_days ?? 0);
  };

  const handleUpdateTerms = async () => {
    if (!editingConnection) return;
    const terms = {
      ratePerLead: editRate,
      paymentTiming: editPaymentTiming,
      weeklyLeadCap: editEnableLeadCaps ? (editWeeklyLeadCap || null) : null,
      monthlyLeadCap: editEnableLeadCaps ? (editMonthlyLeadCap || null) : null,
      terminationNoticeDays: editTerminationDays,
    };
    const success = await updateConnectionTerms(editingConnection.id, terms);
    if (success) {
      setNotification({ type: "success", message: `Terms updated for ${editingConnection.providerName}.` });
      setEditingConnection(null);
      await loadProviders();
    } else {
      setNotification({ type: "error", message: "Failed to update terms." });
    }
    setTimeout(() => setNotification(null), 5000);
  };

  const handleTerminate = async (connection: ApiConnection) => {
    if (!confirm(`Are you sure you want to terminate your connection with ${connection.providerName}?`)) return;
    const success = await terminateConnection(connection.id);
    if (success) {
      setNotification({ type: "success", message: `Connection with ${connection.providerName} terminated.` });
      await loadProviders();
    } else {
      setNotification({ type: "error", message: "Failed to terminate connection." });
    }
    setTimeout(() => setNotification(null), 5000);
  };

  // Provider card component
  const ProviderCard = ({ provider, isActive }: { provider: DiscoveryUser; isActive: boolean }) => {
    const badge = getStatusBadge(provider);
    const connection = isActive ? activeConnections.find((c) => c.provider_id === provider.id) : null;

    return (
      <button
        onClick={() => { setSelectedProvider(provider); setShowTermsForm(false); }}
        className={`text-left bg-white rounded-xl border p-5 shadow-sm hover:shadow-md transition cursor-pointer ${
          isActive ? "border-emerald-200" : "border-gray-200 hover:border-[#E8822A]/30"
        }`}
      >
        <div className="flex items-start gap-3">
          {provider.profilePictureUrl ? (
            <img
              src={provider.profilePictureUrl}
              alt={provider.displayName}
              className="h-12 w-12 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className={`h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              isActive ? "bg-emerald-600" : "bg-[#E8822A]"
            }`}>
              <span className="text-white font-bold text-lg">
                {(provider.displayName || "?").charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="text-gray-800 font-semibold truncate">{provider.displayName}</h4>
            {provider.username && provider.username !== provider.displayName && (
              <p className="text-gray-400 text-xs truncate">@{provider.username}</p>
            )}
            <p className="text-gray-500 text-sm truncate">{provider.email}</p>
            <p className="text-gray-400 text-xs mt-0.5 truncate">{provider.location || "No location"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
          {connection && (
            <span className="text-xs text-emerald-600 font-medium">${calculateFeeBreakdown(connection.rate_per_lead || 0, feeSettings).buyerTotal.toFixed(2)}/lead</span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl border shadow-lg ${
          notification.type === "success"
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          <div className="flex items-center gap-3">
            {notification.type === "success" ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <p className="text-sm">{notification.message}</p>
            <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-70">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Header + Search + Invite Button */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-lg font-semibold text-[#E8822A]">Provider Network ({allProviders.length})</h3>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, location..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] w-72"
            />
          </div>
          <button
            onClick={() => setShowInviteModal(true)}
            className="bg-[#E8822A] hover:bg-[#D47526] text-white px-4 py-2 rounded-lg font-medium transition text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Invite Provider
          </button>
        </div>
      </div>

      {/* Pending Invites Tracking */}
      {pendingInvites.filter(i => i.status === "pending").length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm">
          <h4 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Pending Invites ({pendingInvites.filter(i => i.status === "pending").length})
          </h4>
          <div className="space-y-3">
            {pendingInvites.filter(i => i.status === "pending").map((invite) => (
              <div key={invite.id} className="flex items-center justify-between p-3 bg-amber-50/50 rounded-lg border border-amber-100">
                <div>
                  <p className="font-medium text-gray-800">{invite.provider_name || "Unnamed"}</p>
                  <p className="text-gray-500 text-sm">
                    {invite.provider_email || invite.provider_phone || "No contact info"}
                    {" · "}${Number(invite.rate_per_lead).toFixed(2)}/lead
                    {" · "}Created {new Date(invite.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyInviteLink(invite.invite_code)}
                    className="text-[#E8822A] hover:bg-[#E8822A]/10 px-3 py-1.5 rounded-lg font-medium transition text-sm flex items-center gap-1"
                  >
                    {copiedInviteId === invite.invite_code ? (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        Copy Link
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleCancelInvite(invite.id)}
                    className="text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg font-medium transition text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoadingProviders ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8822A]"></div>
        </div>
      ) : (
        <>
          {/* Non-Active Senders Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
              Non-Active Senders ({nonActiveProviders.length})
            </h4>
            {nonActiveProviders.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-400">{searchQuery ? "No providers match your search." : "All registered providers have active connections."}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {nonActiveProviders.map((provider) => (
                  <ProviderCard key={provider.id} provider={provider} isActive={false} />
                ))}
              </div>
            )}
          </div>

          {/* Active Connections Section */}
          {activeProviders.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                Active Connections ({activeProviders.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeProviders.map((provider) => (
                  <ProviderCard key={provider.id} provider={provider} isActive={true} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Provider Profile Modal */}
      {selectedProvider && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setSelectedProvider(null); setShowTermsForm(false); }}>
          <div
            className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Profile Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-4">
                {selectedProvider.profilePictureUrl ? (
                  <img
                    src={selectedProvider.profilePictureUrl}
                    alt={selectedProvider.displayName}
                    className="h-16 w-16 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-[#E8822A] flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-2xl">
                      {(selectedProvider.displayName || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-[#E8822A]">{selectedProvider.displayName}</h3>
                  {selectedProvider.username && selectedProvider.username !== selectedProvider.displayName && (
                    <p className="text-gray-400 text-sm">@{selectedProvider.username}</p>
                  )}
                  <p className="text-gray-500">{selectedProvider.email}</p>
                </div>
              </div>
            </div>

            {/* Profile Details */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Username</p>
                  <p className="text-gray-800 font-medium">@{selectedProvider.username || "N/A"}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Email</p>
                  <a href={`mailto:${selectedProvider.email}`} className="text-[#E8822A] font-medium hover:underline">
                    {selectedProvider.email}
                  </a>
                </div>
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Phone</p>
                  {selectedProvider.phone ? (
                    <a href={`tel:${selectedProvider.phone}`} className="text-[#E8822A] font-medium hover:underline">
                      {selectedProvider.phone}
                    </a>
                  ) : (
                    <p className="text-gray-400 font-medium italic">Not provided</p>
                  )}
                </div>
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Location</p>
                  <p className={`font-medium ${selectedProvider.location ? "text-gray-800" : "text-gray-400 italic"}`}>
                    {selectedProvider.location || "Not provided"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Preferred Payment</p>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium bg-purple-50 text-purple-700">
                    Stripe Connect
                  </span>
                </div>
              </div>

              {/* Connection Status */}
              {(() => {
                const badge = getStatusBadge(selectedProvider);
                return (
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 text-sm">Connection Status</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons */}
              {(() => {
                const connection = activeConnections.find((c) => c.provider_id === selectedProvider.id);

                if (selectedProvider.connectionStatus === "active" && connection) {
                  return (
                    <div className="space-y-3">
                      <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-emerald-600 text-xs">Rate</p>
                            <p className="text-emerald-800 font-bold text-lg">${calculateFeeBreakdown(connection.rate_per_lead || 0, feeSettings).buyerTotal.toFixed(2)}/lead</p>
                            <p className="text-emerald-600 text-xs">(${Number(connection.rate_per_lead || 0).toFixed(2)} + $${calculateFeeBreakdown(connection.rate_per_lead || 0, feeSettings).buyerFee.toFixed(2)} fee)</p>
                          </div>
                          <div>
                            <p className="text-emerald-600 text-xs">Payment</p>
                            <p className="text-emerald-800 font-medium capitalize">{(connection.payment_timing || "per_lead").replace("_", " ")}</p>
                          </div>
                          <div>
                            <p className="text-emerald-600 text-xs">Total Leads</p>
                            <p className="text-emerald-800 font-bold">{connection.total_leads}</p>
                          </div>
                          <div>
                            <p className="text-emerald-600 text-xs">Total Paid</p>
                            <p className="text-emerald-800 font-bold">${Number(connection.total_paid || 0).toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => openEditTerms(connection)}
                          className="flex-1 px-4 py-2.5 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-medium transition text-sm"
                        >
                          Edit Terms
                        </button>
                        <button
                          onClick={() => handleTerminate(connection)}
                          className="px-4 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg font-medium transition text-sm"
                        >
                          Terminate
                        </button>
                      </div>
                    </div>
                  );
                }

                if (selectedProvider.connectionStatus === "pending_provider_accept") {
                  return (
                    <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 text-center">
                      <div className="flex items-center justify-center gap-2 text-amber-700">
                        <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                        <p className="font-medium">Awaiting Provider Response</p>
                      </div>
                      <p className="text-amber-600 text-sm mt-1">You&apos;ve already sent terms. Waiting for them to accept.</p>
                    </div>
                  );
                }

                if (selectedProvider.connectionStatus === "pending_buyer_review") {
                  return (
                    <div className="bg-orange-50 rounded-lg p-4 border border-orange-200 text-center">
                      <p className="text-orange-700 font-medium">This provider requested a connection</p>
                      <p className="text-orange-600 text-sm mt-1">View in the Connections tab.</p>
                    </div>
                  );
                }

                // Can send terms: not connected, terminated, declined, rejected
                if (canSendTerms(selectedProvider)) {
                  if (!showTermsForm) {
                    return (
                      <button
                        onClick={() => { setShowTermsForm(true); resetTermsForm(); }}
                        className="w-full py-3 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Send Connection Terms
                      </button>
                    );
                  }

                  // Inline terms form
                  return (
                    <div className="space-y-4 border-t border-gray-200 pt-4">
                      <h4 className="font-semibold text-[#E8822A]">Set Connection Terms</h4>

                      {/* Rate Per Lead */}
                      <div>
                        <label className="block text-gray-700 text-sm font-medium mb-1">Rate Per Lead</label>
                        <div className="flex items-center gap-2">
                          <span className="text-[#E8822A] text-xl">$</span>
                          <input
                            type="number"
                            value={ratePerLead}
                            onChange={(e) => setRatePerLead(Number(e.target.value))}
                            className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A]"
                            min={5}
                            max={500}
                          />
                          <span className="text-gray-500 text-sm">per qualified lead</span>
                        </div>
                      </div>

                      {/* Payment Timing */}
                      <div>
                        <label className="block text-gray-700 text-sm font-medium mb-1">Payment Timing</label>
                        <select
                          value={paymentTiming}
                          onChange={(e) => setPaymentTiming(e.target.value as typeof paymentTiming)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] bg-white"
                        >
                          <option value="per_lead">Per Lead (Immediate)</option>
                          <option value="weekly">Weekly</option>
                          <option value="biweekly">Bi-weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>

                      {/* Lead Caps */}
                      <div className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h5 className="font-medium text-gray-800 text-sm">Lead Volume Caps</h5>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={enableLeadCaps}
                              onChange={(e) => setEnableLeadCaps(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#E8822A]"></div>
                          </label>
                        </div>
                        {enableLeadCaps && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-gray-600 text-xs mb-1">Weekly Cap</label>
                              <input
                                type="number"
                                value={weeklyLeadCap || ""}
                                onChange={(e) => setWeeklyLeadCap(e.target.value ? Number(e.target.value) : undefined)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 text-sm"
                                placeholder="No limit"
                              />
                            </div>
                            <div>
                              <label className="block text-gray-600 text-xs mb-1">Monthly Cap</label>
                              <input
                                type="number"
                                value={monthlyLeadCap || ""}
                                onChange={(e) => setMonthlyLeadCap(e.target.value ? Number(e.target.value) : undefined)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 text-sm"
                                placeholder="No limit"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Termination Notice */}
                      <div>
                        <label className="block text-gray-700 text-sm font-medium mb-1">Termination Notice</label>
                        <select
                          value={terminationDays}
                          onChange={(e) => setTerminationDays(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] bg-white"
                        >
                          <option value={0}>Immediate (No notice)</option>
                          <option value={7}>7 days notice</option>
                          <option value={14}>14 days notice</option>
                          <option value={30}>30 days notice</option>
                        </select>
                      </div>

                      {/* Message */}
                      <div>
                        <label className="block text-gray-700 text-sm font-medium mb-1">Message (optional)</label>
                        <textarea
                          value={inviteMessage}
                          onChange={(e) => setInviteMessage(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] text-sm"
                          rows={2}
                          placeholder="Hi! I'd like to partner with you for leads..."
                        />
                      </div>

                      {/* Submit */}
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowTermsForm(false)}
                          className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSendTerms}
                          disabled={isSending}
                          className="flex-1 px-4 py-2.5 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-medium transition text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isSending ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              Sending...
                            </>
                          ) : (
                            "Send Invitation"
                          )}
                        </button>
                      </div>
                    </div>
                  );
                }

                return null;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Edit Terms Modal */}
      {/* Invite New Provider Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowInviteModal(false)}>
          <div
            className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-[#E8822A]">Invite a New Provider</h3>
              <p className="text-gray-500 text-sm mt-1">Create a shareable invite link with pre-set terms. The provider will sign up and automatically receive your connection offer.</p>
            </div>
            <div className="p-6 space-y-4">
              {/* Provider Info */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">Provider Name *</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A]"
                  placeholder="John Smith"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">Email <span className="text-gray-400">(optional)</span></label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A]"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">Phone <span className="text-gray-400">(optional)</span></label>
                  <input
                    type="tel"
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A]"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
              {/* Rate */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">Rate Per Lead</label>
                <div className="flex items-center gap-2">
                  <span className="text-[#E8822A] text-xl">$</span>
                  <input
                    type="number"
                    value={inviteRate}
                    onChange={(e) => setInviteRate(Number(e.target.value))}
                    className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A]"
                    min={5}
                    max={500}
                  />
                  <span className="text-gray-500 text-sm">per qualified lead</span>
                </div>
              </div>
              {/* Payment Timing */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">Payment Timing</label>
                <select
                  value={invitePaymentTiming}
                  onChange={(e) => setInvitePaymentTiming(e.target.value as typeof invitePaymentTiming)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] bg-white"
                >
                  <option value="per_lead">Per Lead (pay as leads come in)</option>
                  <option value="weekly">Weekly Batch</option>
                  <option value="biweekly">Bi-weekly Batch</option>
                  <option value="monthly">Monthly Batch</option>
                </select>
              </div>
              {/* Termination */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">Termination Notice</label>
                <select
                  value={inviteTerminationDays}
                  onChange={(e) => setInviteTerminationDays(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] bg-white"
                >
                  <option value={0}>Immediate (No notice)</option>
                  <option value={7}>7 days notice</option>
                  <option value={14}>14 days notice</option>
                  <option value={30}>30 days notice</option>
                </select>
              </div>
              {/* Personal Message */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">Personal Message <span className="text-gray-400">(optional)</span></label>
                <textarea
                  value={invitePersonalMessage}
                  onChange={(e) => setInvitePersonalMessage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] resize-none"
                  rows={2}
                  placeholder="Hey, I'd love to work with you on WOML..."
                />
              </div>
              {inviteEmail && (
                <p className="text-xs text-gray-400">An invite email will be sent automatically if email is configured.</p>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateInvite}
                disabled={isCreatingInvite}
                className="flex-1 px-4 py-2.5 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isCreatingInvite ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  "Create Invite Link"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingConnection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingConnection(null)}>
          <div
            className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-[#E8822A]">Edit Terms - {editingConnection.providerName}</h3>
              <p className="text-gray-500 text-sm mt-1">Update the terms for this provider relationship.</p>
            </div>
            <div className="p-6 space-y-4">
              {/* Rate */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">Rate Per Lead</label>
                <div className="flex items-center gap-2">
                  <span className="text-[#E8822A] text-xl">$</span>
                  <input
                    type="number"
                    value={editRate}
                    onChange={(e) => setEditRate(Number(e.target.value))}
                    className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A]"
                    min={5}
                    max={500}
                  />
                  <span className="text-gray-500 text-sm">per qualified lead</span>
                </div>
              </div>
              {/* Payment Timing */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">Payment Timing</label>
                <select
                  value={editPaymentTiming}
                  onChange={(e) => setEditPaymentTiming(e.target.value as typeof editPaymentTiming)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] bg-white"
                >
                  <option value="per_lead">Per Lead (Immediate)</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              {/* Lead Caps */}
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-gray-800 text-sm">Lead Volume Caps</h5>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editEnableLeadCaps}
                      onChange={(e) => setEditEnableLeadCaps(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#E8822A]"></div>
                  </label>
                </div>
                {editEnableLeadCaps && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-600 text-xs mb-1">Weekly Cap</label>
                      <input
                        type="number"
                        value={editWeeklyLeadCap || ""}
                        onChange={(e) => setEditWeeklyLeadCap(e.target.value ? Number(e.target.value) : undefined)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 text-sm"
                        placeholder="No limit"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-xs mb-1">Monthly Cap</label>
                      <input
                        type="number"
                        value={editMonthlyLeadCap || ""}
                        onChange={(e) => setEditMonthlyLeadCap(e.target.value ? Number(e.target.value) : undefined)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 text-sm"
                        placeholder="No limit"
                      />
                    </div>
                  </div>
                )}
              </div>
              {/* Termination Notice */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">Termination Notice</label>
                <select
                  value={editTerminationDays}
                  onChange={(e) => setEditTerminationDays(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] bg-white"
                >
                  <option value={0}>Immediate (No notice)</option>
                  <option value={7}>7 days notice</option>
                  <option value={14}>14 days notice</option>
                  <option value={30}>30 days notice</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setEditingConnection(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateTerms}
                className="flex-1 px-4 py-2.5 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-medium transition"
              >
                Update Terms
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LedgerTab({ dbLeads, feeSettings }: { dbLeads: ApiLead[]; feeSettings?: FeeSettings }) {
  // Build transaction history from DB leads
  const transactions = dbLeads.map(lead => {
    const fees = calculateFeeBreakdown(lead.payoutAmount || 0, feeSettings);
    return {
      id: lead.id,
      date: lead.submittedAt,
      type: "lead_payout" as const,
      description: `Lead payout to ${lead.providerName || "Unknown"} for ${lead.customerName}`,
      amount: fees.buyerTotal,
      provider: lead.providerName || "Unknown",
      customer: lead.customerName,
      vehicle: [lead.vehicleYear, lead.vehicleMake, lead.vehicleModel].filter(Boolean).join(" ") || "-",
      status: lead.payoutStatus === "completed" ? "completed" : lead.payoutStatus === "processing" ? "sent_to_woml" : "pending",
    };
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalPaid = transactions.filter(t => t.status === "completed").reduce((sum, t) => sum + t.amount, 0);
  const totalPending = transactions.filter(t => t.status === "pending").reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">Total Transactions</p>
          <p className="text-3xl font-bold text-gray-800">{transactions.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">Total Paid Out</p>
          <p className="text-3xl font-bold text-emerald-600">${totalPaid.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">Pending Payouts</p>
          <p className="text-3xl font-bold text-amber-600">${totalPending.toFixed(2)}</p>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-[#E8822A]">Transaction Ledger</h3>
          <button className="text-[#E8822A] hover:text-[#D47526] text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Provider</th>
                <th className="pb-3 font-medium">Customer</th>
                <th className="pb-3 font-medium">Vehicle</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-gray-100">
                  <td className="py-4 text-gray-500 text-sm">
                    {new Date(tx.date).toLocaleDateString()} {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-4 text-gray-800 font-medium">{tx.provider}</td>
                  <td className="py-4 text-gray-600">{tx.customer}</td>
                  <td className="py-4 text-gray-600 text-sm">{tx.vehicle}</td>
                  <td className="py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      tx.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {tx.status === "completed" ? "Paid" : "Pending"}
                    </span>
                  </td>
                  <td className="py-4 text-[#E8822A] font-bold text-right">${Number(tx.amount).toFixed(2)}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-12">
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


// Provider Detail Modal - Full baseball card view
function ProviderDetailModal({
  provider,
  dbLeads,
  onClose,
  feeSettings,
}: {
  provider: Provider;
  dbLeads: ApiLead[];
  onClose: () => void;
  feeSettings?: FeeSettings;
}) {
  const [activeView, setActiveView] = useState<"card" | "ledger">("card");
  const paidLeads = dbLeads.filter(l => l.payoutStatus === "completed" || l.payoutStatus === "processing");
  const conversionRate = dbLeads.length > 0 ? Math.round((paidLeads.length / dbLeads.length) * 100) : 0;
  const totalPaid = dbLeads.reduce((sum, l) => sum + calculateFeeBreakdown(l.payoutAmount || 0, feeSettings).buyerTotal, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#E8822A] to-[#D47526] p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-3xl font-bold">{(provider.name || "?").charAt(0)}</span>
            </div>
            <div>
              <h3 className="text-2xl font-bold">{provider.name}</h3>
              <p className="text-white/70">{provider.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  provider.status === "active"
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-red-500/20 text-red-200"
                }`}>
                  {provider.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveView("card")}
            className={`flex-1 py-3 font-medium transition ${
              activeView === "card"
                ? "text-[#E8822A] border-b-2 border-[#E8822A]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Stats Card
          </button>
          <button
            onClick={() => setActiveView("ledger")}
            className={`flex-1 py-3 font-medium transition ${
              activeView === "ledger"
                ? "text-[#E8822A] border-b-2 border-[#E8822A]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Payment Ledger
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[50vh] overflow-y-auto">
          {activeView === "card" ? (
            <div className="space-y-6">
              {/* Career Stats */}
              <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Career Stats</h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-[#E8822A]">{dbLeads.length}</p>
                    <p className="text-gray-500 text-sm">Total Leads</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-emerald-600">${totalPaid.toFixed(2)}</p>
                    <p className="text-gray-500 text-sm">Total Paid</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-orange-600">{conversionRate}%</p>
                    <p className="text-gray-500 text-sm">Conversion</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-amber-600">${Number(provider.payoutRate || 0).toFixed(2)}</p>
                    <p className="text-gray-500 text-sm">Per Lead</p>
                  </div>
                </div>
              </div>

              {/* Agreement Info */}
              <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Agreement</h4>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-gray-800 font-medium">Current Payout Rate</p>
                      <p className="text-gray-500 text-sm">Payout: Stripe Connect</p>
                    </div>
                    <p className="text-2xl font-bold text-[#E8822A]">${Number(provider.payoutRate || 0).toFixed(2)}/lead</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Transaction History</h4>
                <p className="text-sm text-gray-500">{dbLeads.length} transactions</p>
              </div>

              {dbLeads.length > 0 ? (
                <div className="space-y-2">
                  {dbLeads.map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-gray-800 font-medium">{lead.customerName}</p>
                        <p className="text-gray-500 text-sm">{new Date(lead.submittedAt).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[#E8822A] font-bold">${calculateFeeBreakdown(lead.payoutAmount || 0, feeSettings).buyerTotal.toFixed(2)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          lead.payoutStatus === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : lead.payoutStatus === "processing"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {lead.payoutStatus === "completed" ? "Paid" : lead.payoutStatus === "processing" ? "Sent to WOML" : "Pending"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-400 py-8">No transactions yet</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Analytics Tab - Excel Upload & Data Visualization
interface UploadedRecord {
  customerName: string;          // Name of person (customer)
  businessSender: string;        // Business sender (at company level)
  individualSender: string;      // Individual sender (car salesman providing business)
  paidGenerator: boolean;        // Paid the lead generator or not (Y/N)
  contactMade: boolean;          // Contact made with the lead (Y/N)
  sold: boolean;                 // Converted (Y/N)
  providerName?: string;
  customerEmail?: string;
  date?: string;
}

interface ProviderPerformance {
  name: string;
  businessName: string;
  totalLeads: number;
  contactedLeads: number;
  soldLeads: number;
  paidLeads: number;
  contactRate: number;
  conversionRate: number;
  paymentRate: number;
  unpaidAmount: number;  // Leads not paid yet
}

interface AnalyticsData {
  // Summary metrics
  totalLeads: number;
  totalContacted: number;
  totalSold: number;
  totalPaid: number;
  overallContactRate: number;
  overallConversionRate: number;
  overallPaymentRate: number;
  // Provider breakdown
  providerStats: ProviderPerformance[];
  // Business breakdown
  businessStats: {
    name: string;
    totalLeads: number;
    soldLeads: number;
    conversionRate: number;
  }[];
}

// Weekly time-series data for dot plot visualization
interface ProviderWeeklyData {
  providerName: string;
  color: string;
  overallConversionRate: number;
  weeks: {
    weekStart: string;
    weekLabel: string;
    totalLeads: number;      // Leads this week only
    soldLeads: number;       // Sold this week only
    conversionRate: number;  // CUMULATIVE: cumulativeSold / cumulativeTotal * 100
    cumulativeTotal: number; // Running total of all leads up to this week
    cumulativeSold: number;  // Running total of all sold up to this week
  }[];
}

// Parse Excel date (handles both serial numbers and date strings)
function parseExcelDate(value: unknown): string {
  if (!value) return new Date().toISOString();

  // If it's a number (Excel serial date), convert it
  // Excel dates are number of days since Dec 30, 1899
  if (typeof value === "number" || (typeof value === "string" && !isNaN(Number(value)) && Number(value) > 1000)) {
    const serial = Number(value);
    // Excel epoch is Dec 30, 1899 (day 0)
    // JS epoch is Jan 1, 1970
    // Difference: 25569 days
    const msPerDay = 86400 * 1000;
    const date = new Date((serial - 25569) * msPerDay);
    if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
      return date.toISOString();
    }
  }

  // Try parsing as date string
  const parsed = new Date(String(value));
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
    return parsed.toISOString();
  }

  // Fallback to current date
  return new Date().toISOString();
}

// Get the Monday of the week for a given date
function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr);
  // Validate the date
  if (isNaN(date.getTime()) || date.getFullYear() < 1900 || date.getFullYear() > 2100) {
    return new Date().toISOString().split("T")[0]; // Fallback to today
  }
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  return monday.toISOString().split("T")[0];
}

// Format week label (e.g., "Jan 6")
function formatWeekLabel(weekStart: string): string {
  const date = new Date(weekStart);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Calculate weekly performance data for top performers (CUMULATIVE conversion rate)
function calculateWeeklyPerformance(
  data: UploadedRecord[],
  providerStats: ProviderPerformance[]
): { weeklyData: ProviderWeeklyData[]; allWeeks: string[] } {
  // Get top 3 performers by conversion rate (with at least 3 leads)
  const topPerformers = providerStats
    .filter(p => p.totalLeads >= 3)
    .sort((a, b) => b.conversionRate - a.conversionRate)
    .slice(0, 3);

  const colors = ["#E8822A", "#10b981", "#f59e0b"];

  // Group all records by week
  const weekSet = new Set<string>();
  data.forEach(record => {
    if (record.date) {
      weekSet.add(getWeekStart(record.date));
    }
  });
  const allWeeks = Array.from(weekSet).sort();

  // Calculate weekly data for each top performer with CUMULATIVE conversion rate
  const weeklyData: ProviderWeeklyData[] = topPerformers.map((performer, i) => {
    const providerRecords = data.filter(
      r => (r.individualSender || r.providerName) === performer.name
    );

    // Sort records by date for cumulative calculation
    const sortedRecords = [...providerRecords].sort((a, b) => {
      const dateA = new Date(a.date || 0).getTime();
      const dateB = new Date(b.date || 0).getTime();
      return dateA - dateB;
    });

    // Group by week first to get per-week counts
    const weekMap = new Map<string, { total: number; sold: number }>();
    sortedRecords.forEach(record => {
      if (record.date) {
        const week = getWeekStart(record.date);
        const existing = weekMap.get(week) || { total: 0, sold: 0 };
        existing.total++;
        if (record.sold) existing.sold++;
        weekMap.set(week, existing);
      }
    });

    // Now calculate CUMULATIVE totals across weeks
    let cumulativeTotal = 0;
    let cumulativeSold = 0;

    return {
      providerName: performer.name,
      color: colors[i],
      overallConversionRate: performer.conversionRate,
      weeks: allWeeks.map(week => {
        const stats = weekMap.get(week) || { total: 0, sold: 0 };
        // Add this week's numbers to running total
        cumulativeTotal += stats.total;
        cumulativeSold += stats.sold;

        return {
          weekStart: week,
          weekLabel: formatWeekLabel(week),
          totalLeads: stats.total,
          soldLeads: stats.sold,
          // CUMULATIVE conversion rate: all sold so far / all leads so far
          conversionRate: cumulativeTotal > 0 ? (cumulativeSold / cumulativeTotal) * 100 : 0,
          // Store cumulative values for tooltip
          cumulativeTotal,
          cumulativeSold,
        };
      }),
    };
  });

  return { weeklyData, allWeeks };
}

function AnalyticsTab({
  dbLeads,
  providers,
  myConnections,
  feeSettings,
}: {
  dbLeads: ApiLead[];
  providers: Provider[];
  myConnections: ApiConnection[];
  feeSettings?: FeeSettings;
}) {
  const [uploadedData, setUploadedData] = useState<UploadedRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Calculate analytics from uploaded data
  const calculateAnalytics = (data: UploadedRecord[]): AnalyticsData => {
    // New format metrics
    const totalLeads = data.length;
    const totalContacted = data.filter(r => r.contactMade).length;
    const totalSold = data.filter(r => r.sold).length;
    const totalPaid = data.filter(r => r.paidGenerator).length;

    const overallContactRate = totalLeads > 0 ? (totalContacted / totalLeads) * 100 : 0;
    const overallConversionRate = totalLeads > 0 ? (totalSold / totalLeads) * 100 : 0;
    const overallPaymentRate = totalLeads > 0 ? (totalPaid / totalLeads) * 100 : 0;

    // Group by individual sender (lead provider)
    const providerMap = new Map<string, {
      businessName: string;
      totalLeads: number;
      contactedLeads: number;
      soldLeads: number;
      paidLeads: number;
    }>();

    data.forEach(record => {
      const key = record.individualSender || record.providerName || "Unknown";
      const existing = providerMap.get(key) || {
        businessName: record.businessSender || "",
        totalLeads: 0,
        contactedLeads: 0,
        soldLeads: 0,
        paidLeads: 0
      };
      existing.totalLeads++;
      if (record.contactMade) existing.contactedLeads++;
      if (record.sold) existing.soldLeads++;
      if (record.paidGenerator) existing.paidLeads++;
      providerMap.set(key, existing);
    });

    const providerStats: ProviderPerformance[] = Array.from(providerMap.entries())
      .map(([name, stats]) => ({
        name,
        businessName: stats.businessName,
        totalLeads: stats.totalLeads,
        contactedLeads: stats.contactedLeads,
        soldLeads: stats.soldLeads,
        paidLeads: stats.paidLeads,
        contactRate: stats.totalLeads > 0 ? (stats.contactedLeads / stats.totalLeads) * 100 : 0,
        conversionRate: stats.totalLeads > 0 ? (stats.soldLeads / stats.totalLeads) * 100 : 0,
        paymentRate: stats.totalLeads > 0 ? (stats.paidLeads / stats.totalLeads) * 100 : 0,
        unpaidAmount: stats.totalLeads - stats.paidLeads,
      }))
      .sort((a, b) => b.totalLeads - a.totalLeads);

    // Group by business sender
    const businessMap = new Map<string, { totalLeads: number; soldLeads: number }>();
    data.forEach(record => {
      const key = record.businessSender || "Unknown";
      const existing = businessMap.get(key) || { totalLeads: 0, soldLeads: 0 };
      existing.totalLeads++;
      if (record.sold) existing.soldLeads++;
      businessMap.set(key, existing);
    });

    const businessStats = Array.from(businessMap.entries())
      .map(([name, stats]) => ({
        name,
        totalLeads: stats.totalLeads,
        soldLeads: stats.soldLeads,
        conversionRate: stats.totalLeads > 0 ? (stats.soldLeads / stats.totalLeads) * 100 : 0,
      }))
      .sort((a, b) => b.totalLeads - a.totalLeads);

    return {
      totalLeads,
      totalContacted,
      totalSold,
      totalPaid,
      overallContactRate,
      overallConversionRate,
      overallPaymentRate,
      providerStats,
      businessStats,
    };
  };

  // Parse Excel/CSV file
  const parseFile = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    setFileName(file.name);

    try {
      const XLSX = await import("xlsx");
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];

      // Helper to find column value with flexible matching (handles whitespace, case variations)
      const getColumn = (row: Record<string, unknown>, ...possibleNames: string[]): unknown => {
        // First try exact matches
        for (const name of possibleNames) {
          if (row[name] !== undefined) return row[name];
        }
        // Then try case-insensitive matching with trimmed keys
        const rowKeys = Object.keys(row);
        for (const name of possibleNames) {
          const normalizedName = name.toLowerCase().trim();
          for (const key of rowKeys) {
            if (key.toLowerCase().trim() === normalizedName) {
              return row[key];
            }
          }
        }
        // Try partial matching for common patterns
        for (const name of possibleNames) {
          const normalizedName = name.toLowerCase().replace(/[^a-z]/g, "");
          for (const key of rowKeys) {
            const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
            if (normalizedKey.includes(normalizedName) || normalizedName.includes(normalizedKey)) {
              return row[key];
            }
          }
        }
        return undefined;
      };

      // Helper to parse Y/N values - handles text, boolean, and numeric
      const parseYesNo = (value: unknown): boolean => {
        if (value === undefined || value === null || value === "") return false;
        if (typeof value === "boolean") return value;
        if (typeof value === "number") return value === 1 || value > 0;
        const str = String(value).toLowerCase().trim();
        return str === "y" || str === "yes" || str === "true" || str === "1";
      };

      // Debug: log first row to see actual column names
      if (jsonData.length > 0) {
        console.log("[File Parser] Column names found:", Object.keys(jsonData[0]));
        console.log("[File Parser] First row values:", jsonData[0]);
      }

      // Map columns to our format (flexible mapping for new format)
      const records: UploadedRecord[] = jsonData.map((row, index) => {
        const customerName = String(
          getColumn(row, "Name of Person", "Customer Name", "Customer", "Name") || "Unknown"
        );

        const businessSender = String(
          getColumn(row, "Business Sender", "Company", "Dealership", "Business") || ""
        );

        const individualSender = String(
          getColumn(row, "Individual Sender", "Car Salesman", "Salesperson", "Provider", "Provider Name", "Agent") || "Unknown"
        );

        // Get raw Y/N values for debugging
        const rawPaid = getColumn(row, "Paid (Y/N)", "Paid the Lead Generator", "Paid", "Payment Made", "Paid Generator");
        const rawContact = getColumn(row, "Contact Made (Y/N)", "Contact Made", "Contacted", "Contact");
        const rawSold = getColumn(row, "Sold (Y/N)", "Sold", "Converted");

        // Debug first few rows
        if (index < 3) {
          console.log(`[File Parser] Row ${index + 1}: Paid raw="${rawPaid}" Contact raw="${rawContact}" Sold raw="${rawSold}"`);
        }

        const paidGenerator = parseYesNo(rawPaid);
        const contactMade = parseYesNo(rawContact);
        const sold = parseYesNo(rawSold);

        if (index < 3) {
          console.log(`[File Parser] Row ${index + 1}: Paid=${paidGenerator} Contact=${contactMade} Sold=${sold}`);
        }

        const providerName = individualSender;
        const customerEmail = String(getColumn(row, "Email", "Customer Email") || "");

        const date = parseExcelDate(getColumn(row, "Date", "Created"));

        return {
          customerName,
          businessSender,
          individualSender,
          paidGenerator,
          contactMade,
          sold,
          providerName,
          customerEmail,
          date,
        };
      });

      // Debug: summary
      const soldCount = records.filter(r => r.sold).length;
      const contactCount = records.filter(r => r.contactMade).length;
      const paidCount = records.filter(r => r.paidGenerator).length;
      console.log(`[File Parser] Summary: ${records.length} records, ${contactCount} contacted, ${soldCount} sold, ${paidCount} paid`);

      setUploadedData(records);
      setAnalytics(calculateAnalytics(records));
    } catch (error) {
      console.error("File parse error:", error);
      setUploadError("Failed to parse file. Please ensure it's a valid Excel (.xlsx) or CSV file with the required columns.");
    } finally {
      setIsUploading(false);
    }
  };

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseFile(file);
    }
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv"))) {
      parseFile(file);
    } else {
      setUploadError("Please upload an Excel (.xlsx, .xls) or CSV file.");
    }
  };

  // Calculate real-time analytics from existing leads data
  const realTimeAnalytics = {
    totalLeads: dbLeads.length,
    pendingLeads: dbLeads.filter(l => l.payoutStatus === "pending").length,
    claimedLeads: dbLeads.filter(l => l.payoutStatus === "completed" || l.payoutStatus === "processing").length,
    totalPayout: dbLeads.reduce((sum, l) => sum + calculateFeeBreakdown(l.payoutAmount || 0, feeSettings).buyerTotal, 0),
  };

  // Get provider rankings from real leads
  const providerRankings = providers
    .map(p => ({
      name: p.name,
      leads: dbLeads.filter(l => l.providerId === p.id).length,
      payout: dbLeads.filter(l => l.providerId === p.id).reduce((sum, l) => sum + l.payoutAmount, 0),
    }))
    .sort((a, b) => b.leads - a.leads);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#E8822A]">Analytics Dashboard</h2>
          <p className="text-gray-500 mt-1">Upload your CRM data for advanced insights</p>
        </div>
      </div>

      {/* Real-Time Stats from WOML Data */}
      <div>
        <h3 className="text-lg font-semibold text-[#E8822A] mb-4">Real-Time Lead Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-500 text-sm">Total Leads</p>
            <p className="text-3xl font-bold text-[#E8822A]">{realTimeAnalytics.totalLeads}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-500 text-sm">Pending</p>
            <p className="text-3xl font-bold text-amber-600">{realTimeAnalytics.pendingLeads}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-500 text-sm">Claimed</p>
            <p className="text-3xl font-bold text-emerald-600">{realTimeAnalytics.claimedLeads}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-500 text-sm">Total Payouts</p>
            <p className="text-3xl font-bold text-orange-600">${realTimeAnalytics.totalPayout.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Top Sellers Leaderboard */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#E8822A] mb-4">Top Lead Sellers</h3>
        {providerRankings.length > 0 ? (
          <div className="space-y-3">
            {providerRankings.slice(0, 10).map((provider, i) => (
              <div key={provider.name} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                  i === 0 ? "bg-yellow-500" : i === 1 ? "bg-gray-400" : i === 2 ? "bg-amber-600" : "bg-gray-300"
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-gray-800">{provider.name}</span>
                    <span className="text-sm text-gray-500">{provider.leads} leads • ${provider.payout.toFixed(2)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#E8822A] rounded-full transition-all"
                      style={{ width: `${providerRankings[0]?.leads ? (provider.leads / providerRankings[0].leads) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">No provider data yet</p>
        )}
      </div>

      {/* Excel Upload Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#E8822A]">Upload CRM Data</h3>
            <p className="text-gray-500 text-sm">Import your monthly/bi-weekly data for advanced analytics</p>
          </div>
        </div>

        {/* File Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
            isDragging ? "border-[#E8822A] bg-orange-50" : "border-gray-300 hover:border-gray-400"
          }`}
        >
          {isUploading ? (
            <div className="space-y-3">
              <div className="animate-spin h-10 w-10 border-4 border-[#E8822A] border-t-transparent rounded-full mx-auto"></div>
              <p className="text-[#E8822A] font-medium">Processing file...</p>
            </div>
          ) : fileName && !uploadError ? (
            <div className="space-y-3">
              <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-emerald-600 font-medium">{fileName}</p>
              <p className="text-gray-500 text-sm">{uploadedData.length} records imported</p>
              <label className="inline-block cursor-pointer">
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                <span className="text-[#E8822A] hover:underline text-sm">Upload different file</span>
              </label>
            </div>
          ) : (
            <label className="cursor-pointer block">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
              <div className="space-y-3">
                <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="text-gray-600 font-medium">Drag & drop your Excel or CSV file here</p>
                <p className="text-gray-400 text-sm">or click to browse</p>
                <p className="text-gray-400 text-xs mt-2">Supported: .xlsx, .xls, .csv</p>
              </div>
            </label>
          )}
        </div>

        {uploadError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{uploadError}</p>
          </div>
        )}

        {/* Expected Columns Info */}
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <p className="text-gray-600 text-sm font-medium mb-2">Expected columns:</p>
          <div className="flex flex-wrap gap-2">
            {["Name of Person", "Business Sender", "Individual Sender", "Paid (Y/N)", "Contact Made (Y/N)", "Sold (Y/N)"].map(col => (
              <span key={col} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600">{col}</span>
            ))}
          </div>
          <p className="text-gray-400 text-xs mt-2">Use Y/N or Yes/No for boolean columns</p>
        </div>
      </div>

      {/* Uploaded Data Analytics */}
      {analytics && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-[#E8822A]">Lead Performance Analytics</h3>

          {/* Key Metrics - Funnel */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <p className="text-gray-500 text-sm">Total Leads</p>
              <p className="text-3xl font-bold text-[#E8822A]">{analytics.totalLeads}</p>
              <p className="text-gray-400 text-xs mt-1">From uploaded data</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <p className="text-gray-500 text-sm">Contact Rate</p>
              <p className="text-3xl font-bold text-orange-600">{analytics.overallContactRate.toFixed(1)}%</p>
              <p className="text-gray-400 text-xs mt-1">{analytics.totalContacted} / {analytics.totalLeads} contacted</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <p className="text-gray-500 text-sm">Conversion Rate</p>
              <p className="text-3xl font-bold text-emerald-600">{analytics.overallConversionRate.toFixed(1)}%</p>
              <p className="text-gray-400 text-xs mt-1">{analytics.totalSold} / {analytics.totalLeads} sold</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <p className="text-gray-500 text-sm">Payment Rate</p>
              <p className="text-3xl font-bold text-amber-600">{analytics.overallPaymentRate.toFixed(1)}%</p>
              <p className="text-gray-400 text-xs mt-1">{analytics.totalPaid} / {analytics.totalLeads} paid</p>
            </div>
          </div>

          {/* Conversion Funnel Visualization */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h4 className="text-lg font-semibold text-[#E8822A] mb-4">Lead Funnel</h4>
            <div className="space-y-4">
              {/* Total Leads */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Total Leads</span>
                  <span className="font-medium text-[#E8822A]">{analytics.totalLeads}</span>
                </div>
                <div className="h-8 bg-[#E8822A] rounded-lg"></div>
              </div>
              {/* Contacted */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Contacted</span>
                  <span className="font-medium text-orange-600">{analytics.totalContacted} ({analytics.overallContactRate.toFixed(0)}%)</span>
                </div>
                <div className="h-8 bg-gray-200 rounded-lg overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-lg" style={{ width: `${analytics.overallContactRate}%` }}></div>
                </div>
              </div>
              {/* Sold */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Sold</span>
                  <span className="font-medium text-emerald-600">{analytics.totalSold} ({analytics.overallConversionRate.toFixed(0)}%)</span>
                </div>
                <div className="h-8 bg-gray-200 rounded-lg overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-lg" style={{ width: `${analytics.overallConversionRate}%` }}></div>
                </div>
              </div>
              {/* Paid */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Paid to Providers</span>
                  <span className="font-medium text-amber-600">{analytics.totalPaid} ({analytics.overallPaymentRate.toFixed(0)}%)</span>
                </div>
                <div className="h-8 bg-gray-200 rounded-lg overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-lg" style={{ width: `${analytics.overallPaymentRate}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Provider Performance Table */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h4 className="text-lg font-semibold text-[#E8822A] mb-4">Individual Provider Performance</h4>
            <p className="text-gray-500 text-sm mb-4">Use this data to adjust payment rates or lead caps for each provider</p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="pb-3 font-medium">Rank</th>
                    <th className="pb-3 font-medium">Provider</th>
                    <th className="pb-3 font-medium">Business</th>
                    <th className="pb-3 font-medium">Leads</th>
                    <th className="pb-3 font-medium">Contacted</th>
                    <th className="pb-3 font-medium">Sold</th>
                    <th className="pb-3 font-medium">Conv. Rate</th>
                    <th className="pb-3 font-medium">Unpaid</th>
                    <th className="pb-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.providerStats.map((provider, i) => (
                    <tr key={provider.name} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-4">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          i === 0 ? "bg-yellow-100 text-yellow-700" :
                          i === 1 ? "bg-gray-100 text-gray-700" :
                          i === 2 ? "bg-amber-100 text-amber-700" :
                          "bg-gray-50 text-gray-500"
                        }`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-4 font-medium text-gray-800">{provider.name}</td>
                      <td className="py-4 text-gray-500 text-sm">{provider.businessName || "-"}</td>
                      <td className="py-4 text-gray-600">{provider.totalLeads}</td>
                      <td className="py-4 text-gray-600">{provider.contactedLeads}</td>
                      <td className="py-4 text-gray-600">{provider.soldLeads}</td>
                      <td className="py-4">
                        <span className={`font-medium ${provider.conversionRate >= 30 ? "text-emerald-600" : provider.conversionRate >= 15 ? "text-amber-600" : "text-red-600"}`}>
                          {provider.conversionRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-4">
                        {provider.unpaidAmount > 0 ? (
                          <span className="text-red-600 font-medium">{provider.unpaidAmount}</span>
                        ) : (
                          <span className="text-emerald-600">✓</span>
                        )}
                      </td>
                      <td className="py-4">
                        <button className="text-xs px-2 py-1 bg-[#E8822A] text-white rounded hover:bg-[#D47526] transition">
                          Adjust Rate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Business Sender Breakdown */}
          {analytics.businessStats && analytics.businessStats.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h4 className="text-lg font-semibold text-[#E8822A] mb-4">Performance by Business Source</h4>
              <div className="space-y-4">
                {analytics.businessStats.map((business, i) => (
                  <div key={business.name} className="flex items-center gap-4">
                    <div className="w-32 truncate font-medium text-gray-800">{business.name}</div>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">{business.totalLeads} leads</span>
                        <span className={`font-medium ${business.conversionRate >= 30 ? "text-emerald-600" : business.conversionRate >= 15 ? "text-amber-600" : "text-red-600"}`}>
                          {business.conversionRate.toFixed(1)}% conversion
                        </span>
                      </div>
                      <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${business.conversionRate >= 30 ? "bg-emerald-500" : business.conversionRate >= 15 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${Math.min(business.conversionRate * 2, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// Leaderboard Tab
function LeaderboardTab({ smsAgents }: { smsAgents: { name: string; phone: string }[] }) {
  const [rows, setRows] = useState<{ actor_name: string; to_value: string; count: number }[]>([]);
  const [uniqueLeads, setUniqueLeads] = useState<{ actor_name: string; unique_leads: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/business/leaderboard")
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setRows(data.rows);
          setUniqueLeads(data.uniqueLeads ?? []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Only show agents configured in Settings
  const configuredNames = smsAgents.map(a => a.name);
  const agentNames = configuredNames.length > 0
    ? configuredNames
    : Array.from(new Set(rows.map(r => r.actor_name)));
  const agents = agentNames.map(name => {
    const mine = rows.filter(r => r.actor_name === name);
    const get = (stage: string) => mine.find(r => r.to_value === stage)?.count ?? 0;
    const contacted = get("contacted");
    const quoted = get("quoted");
    const sold = get("sold");
    const dead = get("dead");
    const total = contacted + quoted + sold + dead;
    const leadsInteracted = uniqueLeads.find(u => u.actor_name === name)?.unique_leads ?? total;
    // Conversion = sales completed / unique leads interacted with
    const convRate = leadsInteracted > 0 ? ((sold / leadsInteracted) * 100).toFixed(1) : "0.0";
    return { name, contacted, quoted, sold, dead, total, leadsInteracted, convRate };
  }).sort((a, b) => Number(b.convRate) - Number(a.convRate));

  const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#212121]">Leaderboard</h2>
        <p className="text-[#212121]/60 text-sm mt-1">Agent performance ranked by conversion rate.</p>
      </div>

      {loading && (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400">Loading...</div>
      )}

      {!loading && agents.length === 0 && (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400">
          {smsAgents.length === 0
            ? "No agents configured yet. Go to Settings \u2192 Lead Alert SMS to add your team members."
            : "No activity yet. Assign agents to leads in the Pipeline and move them through stages to start tracking performance."}
        </div>
      )}

      {!loading && agents.map((agent, idx) => (
        <div key={agent.name} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{medals[idx] ?? `#${idx + 1}`}</span>
              <div>
                <p className="font-bold text-gray-900 text-lg">{agent.name}</p>
                <p className="text-xs text-gray-400">
                  {agent.total} total actions &middot; {agent.leadsInteracted} leads interacted with
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-emerald-600">{agent.convRate}%</p>
              <p className="text-xs text-gray-400">conversion</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Contacted", value: agent.contacted, color: "#f97316" },
              { label: "Quoted",    value: agent.quoted,    color: "#ca8a04" },
              { label: "Sold",      value: agent.sold,      color: "#16a34a" },
              { label: "Dead",      value: agent.dead,      color: "#6b7280" },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Marketing Tab
function MarketingTab() {
  const defaultScript = {
    title: "Quick note about your auto insurance",
    body: `Hi [First Name],

I wanted to follow up — I tried reaching you by phone but didn't want you to miss out on a quote we put together for you. It only takes a few minutes to review and could save you money on your coverage.

Reply to this email or call me at [Your Number] when you get a chance. Looking forward to connecting!

— [Your Name], Options Insurance Agency`,
  };

  const [scripts, setScripts] = useState<{ title: string; body: string }[]>([defaultScript]);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleSave = () => {
    if (!newTitle.trim() || !newBody.trim()) return;
    setScripts(prev => [...prev, { title: newTitle.trim(), body: newBody.trim() }]);
    setNewTitle("");
    setNewBody("");
  };

  const handleCopy = async (script: { title: string; body: string }, idx: number) => {
    await navigator.clipboard.writeText(`Subject: ${script.title}\n\n${script.body}`);
    setCopiedId(idx);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-[#212121]">Email Outreach Scripts</h2>
        <p className="text-[#212121]/60 text-sm mt-1">Copy, personalize, and send to leads who aren&apos;t picking up the phone.</p>
      </div>

      {/* New Script Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Create New Script</h3>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Subject line..."
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30 focus:border-[#E8822A]"
          />
          <textarea
            placeholder="Email body..."
            value={newBody}
            onChange={e => setNewBody(e.target.value)}
            rows={6}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30 focus:border-[#E8822A] resize-y"
          />
          <button
            onClick={handleSave}
            disabled={!newTitle.trim() || !newBody.trim()}
            className="px-5 py-2 bg-[#E8822A] text-white rounded-lg text-sm font-medium hover:bg-[#d47424] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save Script
          </button>
        </div>
      </div>

      {/* Saved Scripts */}
      <div className="space-y-4">
        {scripts.map((script, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-gray-800 text-sm">{script.title}</h4>
                <p className="text-gray-500 text-sm mt-2 whitespace-pre-line line-clamp-4">{script.body}</p>
              </div>
              <button
                onClick={() => handleCopy(script, idx)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              >
                {copiedId === idx ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span className="text-emerald-600">Copied!</span>
                  </>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Settings Tab
function SettingsTab({ currentBuyer, feeSettings, onPayoutModeChange }: { currentBuyer: import("@/lib/auth-types").LeadBuyer | null; feeSettings?: FeeSettings; onPayoutModeChange?: (isInstant: boolean) => void }) {
  const { updateUser } = useAuth();
  const [email, setEmail] = useState(currentBuyer?.email || "");
  const [businessName, setBusinessName] = useState(currentBuyer?.businessName || "");
  const [phone, setPhone] = useState(currentBuyer?.phone || "");
  const [profilePicture, setProfilePicture] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<"not_connected" | "connected">("not_connected");
  const [stripeLoading, setStripeLoading] = useState(false);

  // SMS Alert state
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [leadChasers, setLeadChasers] = useState<{ name: string; phone: string }[]>([{ name: "", phone: "" }]);
  const [smsSaving, setSmsSaving] = useState(false);
  const [smsSaved, setSmsSaved] = useState(false);
  const [smsError, setSmsError] = useState("");

  // Auto-pay state
  const [autoPayEnabled, setAutoPayEnabled] = useState(false);
  const [autoPaySchedule, setAutoPaySchedule] = useState("biweekly");
  const [reviewWindowDays, setReviewWindowDays] = useState(3);
  const [nextAutoPayDate, setNextAutoPayDate] = useState<string | null>(null);
  const [autoPaySaving, setAutoPaySaving] = useState(false);
  const [autoPaySaved, setAutoPaySaved] = useState(false);
  const [payNowLoading, setPayNowLoading] = useState(false);
  const [payNowResult, setPayNowResult] = useState<string | null>(null);

  // PIN state
  const [pinHasExisting, setPinHasExisting] = useState<boolean | null>(null);
  const [pinCurrentInput, setPinCurrentInput] = useState("");
  const [pinNewInput, setPinNewInput] = useState("");
  const [pinConfirmInput, setPinConfirmInput] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSuccess, setPinSuccess] = useState(false);

  // Fetch full profile on mount
  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data = await res.json();
          const p = data.profile;
          if (p.profilePictureUrl) setProfilePicture(p.profilePictureUrl);
          if (p.stripeCustomerId) setStripeStatus("connected");
        }
      } catch (e) {
        console.error("Failed to load profile:", e);
      }
    }
    async function loadSmsSettings() {
      try {
        const res = await fetch("/api/business/sms-alerts");
        if (res.ok) {
          const data = await res.json();
          setSmsEnabled(data.smsAlertsEnabled ?? false);
          if (data.leadChasers && data.leadChasers.length > 0) {
            setLeadChasers(
              data.leadChasers.map((c: { name: string; phone: string }) => ({
                name: c.name,
                phone: c.phone.replace(/^\+1/, ""),
              }))
            );
          } else {
            setLeadChasers([{ name: "", phone: "" }]);
          }
        }
      } catch (e) {
        console.error("Failed to load SMS settings:", e);
      }
    }
    async function loadAutoPaySettings() {
      try {
        const res = await fetch("/api/business/auto-pay-settings");
        if (res.ok) {
          const data = await res.json();
          const s = data.settings ?? data; // handle both {settings:{}} and flat response
          setAutoPayEnabled(s.autoPayEnabled ?? false);
          setAutoPaySchedule(s.autoPaySchedule || "biweekly");
          setReviewWindowDays(s.reviewWindowDays ?? 3);
          setNextAutoPayDate(s.nextAutoPayDate || null);
        }
      } catch (e) {
        console.error("Failed to load auto-pay settings:", e);
      }
    }
    loadProfile();
    loadSmsSettings();
    loadAutoPaySettings();
    fetch("/api/business/pin-status")
      .then(r => r.json())
      .then(d => setPinHasExisting(d.hasPin ?? false))
      .catch(() => setPinHasExisting(false));
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
    if (!currentBuyer) return;
    setSaving(true);
    await updateUser({
      email,
      businessName,
      phone,
      profilePictureUrl: profilePicture || undefined,
    } as any);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleSmsSave = async () => {
    setSmsError("");
    setSmsSaving(true);
    try {
      const res = await fetch("/api/business/sms-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smsAlertsEnabled: smsEnabled,
          leadChasers: leadChasers.filter(c => c.name.trim() && c.phone.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSmsError(data.error || "Failed to save SMS settings");
      } else {
        setSmsSaved(true);
        setTimeout(() => setSmsSaved(false), 3000);
      }
    } catch {
      setSmsError("Network error — please try again.");
    } finally {
      setSmsSaving(false);
    }
  };

  const handlePinChange = async () => {
    setPinError("");
    setPinSuccess(false);
    if (!/^\d{4}$/.test(pinNewInput)) {
      setPinError("New PIN must be exactly 4 digits.");
      return;
    }
    if (pinNewInput !== pinConfirmInput) {
      setPinError("New PINs do not match.");
      return;
    }
    if (pinHasExisting && !/^\d{4}$/.test(pinCurrentInput)) {
      setPinError("Please enter your current PIN.");
      return;
    }
    setPinSaving(true);
    try {
      const res = await fetch("/api/business/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPin: pinHasExisting ? pinCurrentInput : undefined,
          newPin: pinNewInput,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to update PIN");
      setPinSuccess(true);
      setPinHasExisting(true);
      setPinCurrentInput("");
      setPinNewInput("");
      setPinConfirmInput("");
    } catch (err: any) {
      setPinError(err.message || "Failed to update PIN.");
    } finally {
      setPinSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl shadow-sm">
      <h3 className="text-lg font-semibold text-[#E8822A] mb-6">Business Settings</h3>

      {saved && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Settings saved successfully!
        </div>
      )}

      <div className="space-y-6">
        {/* Profile Picture */}
        <div className="flex items-center gap-4">
          <div className="relative">
            {profilePicture ? (
              <img src={profilePicture} alt="Profile" className="h-20 w-20 rounded-full object-cover border-2 border-gray-200" />
            ) : (
              <div className="h-20 w-20 rounded-full bg-[#E8822A] flex items-center justify-center border-2 border-gray-200">
                <span className="text-2xl font-bold text-white">{currentBuyer?.businessName?.charAt(0) || "?"}</span>
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
          <label className="block text-gray-700 text-sm font-medium mb-2">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#E8822A] focus:outline-none transition"
          />
        </div>
        <div>
          <label className="block text-gray-700 text-sm font-medium mb-2">Username</label>
          <input
            type="text"
            value={currentBuyer?.username || ""}
            disabled
            className="w-full px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-gray-500 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-gray-700 text-sm font-medium mb-2">Business Name</label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#E8822A] focus:outline-none transition"
          />
        </div>
        <div>
          <label className="block text-gray-700 text-sm font-medium mb-2">Phone Number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#E8822A] focus:outline-none transition"
          />
        </div>
        <div>
          <label className="block text-gray-700 text-sm font-medium mb-2">Business Type</label>
          <input
            type="text"
            value={currentBuyer?.businessType?.replace("_", " ") || ""}
            disabled
            className="w-full px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-gray-500 cursor-not-allowed capitalize"
          />
        </div>

        {/* Stripe Payment Method */}
        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-gray-700 text-sm font-medium">Payment Method</label>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
              stripeStatus === "connected"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}>
              {stripeStatus === "connected" ? "Connected" : "Not Connected"}
            </span>
          </div>
          <p className="text-gray-500 text-sm mb-4">
            {stripeStatus === "connected"
              ? "Your payment method is connected via Stripe. You can update it anytime."
              : "Connect a bank account or card to pay lead rewards to your providers."}
          </p>
          <button
            onClick={async () => {
              setStripeLoading(true);
              try {
                const res = await fetch("/api/stripe/setup-customer", { method: "POST" });
                const data = await res.json();
                if (data.setupUrl) {
                  window.location.href = data.setupUrl;
                } else {
                  alert(data.error || "Failed to set up payment method.");
                  setStripeLoading(false);
                }
              } catch {
                alert("Failed to connect Stripe. Please try again.");
                setStripeLoading(false);
              }
            }}
            disabled={stripeLoading}
            className="bg-gray-900 hover:bg-gray-800 text-white px-5 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
          >
            {stripeLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Connecting...
              </>
            ) : stripeStatus === "connected" ? (
              "Update Payment Method"
            ) : (
              "Connect Bank Account"
            )}
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#E8822A] hover:bg-[#D47526] text-white px-6 py-2 rounded-lg transition font-semibold shadow-md disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>

        {/* ── SMS Lead Alerts ────────────────────────────────────────────── */}
        <div className="border-t border-gray-200 pt-6 mt-2">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h4 className="text-sm font-semibold text-gray-800">Lead Alert SMS</h4>
              <p className="text-gray-500 text-xs mt-0.5">
                Get a text the moment a provider submits a new lead. Add your full team — no limit.
              </p>
            </div>
            {/* Toggle switch */}
            <button
              type="button"
              onClick={() => setSmsEnabled(v => !v)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                smsEnabled ? "bg-[#E8822A]" : "bg-gray-200"
              }`}
              aria-pressed={smsEnabled}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  smsEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {smsEnabled && (
            <div className="mt-4 space-y-3">
              {leadChasers.map((chaser, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-gray-700 text-xs font-medium">
                      Lead Chaser {idx + 1}
                    </label>
                    {leadChasers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLeadChasers(prev => prev.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-600 text-xs transition"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Name (e.g. Hunter)"
                      value={chaser.name}
                      onChange={e => setLeadChasers(prev => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                      className="flex-1 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#E8822A] focus:outline-none transition text-sm"
                    />
                    <input
                      type="tel"
                      placeholder="(215) 555-0100"
                      value={chaser.phone}
                      onChange={e => setLeadChasers(prev => prev.map((c, i) => i === idx ? { ...c, phone: e.target.value } : c))}
                      className="flex-1 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#E8822A] focus:outline-none transition text-sm"
                    />
                  </div>
                </div>
              ))}

              {/* Add Lead Chaser button */}
              <button
                type="button"
                onClick={() => setLeadChasers(prev => [...prev, { name: "", phone: "" }])}
                className="flex items-center gap-1.5 text-[#E8822A] text-xs font-medium hover:underline transition mt-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Lead Chaser
              </button>
            </div>
          )}

          {smsError && (
            <p className="mt-2 text-red-600 text-xs">{smsError}</p>
          )}

          {smsSaved && (
            <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              SMS alert settings saved!
            </div>
          )}

          <button
            onClick={handleSmsSave}
            disabled={smsSaving}
            className="mt-3 bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {smsSaving ? "Saving\u2026" : "Save Alert Settings"}
          </button>
        </div>

        {/* ── Payout Settings ─────────────────────────────────────────── */}
        <div className="border-t border-gray-200 pt-6 mt-2">
          <h4 className="text-sm font-semibold text-gray-800 mb-1">Payout Mode</h4>
          <p className="text-gray-500 text-xs mb-4">Choose how and when your providers get paid. WOML takes 12.5% — split evenly: 6.25% added to your rate, 6.25% deducted from the provider payout.</p>

          {/* 3-mode selector */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {/* Manual */}
            <button
              type="button"
              onClick={() => { setAutoPayEnabled(false); setAutoPaySchedule("biweekly"); setReviewWindowDays(3); }}
              className={`p-4 rounded-xl border-2 text-left transition ${!autoPayEnabled ? "border-[#E8822A] bg-orange-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
            >
              <div className="text-xl mb-2">🖐️</div>
              <p className={`text-sm font-semibold ${!autoPayEnabled ? "text-[#E77500]" : "text-gray-800"}`}>Manual</p>
              <p className="text-xs text-gray-500 mt-1">Pay leads individually or in bulk whenever you&apos;re ready. No automation — you&apos;re in full control.</p>
            </button>

            {/* Scheduled */}
            <button
              type="button"
              onClick={() => { setAutoPayEnabled(true); setReviewWindowDays(3); if (autoPaySchedule === "instant") setAutoPaySchedule("biweekly"); }}
              className={`p-4 rounded-xl border-2 text-left transition ${autoPayEnabled && autoPaySchedule !== "instant" ? "border-[#E8822A] bg-orange-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
            >
              <div className="text-xl mb-2">📅</div>
              <p className={`text-sm font-semibold ${autoPayEnabled && autoPaySchedule !== "instant" ? "text-[#E77500]" : "text-gray-800"}`}>Scheduled</p>
              <p className="text-xs text-gray-500 mt-1">3-day review window, then WOML auto-pays on your chosen cycle. Set it and forget it.</p>
            </button>

            {/* Instant */}
            <button
              type="button"
              onClick={() => { setAutoPayEnabled(true); setAutoPaySchedule("instant"); setReviewWindowDays(0); }}
              className={`p-4 rounded-xl border-2 text-left transition ${autoPayEnabled && autoPaySchedule === "instant" ? "border-[#E8822A] bg-orange-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
            >
              <div className="text-xl mb-2">⚡</div>
              <p className={`text-sm font-semibold ${autoPayEnabled && autoPaySchedule === "instant" ? "text-[#E77500]" : "text-gray-800"}`}>Instant</p>
              <p className="text-xs text-gray-500 mt-1">Fully automated. Providers are paid the moment they submit a lead — no delays, no review.</p>
            </button>
          </div>

          {/* Scheduled sub-options — just the cycle picker, review window is fixed at 3 days */}
          {autoPayEnabled && autoPaySchedule !== "instant" && (
            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-gray-600 font-medium">3-day review window · Leads auto-approve after 3 days if not rejected</p>
              </div>
              <div className="space-y-1">
                <label className="block text-gray-700 text-xs font-medium">Pay Cycle</label>
                <select
                  value={autoPaySchedule}
                  onChange={e => setAutoPaySchedule(e.target.value)}
                  className="w-full max-w-[200px] px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-900 text-sm focus:border-[#E8822A] focus:outline-none transition"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <p className="text-gray-400 text-xs">
                Approved leads are batched and paid automatically on your {autoPaySchedule === "weekly" ? "weekly" : autoPaySchedule === "biweekly" ? "bi-weekly" : "monthly"} cycle.
              </p>
              {nextAutoPayDate && (
                <p className="text-[#E77500] text-xs font-medium">
                  Next scheduled payout: {new Date(nextAutoPayDate).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
                </p>
              )}
            </div>
          )}

          {/* Instant info banner */}
          {autoPayEnabled && autoPaySchedule === "instant" && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4 flex items-start gap-3">
              <span className="text-lg mt-0.5">⚡</span>
              <div>
                <p className="text-sm font-semibold text-orange-800">Fully automated — no action required</p>
                <p className="text-xs text-orange-700 mt-0.5">Every lead submission triggers an immediate Stripe charge and provider payout. Zero review window — use when you fully trust your providers. If any leads are already pending, use the button below to pay them now.</p>
              </div>
            </div>
          )}

          {autoPaySaved && (
            <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Payout settings saved!
            </div>
          )}

          <button
            onClick={async () => {
              setAutoPaySaving(true);
              setAutoPaySaved(false);
              try {
                const res = await fetch("/api/business/auto-pay-settings", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    autoPayEnabled,
                    autoPaySchedule,
                    reviewWindowDays: autoPaySchedule === "instant" ? 0 : 3,
                  }),
                });
                if (res.ok) {
                  const data = await res.json();
                  const s = data.settings ?? data;
                  setNextAutoPayDate(s.nextAutoPayDate || null);
                  setAutoPaySaved(true);
                  setTimeout(() => setAutoPaySaved(false), 3000);

                  // Notify parent so the Leads tab banner updates immediately
                  onPayoutModeChange?.(autoPayEnabled && autoPaySchedule === "instant");

                  // If instant mode was just saved, immediately pay any leads already in the queue
                  if (autoPaySchedule === "instant" && autoPayEnabled) {
                    setPayNowLoading(true);
                    setPayNowResult(null);
                    try {
                      const payRes = await fetch("/api/business/pay-now", { method: "POST" });
                      const payData = await payRes.json();
                      if (payRes.ok && payData.succeeded > 0) {
                        setPayNowResult(payData.message || "Queued leads paid.");
                      }
                    } catch { /* non-blocking */ } finally {
                      setPayNowLoading(false);
                    }
                  }
                } else {
                  const err = await res.json().catch(() => ({}));
                  alert(`Save failed: ${err.error || res.statusText}`);
                }
              } catch (e) {
                console.error("Failed to save payout settings:", e);
              } finally {
                setAutoPaySaving(false);
              }
            }}
            disabled={autoPaySaving}
            className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {autoPaySaving ? "Saving…" : "Save Payout Settings"}
          </button>

          {/* Pay Now button — visible in instant mode to catch any queued leads */}
          {autoPayEnabled && autoPaySchedule === "instant" && (
            <div className="mt-3 space-y-2">
              <button
                onClick={async () => {
                  setPayNowLoading(true);
                  setPayNowResult(null);
                  try {
                    const res = await fetch("/api/business/pay-now", { method: "POST" });
                    const data = await res.json();
                    if (res.ok) {
                      setPayNowResult(data.message || "Payment processed.");
                    } else {
                      setPayNowResult(`Error: ${data.error}`);
                    }
                  } catch {
                    setPayNowResult("Error: Failed to process payment.");
                  } finally {
                    setPayNowLoading(false);
                  }
                }}
                disabled={payNowLoading}
                className="bg-[#E77500] hover:bg-[#D47526] text-white px-5 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {payNowLoading ? "Processing…" : "Pay All Pending Leads Now"}
              </button>
              {payNowResult && (
                <p className={`text-xs px-3 py-2 rounded-lg ${payNowResult.startsWith("Error") ? "bg-red-50 text-red-600 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                  {payNowResult}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Business Owner PIN ─────────────────────────────────────────── */}
        <div className="border-t border-gray-200 pt-6 mt-2">
          <div className="mb-3">
            <h4 className="text-sm font-semibold text-gray-800">Business Owner PIN</h4>
            <p className="text-gray-500 text-xs mt-0.5">
              {pinHasExisting
                ? "Update your 4-digit PIN used to access the full business portal."
                : "No PIN set yet. Create one to protect your business portal from Lead Chasers."}
            </p>
          </div>

          <div className="space-y-3 max-w-xs">
            {pinHasExisting && (
              <div className="space-y-1">
                <label className="block text-gray-700 text-xs font-medium">Current PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={pinCurrentInput}
                  onChange={e => setPinCurrentInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 text-center text-lg tracking-[0.4em] focus:border-[#E8822A] focus:outline-none transition"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-gray-700 text-xs font-medium">
                {pinHasExisting ? "New PIN" : "Create PIN"}
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={pinNewInput}
                onChange={e => setPinNewInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 text-center text-lg tracking-[0.4em] focus:border-[#E8822A] focus:outline-none transition"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-gray-700 text-xs font-medium">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={pinConfirmInput}
                onChange={e => setPinConfirmInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 text-center text-lg tracking-[0.4em] focus:border-[#E8822A] focus:outline-none transition"
              />
            </div>
          </div>

          {pinError && (
            <p className="mt-2 text-red-600 text-xs">{pinError}</p>
          )}

          {pinSuccess && (
            <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              PIN {pinHasExisting ? "updated" : "created"} successfully!
            </div>
          )}

          <button
            onClick={handlePinChange}
            disabled={pinSaving || pinNewInput.length < 4 || pinConfirmInput.length < 4}
            className="mt-3 bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {pinSaving ? "Saving\u2026" : pinHasExisting ? "Update PIN" : "Set PIN"}
          </button>
        </div>

        {/* ── Pipeline Settings ─────────────────────────────────────────── */}
        <PipelineSettingsSection />

        {/* ── Close Account ─────────────────────────────────────────────── */}
        <div className="border-t border-red-100 pt-6 mt-2">
          <h4 className="text-sm font-semibold text-red-700 mb-2">Close Account</h4>
          <p className="text-gray-500 text-sm mb-4">
            Closing your account deactivates all provider invite links and your channel. You remain responsible for any leads accepted before closure. Account closure is only available once all outstanding lead payments have been completed.
          </p>
          <CloseAccountButton buyerId={currentBuyer?.id || null} />
        </div>

        {/* ── Disable Account (Soft Delete) ──────────────────────────────── */}
        <div className="border-t border-red-100 pt-6 mt-2">
          <h4 className="text-sm font-semibold text-red-700 mb-2">Disable Account</h4>
          <p className="text-gray-500 text-sm mb-4">
            Disabling your account prevents login and hides your profile. Your data is preserved and an admin can re-enable your account if you contact support.
          </p>
          <DisableAccountButton />
        </div>
      </div>
    </div>
  );
}

function PipelineSettingsSection() {
  const [windowDays, setWindowDays] = useState(30);
  const [fTargetContacted, setFTargetContacted] = useState(80);
  const [fTargetQuoted, setFTargetQuoted] = useState(50);
  const [fTargetSold, setFTargetSold] = useState(30);
  const [fTargetDead, setFTargetDead] = useState(20);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [funnelSaving, setFunnelSaving] = useState(false);
  const [funnelSaved, setFunnelSaved] = useState(false);

  useEffect(() => {
    fetch("/api/business/settings")
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setWindowDays(data.settings.dead_lead_window_days);
          setFTargetContacted(data.settings.funnel_target_contacted ?? 80);
          setFTargetQuoted(data.settings.funnel_target_quoted ?? 50);
          setFTargetSold(data.settings.funnel_target_sold ?? 30);
          setFTargetDead(data.settings.funnel_target_dead ?? 20);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/business/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dead_lead_window_days: windowDays }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  };

  const handleFunnelSave = async () => {
    setFunnelSaving(true);
    try {
      await fetch("/api/business/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          funnel_target_contacted: fTargetContacted,
          funnel_target_quoted: fTargetQuoted,
          funnel_target_sold: fTargetSold,
          funnel_target_dead: fTargetDead,
        }),
      });
      setFunnelSaved(true);
      setTimeout(() => setFunnelSaved(false), 3000);
    } catch {
      // Ignore
    } finally {
      setFunnelSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <>
    <div className="border-t border-gray-200 pt-6 mt-2">
      <h4 className="text-sm font-semibold text-gray-800 mb-1">Pipeline Settings</h4>
      <p className="text-gray-500 text-xs mb-4">
        Leads without activity will automatically be marked &quot;dead&quot; after this window.
      </p>
      <div className="flex items-center gap-3">
        <select
          value={windowDays}
          onChange={e => setWindowDays(Number(e.target.value))}
          className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 text-sm focus:border-[#E8822A] focus:outline-none"
        >
          {[7, 14, 30, 60, 90].map(d => (
            <option key={d} value={d}>{d} days</option>
          ))}
        </select>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && <span className="text-emerald-600 text-sm font-medium">Saved!</span>}
      </div>
    </div>

    {/* Funnel Targets */}
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mt-6">
      <h3 className="text-base font-semibold text-gray-800 mb-1">Funnel Targets</h3>
      <p className="text-sm text-gray-500 mb-4">
        Set the percentage of leads you want to hit at each pipeline stage. These targets
        appear on your Dashboard so you can track efficiency at a glance.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {[
          { label: "Contacted", color: "#f97316", state: fTargetContacted, setter: setFTargetContacted },
          { label: "Quoted",    color: "#ca8a04", state: fTargetQuoted,    setter: setFTargetQuoted    },
          { label: "Sold",      color: "#16a34a", state: fTargetSold,      setter: setFTargetSold      },
          { label: "Dead",      color: "#111827", state: fTargetDead,      setter: setFTargetDead      },
        ].map(f => (
          <div key={f.label}>
            <label className="block text-xs font-medium mb-1" style={{ color: f.color }}>{f.label} Target</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                value={f.state}
                onChange={e => f.setter(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#E8822A]"
              />
              <span className="text-gray-500 text-sm">%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleFunnelSave}
          disabled={funnelSaving}
          className="px-4 py-2 bg-[#E8822A] text-white rounded-lg text-sm font-medium hover:bg-[#d4731f] transition disabled:opacity-50"
        >
          {funnelSaving ? "Saving..." : "Save Targets"}
        </button>
        {funnelSaved && <span className="text-emerald-600 text-sm font-medium">Saved!</span>}
      </div>
    </div>
    </>
  );
}

function CloseAccountButton({ buyerId }: { buyerId: string | null }) {
  const [checking, setChecking] = useState(false);
  const [unpaidCount, setUnpaidCount] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckAndClose = async () => {
    if (!buyerId) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/account/close", { method: "GET" });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Failed to check account status."); setChecking(false); return; }
      setUnpaidCount(data.unpaidLeads);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  const handleConfirmClose = async () => {
    setClosing(true);
    setError(null);
    try {
      const res = await fetch("/api/account/close", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setClosed(true);
        setTimeout(() => { window.location.href = "/"; }, 3000);
      } else {
        setError(data.error || "Account closure failed. Please contact womleads@outlook.com.");
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setClosing(false);
    }
  };

  if (closed) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-sm">
        Your account has been closed. Redirecting...
      </div>
    );
  }

  if (unpaidCount !== null && unpaidCount > 0) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-amber-800 text-sm font-semibold mb-1">Outstanding Payments</p>
        <p className="text-amber-700 text-sm mb-3">
          You have <strong>{unpaidCount} unpaid lead{unpaidCount !== 1 ? "s" : ""}</strong>. All lead payments must be completed before your account can be closed. Please go to your Ledger tab to pay outstanding balances.
        </p>
        <button onClick={() => setUnpaidCount(null)} className="text-amber-700 underline text-sm">Dismiss</button>
      </div>
    );
  }

  if (unpaidCount === 0) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800 text-sm font-semibold mb-1">All payments are up to date.</p>
        <p className="text-red-700 text-sm mb-4">
          This action is permanent. Your channel will be deactivated, all provider invite links will stop working, and your account data will be locked. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleConfirmClose}
            disabled={closing}
            className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {closing ? "Closing..." : "Yes, close my account"}
          </button>
          <button onClick={() => setUnpaidCount(null)} className="text-gray-500 hover:text-gray-700 text-sm px-4 py-2">
            Cancel
          </button>
        </div>
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleCheckAndClose}
        disabled={checking}
        className="border border-red-300 text-red-600 hover:bg-red-50 px-5 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
      >
        {checking ? "Checking..." : "Request Account Closure"}
      </button>
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
    </div>
  );
}

function DisableAccountButton() {
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

// Connections Tab - View and manage active provider connections
function ConnectionsTab({
  buyerId,
  buyerBusinessName,
  myConnections,
  updateConnectionTerms,
  terminateConnection,
  feeSettings,
}: {
  buyerId: string;
  buyerBusinessName: string;
  myConnections: ApiConnection[];
  updateConnectionTerms: (connectionId: string, terms: { ratePerLead?: number; paymentTiming?: string; weeklyLeadCap?: number | null; monthlyLeadCap?: number | null; terminationNoticeDays?: number }) => Promise<boolean>;
  terminateConnection: (connectionId: string) => Promise<boolean>;
  feeSettings?: FeeSettings;
}) {
  const [selectedConnection, setSelectedConnection] = useState<ApiConnection | null>(null);
  const [showEditTermsModal, setShowEditTermsModal] = useState(false);

  // Terms form state
  const [ratePerLead, setRatePerLead] = useState(50);
  const [paymentTiming, setPaymentTiming] = useState<"per_lead" | "weekly" | "biweekly" | "monthly">("per_lead");
  const [minimumPayout, setMinimumPayout] = useState<number | undefined>(undefined);
  const [leadTypes, setLeadTypes] = useState(["auto"]);
  const [exclusivity, setExclusivity] = useState(false);
  const [terminationDays, setTerminationDays] = useState(0);
  const [notes, setNotes] = useState("");
  const [enableLeadCaps, setEnableLeadCaps] = useState(false);
  const [weeklyLeadCap, setWeeklyLeadCap] = useState<number | undefined>(undefined);
  const [monthlyLeadCap, setMonthlyLeadCap] = useState<number | undefined>(undefined);
  const [pauseWhenCapReached, setPauseWhenCapReached] = useState(true);

  const openEditTermsModal = (connection: ApiConnection) => {
    setSelectedConnection(connection);
    setRatePerLead(connection.rate_per_lead);
    setPaymentTiming(connection.payment_timing as "per_lead" | "weekly" | "biweekly" | "monthly");
    setMinimumPayout(undefined);
    setLeadTypes(["auto"]);
    setExclusivity(false);
    setTerminationDays(connection.termination_notice_days);
    setNotes("");
    setEnableLeadCaps(!!(connection.weekly_lead_cap || connection.monthly_lead_cap));
    setWeeklyLeadCap(connection.weekly_lead_cap || undefined);
    setMonthlyLeadCap(connection.monthly_lead_cap || undefined);
    setPauseWhenCapReached(true);
    setShowEditTermsModal(true);
  };

  const handleUpdateTerms = () => {
    if (!selectedConnection) return;
    const terms = {
      ratePerLead,
      paymentTiming,
      weeklyLeadCap: enableLeadCaps ? weeklyLeadCap : null,
      monthlyLeadCap: enableLeadCaps ? monthlyLeadCap : null,
      terminationNoticeDays: terminationDays,
    };
    updateConnectionTerms(selectedConnection.id, terms);
    setShowEditTermsModal(false);
    setSelectedConnection(null);
  };

  const handleTerminate = (connectionId: string, providerName: string) => {
    if (confirm(`Are you sure you want to terminate your connection with ${providerName}? They will no longer be able to submit leads.`)) {
      terminateConnection(connectionId);
    }
  };

  const activeConnections = myConnections.filter(c => c.status === "active");
  const terminatedConnections = myConnections.filter(c => c.status === "terminated");

  return (
    <div className="space-y-6">
      {/* Active Connections */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#E8822A] mb-6">Active Connections ({activeConnections.length})</h3>

        {activeConnections.length > 0 ? (
          <div className="space-y-4">
            {activeConnections.map((connection) => (
              <div key={connection.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                      <span className="text-xl font-bold text-emerald-600">{(connection.providerName || "?").charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{connection.providerName}</p>
                      <p className="text-gray-500 text-sm">{connection.providerEmail}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[#E8822A] font-medium">${calculateFeeBreakdown(connection.rate_per_lead || 0, feeSettings).buyerTotal.toFixed(2)}/lead</span>
                        <span className="text-gray-400 text-xs">(incl. platform fee)</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-500 text-sm">{formatPaymentTiming(connection.payment_timing as any)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => openEditTermsModal(connection)}
                        className="text-[#E8822A] hover:bg-[#E8822A]/10 px-3 py-1 rounded-lg font-medium transition text-sm"
                      >
                        Edit Terms
                      </button>
                      <button
                        onClick={() => handleTerminate(connection.id, connection.providerName)}
                        className="text-red-600 hover:bg-red-50 px-3 py-1 rounded-lg font-medium transition text-sm"
                      >
                        Terminate
                      </button>
                    </div>
                    <p className="text-gray-400 text-xs">
                      Connected since {new Date(connection.accepted_at || connection.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-gray-500 text-sm">Total Leads</p>
                    <p className="text-xl font-bold text-[#E8822A]">{connection.total_leads}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">Total Paid</p>
                    <p className="text-xl font-bold text-emerald-600">${Number(connection.total_paid || 0).toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-400 py-8">No active connections yet — invite providers from the Invite tab</p>
        )}
      </div>

      {/* Past Connections */}
      {terminatedConnections.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-500 mb-6">Past Connections</h3>
          <div className="space-y-3">
            {terminatedConnections.map((connection) => (
              <div key={connection.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg opacity-60">
                <div>
                  <p className="font-medium text-gray-600">{connection.providerName}</p>
                  <p className="text-gray-400 text-sm">Terminated</p>
                </div>
                <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded-full">Terminated</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Terms Modal */}
      {showEditTermsModal && selectedConnection && (
        <TermsModal
          title={`Edit Terms for ${selectedConnection.providerName}`}
          ratePerLead={ratePerLead}
          setRatePerLead={setRatePerLead}
          paymentTiming={paymentTiming}
          setPaymentTiming={setPaymentTiming}
          minimumPayout={minimumPayout}
          setMinimumPayout={setMinimumPayout}
          leadTypes={leadTypes}
          setLeadTypes={setLeadTypes}
          exclusivity={exclusivity}
          setExclusivity={setExclusivity}
          terminationDays={terminationDays}
          setTerminationDays={setTerminationDays}
          notes={notes}
          setNotes={setNotes}
          enableLeadCaps={enableLeadCaps}
          setEnableLeadCaps={setEnableLeadCaps}
          weeklyLeadCap={weeklyLeadCap}
          setWeeklyLeadCap={setWeeklyLeadCap}
          monthlyLeadCap={monthlyLeadCap}
          setMonthlyLeadCap={setMonthlyLeadCap}
          pauseWhenCapReached={pauseWhenCapReached}
          setPauseWhenCapReached={setPauseWhenCapReached}
          onSave={handleUpdateTerms}
          onCancel={() => { setShowEditTermsModal(false); setSelectedConnection(null); }}
          saveButtonText="Update Terms"
        />
      )}

    </div>
  );
}

// Terms Modal Component
function TermsModal({
  title,
  ratePerLead,
  setRatePerLead,
  paymentTiming,
  setPaymentTiming,
  minimumPayout,
  setMinimumPayout,
  leadTypes,
  setLeadTypes,
  exclusivity,
  setExclusivity,
  terminationDays,
  setTerminationDays,
  notes,
  setNotes,
  // Lead caps props
  enableLeadCaps,
  setEnableLeadCaps,
  weeklyLeadCap,
  setWeeklyLeadCap,
  monthlyLeadCap,
  setMonthlyLeadCap,
  pauseWhenCapReached,
  setPauseWhenCapReached,
  onSave,
  onCancel,
  saveButtonText,
}: {
  title: string;
  ratePerLead: number;
  setRatePerLead: (v: number) => void;
  paymentTiming: "per_lead" | "weekly" | "biweekly" | "monthly";
  setPaymentTiming: (v: "per_lead" | "weekly" | "biweekly" | "monthly") => void;
  minimumPayout: number | undefined;
  setMinimumPayout: (v: number | undefined) => void;
  leadTypes: string[];
  setLeadTypes: (v: string[]) => void;
  exclusivity: boolean;
  setExclusivity: (v: boolean) => void;
  terminationDays: number;
  setTerminationDays: (v: number) => void;
  notes: string;
  setNotes: (v: string) => void;
  // Lead caps props
  enableLeadCaps: boolean;
  setEnableLeadCaps: (v: boolean) => void;
  weeklyLeadCap: number | undefined;
  setWeeklyLeadCap: (v: number | undefined) => void;
  monthlyLeadCap: number | undefined;
  setMonthlyLeadCap: (v: number | undefined) => void;
  pauseWhenCapReached: boolean;
  setPauseWhenCapReached: (v: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  saveButtonText: string;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-[#E8822A]">{title}</h3>
          <p className="text-gray-500 text-sm mt-1">Set the terms for this provider relationship. They must accept these terms before they can submit leads.</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Rate Per Lead */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">Rate Per Lead</label>
            <div className="flex items-center gap-2">
              <span className="text-[#E8822A] text-xl">$</span>
              <input
                type="number"
                value={ratePerLead}
                onChange={(e) => setRatePerLead(parseInt(e.target.value) || 0)}
                min="1"
                className="w-32 px-4 py-2 border border-gray-200 rounded-lg text-xl font-bold text-[#E8822A] focus:border-[#E8822A] focus:outline-none transition"
              />
              <span className="text-gray-500">per qualified lead</span>
            </div>
          </div>

          {/* Payment Timing */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">Payment Schedule</label>
            <select
              value={paymentTiming}
              onChange={(e) => setPaymentTiming(e.target.value as typeof paymentTiming)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-[#E8822A] focus:outline-none transition bg-white"
            >
              <option value="per_lead">Per Lead (Immediate)</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {/* Minimum Payout */}
          {paymentTiming !== "per_lead" && (
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Minimum Payout Threshold <span className="text-gray-400">(optional)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">$</span>
                <input
                  type="number"
                  value={minimumPayout || ""}
                  onChange={(e) => setMinimumPayout(e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="No minimum"
                  className="w-32 px-4 py-2 border border-gray-200 rounded-lg focus:border-[#E8822A] focus:outline-none transition"
                />
              </div>
              <p className="text-gray-400 text-xs mt-1">Provider won&apos;t receive payout until this threshold is met</p>
            </div>
          )}

          {/* Lead Types */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">Accepted Lead Types</label>
            <div className="flex flex-wrap gap-2">
              {["auto", "home", "life", "health", "commercial"].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    if (leadTypes.includes(type)) {
                      setLeadTypes(leadTypes.filter(t => t !== type));
                    } else {
                      setLeadTypes([...leadTypes, type]);
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition capitalize ${
                    leadTypes.includes(type)
                      ? "bg-[#E8822A] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Exclusivity */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-gray-700 text-sm font-medium">Exclusive Partnership</label>
              <p className="text-gray-400 text-xs">Provider can only submit leads to you</p>
            </div>
            <button
              type="button"
              onClick={() => setExclusivity(!exclusivity)}
              className={`relative w-12 h-6 rounded-full transition ${
                exclusivity ? "bg-[#E8822A]" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition ${
                  exclusivity ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* Termination Notice */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">Termination Notice Period</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={terminationDays}
                onChange={(e) => setTerminationDays(parseInt(e.target.value) || 1)}
                min="1"
                className="w-20 px-4 py-2 border border-gray-200 rounded-lg focus:border-[#E8822A] focus:outline-none transition"
              />
              <span className="text-gray-500">days notice required</span>
            </div>
          </div>

          {/* Lead Caps - Buyer Protection */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="text-gray-700 text-sm font-medium">Lead Volume Caps</label>
                <p className="text-amber-700 text-xs">Protect yourself from unlimited lead obligations</p>
              </div>
              <button
                type="button"
                onClick={() => setEnableLeadCaps(!enableLeadCaps)}
                className={`relative w-12 h-6 rounded-full transition ${
                  enableLeadCaps ? "bg-amber-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition ${
                    enableLeadCaps ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>

            {enableLeadCaps && (
              <div className="space-y-4 pt-3 border-t border-amber-200">
                {/* Weekly Cap */}
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Weekly Lead Limit <span className="text-gray-400">(optional)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={weeklyLeadCap || ""}
                      onChange={(e) => setWeeklyLeadCap(e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Unlimited"
                      min="1"
                      className="w-28 px-4 py-2 border border-gray-200 rounded-lg focus:border-[#E8822A] focus:outline-none transition"
                    />
                    <span className="text-gray-500 text-sm">leads per week</span>
                  </div>
                  <p className="text-gray-400 text-xs mt-1">Resets every Monday</p>
                </div>

                {/* Monthly Cap */}
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Monthly Lead Limit <span className="text-gray-400">(optional)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={monthlyLeadCap || ""}
                      onChange={(e) => setMonthlyLeadCap(e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Unlimited"
                      min="1"
                      className="w-28 px-4 py-2 border border-gray-200 rounded-lg focus:border-[#E8822A] focus:outline-none transition"
                    />
                    <span className="text-gray-500 text-sm">leads per month</span>
                  </div>
                  <p className="text-gray-400 text-xs mt-1">Resets on the 1st of each month</p>
                </div>

                {/* What happens when cap is reached */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <label className="text-gray-700 text-sm font-medium">Auto-pause when cap reached</label>
                    <p className="text-gray-400 text-xs">Provider cannot submit leads until cap resets</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPauseWhenCapReached(!pauseWhenCapReached)}
                    className={`relative w-12 h-6 rounded-full transition ${
                      pauseWhenCapReached ? "bg-[#E8822A]" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition ${
                        pauseWhenCapReached ? "left-7" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Cap summary */}
                {(weeklyLeadCap || monthlyLeadCap) && (
                  <div className="bg-amber-100 rounded-lg p-3 mt-2">
                    <p className="text-amber-800 text-sm font-medium">Cap Summary</p>
                    <p className="text-amber-700 text-xs mt-1">
                      Max cost per week: {weeklyLeadCap ? `$${((weeklyLeadCap || 0) * (ratePerLead || 0)).toFixed(2)}` : "Unlimited"}
                      {monthlyLeadCap && ` • Max cost per month: $${((monthlyLeadCap || 0) * (ratePerLead || 0)).toFixed(2)}`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Additional Notes <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any specific requirements or expectations..."
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-[#E8822A] focus:outline-none transition resize-none"
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-lg font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="flex-1 bg-[#E8822A] hover:bg-[#D47526] text-white py-3 rounded-lg font-semibold transition"
          >
            {saveButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}

// Loading fallback
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-[#E77500] flex items-center justify-center">
      <div className="text-center">
        <Image src="/woml-alt-white.png" alt="WOML" width={200} height={60} className="mx-auto mb-4" priority />
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
      </div>
    </div>
  );
}

// Main export with Suspense
export default function BusinessPortal() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <BusinessPortalContent />
    </Suspense>
  );
}
