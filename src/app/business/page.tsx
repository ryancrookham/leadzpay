"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useLeads, type Provider } from "@/lib/leads-context";
import { useAuth, useCurrentBuyer } from "@/lib/auth-context";
import { useConnections, type ApiConnection, type DiscoveryUser } from "@/lib/connection-context";
import { isBuyer } from "@/lib/auth-types";
import { ContractTerms, getDefaultContractTerms, formatPaymentTiming } from "@/lib/connection-types";
import { calculateFeeBreakdown, PLATFORM_FEE_BUYER } from "@/lib/platform-fees";
import { WOML_PLATFORM } from "@/lib/master-operator";

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
  payoutStatus: "pending" | "processing" | "completed" | "failed";
  payoutCompletedAt: string | null;
  submittedAt: string;
  providerName: string | null;
  providerVenmo?: string | null;
  buyerName: string | null;
  buyerBusinessName: string | null;
}

type Tab = "dashboard" | "leads" | "requests" | "providers" | "rolodex" | "ledger" | "settings";

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

function BusinessPortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, isAuthenticated, isLoading, logout } = useAuth();
  const currentBuyer = useCurrentBuyer();

  // Get initial tab from URL query param
  const urlTab = searchParams.get("tab") as Tab | null;
  const validTabs: Tab[] = ["dashboard", "leads", "requests", "providers", "rolodex", "ledger", "settings"];
  const initialTab = urlTab && validTabs.includes(urlTab) ? urlTab : "dashboard";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Excel upload state for Dashboard analytics
  const [uploadedCrmData, setUploadedCrmData] = useState<UploadedRecord[]>([]);
  const [crmAnalytics, setCrmAnalytics] = useState<AnalyticsData | null>(null);
  const [isUploadingCrm, setIsUploadingCrm] = useState(false);
  const [crmUploadError, setCrmUploadError] = useState<string | null>(null);
  const [crmFileName, setCrmFileName] = useState<string | null>(null);
  const [isDraggingCrm, setIsDraggingCrm] = useState(false);

  const { providers, updateProvider, addProvider } = useLeads();
  const {
    getRequestsForBuyer,
    getConnectionsForBuyer,
    setTermsForRequest,
    rejectRequest,
    updateConnectionTerms,
    terminateConnection,
    sendInvitationToProvider,
    fetchUsersByRole,
  } = useConnections();

  // Fetch leads from database API (not localStorage)
  const [dbLeads, setDbLeads] = useState<ApiLead[]>([]);
  const [dbLeadsLoading, setDbLeadsLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    const fetchLeads = async () => {
      try {
        const res = await fetch("/api/leads");
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
  }, [currentUser]);

  // Get connection requests for this buyer (pending_buyer_review = awaiting business to set terms)
  const pendingRequests = currentUser ? getRequestsForBuyer(currentUser.id).filter(r => r.status === "pending_buyer_review") : [];
  // Connections awaiting provider response (terms sent, waiting for accept/decline)
  const awaitingResponse = currentUser ? getRequestsForBuyer(currentUser.id).filter(r => r.status === "pending_provider_accept") : [];
  const myConnections = currentUser ? getConnectionsForBuyer(currentUser.id) : [];
  // Active connections (finalized, terms accepted)
  const activeConnections = myConnections.filter(c => c.status === "active");

  // Redirect to login if not authenticated or not a buyer
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !currentUser)) {
      router.push("/auth/login?role=buyer");
    } else if (!isLoading && currentUser && !isBuyer(currentUser)) {
      router.push(currentUser.role === "admin" ? "/admin" : "/provider-dashboard");
    }
  }, [isLoading, isAuthenticated, currentUser, router]);

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  // Calculate CRM analytics from uploaded data
  const calculateCrmAnalytics = (data: UploadedRecord[]): AnalyticsData => {
    // Helper to parse Y/N values
    const parseYesNo = (value: unknown): boolean => {
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value === 1;
      const str = String(value || "").toLowerCase().trim();
      return str === "y" || str === "yes" || str === "true" || str === "1";
    };

    const totalLeads = data.length;
    const totalContacted = data.filter(r => r.contactMade).length;
    const totalSold = data.filter(r => r.sold).length;
    const totalPaid = data.filter(r => r.paidGenerator).length;

    const overallContactRate = totalLeads > 0 ? (totalContacted / totalLeads) * 100 : 0;
    const overallConversionRate = totalLeads > 0 ? (totalSold / totalLeads) * 100 : 0;
    const overallPaymentRate = totalLeads > 0 ? (totalPaid / totalLeads) * 100 : 0;

    // Group by individual sender
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

    // Group by business
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

    const totalPremium = data.reduce((sum, r) => sum + (r.premium || 0), 0);
    const avgPremium = totalSold > 0 ? totalPremium / totalSold : 0;

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
      totalCustomers: totalLeads,
      boundPolicies: totalSold,
      renewedPolicies: 0,
      lapsedPolicies: 0,
      retentionRate: overallConversionRate,
      totalPremium,
      avgPremium,
    };
  };

  // Parse Excel/CSV file for CRM data
  const parseCrmFile = async (file: File) => {
    setIsUploadingCrm(true);
    setCrmUploadError(null);
    setCrmFileName(file.name);

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
        console.log("[CRM Parser] Column names found:", Object.keys(jsonData[0]));
        console.log("[CRM Parser] First row values:", jsonData[0]);
      }

      const records: UploadedRecord[] = jsonData.map((row, index) => {
        const customerName = String(
          getColumn(row, "Name of Person", "Insurance Seeker", "Customer Name", "Customer", "Name") || "Unknown"
        );

        const businessSender = String(
          getColumn(row, "Business Sender", "Company", "Dealership", "Business") || ""
        );

        const individualSender = String(
          getColumn(row, "Individual Sender", "Car Salesman", "Salesperson", "Provider", "Provider Name", "Agent") || "Unknown"
        );

        // Get raw Y/N values for debugging
        const rawPaid = getColumn(row, "Paid (Y/N)", "Paid the Lead Generator", "Paid", "Payment Made");
        const rawContact = getColumn(row, "Contact Made (Y/N)", "Contact Made", "Contacted", "Contact");
        const rawSold = getColumn(row, "Sold (Y/N)", "Sold Lead Business", "Sold", "Converted", "Policy Sold");

        // Debug first few rows
        if (index < 3) {
          console.log(`[CRM Parser] Row ${index + 1}: Paid raw="${rawPaid}" Contact raw="${rawContact}" Sold raw="${rawSold}"`);
        }

        const paidGenerator = parseYesNo(rawPaid);
        const contactMade = parseYesNo(rawContact);
        const sold = parseYesNo(rawSold);

        if (index < 3) {
          console.log(`[CRM Parser] Row ${index + 1}: Paid=${paidGenerator} Contact=${contactMade} Sold=${sold}`);
        }

        const rawPremium = getColumn(row, "Premium", "Annual Premium", "Amount") || 0;
        const premium = typeof rawPremium === "number" ? rawPremium : parseFloat(String(rawPremium).replace(/[^0-9.]/g, "")) || 0;
        const date = parseExcelDate(getColumn(row, "Date", "Created"));
        const carrier = String(getColumn(row, "Carrier", "Insurance Company") || "");

        return {
          customerName,
          businessSender,
          individualSender,
          paidGenerator,
          contactMade,
          sold,
          providerName: individualSender,
          customerEmail: String(getColumn(row, "Email", "Customer Email") || ""),
          policyStatus: sold ? "bound" as const : "lead" as const,
          premium,
          date,
          carrier,
        };
      });

      // Debug: summary
      const soldCount = records.filter(r => r.sold).length;
      const contactCount = records.filter(r => r.contactMade).length;
      const paidCount = records.filter(r => r.paidGenerator).length;
      console.log(`[CRM Parser] Summary: ${records.length} records, ${contactCount} contacted, ${soldCount} sold, ${paidCount} paid`);

      setUploadedCrmData(records);
      setCrmAnalytics(calculateCrmAnalytics(records));
    } catch (error) {
      console.error("File parse error:", error);
      setCrmUploadError("Failed to parse file. Please ensure it's a valid Excel (.xlsx) or CSV file.");
    } finally {
      setIsUploadingCrm(false);
    }
  };

  const handleCrmFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseCrmFile(file);
  };

  const handleCrmDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingCrm(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv"))) {
      parseCrmFile(file);
    } else {
      setCrmUploadError("Please upload an Excel (.xlsx, .xls) or CSV file.");
    }
  };

  // Show branded loading state during auth check
  if (isLoading || !isAuthenticated || !currentUser || !isBuyer(currentUser)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Image src="/woml-logo.png" alt="WOML" width={200} height={60} className="mx-auto mb-4" priority />
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f] mx-auto"></div>
        </div>
      </div>
    );
  }

  // Calculate stats from DB leads
  const totalLeads = dbLeads.length;
  const paidLeads = dbLeads.filter(l => l.payoutStatus === "completed" || l.payoutStatus === "processing").length;
  const totalPayouts = dbLeads.reduce((sum, l) => sum + calculateFeeBreakdown(l.payoutAmount || 0).buyerTotal, 0);
  const avgLeadValue = totalLeads > 0 ? totalPayouts / totalLeads : 0;

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

  // Get leads by day for chart (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });

  const leadsByDay = last7Days.map(day => ({
    day: new Date(day).toLocaleDateString('en-US', { weekday: 'short' }),
    count: dbLeads.filter(l => l.submittedAt.split('T')[0] === day).length,
  }));

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
            <span className="text-[#1e3a5f] font-medium">{currentBuyer?.businessName || "Options Insurance Agency"}</span>
            <span className="text-xs bg-[#1e3a5f] text-white px-2 py-1 rounded-full ml-2">Admin</span>
          </div>
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
      </header>

      <div className="relative z-10 max-w-7xl mx-auto px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto">
          {(["dashboard", "requests", "leads", "providers", "rolodex", "ledger", "settings"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-lg font-medium transition whitespace-nowrap ${
                activeTab === tab
                  ? "bg-[#1e3a5f] text-white shadow-md"
                  : "bg-white text-gray-600 hover:text-[#1e3a5f] hover:bg-gray-100 border border-gray-200"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === "requests" && pendingRequests.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Total Leads" value={totalLeads.toString()} color="navy" />
              <StatCard title="Leads Paid" value={paidLeads.toString()} color="emerald" />
              <StatCard title="Total Payouts" value={`$${totalPayouts.toFixed(2)}`} color="blue" />
              <StatCard title="Avg Lead Value" value={`$${avgLeadValue.toFixed(2)}`} color="amber" />
            </div>

            {/* Charts Row */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Leads by Day Chart */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-[#1e3a5f] mb-4">Leads This Week</h3>
                {(() => {
                  const maxCount = Math.max(...leadsByDay.map(d => d.count), 3);
                  const padX = 20;
                  const padTop = 22;
                  const padBot = 28;
                  const w = 320;
                  const h = 200;
                  const chartW = w - padX * 2;
                  const chartH = h - padTop - padBot;
                  const stepX = chartW / (leadsByDay.length - 1);
                  const pts = leadsByDay.map((d, i) => ({
                    x: padX + i * stepX,
                    y: padTop + chartH - (d.count / maxCount) * chartH,
                    ...d,
                  }));
                  const linePoints = pts.map(p => `${p.x},${p.y}`).join(" ");
                  const fillPoints = `${pts[0].x},${padTop + chartH} ${linePoints} ${pts[pts.length - 1].x},${padTop + chartH}`;
                  return (
                    <div className="h-64">
                      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                        <defs>
                          <linearGradient id="leadsFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#1e3a5f" stopOpacity="0.18" />
                            <stop offset="100%" stopColor="#1e3a5f" stopOpacity="0.02" />
                          </linearGradient>
                        </defs>
                        {/* Grid lines */}
                        {[0, 1, 2, 3].map(i => {
                          const y = padTop + (chartH / 3) * i;
                          return <line key={i} x1={padX} y1={y} x2={w - padX} y2={y} stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="4 3" />;
                        })}
                        {/* Gradient fill */}
                        <polygon points={fillPoints} fill="url(#leadsFill)" />
                        {/* Line */}
                        <polyline points={linePoints} fill="none" stroke="#1e3a5f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        {/* Data points and labels */}
                        {pts.map((p, i) => (
                          <g key={i}>
                            <circle cx={p.x} cy={p.y} r="4" fill="#1e3a5f" stroke="white" strokeWidth="2" />
                            <text x={p.x} y={p.y - 10} textAnchor="middle" fill="#1e3a5f" fontSize="11" fontWeight="600">{p.count}</text>
                            <text x={p.x} y={h - 8} textAnchor="middle" fill="#6b7280" fontSize="10">{p.day}</text>
                          </g>
                        ))}
                      </svg>
                    </div>
                  );
                })()}
              </div>

              {/* Top Providers Chart */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-[#1e3a5f] mb-4">Top Providers</h3>
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
                            className="h-full bg-[#1e3a5f] rounded-full"
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

            {/* Recent Leads */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-[#1e3a5f] mb-4">Recent Leads</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="pb-3 font-medium">Customer</th>
                      <th className="pb-3 font-medium">Vehicle</th>
                      <th className="pb-3 font-medium">Provider</th>
                      <th className="pb-3 font-medium">Quote</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbLeads.slice(0, 5).map((lead) => (
                      <tr key={lead.id} className="border-b border-gray-100">
                        <td className="py-4 text-gray-800 font-medium">{lead.customerName}</td>
                        <td className="py-4 text-gray-600">{[lead.vehicleYear, lead.vehicleMake, lead.vehicleModel].filter(Boolean).join(" ") || "-"}</td>
                        <td className="py-4 text-gray-600">{lead.providerName || "Unknown"}</td>
                        <td className="py-4 text-[#1e3a5f] font-medium">-</td>
                        <td className="py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            lead.payoutStatus === "completed" ? "bg-emerald-100 text-emerald-700" :
                            lead.payoutStatus === "processing" ? "bg-blue-100 text-blue-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>{lead.payoutStatus === "completed" ? "Paid" : lead.payoutStatus === "processing" ? "Sent to WOML" : "Pending"}</span>
                        </td>
                        <td className="py-4 text-gray-800 font-medium">${calculateFeeBreakdown(lead.payoutAmount || 0).buyerTotal.toFixed(2)}</td>
                      </tr>
                    ))}
                    {dbLeads.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center text-gray-400 py-8">
                          No leads yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CRM Data Upload Section */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#1e3a5f]">Import CRM Data</h3>
                  <p className="text-gray-500 text-sm">Upload monthly data from EZLynx for advanced analytics</p>
                </div>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDraggingCrm(true); }}
                onDragLeave={() => setIsDraggingCrm(false)}
                onDrop={handleCrmDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
                  isDraggingCrm ? "border-[#1e3a5f] bg-blue-50" : "border-gray-300 hover:border-gray-400"
                }`}
              >
                {isUploadingCrm ? (
                  <div className="space-y-3">
                    <div className="animate-spin h-10 w-10 border-4 border-[#1e3a5f] border-t-transparent rounded-full mx-auto"></div>
                    <p className="text-[#1e3a5f] font-medium">Processing file...</p>
                  </div>
                ) : crmFileName && !crmUploadError ? (
                  <div className="space-y-3">
                    <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                      <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-emerald-600 font-medium">{crmFileName}</p>
                    <p className="text-gray-500 text-sm">{uploadedCrmData.length} records imported</p>
                    <label className="inline-block cursor-pointer">
                      <input type="file" accept=".xlsx,.xls,.csv" onChange={handleCrmFileChange} className="hidden" />
                      <span className="text-[#1e3a5f] hover:underline text-sm">Upload different file</span>
                    </label>
                  </div>
                ) : (
                  <label className="cursor-pointer block">
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleCrmFileChange} className="hidden" />
                    <div className="space-y-3">
                      <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
                        <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <p className="text-gray-600 font-medium">Drag & drop your Excel or CSV file here</p>
                      <p className="text-gray-400 text-sm">or click to browse • Supported: .xlsx, .xls, .csv</p>
                    </div>
                  </label>
                )}
              </div>

              {crmUploadError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{crmUploadError}</p>
                </div>
              )}

              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-600 text-sm font-medium mb-2">Expected columns in your Excel file:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Name of Person",
                    "Business Sender",
                    "Individual Sender",
                    "Paid (Y/N)",
                    "Contact Made (Y/N)",
                    "Sold (Y/N)"
                  ].map(col => (
                    <span key={col} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600">{col}</span>
                  ))}
                </div>
                <p className="text-gray-400 text-xs mt-2">Source Conversion Rate is calculated automatically (Sold ÷ Total per Individual Sender)</p>
              </div>
            </div>

            {/* CRM Analytics (shown after upload) */}
            {crmAnalytics && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-[#1e3a5f]">Lead Performance Analytics</h3>

                {/* Summary Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <p className="text-gray-500 text-sm">Total Leads</p>
                    <p className="text-3xl font-bold text-[#1e3a5f]">{crmAnalytics.totalLeads}</p>
                    <p className="text-gray-400 text-xs mt-1">From uploaded file</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <p className="text-gray-500 text-sm">Contact Rate</p>
                    <p className="text-3xl font-bold text-blue-600">{crmAnalytics.overallContactRate.toFixed(1)}%</p>
                    <p className="text-gray-400 text-xs mt-1">{crmAnalytics.totalContacted} contacted</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <p className="text-gray-500 text-sm">Conversion Rate</p>
                    <p className="text-3xl font-bold text-emerald-600">{crmAnalytics.overallConversionRate.toFixed(1)}%</p>
                    <p className="text-gray-400 text-xs mt-1">{crmAnalytics.totalSold} sold</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <p className="text-gray-500 text-sm">Payment Rate</p>
                    <p className="text-3xl font-bold text-amber-600">{crmAnalytics.overallPaymentRate.toFixed(1)}%</p>
                    <p className="text-gray-400 text-xs mt-1">{crmAnalytics.totalPaid} paid</p>
                  </div>
                </div>

                {/* Lead Funnel Visualization */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h4 className="text-lg font-semibold text-[#1e3a5f] mb-4">Lead Funnel</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Total Leads</span>
                        <span className="font-bold text-[#1e3a5f]">{crmAnalytics.totalLeads}</span>
                      </div>
                      <div className="h-6 bg-[#1e3a5f] rounded"></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Contacted</span>
                        <span className="font-bold text-blue-600">{crmAnalytics.totalContacted} ({crmAnalytics.overallContactRate.toFixed(0)}%)</span>
                      </div>
                      <div className="h-6 bg-gray-200 rounded overflow-hidden">
                        <div className="h-full bg-blue-500 rounded" style={{ width: `${crmAnalytics.overallContactRate}%` }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Sold</span>
                        <span className="font-bold text-emerald-600">{crmAnalytics.totalSold} ({crmAnalytics.overallConversionRate.toFixed(0)}%)</span>
                      </div>
                      <div className="h-6 bg-gray-200 rounded overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded" style={{ width: `${crmAnalytics.overallConversionRate}%` }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Paid to Providers</span>
                        <span className="font-bold text-amber-600">{crmAnalytics.totalPaid} ({crmAnalytics.overallPaymentRate.toFixed(0)}%)</span>
                      </div>
                      <div className="h-6 bg-gray-200 rounded overflow-hidden">
                        <div className="h-full bg-amber-500 rounded" style={{ width: `${crmAnalytics.overallPaymentRate}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Individual Sender (Provider) Performance Table */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h4 className="text-lg font-semibold text-[#1e3a5f] mb-2">Individual Sender Performance</h4>
                  <p className="text-gray-500 text-sm mb-4">Use this to adjust payment rates or lead caps</p>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-200">
                          <th className="pb-3 font-medium">Rank</th>
                          <th className="pb-3 font-medium">Individual Sender</th>
                          <th className="pb-3 font-medium">Business</th>
                          <th className="pb-3 font-medium">Leads</th>
                          <th className="pb-3 font-medium">Contacted</th>
                          <th className="pb-3 font-medium">Sold</th>
                          <th className="pb-3 font-medium">Conv. Rate</th>
                          <th className="pb-3 font-medium">Unpaid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {crmAnalytics.providerStats.slice(0, 10).map((provider, i) => (
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
                              <span className={`font-medium ${provider.unpaidAmount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                                {provider.unpaidAmount}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top 3 Performers Over Time - Dot Plot */}
                {(() => {
                  const { weeklyData, allWeeks } = calculateWeeklyPerformance(uploadedCrmData, crmAnalytics.providerStats);
                  if (weeklyData.length === 0 || allWeeks.length < 2) return null;

                  const chartHeight = 280;
                  const chartWidth = 100; // percentage
                  const paddingLeft = 50;
                  const paddingRight = 20;
                  const paddingTop = 20;
                  const paddingBottom = 50;
                  const effectiveWidth = 800 - paddingLeft - paddingRight;
                  const effectiveHeight = chartHeight - paddingTop - paddingBottom;

                  return (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                      <h4 className="text-lg font-semibold text-[#1e3a5f] mb-2">Top 3 Performers Over Time</h4>
                      <p className="text-gray-500 text-sm mb-4">Weekly source conversion rate (%) for your best performers</p>

                      {/* Legend */}
                      <div className="flex gap-6 mb-4">
                        {weeklyData.map(provider => (
                          <div key={provider.providerName} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: provider.color }}></div>
                            <span className="text-sm text-gray-700">{provider.providerName}</span>
                            <span className="text-xs text-gray-400">({provider.overallConversionRate.toFixed(1)}%)</span>
                          </div>
                        ))}
                      </div>

                      {/* SVG Chart */}
                      <div className="w-full overflow-x-auto">
                        <svg viewBox="0 0 800 280" className="w-full" style={{ minWidth: "600px" }}>
                          {/* Y-axis grid lines and labels */}
                          {[0, 25, 50, 75, 100].map(val => {
                            const y = paddingTop + effectiveHeight - (val / 100) * effectiveHeight;
                            return (
                              <g key={val}>
                                <line x1={paddingLeft} y1={y} x2={800 - paddingRight} y2={y} stroke="#e5e7eb" strokeDasharray="4,4" />
                                <text x={paddingLeft - 10} y={y + 4} textAnchor="end" className="fill-gray-400 text-xs">{val}%</text>
                              </g>
                            );
                          })}

                          {/* X-axis labels (weeks) */}
                          {allWeeks.map((week, i) => {
                            const x = paddingLeft + (i / (allWeeks.length - 1)) * effectiveWidth;
                            return (
                              <text key={week} x={x} y={chartHeight - 15} textAnchor="middle" className="fill-gray-500 text-xs">
                                {formatWeekLabel(week)}
                              </text>
                            );
                          })}

                          {/* Lines and dots for each provider */}
                          {weeklyData.map(provider => {
                            const points = provider.weeks
                              .map((w, i) => {
                                if (w.totalLeads === 0) return null;
                                const x = paddingLeft + (i / (allWeeks.length - 1)) * effectiveWidth;
                                const y = paddingTop + effectiveHeight - (w.conversionRate / 100) * effectiveHeight;
                                return { x, y, data: w };
                              })
                              .filter(Boolean) as { x: number; y: number; data: typeof provider.weeks[0] }[];

                            if (points.length === 0) return null;

                            // Create line path
                            const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

                            return (
                              <g key={provider.providerName}>
                                {/* Line */}
                                <path d={linePath} fill="none" stroke={provider.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                {/* Dots */}
                                {points.map((p, i) => (
                                  <g key={i}>
                                    <circle cx={p.x} cy={p.y} r="6" fill={provider.color} />
                                    <circle cx={p.x} cy={p.y} r="4" fill="white" />
                                    <circle cx={p.x} cy={p.y} r="3" fill={provider.color} />
                                    {/* Tooltip on hover (using title for basic tooltip) */}
                                    <title>{`${provider.providerName}: ${p.data.conversionRate.toFixed(1)}% cumulative (${p.data.cumulativeSold}/${p.data.cumulativeTotal} total leads)`}</title>
                                  </g>
                                ))}
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>
                  );
                })()}

                {/* Volume vs Quality Scatter Plot */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h4 className="text-lg font-semibold text-[#1e3a5f] mb-2">Volume vs Quality</h4>
                  <p className="text-gray-500 text-sm mb-4">Find providers with the best balance of lead volume and conversion quality</p>

                  {(() => {
                    const maxLeads = Math.max(...crmAnalytics.providerStats.map(p => p.totalLeads), 1);
                    const chartHeight = 250;
                    const paddingLeft = 50;
                    const paddingRight = 20;
                    const paddingTop = 20;
                    const paddingBottom = 40;

                    return (
                      <div className="w-full overflow-x-auto">
                        <svg viewBox="0 0 600 250" className="w-full" style={{ minWidth: "400px" }}>
                          {/* Y-axis (Conversion Rate) */}
                          {[0, 25, 50, 75, 100].map(val => {
                            const y = paddingTop + (chartHeight - paddingTop - paddingBottom) * (1 - val / 100);
                            return (
                              <g key={val}>
                                <line x1={paddingLeft} y1={y} x2={600 - paddingRight} y2={y} stroke="#e5e7eb" strokeDasharray="2,2" />
                                <text x={paddingLeft - 10} y={y + 4} textAnchor="end" className="fill-gray-400 text-xs">{val}%</text>
                              </g>
                            );
                          })}

                          {/* X-axis label */}
                          <text x={325} y={chartHeight - 5} textAnchor="middle" className="fill-gray-500 text-xs">Total Leads</text>
                          <text x={20} y={chartHeight / 2} textAnchor="middle" transform={`rotate(-90, 20, ${chartHeight / 2})`} className="fill-gray-500 text-xs">Conv. Rate %</text>

                          {/* Quadrant backgrounds */}
                          <rect x={paddingLeft + (600 - paddingLeft - paddingRight) / 2} y={paddingTop}
                                width={(600 - paddingLeft - paddingRight) / 2} height={(chartHeight - paddingTop - paddingBottom) / 2}
                                fill="#10b98110" />

                          {/* Scatter points */}
                          {crmAnalytics.providerStats.slice(0, 15).map((provider, i) => {
                            const x = paddingLeft + (provider.totalLeads / maxLeads) * (600 - paddingLeft - paddingRight - 20);
                            const y = paddingTop + (chartHeight - paddingTop - paddingBottom) * (1 - provider.conversionRate / 100);
                            const radius = Math.max(8, Math.min(20, 6 + provider.totalLeads / 3));
                            const color = provider.conversionRate >= 30 ? "#10b981" : provider.conversionRate >= 15 ? "#f59e0b" : "#ef4444";

                            return (
                              <g key={provider.name}>
                                <circle cx={x} cy={y} r={radius} fill={color} opacity="0.7" />
                                <title>{`${provider.name}: ${provider.totalLeads} leads, ${provider.conversionRate.toFixed(1)}% conv.`}</title>
                              </g>
                            );
                          })}

                          {/* Legend */}
                          <g transform="translate(480, 30)">
                            <circle cx="0" cy="0" r="6" fill="#10b981" />
                            <text x="12" y="4" className="fill-gray-600 text-xs">High (30%+)</text>
                            <circle cx="0" cy="18" r="6" fill="#f59e0b" />
                            <text x="12" y="22" className="fill-gray-600 text-xs">Med (15-30%)</text>
                            <circle cx="0" cy="36" r="6" fill="#ef4444" />
                            <text x="12" y="40" className="fill-gray-600 text-xs">Low (&lt;15%)</text>
                          </g>
                        </svg>
                      </div>
                    );
                  })()}
                </div>

                {/* Payment Status by Provider */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h4 className="text-lg font-semibold text-[#1e3a5f] mb-2">Payment Status</h4>
                  <p className="text-gray-500 text-sm mb-4">Track paid vs unpaid leads by provider</p>

                  <div className="space-y-3">
                    {crmAnalytics.providerStats
                      .filter(p => p.totalLeads > 0)
                      .sort((a, b) => b.unpaidAmount - a.unpaidAmount)
                      .slice(0, 8)
                      .map(provider => {
                        const paidPercent = (provider.paidLeads / provider.totalLeads) * 100;
                        return (
                          <div key={provider.name} className="flex items-center gap-3">
                            <div className="w-32 truncate text-sm text-gray-700" title={provider.name}>{provider.name}</div>
                            <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden flex">
                              <div
                                className="h-full bg-emerald-500 transition-all"
                                style={{ width: `${paidPercent}%` }}
                              ></div>
                              <div
                                className="h-full bg-amber-400 transition-all"
                                style={{ width: `${100 - paidPercent}%` }}
                              ></div>
                            </div>
                            <div className="text-xs text-gray-500 w-24 text-right">
                              <span className="text-emerald-600 font-medium">{provider.paidLeads}</span>
                              <span className="mx-1">/</span>
                              <span className="text-amber-600 font-medium">{provider.unpaidAmount}</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  <div className="flex gap-4 mt-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-emerald-500"></div>
                      <span>Paid</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-amber-400"></div>
                      <span>Unpaid</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === "requests" && (
          <TabErrorBoundary tabName="Requests">
            <RequestsTab
              buyerId={currentUser.id}
              buyerBusinessName={currentBuyer?.businessName || ""}
              pendingRequests={pendingRequests}
              awaitingResponse={awaitingResponse}
              myConnections={myConnections}
              setTermsForRequest={setTermsForRequest}
              rejectRequest={rejectRequest}
              updateConnectionTerms={updateConnectionTerms}
              terminateConnection={terminateConnection}
              sendInvitationToProvider={sendInvitationToProvider}
              licensedStates={currentBuyer?.licensedStates || []}
            />
          </TabErrorBoundary>
        )}

        {/* Leads Tab */}
        {activeTab === "leads" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-[#1e3a5f]">All Leads ({dbLeads.length})</h3>
            </div>
            {dbLeadsLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div>
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Vehicle</th>
                    <th className="pb-3 font-medium">Provider</th>
                    <th className="pb-3 font-medium">Cost</th>
                    <th className="pb-3 font-medium">Payment</th>
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
                      <td className="py-4 text-gray-600">{lead.providerName || "Unknown"}</td>
                      <td className="py-4">
                        <div className="text-gray-800 font-medium">${calculateFeeBreakdown(lead.payoutAmount || 0).buyerTotal.toFixed(2)}</div>
                        <div className="text-gray-400 text-xs">${(lead.payoutAmount || 0).toFixed(2)} + ${calculateFeeBreakdown(lead.payoutAmount || 0).buyerFee.toFixed(2)} WOML fee</div>
                      </td>
                      <td className="py-4">
                        {lead.payoutStatus === "completed" ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-emerald-600 text-sm font-medium">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Completed
                            </span>
                            <div className="text-gray-400 text-[10px]">Provider paid by WOML</div>
                          </div>
                        ) : lead.payoutStatus === "processing" ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                              Paid to @womleads
                            </span>
                            <div className="text-gray-400 text-[10px] mt-1">WOML forwarding to provider</div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <a
                              href={`https://venmo.com/${WOML_PLATFORM.venmoUsername}?txn=pay&amount=${calculateFeeBreakdown(lead.payoutAmount || 0).buyerTotal.toFixed(2)}&note=${encodeURIComponent(`WOML Lead Payment - ${lead.customerName}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-white bg-[#008CFF] hover:bg-[#0074d4] px-3 py-1.5 rounded-lg text-sm font-medium transition"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 3.5c.8 1.3 1.2 2.7 1.2 4.3 0 3.4-2.9 7.8-5.2 10.9H9.2L7 4.6l5-.5.9 7.3c.8-1.3 1.8-3.4 1.8-4.8 0-1-.2-1.7-.4-2.3l5.2-1z"/></svg>
                              Pay @womleads ${calculateFeeBreakdown(lead.payoutAmount || 0).buyerTotal.toFixed(2)}
                            </a>
                            <button
                              onClick={async () => {
                                if (!confirm(`Confirm you paid $${calculateFeeBreakdown(lead.payoutAmount || 0).buyerTotal.toFixed(2)} to @womleads via Venmo for this lead?`)) return;
                                try {
                                  const res = await fetch(`/api/leads/${lead.id}/mark-paid`, { method: "POST" });
                                  if (res.ok) {
                                    setDbLeads(prev => prev.map(l =>
                                      l.id === lead.id ? { ...l, payoutStatus: "processing" } : l
                                    ));
                                  }
                                } catch (e) {
                                  console.error("Mark sent failed:", e);
                                }
                              }}
                              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-3 py-1 rounded-lg text-sm font-medium transition border border-amber-200"
                            >
                              Mark Sent to WOML
                            </button>
                            <p className="text-gray-400 text-[10px]">Pay WOML first. Provider paid after processing.</p>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {dbLeads.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-400 py-12">No leads yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            )}
          </div>
        )}

        {/* Providers Tab */}
        {activeTab === "providers" && (
          <TabErrorBoundary tabName="Providers">
            <ProvidersTab
              fetchUsersByRole={fetchUsersByRole}
              sendInvitationToProvider={sendInvitationToProvider}
              updateConnectionTerms={updateConnectionTerms}
              terminateConnection={terminateConnection}
              activeConnections={activeConnections}
            />
          </TabErrorBoundary>
        )}

        {/* Ledger Tab */}
        {activeTab === "ledger" && (
          <TabErrorBoundary tabName="Ledger">
            <LedgerTab dbLeads={dbLeads} />
          </TabErrorBoundary>
        )}

        {/* Rolodex Tab */}
        {activeTab === "rolodex" && (
          <TabErrorBoundary tabName="Rolodex">
            <RolodexTab providers={providers} dbLeads={dbLeads} currentBuyer={currentBuyer} activeConnections={activeConnections} />
          </TabErrorBoundary>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <TabErrorBoundary tabName="Settings">
            <SettingsTab currentBuyer={currentBuyer} />
          </TabErrorBoundary>
        )}
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
}: {
  fetchUsersByRole: (role: "buyer" | "provider") => Promise<DiscoveryUser[]>;
  sendInvitationToProvider: (email: string, terms: { ratePerLead: number; paymentTiming?: string; weeklyLeadCap?: number; monthlyLeadCap?: number; terminationNoticeDays?: number }, message?: string) => Promise<ApiConnection | null>;
  updateConnectionTerms: (id: string, terms: { ratePerLead?: number; paymentTiming?: string; weeklyLeadCap?: number | null; monthlyLeadCap?: number | null; terminationNoticeDays?: number }) => Promise<boolean>;
  terminateConnection: (id: string) => Promise<boolean>;
  activeConnections: ApiConnection[];
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
  const [terminationDays, setTerminationDays] = useState(7);
  const [inviteMessage, setInviteMessage] = useState("");

  // Edit terms modal state
  const [editingConnection, setEditingConnection] = useState<ApiConnection | null>(null);
  const [editRate, setEditRate] = useState(50);
  const [editPaymentTiming, setEditPaymentTiming] = useState<"per_lead" | "weekly" | "biweekly" | "monthly">("per_lead");
  const [editEnableLeadCaps, setEditEnableLeadCaps] = useState(false);
  const [editWeeklyLeadCap, setEditWeeklyLeadCap] = useState<number | undefined>(undefined);
  const [editMonthlyLeadCap, setEditMonthlyLeadCap] = useState<number | undefined>(undefined);
  const [editTerminationDays, setEditTerminationDays] = useState(7);

  // Fetch providers on mount
  useEffect(() => {
    loadProviders();
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
      case "pending_buyer_review": return { label: "Requested Connection", bg: "bg-blue-100", text: "text-blue-700" };
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
      case "venmo": return "Venmo";
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
    setEditTerminationDays(connection.termination_notice_days || 7);
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
          isActive ? "border-emerald-200" : "border-gray-200 hover:border-[#1e3a5f]/30"
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
              isActive ? "bg-emerald-600" : "bg-[#1e3a5f]"
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
          {provider.payoutMethod && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-600">
              {getPayoutLabel(provider.payoutMethod)}
            </span>
          )}
          {connection && (
            <span className="text-xs text-emerald-600 font-medium">${calculateFeeBreakdown(connection.rate_per_lead || 0).buyerTotal.toFixed(2)}/lead</span>
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

      {/* Header + Search */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-lg font-semibold text-[#1e3a5f]">Provider Network ({allProviders.length})</h3>
        <div className="relative">
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, location..."
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] w-72"
          />
        </div>
      </div>

      {isLoadingProviders ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div>
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
                  <div className="h-16 w-16 rounded-full bg-[#1e3a5f] flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-2xl">
                      {(selectedProvider.displayName || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-[#1e3a5f]">{selectedProvider.displayName}</h3>
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
                  <a href={`mailto:${selectedProvider.email}`} className="text-[#1e3a5f] font-medium hover:underline">
                    {selectedProvider.email}
                  </a>
                </div>
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Phone</p>
                  {selectedProvider.phone ? (
                    <a href={`tel:${selectedProvider.phone}`} className="text-[#1e3a5f] font-medium hover:underline">
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
                  {selectedProvider.payoutMethod ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium bg-purple-50 text-purple-700">
                      {getPayoutLabel(selectedProvider.payoutMethod)}
                    </span>
                  ) : (
                    <p className="text-gray-400 font-medium italic">Not provided</p>
                  )}
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
                            <p className="text-emerald-800 font-bold text-lg">${calculateFeeBreakdown(connection.rate_per_lead || 0).buyerTotal.toFixed(2)}/lead</p>
                            <p className="text-emerald-600 text-xs">(${Number(connection.rate_per_lead || 0).toFixed(2)} + $${PLATFORM_FEE_BUYER.toFixed(2)} fee)</p>
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
                          className="flex-1 px-4 py-2.5 bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white rounded-lg font-medium transition text-sm"
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
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 text-center">
                      <p className="text-blue-700 font-medium">This provider requested a connection</p>
                      <p className="text-blue-600 text-sm mt-1">Go to the Requests tab to review and set terms.</p>
                    </div>
                  );
                }

                // Can send terms: not connected, terminated, declined, rejected
                if (canSendTerms(selectedProvider)) {
                  if (!showTermsForm) {
                    return (
                      <button
                        onClick={() => { setShowTermsForm(true); resetTermsForm(); }}
                        className="w-full py-3 bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
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
                      <h4 className="font-semibold text-[#1e3a5f]">Set Connection Terms</h4>

                      {/* Rate Per Lead */}
                      <div>
                        <label className="block text-gray-700 text-sm font-medium mb-1">Rate Per Lead</label>
                        <div className="flex items-center gap-2">
                          <span className="text-[#1e3a5f] text-xl">$</span>
                          <input
                            type="number"
                            value={ratePerLead}
                            onChange={(e) => setRatePerLead(Number(e.target.value))}
                            className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
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
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] bg-white"
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
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#1e3a5f]"></div>
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
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 text-sm"
                                placeholder="No limit"
                              />
                            </div>
                            <div>
                              <label className="block text-gray-600 text-xs mb-1">Monthly Cap</label>
                              <input
                                type="number"
                                value={monthlyLeadCap || ""}
                                onChange={(e) => setMonthlyLeadCap(e.target.value ? Number(e.target.value) : undefined)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 text-sm"
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
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] bg-white"
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
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] text-sm"
                          rows={2}
                          placeholder="Hi! I'd like to partner with you for insurance leads..."
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
                          className="flex-1 px-4 py-2.5 bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white rounded-lg font-medium transition text-sm disabled:opacity-50 flex items-center justify-center gap-2"
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
      {editingConnection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingConnection(null)}>
          <div
            className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-[#1e3a5f]">Edit Terms - {editingConnection.providerName}</h3>
              <p className="text-gray-500 text-sm mt-1">Update the terms for this provider relationship.</p>
            </div>
            <div className="p-6 space-y-4">
              {/* Rate */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">Rate Per Lead</label>
                <div className="flex items-center gap-2">
                  <span className="text-[#1e3a5f] text-xl">$</span>
                  <input
                    type="number"
                    value={editRate}
                    onChange={(e) => setEditRate(Number(e.target.value))}
                    className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
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
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] bg-white"
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
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#1e3a5f]"></div>
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
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 text-sm"
                        placeholder="No limit"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-xs mb-1">Monthly Cap</label>
                      <input
                        type="number"
                        value={editMonthlyLeadCap || ""}
                        onChange={(e) => setEditMonthlyLeadCap(e.target.value ? Number(e.target.value) : undefined)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 text-sm"
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
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] bg-white"
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
                className="flex-1 px-4 py-2.5 bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white rounded-lg font-medium transition"
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

function LedgerTab({ dbLeads }: { dbLeads: ApiLead[] }) {
  // Build transaction history from DB leads
  const transactions = dbLeads.map(lead => {
    const fees = calculateFeeBreakdown(lead.payoutAmount || 0);
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
          <h3 className="text-lg font-semibold text-[#1e3a5f]">Transaction Ledger</h3>
          <button className="text-[#1e3a5f] hover:text-[#2a4a6f] text-sm flex items-center gap-1">
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
                  <td className="py-4 text-[#1e3a5f] font-bold text-right">${Number(tx.amount).toFixed(2)}</td>
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

function PaymentMethodBadge({ method }: { method: string }) {
  const styles: Record<string, { bg: string; text: string; icon: string }> = {
    venmo: { bg: "bg-blue-100", text: "text-blue-700", icon: "V" },
    paypal: { bg: "bg-indigo-100", text: "text-indigo-700", icon: "P" },
    bank: { bg: "bg-emerald-100", text: "text-emerald-700", icon: "B" },
    pending: { bg: "bg-gray-100", text: "text-gray-500", icon: "?" },
  };

  const style = styles[method] || styles.pending;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      <span className="font-bold">{style.icon}</span>
      {method.charAt(0).toUpperCase() + method.slice(1)}
    </span>
  );
}

// Rolodex Tab - View connected providers as baseball cards
function RolodexTab({
  providers,
  dbLeads,
  currentBuyer,
  activeConnections
}: {
  providers: Provider[];
  dbLeads: ApiLead[];
  currentBuyer: import("@/lib/auth-types").LeadBuyer | null;
  activeConnections: ApiConnection[];
}) {
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter providers based on search
  const filteredProviders = providers.filter(p =>
    (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.email || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter active connections based on search
  const filteredConnections = activeConnections.filter(c =>
    (c.providerName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.providerEmail || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate stats for each provider from DB leads
  const providersWithStats = filteredProviders.map(provider => {
    const providerLeads = dbLeads.filter(l => l.providerId === provider.id);
    const paidLeads = providerLeads.filter(l => l.payoutStatus === "completed" || l.payoutStatus === "processing");
    return {
      ...provider,
      totalLeads: providerLeads.length,
      totalEarnings: providerLeads.reduce((sum, l) => sum + l.payoutAmount, 0),
      conversionRate: providerLeads.length > 0
        ? Math.round((paidLeads.length / providerLeads.length) * 100)
        : 0,
      lastLeadDate: providerLeads.length > 0
        ? new Date(providerLeads[0].submittedAt).toLocaleDateString()
        : "Never",
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#1e3a5f]">Your Rolodex</h3>
          <p className="text-gray-500 text-sm">View and manage your connected lead providers</p>
        </div>
        <div className="relative w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search providers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f] transition"
          />
          <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Provider Cards Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {providersWithStats.map((provider) => (
          <div
            key={provider.id}
            onClick={() => setSelectedProvider(provider)}
            className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md hover:border-[#1e3a5f]/30 transition cursor-pointer group"
          >
            {/* Card Header */}
            <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2a4a6f] p-4 text-white">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-xl font-bold">{(provider.name || "?").charAt(0)}</span>
                </div>
                <div>
                  <h4 className="font-semibold">{provider.name || "Provider"}</h4>
                  <p className="text-white/70 text-sm">@{(provider.email || "").split("@")[0]}</p>
                </div>
              </div>
            </div>

            {/* Stats Section */}
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-[#1e3a5f]">{provider.totalLeads}</p>
                  <p className="text-gray-500 text-xs uppercase tracking-wide">Leads</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-600">${Number(provider.totalEarnings || 0).toFixed(2)}</p>
                  <p className="text-gray-500 text-xs uppercase tracking-wide">Paid</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-3">
                <div className="flex items-center gap-1 text-gray-500">
                  <span className="font-medium text-[#1e3a5f]">${Number(provider.payoutRate || 0).toFixed(2)}</span>
                  <span>/lead</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  provider.status === "active"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {provider.status}
                </span>
              </div>
            </div>
          </div>
        ))}

        {/* Active Connections Cards */}
        {filteredConnections.map((connection) => (
          <div
            key={connection.id}
            className="bg-white rounded-2xl border border-emerald-200 overflow-hidden shadow-sm hover:shadow-md hover:border-emerald-400 transition cursor-pointer group"
          >
            {/* Card Header - Green gradient for connections */}
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 p-4 text-white">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-xl font-bold">{(connection.providerName || "?").charAt(0)}</span>
                </div>
                <div>
                  <h4 className="font-semibold">{connection.providerName}</h4>
                  <p className="text-white/70 text-sm">@{(connection.providerEmail || "").split("@")[0]}</p>
                </div>
              </div>
            </div>

            {/* Stats Section */}
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-[#1e3a5f]">{connection.total_leads}</p>
                  <p className="text-gray-500 text-xs uppercase tracking-wide">Leads</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-600">${Number(connection.total_paid || 0).toFixed(2)}</p>
                  <p className="text-gray-500 text-xs uppercase tracking-wide">Paid</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-3">
                <div className="flex items-center gap-1 text-gray-500">
                  <span className="font-medium text-emerald-600">${calculateFeeBreakdown(connection.rate_per_lead || 0).buyerTotal.toFixed(2)}</span>
                  <span>/lead</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                  Connected
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredProviders.length === 0 && filteredConnections.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="text-gray-400">
            {searchQuery ? "No providers match your search" : "No providers in your rolodex yet"}
          </p>
        </div>
      )}

      {/* Provider Detail Modal */}
      {selectedProvider && (
        <ProviderDetailModal
          provider={selectedProvider}
          dbLeads={dbLeads.filter(l => l.providerId === selectedProvider.id)}
          onClose={() => setSelectedProvider(null)}
        />
      )}
    </div>
  );
}

// Provider Detail Modal - Full baseball card view
function ProviderDetailModal({
  provider,
  dbLeads,
  onClose
}: {
  provider: Provider;
  dbLeads: ApiLead[];
  onClose: () => void;
}) {
  const [activeView, setActiveView] = useState<"card" | "ledger">("card");
  const paidLeads = dbLeads.filter(l => l.payoutStatus === "completed" || l.payoutStatus === "processing");
  const conversionRate = dbLeads.length > 0 ? Math.round((paidLeads.length / dbLeads.length) * 100) : 0;
  const totalPaid = dbLeads.reduce((sum, l) => sum + calculateFeeBreakdown(l.payoutAmount || 0).buyerTotal, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2a4a6f] p-6 text-white relative">
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
                {provider.paymentMethod && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-white/10 text-white/80">
                    {provider.paymentMethod}
                  </span>
                )}
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
                ? "text-[#1e3a5f] border-b-2 border-[#1e3a5f]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Stats Card
          </button>
          <button
            onClick={() => setActiveView("ledger")}
            className={`flex-1 py-3 font-medium transition ${
              activeView === "ledger"
                ? "text-[#1e3a5f] border-b-2 border-[#1e3a5f]"
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
                    <p className="text-3xl font-bold text-[#1e3a5f]">{dbLeads.length}</p>
                    <p className="text-gray-500 text-sm">Total Leads</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-emerald-600">${totalPaid.toFixed(2)}</p>
                    <p className="text-gray-500 text-sm">Total Paid</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-blue-600">{conversionRate}%</p>
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
                      <p className="text-gray-500 text-sm">Payment: {provider.paymentMethod || "Not set"}</p>
                    </div>
                    <p className="text-2xl font-bold text-[#1e3a5f]">${Number(provider.payoutRate || 0).toFixed(2)}/lead</p>
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
                        <p className="text-[#1e3a5f] font-bold">${calculateFeeBreakdown(lead.payoutAmount || 0).buyerTotal.toFixed(2)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          lead.payoutStatus === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : lead.payoutStatus === "processing"
                            ? "bg-blue-100 text-blue-700"
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
  customerName: string;          // Name of person (insurance seeker)
  businessSender: string;        // Business sender (at company level)
  individualSender: string;      // Individual sender (car salesman providing business)
  paidGenerator: boolean;        // Paid the lead generator or not (Y/N)
  contactMade: boolean;          // Contact made with the lead (Y/N)
  sold: boolean;                 // Sold lead business (Y/N)
  // Legacy fields for backward compatibility
  providerName?: string;
  customerEmail?: string;
  policyStatus?: "lead" | "quoted" | "bound" | "renewed" | "lapsed" | "cancelled";
  premium?: number;
  date?: string;
  carrier?: string;
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
  // Legacy fields
  totalCustomers: number;
  boundPolicies: number;
  renewedPolicies: number;
  lapsedPolicies: number;
  retentionRate: number;
  totalPremium: number;
  avgPremium: number;
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

  const colors = ["#1e3a5f", "#10b981", "#f59e0b"];

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
}: {
  dbLeads: ApiLead[];
  providers: Provider[];
  myConnections: ApiConnection[];
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

    // Legacy metrics for backward compatibility
    const boundPolicies = totalSold;
    const totalCustomers = totalLeads;
    const totalPremium = data.reduce((sum, r) => sum + (r.premium || 0), 0);
    const avgPremium = boundPolicies > 0 ? totalPremium / boundPolicies : 0;

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
      // Legacy
      totalCustomers,
      boundPolicies,
      renewedPolicies: 0,
      lapsedPolicies: 0,
      retentionRate: overallConversionRate,
      totalPremium,
      avgPremium,
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
          getColumn(row, "Name of Person", "Insurance Seeker", "Customer Name", "Customer", "Name") || "Unknown"
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
        const rawSold = getColumn(row, "Sold (Y/N)", "Sold Lead Business", "Sold", "Converted", "Policy Sold");

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

        // Legacy format columns (for backward compatibility)
        const providerName = individualSender;
        const customerEmail = String(getColumn(row, "Email", "Customer Email") || "");

        const rawStatus = String(getColumn(row, "Status", "Policy Status") || "lead").toLowerCase();
        let policyStatus: UploadedRecord["policyStatus"] = "lead";
        if (sold || rawStatus.includes("bound") || rawStatus.includes("sold")) policyStatus = "bound";
        else if (rawStatus.includes("renew")) policyStatus = "renewed";
        else if (rawStatus.includes("lapse") || rawStatus.includes("cancel")) policyStatus = "lapsed";
        else if (rawStatus.includes("quote")) policyStatus = "quoted";

        const rawPremium = getColumn(row, "Premium", "Annual Premium", "Amount") || 0;
        const premium = typeof rawPremium === "number" ? rawPremium : parseFloat(String(rawPremium).replace(/[^0-9.]/g, "")) || 0;

        const date = parseExcelDate(getColumn(row, "Date", "Created"));

        const carrier = String(getColumn(row, "Carrier", "Insurance Company") || "");

        return {
          customerName,
          businessSender,
          individualSender,
          paidGenerator,
          contactMade,
          sold,
          // Legacy fields
          providerName,
          customerEmail,
          policyStatus,
          premium,
          date,
          carrier,
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
    totalPayout: dbLeads.reduce((sum, l) => sum + calculateFeeBreakdown(l.payoutAmount || 0).buyerTotal, 0),
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
          <h2 className="text-2xl font-bold text-[#1e3a5f]">Analytics Dashboard</h2>
          <p className="text-gray-500 mt-1">Upload your CRM data for advanced insights</p>
        </div>
      </div>

      {/* Real-Time Stats from WOML Data */}
      <div>
        <h3 className="text-lg font-semibold text-[#1e3a5f] mb-4">Real-Time Lead Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <p className="text-gray-500 text-sm">Total Leads</p>
            <p className="text-3xl font-bold text-[#1e3a5f]">{realTimeAnalytics.totalLeads}</p>
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
            <p className="text-3xl font-bold text-blue-600">${realTimeAnalytics.totalPayout.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Top Sellers Leaderboard */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#1e3a5f] mb-4">Top Lead Sellers</h3>
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
                      className="h-full bg-[#1e3a5f] rounded-full transition-all"
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
            <h3 className="text-lg font-semibold text-[#1e3a5f]">Upload CRM Data</h3>
            <p className="text-gray-500 text-sm">Import your monthly/bi-weekly data for advanced analytics</p>
          </div>
        </div>

        {/* File Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
            isDragging ? "border-[#1e3a5f] bg-blue-50" : "border-gray-300 hover:border-gray-400"
          }`}
        >
          {isUploading ? (
            <div className="space-y-3">
              <div className="animate-spin h-10 w-10 border-4 border-[#1e3a5f] border-t-transparent rounded-full mx-auto"></div>
              <p className="text-[#1e3a5f] font-medium">Processing file...</p>
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
                <span className="text-[#1e3a5f] hover:underline text-sm">Upload different file</span>
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
          <h3 className="text-lg font-semibold text-[#1e3a5f]">Lead Performance Analytics</h3>

          {/* Key Metrics - Funnel */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <p className="text-gray-500 text-sm">Total Leads</p>
              <p className="text-3xl font-bold text-[#1e3a5f]">{analytics.totalLeads}</p>
              <p className="text-gray-400 text-xs mt-1">From uploaded data</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <p className="text-gray-500 text-sm">Contact Rate</p>
              <p className="text-3xl font-bold text-blue-600">{analytics.overallContactRate.toFixed(1)}%</p>
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
            <h4 className="text-lg font-semibold text-[#1e3a5f] mb-4">Lead Funnel</h4>
            <div className="space-y-4">
              {/* Total Leads */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Total Leads</span>
                  <span className="font-medium text-[#1e3a5f]">{analytics.totalLeads}</span>
                </div>
                <div className="h-8 bg-[#1e3a5f] rounded-lg"></div>
              </div>
              {/* Contacted */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Contacted</span>
                  <span className="font-medium text-blue-600">{analytics.totalContacted} ({analytics.overallContactRate.toFixed(0)}%)</span>
                </div>
                <div className="h-8 bg-gray-200 rounded-lg overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-lg" style={{ width: `${analytics.overallContactRate}%` }}></div>
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
            <h4 className="text-lg font-semibold text-[#1e3a5f] mb-4">Individual Provider Performance</h4>
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
                        <button className="text-xs px-2 py-1 bg-[#1e3a5f] text-white rounded hover:bg-[#2a4a6f] transition">
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
              <h4 className="text-lg font-semibold text-[#1e3a5f] mb-4">Performance by Business Source</h4>
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

          {/* Retention Breakdown Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h4 className="text-lg font-semibold text-[#1e3a5f] mb-4">Policy Status Breakdown</h4>
            <div className="flex items-center gap-8">
              {/* Simple donut visualization */}
              <div className="relative w-40 h-40">
                <svg viewBox="0 0 36 36" className="w-full h-full">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3"
                    strokeDasharray={`${analytics.retentionRate}, 100`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-[#1e3a5f]">{analytics.retentionRate.toFixed(0)}%</span>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                    <span className="text-gray-600">Renewed</span>
                  </div>
                  <span className="font-medium text-gray-800">{analytics.renewedPolicies}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                    <span className="text-gray-600">Bound (New)</span>
                  </div>
                  <span className="font-medium text-gray-800">{analytics.boundPolicies - analytics.renewedPolicies}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500"></span>
                    <span className="text-gray-600">Lapsed/Cancelled</span>
                  </div>
                  <span className="font-medium text-gray-800">{analytics.lapsedPolicies}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-gray-300"></span>
                    <span className="text-gray-600">Other (Lead/Quoted)</span>
                  </div>
                  <span className="font-medium text-gray-800">{analytics.totalCustomers - analytics.boundPolicies - analytics.lapsedPolicies}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Settings Tab
function SettingsTab({ currentBuyer }: { currentBuyer: import("@/lib/auth-types").LeadBuyer | null }) {
  const { updateUser } = useAuth();
  const [businessName, setBusinessName] = useState(currentBuyer?.businessName || "");
  const [phone, setPhone] = useState(currentBuyer?.phone || "");
  const [profilePicture, setProfilePicture] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("venmo");
  const [payoutVenmo, setPayoutVenmo] = useState("");
  const [payoutPaypal, setPayoutPaypal] = useState("");
  const [payoutCashapp, setPayoutCashapp] = useState("");
  const [payoutBankRouting, setPayoutBankRouting] = useState("");
  const [payoutBankAccount, setPayoutBankAccount] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Fetch full profile on mount
  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data = await res.json();
          const p = data.profile;
          if (p.profilePictureUrl) setProfilePicture(p.profilePictureUrl);
          if (p.payoutMethod) setPayoutMethod(p.payoutMethod);
          if (p.payoutVenmo) setPayoutVenmo(p.payoutVenmo);
          if (p.payoutPaypal) setPayoutPaypal(p.payoutPaypal);
          if (p.payoutCashapp) setPayoutCashapp(p.payoutCashapp);
          if (p.payoutBankRouting) setPayoutBankRouting(p.payoutBankRouting);
          if (p.payoutBankAccount) setPayoutBankAccount(p.payoutBankAccount);
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
    if (!currentBuyer) return;
    setSaving(true);
    await updateUser({
      businessName,
      phone,
      profilePictureUrl: profilePicture || undefined,
      payoutMethod: payoutMethod as any,
      payoutVenmo,
      payoutPaypal,
      payoutCashapp,
      payoutBankRouting,
      payoutBankAccount,
    } as any);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const payoutOptions = [
    { value: "venmo", label: "Venmo", icon: "V" },
    { value: "paypal", label: "PayPal", icon: "P" },
    { value: "cashapp", label: "CashApp", icon: "$" },
    { value: "bank", label: "Bank Account", icon: "B" },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl shadow-sm">
      <h3 className="text-lg font-semibold text-[#1e3a5f] mb-6">Business Settings</h3>

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
              <div className="h-20 w-20 rounded-full bg-[#1e3a5f] flex items-center justify-center border-2 border-gray-200">
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
            value={currentBuyer?.email || ""}
            disabled
            className="w-full px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-gray-500 cursor-not-allowed"
          />
          <p className="text-gray-400 text-xs mt-1">Email cannot be changed</p>
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
            className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition"
          />
        </div>
        <div>
          <label className="block text-gray-700 text-sm font-medium mb-2">Phone Number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#1e3a5f] focus:outline-none transition"
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

        {/* Payment Method */}
        <div>
          <label className="block text-gray-700 text-sm font-medium mb-3">Payment Method</label>
          <p className="text-gray-400 text-xs mb-3">Set your payment accounts for paying lead providers</p>
          <div className="grid grid-cols-2 gap-2">
            {payoutOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPayoutMethod(opt.value)}
                className={`flex items-center gap-2 p-3 rounded-lg border-2 transition text-left ${
                  payoutMethod === opt.value
                    ? "border-[#1e3a5f] bg-blue-50 text-[#1e3a5f]"
                    : "border-gray-200 hover:border-gray-300 text-gray-600"
                }`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  payoutMethod === opt.value ? "bg-[#1e3a5f] text-white" : "bg-gray-100 text-gray-500"
                }`}>{opt.icon}</span>
                <span className="font-medium text-sm">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Conditional payment detail inputs */}
        {profileLoaded && (
          <div>
            {payoutMethod === "venmo" && (
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">Venmo Username</label>
                <input
                  type="text"
                  value={payoutVenmo}
                  onChange={(e) => setPayoutVenmo(e.target.value)}
                  placeholder="@username"
                  className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-[#1e3a5f] focus:outline-none transition"
                />
              </div>
            )}
            {payoutMethod === "paypal" && (
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">PayPal Email</label>
                <input
                  type="email"
                  value={payoutPaypal}
                  onChange={(e) => setPayoutPaypal(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-[#1e3a5f] focus:outline-none transition"
                />
              </div>
            )}
            {payoutMethod === "cashapp" && (
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">CashApp Tag</label>
                <input
                  type="text"
                  value={payoutCashapp}
                  onChange={(e) => setPayoutCashapp(e.target.value)}
                  placeholder="$cashtag"
                  className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-[#1e3a5f] focus:outline-none transition"
                />
              </div>
            )}
            {payoutMethod === "bank" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">Routing Number</label>
                  <input
                    type="text"
                    value={payoutBankRouting}
                    onChange={(e) => setPayoutBankRouting(e.target.value)}
                    placeholder="9-digit routing number"
                    className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-[#1e3a5f] focus:outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">Account Number</label>
                  <input
                    type="text"
                    value={payoutBankAccount}
                    onChange={(e) => setPayoutBankAccount(e.target.value)}
                    placeholder="Account number"
                    className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-[#1e3a5f] focus:outline-none transition"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-6 py-2 rounded-lg transition font-semibold shadow-md disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

// Requests Tab - Manage connection requests from providers
function RequestsTab({
  buyerId,
  buyerBusinessName,
  pendingRequests,
  awaitingResponse,
  myConnections,
  setTermsForRequest,
  rejectRequest,
  updateConnectionTerms,
  terminateConnection,
  sendInvitationToProvider,
  licensedStates,
}: {
  buyerId: string;
  buyerBusinessName: string;
  pendingRequests: ApiConnection[];
  awaitingResponse: ApiConnection[];
  myConnections: ApiConnection[];
  setTermsForRequest: (requestId: string, terms: { ratePerLead: number; paymentTiming?: string; weeklyLeadCap?: number; monthlyLeadCap?: number; terminationNoticeDays?: number }) => Promise<boolean>;
  rejectRequest: (requestId: string) => Promise<boolean>;
  updateConnectionTerms: (connectionId: string, terms: { ratePerLead?: number; paymentTiming?: string; weeklyLeadCap?: number | null; monthlyLeadCap?: number | null; terminationNoticeDays?: number }) => Promise<boolean>;
  terminateConnection: (connectionId: string) => Promise<boolean>;
  sendInvitationToProvider: (providerEmail: string, terms: { ratePerLead: number; paymentTiming?: string; weeklyLeadCap?: number; monthlyLeadCap?: number; terminationNoticeDays?: number }, message?: string) => Promise<ApiConnection | null>;
  licensedStates: string[];
}) {
  const [selectedRequest, setSelectedRequest] = useState<ApiConnection | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<ApiConnection | null>(null);
  const [showEditTermsModal, setShowEditTermsModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Invite form state
  const [inviteProviderEmail, setInviteProviderEmail] = useState("");
  const [inviteProviderName, setInviteProviderName] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [invitePhoneNumber, setInvitePhoneNumber] = useState("");
  const [isSendingText, setIsSendingText] = useState(false);

  // Terms form state
  const [ratePerLead, setRatePerLead] = useState(50);
  const [paymentTiming, setPaymentTiming] = useState<"per_lead" | "weekly" | "biweekly" | "monthly">("per_lead");
  const [minimumPayout, setMinimumPayout] = useState<number | undefined>(undefined);
  const [leadTypes, setLeadTypes] = useState(["auto"]);
  const [exclusivity, setExclusivity] = useState(false);
  const [terminationDays, setTerminationDays] = useState(7);
  const [notes, setNotes] = useState("");

  // Lead cap state - buyer protection
  const [enableLeadCaps, setEnableLeadCaps] = useState(false);
  const [weeklyLeadCap, setWeeklyLeadCap] = useState<number | undefined>(undefined);
  const [monthlyLeadCap, setMonthlyLeadCap] = useState<number | undefined>(undefined);
  const [pauseWhenCapReached, setPauseWhenCapReached] = useState(true);

  const openTermsModal = (request: ApiConnection) => {
    setSelectedRequest(request);
    // Reset form to defaults
    setRatePerLead(50);
    setPaymentTiming("per_lead");
    setMinimumPayout(undefined);
    setLeadTypes(["auto"]);
    setExclusivity(false);
    setTerminationDays(7);
    setNotes("");
    // Reset lead caps
    setEnableLeadCaps(false);
    setWeeklyLeadCap(undefined);
    setMonthlyLeadCap(undefined);
    setPauseWhenCapReached(true);
    setShowTermsModal(true);
  };

  const handleSetTerms = async () => {
    if (!selectedRequest) return;

    // Simplified terms for API
    const terms = {
      ratePerLead,
      paymentTiming,
      weeklyLeadCap: enableLeadCaps ? weeklyLeadCap : undefined,
      monthlyLeadCap: enableLeadCaps ? monthlyLeadCap : undefined,
      terminationNoticeDays: terminationDays,
    };

    const success = await setTermsForRequest(selectedRequest.id, terms);
    if (success) {
      alert(`Terms sent to provider! They will review and accept to finalize the connection.`);
    } else {
      alert("Failed to send terms. Please try again.");
    }
    setShowTermsModal(false);
    setSelectedRequest(null);
  };

  const handleReject = (requestId: string) => {
    if (confirm("Are you sure you want to reject this connection request?")) {
      rejectRequest(requestId);
    }
  };

  const openEditTermsModal = (connection: ApiConnection) => {
    setSelectedConnection(connection);
    setRatePerLead(connection.rate_per_lead);
    setPaymentTiming(connection.payment_timing as "per_lead" | "weekly" | "biweekly" | "monthly");
    setMinimumPayout(undefined);
    setLeadTypes(["auto"]);
    setExclusivity(false);
    setTerminationDays(connection.termination_notice_days);
    setNotes("");
    // Load lead caps
    setEnableLeadCaps(!!(connection.weekly_lead_cap || connection.monthly_lead_cap));
    setWeeklyLeadCap(connection.weekly_lead_cap || undefined);
    setMonthlyLeadCap(connection.monthly_lead_cap || undefined);
    setPauseWhenCapReached(true);
    setShowEditTermsModal(true);
  };

  const handleUpdateTerms = () => {
    if (!selectedConnection) return;

    // Simplified terms for API
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

  const openInviteModal = () => {
    // Reset form
    setInviteProviderEmail("");
    setInviteProviderName("");
    setInviteMessage("");
    setInvitePhoneNumber("");
    setIsSendingText(false);
    setRatePerLead(50);
    setPaymentTiming("per_lead");
    setMinimumPayout(undefined);
    setLeadTypes(["auto"]);
    setExclusivity(false);
    setTerminationDays(7);
    setNotes("");
    setEnableLeadCaps(false);
    setWeeklyLeadCap(undefined);
    setMonthlyLeadCap(undefined);
    setPauseWhenCapReached(true);
    setShowInviteModal(true);
  };

  const handleSendInvitation = async () => {
    if (!inviteProviderEmail || !inviteProviderName) {
      alert("Please enter the provider's name and email");
      return;
    }

    // Simplified terms for API
    const terms = {
      ratePerLead,
      paymentTiming,
      weeklyLeadCap: enableLeadCaps ? weeklyLeadCap : undefined,
      monthlyLeadCap: enableLeadCaps ? monthlyLeadCap : undefined,
      terminationNoticeDays: terminationDays,
    };

    const result = await sendInvitationToProvider(
      inviteProviderEmail,
      terms,
      inviteMessage || undefined
    );

    setShowInviteModal(false);
    if (result) {
      alert(`Invitation sent to ${inviteProviderName}! They will see your offer when they sign in.`);
    } else {
      alert("Failed to send invitation. Provider may not be registered.");
    }
  };

  const handleSendTextInvite = async () => {
    if (!invitePhoneNumber) {
      alert("Please enter a phone number");
      return;
    }
    setIsSendingText(true);
    try {
      const response = await fetch("/api/invite-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: invitePhoneNumber,
          businessName: buyerBusinessName,
        }),
      });
      const data = await response.json();
      if (data.success) {
        alert(`Text invite sent to ${invitePhoneNumber}!`);
        setInvitePhoneNumber("");
      } else {
        alert(data.error || "Failed to send text invite");
      }
    } catch {
      alert("Failed to send text invite. Please try again.");
    } finally {
      setIsSendingText(false);
    }
  };

  const activeConnections = myConnections.filter(c => c.status === "active");
  const terminatedConnections = myConnections.filter(c => c.status === "terminated");

  return (
    <div className="space-y-6">
      {/* Pending Requests */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <h3 className="text-lg font-semibold text-[#1e3a5f]">Pending Requests</h3>
          {(pendingRequests.length + awaitingResponse.length) > 0 && (
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
              {pendingRequests.length + awaitingResponse.length} pending
            </span>
          )}
        </div>

        {(pendingRequests.length + awaitingResponse.length) > 0 ? (
          <div className="space-y-4">
            {[...pendingRequests, ...awaitingResponse]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((item) => (
              <div key={item.id} className={`border rounded-xl p-4 ${item.status === "pending_provider_accept" ? "border-amber-100 bg-amber-50/30" : "border-gray-200 hover:border-[#1e3a5f]/30"} transition`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`h-12 w-12 rounded-full flex items-center justify-center ${item.status === "pending_provider_accept" ? "bg-amber-100" : "bg-[#1e3a5f]"}`}>
                      <span className={`text-xl font-bold ${item.status === "pending_provider_accept" ? "text-amber-600" : "text-white"}`}>{(item.providerName || "?").charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{item.providerName}</p>
                      <p className="text-gray-500 text-sm">{item.providerEmail}</p>
                      {item.status === "pending_buyer_review" ? (
                        <p className="text-gray-400 text-xs mt-1">
                          Requested {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "N/A"}
                        </p>
                      ) : (
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-amber-700 font-medium">${Number(item.rate_per_lead || 0).toFixed(2)}/lead</span>
                          <span className="text-gray-400">•</span>
                          <span className="text-gray-500 text-sm">Terms sent {(item.terms_updated_at || item.created_at) ? new Date(item.terms_updated_at || item.created_at).toLocaleDateString() : "N/A"}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    {item.status === "pending_buyer_review" ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => openTermsModal(item)}
                          className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-4 py-2 rounded-lg font-medium transition text-sm"
                        >
                          Set Terms
                        </button>
                        <button
                          onClick={() => handleReject(item.id)}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition text-sm"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-medium">
                        <svg className="w-4 h-4 mr-1.5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Awaiting Response
                      </span>
                    )}
                  </div>
                </div>
                {item.status === "pending_buyer_review" && item.message && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-gray-600 text-sm italic">&quot;{item.message}&quot;</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-400 py-8">No pending requests</p>
        )}
      </div>

      {/* Active Connections */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#1e3a5f] mb-6">Active Connections ({activeConnections.length})</h3>

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
                        <span className="text-[#1e3a5f] font-medium">${calculateFeeBreakdown(connection.rate_per_lead || 0).buyerTotal.toFixed(2)}/lead</span>
                        <span className="text-gray-400 text-xs">(incl. $1 fee)</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-500 text-sm">{formatPaymentTiming(connection.payment_timing as any)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => openEditTermsModal(connection)}
                        className="text-[#1e3a5f] hover:bg-[#1e3a5f]/10 px-3 py-1 rounded-lg font-medium transition text-sm"
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
                    <p className="text-xl font-bold text-[#1e3a5f]">{connection.total_leads}</p>
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
          <p className="text-center text-gray-400 py-8">No active connections yet</p>
        )}
      </div>

      {/* Terminated Connections */}
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

      {/* Set Terms Modal */}
      {showTermsModal && selectedRequest && (
        <TermsModal
          title={`Set Terms for ${selectedRequest.providerName}`}
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
          onSave={handleSetTerms}
          onCancel={() => { setShowTermsModal(false); setSelectedRequest(null); }}
          saveButtonText="Send Terms to Provider"
        />
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
          <h3 className="text-xl font-bold text-[#1e3a5f]">{title}</h3>
          <p className="text-gray-500 text-sm mt-1">Set the terms for this provider relationship. They must accept these terms before they can submit leads.</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Rate Per Lead */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">Rate Per Lead</label>
            <div className="flex items-center gap-2">
              <span className="text-[#1e3a5f] text-xl">$</span>
              <input
                type="number"
                value={ratePerLead}
                onChange={(e) => setRatePerLead(parseInt(e.target.value) || 0)}
                min="1"
                className="w-32 px-4 py-2 border border-gray-200 rounded-lg text-xl font-bold text-[#1e3a5f] focus:border-[#1e3a5f] focus:outline-none transition"
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
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none transition bg-white"
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
                  className="w-32 px-4 py-2 border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none transition"
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
                      ? "bg-[#1e3a5f] text-white"
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
                exclusivity ? "bg-[#1e3a5f]" : "bg-gray-300"
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
                className="w-20 px-4 py-2 border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none transition"
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
                      className="w-28 px-4 py-2 border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none transition"
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
                      className="w-28 px-4 py-2 border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none transition"
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
                      pauseWhenCapReached ? "bg-[#1e3a5f]" : "bg-gray-300"
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
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none transition resize-none"
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
            className="flex-1 bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white py-3 rounded-lg font-semibold transition"
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Image src="/woml-logo.png" alt="WOML" width={200} height={60} className="mx-auto mb-4" priority />
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f] mx-auto"></div>
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
