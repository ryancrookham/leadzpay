"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useLeads, type Lead, type Provider } from "@/lib/leads-context";
import { useAuth, useCurrentBuyer } from "@/lib/auth-context";
import { useConnections } from "@/lib/connection-context";
import { isBuyer } from "@/lib/auth-types";
import { ConnectionRequest, ContractTerms, getDefaultContractTerms, formatPaymentTiming } from "@/lib/connection-types";

type Tab = "dashboard" | "leads" | "requests" | "providers" | "rolodex" | "ledger" | "settings";

export default function BusinessPortal() {
  const router = useRouter();
  const { currentUser, isAuthenticated, isLoading, logout } = useAuth();
  const currentBuyer = useCurrentBuyer();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  // Excel upload state for Dashboard analytics
  const [uploadedCrmData, setUploadedCrmData] = useState<UploadedRecord[]>([]);
  const [crmAnalytics, setCrmAnalytics] = useState<AnalyticsData | null>(null);
  const [isUploadingCrm, setIsUploadingCrm] = useState(false);
  const [crmUploadError, setCrmUploadError] = useState<string | null>(null);
  const [crmFileName, setCrmFileName] = useState<string | null>(null);
  const [isDraggingCrm, setIsDraggingCrm] = useState(false);

  const { leads, providers, updateProvider, addProvider } = useLeads();
  const {
    getRequestsForBuyer,
    getConnectionsForBuyer,
    setTermsForRequest,
    rejectRequest,
    updateConnectionTerms,
    terminateConnection,
  } = useConnections();

  // Get connection requests for this buyer
  const pendingRequests = currentUser ? getRequestsForBuyer(currentUser.id).filter(r => r.status === "pending") : [];
  const myConnections = currentUser ? getConnectionsForBuyer(currentUser.id) : [];

  // Redirect to login if not authenticated or not a buyer
  useEffect(() => {
    console.log("[BUSINESS] Auth check - isLoading:", isLoading, "isAuthenticated:", isAuthenticated, "currentUser:", currentUser?.email);
    if (!isLoading && (!isAuthenticated || !currentUser)) {
      console.log("[BUSINESS] Not authenticated, redirecting to login");
      router.push("/auth/login?role=buyer");
    } else if (!isLoading && currentUser && !isBuyer(currentUser)) {
      console.log("[BUSINESS] User is not a buyer, redirecting to provider dashboard");
      router.push("/provider-dashboard");
    }
  }, [isLoading, isAuthenticated, currentUser, router]);

  const handleLogout = () => {
    logout();
    router.replace("/");
  };

  // Calculate CRM analytics from uploaded data
  const calculateCrmAnalytics = (data: UploadedRecord[]): AnalyticsData => {
    const totalCustomers = data.length;
    const boundPolicies = data.filter(r => r.policyStatus === "bound" || r.policyStatus === "renewed").length;
    const renewedPolicies = data.filter(r => r.policyStatus === "renewed").length;
    const lapsedPolicies = data.filter(r => r.policyStatus === "lapsed" || r.policyStatus === "cancelled").length;
    const eligibleForRenewal = renewedPolicies + lapsedPolicies;
    const retentionRate = eligibleForRenewal > 0 ? (renewedPolicies / eligibleForRenewal) * 100 : 0;
    const totalPremium = data.reduce((sum, r) => sum + (r.premium || 0), 0);
    const avgPremium = boundPolicies > 0 ? totalPremium / boundPolicies : 0;

    const providerMap = new Map<string, { leads: number; bound: number; revenue: number }>();
    data.forEach(record => {
      const existing = providerMap.get(record.providerName) || { leads: 0, bound: 0, revenue: 0 };
      existing.leads++;
      if (record.policyStatus === "bound" || record.policyStatus === "renewed") {
        existing.bound++;
        existing.revenue += record.premium || 0;
      }
      providerMap.set(record.providerName, existing);
    });

    const providerStats = Array.from(providerMap.entries())
      .map(([name, stats]) => ({
        name,
        leads: stats.leads,
        bound: stats.bound,
        closingRate: stats.leads > 0 ? (stats.bound / stats.leads) * 100 : 0,
        revenue: stats.revenue,
      }))
      .sort((a, b) => b.leads - a.leads);

    return { totalCustomers, boundPolicies, renewedPolicies, lapsedPolicies, retentionRate, totalPremium, avgPremium, providerStats };
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

      const records: UploadedRecord[] = jsonData.map((row) => {
        const providerName = (row["Provider Name"] || row["Provider"] || row["Salesperson"] || row["Agent"] || row["provider_name"] || "Unknown") as string;
        const customerName = (row["Customer Name"] || row["Customer"] || row["Name"] || row["customer_name"] || "Unknown") as string;
        const customerEmail = (row["Email"] || row["Customer Email"] || row["email"] || "") as string;
        const rawStatus = ((row["Status"] || row["Policy Status"] || row["status"] || row["policy_status"] || "lead") as string).toLowerCase();
        let policyStatus: UploadedRecord["policyStatus"] = "lead";
        if (rawStatus.includes("bound") || rawStatus.includes("sold") || rawStatus.includes("active")) policyStatus = "bound";
        else if (rawStatus.includes("renew")) policyStatus = "renewed";
        else if (rawStatus.includes("lapse") || rawStatus.includes("cancel")) policyStatus = "lapsed";
        else if (rawStatus.includes("quote")) policyStatus = "quoted";
        const rawPremium = row["Premium"] || row["Annual Premium"] || row["premium"] || row["Amount"] || 0;
        const premium = typeof rawPremium === "number" ? rawPremium : parseFloat(String(rawPremium).replace(/[^0-9.]/g, "")) || 0;
        const rawDate = row["Date"] || row["Created"] || row["date"] || row["created_at"] || new Date().toISOString();
        const date = String(rawDate);
        const carrier = (row["Carrier"] || row["Insurance Company"] || row["carrier"] || "") as string;
        return { providerName, customerName, customerEmail, policyStatus, premium, date, carrier };
      });

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

  // Show branded loading state during auth check or before redirect
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

  // Calculate stats
  const totalLeads = leads.length;
  const claimedLeads = leads.filter(l => l.status === "claimed").length;
  const totalPayouts = leads.reduce((sum, l) => sum + (l.payout || 0), 0);
  const avgLeadValue = totalLeads > 0 ? totalPayouts / totalLeads : 0;

  // Get leads by provider for chart
  const leadsByProvider = providers.map(p => ({
    ...p,
    leadCount: leads.filter(l => l.providerId === p.id).length,
    totalPayout: leads.filter(l => l.providerId === p.id).reduce((sum, l) => sum + (l.payout || 0), 0),
  }));

  // Get leads by day for chart (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });

  const leadsByDay = last7Days.map(day => ({
    day: new Date(day).toLocaleDateString('en-US', { weekday: 'short' }),
    count: leads.filter(l => l.createdAt.split('T')[0] === day).length,
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
            <span className="text-[#1e3a5f] font-medium">{currentBuyer?.businessName || "Business Portal"}</span>
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
              <StatCard title="Policies Sold" value={claimedLeads.toString()} color="emerald" />
              <StatCard title="Total Payouts" value={`$${totalPayouts.toLocaleString()}`} color="blue" />
              <StatCard title="Avg Lead Value" value={`$${avgLeadValue.toFixed(0)}`} color="amber" />
            </div>

            {/* Charts Row */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Leads by Day Chart */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-[#1e3a5f] mb-4">Leads This Week</h3>
                <div className="flex items-end justify-between h-48 gap-2">
                  {leadsByDay.map((day, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div className="flex-1 w-full flex items-end">
                        <div
                          className="w-full bg-[#1e3a5f] rounded-t-lg transition-all"
                          style={{ height: `${Math.max(day.count * 20, 8)}%` }}
                        />
                      </div>
                      <span className="text-gray-500 text-xs mt-2">{day.day}</span>
                      <span className="text-[#1e3a5f] text-sm font-medium">{day.count}</span>
                    </div>
                  ))}
                </div>
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
                    {leads.slice(0, 5).map((lead) => (
                      <LeadRow key={lead.id} lead={lead} />
                    ))}
                    {leads.length === 0 && (
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
                <p className="text-gray-600 text-sm font-medium mb-2">Expected columns:</p>
                <div className="flex flex-wrap gap-2">
                  {["Provider Name", "Customer Name", "Status", "Date"].map(col => (
                    <span key={col} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600">{col}</span>
                  ))}
                </div>
                <p className="text-gray-400 text-xs mt-2">Status values: lead, quoted, bound, renewed, lapsed, cancelled</p>
              </div>
            </div>

            {/* CRM Analytics (shown after upload) */}
            {crmAnalytics && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-[#1e3a5f]">CRM Analytics</h3>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <p className="text-gray-500 text-sm">Retention Rate</p>
                    <p className="text-3xl font-bold text-emerald-600">{crmAnalytics.retentionRate.toFixed(1)}%</p>
                    <p className="text-gray-400 text-xs mt-1">{crmAnalytics.renewedPolicies} renewed / {crmAnalytics.renewedPolicies + crmAnalytics.lapsedPolicies} eligible</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <p className="text-gray-500 text-sm">Total Policies</p>
                    <p className="text-3xl font-bold text-[#1e3a5f]">{crmAnalytics.boundPolicies}</p>
                    <p className="text-gray-400 text-xs mt-1">Bound + Renewed</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <p className="text-gray-500 text-sm">Records Imported</p>
                    <p className="text-3xl font-bold text-blue-600">{crmAnalytics.totalCustomers}</p>
                    <p className="text-gray-400 text-xs mt-1">From uploaded file</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <p className="text-gray-500 text-sm">Closing Rate</p>
                    <p className="text-3xl font-bold text-amber-600">{crmAnalytics.totalCustomers > 0 ? ((crmAnalytics.boundPolicies / crmAnalytics.totalCustomers) * 100).toFixed(1) : 0}%</p>
                    <p className="text-gray-400 text-xs mt-1">Leads → Policies</p>
                  </div>
                </div>

                {/* Provider Performance Table */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h4 className="text-lg font-semibold text-[#1e3a5f] mb-4">Provider Performance</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-200">
                          <th className="pb-3 font-medium">Rank</th>
                          <th className="pb-3 font-medium">Provider</th>
                          <th className="pb-3 font-medium">Leads</th>
                          <th className="pb-3 font-medium">Bound</th>
                          <th className="pb-3 font-medium">Closing Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {crmAnalytics.providerStats.slice(0, 10).map((provider, i) => (
                          <tr key={provider.name} className="border-b border-gray-100">
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
                            <td className="py-4 text-gray-600">{provider.leads}</td>
                            <td className="py-4 text-gray-600">{provider.bound}</td>
                            <td className="py-4">
                              <span className={`font-medium ${provider.closingRate >= 30 ? "text-emerald-600" : provider.closingRate >= 15 ? "text-amber-600" : "text-red-600"}`}>
                                {provider.closingRate.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === "requests" && (
          <RequestsTab
            buyerId={currentUser.id}
            pendingRequests={pendingRequests}
            myConnections={myConnections}
            setTermsForRequest={setTermsForRequest}
            rejectRequest={rejectRequest}
            updateConnectionTerms={updateConnectionTerms}
            terminateConnection={terminateConnection}
            licensedStates={currentBuyer?.licensedStates || []}
          />
        )}

        {/* Leads Tab */}
        {activeTab === "leads" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-[#1e3a5f]">All Leads ({leads.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Contact</th>
                    <th className="pb-3 font-medium">Vehicle</th>
                    <th className="pb-3 font-medium">Provider</th>
                    <th className="pb-3 font-medium">Quote</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-gray-100">
                      <td className="py-4 text-gray-500 text-sm">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-4 text-gray-800 font-medium">{lead.customerName}</td>
                      <td className="py-4 text-gray-500 text-sm">
                        <div>{lead.email}</div>
                        <div>{lead.phone}</div>
                      </td>
                      <td className="py-4 text-gray-600">{lead.carModel}</td>
                      <td className="py-4 text-gray-600">{lead.providerName}</td>
                      <td className="py-4 text-[#1e3a5f] font-medium">
                        {lead.quote ? `$${lead.quote.monthlyPremium}/mo` : "-"}
                      </td>
                      <td className="py-4">
                        <StatusBadge status={lead.status} />
                      </td>
                      <td className="py-4 text-gray-800 font-medium">${lead.payout || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Providers Tab */}
        {activeTab === "providers" && (
          <ProvidersTab providers={providers} leads={leads} updateProvider={updateProvider} addProvider={addProvider} />
        )}

        {/* Ledger Tab */}
        {activeTab === "ledger" && (
          <LedgerTab leads={leads} providers={providers} />
        )}

        {/* Rolodex Tab */}
        {activeTab === "rolodex" && (
          <RolodexTab providers={providers} leads={leads} currentBuyer={currentBuyer} />
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <SettingsTab currentBuyer={currentBuyer} />
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

function LeadRow({ lead }: { lead: Lead }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="py-4 text-gray-800 font-medium">{lead.customerName}</td>
      <td className="py-4 text-gray-600">{lead.carModel}</td>
      <td className="py-4 text-gray-600">{lead.providerName}</td>
      <td className="py-4 text-[#1e3a5f] font-medium">
        {lead.quote ? `$${lead.quote.monthlyPremium}/mo` : "-"}
      </td>
      <td className="py-4">
        <StatusBadge status={lead.status} />
      </td>
      <td className="py-4 text-gray-800 font-medium">${lead.payout || 0}</td>
    </tr>
  );
}

function ProvidersTab({
  providers,
  leads,
  updateProvider,
  addProvider,
}: {
  providers: Provider[];
  leads: Lead[];
  updateProvider: (id: string, updates: Partial<Provider>) => void;
  addProvider: (provider: Omit<Provider, "id">) => Provider;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [newRate, setNewRate] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [newProviderName, setNewProviderName] = useState("");
  const [newProviderEmail, setNewProviderEmail] = useState("");
  const [newProviderRate, setNewProviderRate] = useState("50");
  const [newProviderPayment, setNewProviderPayment] = useState<"venmo" | "paypal" | "bank">("venmo");

  const handleAddProvider = () => {
    if (newProviderName && newProviderEmail) {
      addProvider({
        name: newProviderName,
        email: newProviderEmail,
        payoutRate: parseInt(newProviderRate) || 50,
        status: "active",
        totalLeads: 0,
        totalEarnings: 0,
        paymentMethod: newProviderPayment,
      });
      setNewProviderName("");
      setNewProviderEmail("");
      setNewProviderRate("50");
      setShowAddModal(false);
    }
  };

  const openRateModal = (provider: Provider) => {
    setSelectedProvider(provider);
    setNewRate(provider.payoutRate.toString());
    setShowRateModal(true);
  };

  const handleRateChange = async () => {
    if (!selectedProvider || !newRate) return;

    const newRateNum = parseInt(newRate);
    if (newRateNum === selectedProvider.payoutRate) {
      setShowRateModal(false);
      return;
    }

    setIsUpdating(true);

    try {
      // Send email notification
      const response = await fetch("/api/notify-rate-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName: selectedProvider.name,
          providerEmail: selectedProvider.email,
          oldRate: selectedProvider.payoutRate,
          newRate: newRateNum,
        }),
      });

      const data = await response.json();

      // Update the provider rate
      updateProvider(selectedProvider.id, { payoutRate: newRateNum });

      setShowRateModal(false);
      setNotification({
        type: "success",
        message: `Rate updated to $${newRateNum}/lead. ${data.notifications?.provider?.simulated ? "Email notification simulated." : "Email sent to " + selectedProvider.email}`,
      });

      // Clear notification after 5 seconds
      setTimeout(() => setNotification(null), 5000);
    } catch (error) {
      console.error("Rate change error:", error);
      setNotification({
        type: "error",
        message: "Failed to update rate. Please try again.",
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setIsUpdating(false);
    }
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

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#1e3a5f]">Manage Providers ({providers.length})</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-4 py-2 rounded-lg transition flex items-center gap-2 font-semibold shadow-md"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Provider
        </button>
      </div>

      {/* Rate Change Modal */}
      {showRateModal && selectedProvider && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-gray-200 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-[#1e3a5f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#1e3a5f]">Change Payout Rate</h3>
                <p className="text-gray-500 text-sm">{selectedProvider.name}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Current Rate</span>
                  <span className="text-gray-800 font-bold text-lg">${selectedProvider.payoutRate}/lead</span>
                </div>
              </div>

              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">New Rate (per lead)</label>
                <div className="flex items-center gap-2">
                  <span className="text-[#1e3a5f] text-xl">$</span>
                  <input
                    type="number"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                    min="0"
                    className="flex-1 px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-800 text-xl font-bold focus:border-[#1e3a5f] focus:outline-none transition"
                  />
                </div>
              </div>

              {parseInt(newRate) !== selectedProvider.payoutRate && (
                <div className={`p-3 rounded-lg border ${
                  parseInt(newRate) > selectedProvider.payoutRate
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-amber-50 border-amber-200"
                }`}>
                  <p className={`text-sm ${
                    parseInt(newRate) > selectedProvider.payoutRate
                      ? "text-emerald-700"
                      : "text-amber-700"
                  }`}>
                    {parseInt(newRate) > selectedProvider.payoutRate
                      ? `Rate increase of $${parseInt(newRate) - selectedProvider.payoutRate} per lead`
                      : `Rate decrease of $${selectedProvider.payoutRate - parseInt(newRate)} per lead`
                    }
                  </p>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <p className="text-blue-700 text-sm font-medium">Email Notification</p>
                    <p className="text-blue-600 text-xs mt-1">
                      Both {selectedProvider.name} and you will receive an email notification about this rate change.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowRateModal(false)}
                  disabled={isUpdating}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-lg transition border border-gray-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRateChange}
                  disabled={isUpdating || !newRate || parseInt(newRate) === selectedProvider.payoutRate}
                  className="flex-1 bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white py-3 rounded-lg transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isUpdating ? (
                    <>
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Updating...
                    </>
                  ) : (
                    "Confirm & Notify"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Provider Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-gray-200 shadow-xl">
            <h3 className="text-xl font-bold text-[#1e3a5f] mb-4">Add New Provider</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 text-sm mb-2">Provider Name</label>
                <input
                  type="text"
                  value={newProviderName}
                  onChange={(e) => setNewProviderName(e.target.value)}
                  placeholder="John Smith"
                  className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-400 focus:border-[#1e3a5f] focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm mb-2">Email</label>
                <input
                  type="email"
                  value={newProviderEmail}
                  onChange={(e) => setNewProviderEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-400 focus:border-[#1e3a5f] focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm mb-2">Payout Rate (per lead)</label>
                <div className="flex items-center gap-2">
                  <span className="text-[#1e3a5f]">$</span>
                  <input
                    type="number"
                    value={newProviderRate}
                    onChange={(e) => setNewProviderRate(e.target.value)}
                    className="w-32 px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-800 focus:border-[#1e3a5f] focus:outline-none transition"
                  />
                </div>
              </div>
              <div>
                <label className="block text-gray-700 text-sm mb-2">Payment Method</label>
                <select
                  value={newProviderPayment}
                  onChange={(e) => setNewProviderPayment(e.target.value as "venmo" | "paypal" | "bank")}
                  className="w-full px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-800 focus:border-[#1e3a5f] focus:outline-none transition"
                >
                  <option value="venmo">Venmo</option>
                  <option value="paypal">PayPal</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg transition border border-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddProvider}
                  className="flex-1 bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white py-2 rounded-lg transition font-semibold"
                >
                  Add Provider
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Providers List */}
      <div className="grid gap-4">
        {providers.map((provider) => {
          const providerLeads = leads.filter(l => l.providerId === provider.id);
          const totalPayout = providerLeads.reduce((sum, l) => sum + (l.payout || 0), 0);

          return (
            <div key={provider.id} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-[#1e3a5f] flex items-center justify-center">
                    <span className="text-white font-bold text-lg">
                      {provider.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-gray-800 font-semibold text-lg">{provider.name}</h4>
                    <p className="text-gray-500 text-sm">{provider.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        provider.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        {provider.status}
                      </span>
                      <span className="text-gray-400 text-xs">
                        Payment: {provider.paymentMethod || "Not set"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-gray-500 text-sm mb-1">Payout Rate</div>
                  <button
                    onClick={() => openRateModal(provider)}
                    className="group flex items-center gap-2 bg-gray-50 hover:bg-[#1e3a5f]/5 border border-gray-200 hover:border-[#1e3a5f]/30 px-4 py-2 rounded-lg transition"
                  >
                    <span className="text-[#1e3a5f] font-bold text-lg">${provider.payoutRate}</span>
                    <span className="text-gray-500 text-sm">/lead</span>
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-[#1e3a5f] transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-gray-200">
                <div>
                  <p className="text-gray-500 text-sm">Total Leads</p>
                  <p className="text-gray-800 text-xl font-bold">{providerLeads.length}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Total Earned</p>
                  <p className="text-[#1e3a5f] text-xl font-bold">${totalPayout}</p>
                </div>
                <div className="flex items-end justify-end gap-2">
                  <button
                    onClick={() => updateProvider(provider.id, {
                      status: provider.status === "active" ? "inactive" : "active"
                    })}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      provider.status === "active"
                        ? "bg-red-100 text-red-700 hover:bg-red-200"
                        : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    }`}
                  >
                    {provider.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {providers.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400">No providers yet. Add your first provider above.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LedgerTab({ leads, providers }: { leads: Lead[]; providers: Provider[] }) {
  // Build transaction history from leads
  const transactions = leads.map(lead => {
    const provider = providers.find(p => p.id === lead.providerId);
    return {
      id: lead.id,
      date: lead.createdAt,
      type: "lead_payout" as const,
      description: `Lead payout to ${provider?.name || "Unknown"} for ${lead.customerName}`,
      amount: lead.payout || 0,
      provider: provider?.name || "Unknown",
      customer: lead.customerName,
      vehicle: lead.carModel,
      paymentMethod: provider?.paymentMethod || "pending",
      status: lead.status === "claimed" ? "completed" : "pending",
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
          <p className="text-3xl font-bold text-emerald-600">${totalPaid.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">Pending Payouts</p>
          <p className="text-3xl font-bold text-amber-600">${totalPending.toLocaleString()}</p>
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
                <th className="pb-3 font-medium">Payment Method</th>
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
                    <PaymentMethodBadge method={tx.paymentMethod} />
                  </td>
                  <td className="py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      tx.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="py-4 text-[#1e3a5f] font-bold text-right">${tx.amount}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-gray-400 py-12">
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
  leads,
  currentBuyer
}: {
  providers: Provider[];
  leads: Lead[];
  currentBuyer: import("@/lib/auth-types").LeadBuyer | null;
}) {
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter providers based on search
  const filteredProviders = providers.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate stats for each provider
  const providersWithStats = filteredProviders.map(provider => {
    const providerLeads = leads.filter(l => l.providerId === provider.id);
    const claimedLeads = providerLeads.filter(l => l.status === "claimed");
    return {
      ...provider,
      totalLeads: providerLeads.length,
      totalEarnings: providerLeads.reduce((sum, l) => sum + (l.payout || 0), 0),
      conversionRate: providerLeads.length > 0
        ? Math.round((claimedLeads.length / providerLeads.length) * 100)
        : 0,
      lastLeadDate: providerLeads.length > 0
        ? new Date(providerLeads[0].createdAt).toLocaleDateString()
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
                  <span className="text-xl font-bold">{provider.name.charAt(0)}</span>
                </div>
                <div>
                  <h4 className="font-semibold">{provider.name}</h4>
                  <p className="text-white/70 text-sm">@{provider.email.split("@")[0]}</p>
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
                  <p className="text-2xl font-bold text-emerald-600">${provider.totalEarnings}</p>
                  <p className="text-gray-500 text-xs uppercase tracking-wide">Paid</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-3">
                <div className="flex items-center gap-1 text-gray-500">
                  <span className="font-medium text-[#1e3a5f]">${provider.payoutRate}</span>
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
      </div>

      {filteredProviders.length === 0 && (
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
          leads={leads.filter(l => l.providerId === selectedProvider.id)}
          onClose={() => setSelectedProvider(null)}
        />
      )}
    </div>
  );
}

// Provider Detail Modal - Full baseball card view
function ProviderDetailModal({
  provider,
  leads,
  onClose
}: {
  provider: Provider;
  leads: Lead[];
  onClose: () => void;
}) {
  const [activeView, setActiveView] = useState<"card" | "ledger">("card");
  const claimedLeads = leads.filter(l => l.status === "claimed");
  const conversionRate = leads.length > 0 ? Math.round((claimedLeads.length / leads.length) * 100) : 0;
  const totalPaid = leads.reduce((sum, l) => sum + (l.payout || 0), 0);

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
              <span className="text-3xl font-bold">{provider.name.charAt(0)}</span>
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
                    <p className="text-3xl font-bold text-[#1e3a5f]">{leads.length}</p>
                    <p className="text-gray-500 text-sm">Total Leads</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-emerald-600">${totalPaid}</p>
                    <p className="text-gray-500 text-sm">Total Paid</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-blue-600">{conversionRate}%</p>
                    <p className="text-gray-500 text-sm">Conversion</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-amber-600">${provider.payoutRate}</p>
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
                    <p className="text-2xl font-bold text-[#1e3a5f]">${provider.payoutRate}/lead</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Transaction History</h4>
                <p className="text-sm text-gray-500">{leads.length} transactions</p>
              </div>

              {leads.length > 0 ? (
                <div className="space-y-2">
                  {leads.map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-gray-800 font-medium">{lead.customerName}</p>
                        <p className="text-gray-500 text-sm">{new Date(lead.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[#1e3a5f] font-bold">${lead.payout || 0}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          lead.status === "claimed"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {lead.status}
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
  providerName: string;
  providerId?: string;
  customerName: string;
  customerEmail?: string;
  policyStatus: "lead" | "quoted" | "bound" | "renewed" | "lapsed" | "cancelled";
  premium?: number;
  date: string;
  carrier?: string;
}

interface AnalyticsData {
  totalCustomers: number;
  boundPolicies: number;
  renewedPolicies: number;
  lapsedPolicies: number;
  retentionRate: number;
  totalPremium: number;
  avgPremium: number;
  providerStats: {
    name: string;
    leads: number;
    bound: number;
    closingRate: number;
    revenue: number;
  }[];
}

function AnalyticsTab({
  leads,
  providers,
  myConnections,
}: {
  leads: Lead[];
  providers: Provider[];
  myConnections: import("@/lib/connection-types").Connection[];
}) {
  const [uploadedData, setUploadedData] = useState<UploadedRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Calculate analytics from uploaded data
  const calculateAnalytics = (data: UploadedRecord[]): AnalyticsData => {
    const totalCustomers = data.length;
    const boundPolicies = data.filter(r => r.policyStatus === "bound" || r.policyStatus === "renewed").length;
    const renewedPolicies = data.filter(r => r.policyStatus === "renewed").length;
    const lapsedPolicies = data.filter(r => r.policyStatus === "lapsed" || r.policyStatus === "cancelled").length;

    // Retention = renewed / (renewed + lapsed)
    const eligibleForRenewal = renewedPolicies + lapsedPolicies;
    const retentionRate = eligibleForRenewal > 0 ? (renewedPolicies / eligibleForRenewal) * 100 : 0;

    const totalPremium = data.reduce((sum, r) => sum + (r.premium || 0), 0);
    const avgPremium = boundPolicies > 0 ? totalPremium / boundPolicies : 0;

    // Group by provider
    const providerMap = new Map<string, { leads: number; bound: number; revenue: number }>();
    data.forEach(record => {
      const existing = providerMap.get(record.providerName) || { leads: 0, bound: 0, revenue: 0 };
      existing.leads++;
      if (record.policyStatus === "bound" || record.policyStatus === "renewed") {
        existing.bound++;
        existing.revenue += record.premium || 0;
      }
      providerMap.set(record.providerName, existing);
    });

    const providerStats = Array.from(providerMap.entries())
      .map(([name, stats]) => ({
        name,
        leads: stats.leads,
        bound: stats.bound,
        closingRate: stats.leads > 0 ? (stats.bound / stats.leads) * 100 : 0,
        revenue: stats.revenue,
      }))
      .sort((a, b) => b.leads - a.leads);

    return {
      totalCustomers,
      boundPolicies,
      renewedPolicies,
      lapsedPolicies,
      retentionRate,
      totalPremium,
      avgPremium,
      providerStats,
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

      // Map columns to our format (flexible mapping)
      const records: UploadedRecord[] = jsonData.map((row) => {
        // Try to find provider name in various column names
        const providerName = (row["Provider Name"] || row["Provider"] || row["Salesperson"] || row["Agent"] || row["provider_name"] || "Unknown") as string;
        const customerName = (row["Customer Name"] || row["Customer"] || row["Name"] || row["customer_name"] || "Unknown") as string;
        const customerEmail = (row["Email"] || row["Customer Email"] || row["email"] || "") as string;

        // Parse status
        const rawStatus = ((row["Status"] || row["Policy Status"] || row["status"] || row["policy_status"] || "lead") as string).toLowerCase();
        let policyStatus: UploadedRecord["policyStatus"] = "lead";
        if (rawStatus.includes("bound") || rawStatus.includes("sold") || rawStatus.includes("active")) policyStatus = "bound";
        else if (rawStatus.includes("renew")) policyStatus = "renewed";
        else if (rawStatus.includes("lapse") || rawStatus.includes("cancel")) policyStatus = "lapsed";
        else if (rawStatus.includes("quote")) policyStatus = "quoted";

        // Parse premium
        const rawPremium = row["Premium"] || row["Annual Premium"] || row["premium"] || row["Amount"] || 0;
        const premium = typeof rawPremium === "number" ? rawPremium : parseFloat(String(rawPremium).replace(/[^0-9.]/g, "")) || 0;

        // Parse date
        const rawDate = row["Date"] || row["Created"] || row["date"] || row["created_at"] || new Date().toISOString();
        const date = String(rawDate);

        const carrier = (row["Carrier"] || row["Insurance Company"] || row["carrier"] || "") as string;

        return {
          providerName,
          customerName,
          customerEmail,
          policyStatus,
          premium,
          date,
          carrier,
        };
      });

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
    totalLeads: leads.length,
    pendingLeads: leads.filter(l => l.status === "pending").length,
    claimedLeads: leads.filter(l => l.status === "claimed").length,
    totalPayout: leads.reduce((sum, l) => sum + (l.payout || 0), 0),
  };

  // Get provider rankings from real leads
  const providerRankings = providers
    .map(p => ({
      name: p.name,
      leads: leads.filter(l => l.providerId === p.id).length,
      payout: leads.filter(l => l.providerId === p.id).reduce((sum, l) => sum + (l.payout || 0), 0),
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
            <p className="text-3xl font-bold text-blue-600">${realTimeAnalytics.totalPayout.toLocaleString()}</p>
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
                    <span className="text-sm text-gray-500">{provider.leads} leads • ${provider.payout}</span>
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
            {["Provider Name", "Customer Name", "Status", "Premium", "Date", "Carrier"].map(col => (
              <span key={col} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600">{col}</span>
            ))}
          </div>
          <p className="text-gray-400 text-xs mt-2">Status values: lead, quoted, bound, renewed, lapsed, cancelled</p>
        </div>
      </div>

      {/* Uploaded Data Analytics */}
      {analytics && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-[#1e3a5f]">CRM Data Analytics</h3>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <p className="text-gray-500 text-sm">Retention Rate</p>
              <p className="text-3xl font-bold text-emerald-600">{analytics.retentionRate.toFixed(1)}%</p>
              <p className="text-gray-400 text-xs mt-1">{analytics.renewedPolicies} renewed / {analytics.renewedPolicies + analytics.lapsedPolicies} eligible</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <p className="text-gray-500 text-sm">Total Policies</p>
              <p className="text-3xl font-bold text-[#1e3a5f]">{analytics.boundPolicies}</p>
              <p className="text-gray-400 text-xs mt-1">Bound + Renewed</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <p className="text-gray-500 text-sm">Total Premium</p>
              <p className="text-3xl font-bold text-blue-600">${analytics.totalPremium.toLocaleString()}</p>
              <p className="text-gray-400 text-xs mt-1">Annual revenue</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <p className="text-gray-500 text-sm">Avg Premium</p>
              <p className="text-3xl font-bold text-amber-600">${analytics.avgPremium.toFixed(0)}</p>
              <p className="text-gray-400 text-xs mt-1">Per policy</p>
            </div>
          </div>

          {/* Provider Performance from Uploaded Data */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h4 className="text-lg font-semibold text-[#1e3a5f] mb-4">Provider Performance (from CRM data)</h4>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="pb-3 font-medium">Rank</th>
                    <th className="pb-3 font-medium">Provider</th>
                    <th className="pb-3 font-medium">Leads</th>
                    <th className="pb-3 font-medium">Bound</th>
                    <th className="pb-3 font-medium">Closing Rate</th>
                    <th className="pb-3 font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.providerStats.map((provider, i) => (
                    <tr key={provider.name} className="border-b border-gray-100">
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
                      <td className="py-4 text-gray-600">{provider.leads}</td>
                      <td className="py-4 text-gray-600">{provider.bound}</td>
                      <td className="py-4">
                        <span className={`font-medium ${provider.closingRate >= 30 ? "text-emerald-600" : provider.closingRate >= 15 ? "text-amber-600" : "text-red-600"}`}>
                          {provider.closingRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-4 text-[#1e3a5f] font-medium">${provider.revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

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
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (currentBuyer) {
      updateUser({ businessName, phone });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

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
        <button
          onClick={handleSave}
          className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-6 py-2 rounded-lg transition font-semibold shadow-md"
        >
          Save Settings
        </button>
      </div>
    </div>
  );
}

// Requests Tab - Manage connection requests from providers
function RequestsTab({
  buyerId,
  pendingRequests,
  myConnections,
  setTermsForRequest,
  rejectRequest,
  updateConnectionTerms,
  terminateConnection,
  licensedStates,
}: {
  buyerId: string;
  pendingRequests: ConnectionRequest[];
  myConnections: import("@/lib/connection-types").Connection[];
  setTermsForRequest: (requestId: string, terms: ContractTerms) => void;
  rejectRequest: (requestId: string) => void;
  updateConnectionTerms: (connectionId: string, terms: ContractTerms) => void;
  terminateConnection: (connectionId: string, terminatedBy: "buyer" | "provider", reason?: string) => void;
  licensedStates: string[];
}) {
  const [selectedRequest, setSelectedRequest] = useState<ConnectionRequest | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<import("@/lib/connection-types").Connection | null>(null);
  const [showEditTermsModal, setShowEditTermsModal] = useState(false);

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

  const openTermsModal = (request: ConnectionRequest) => {
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

  const handleSetTerms = () => {
    if (!selectedRequest) return;

    const terms: ContractTerms = {
      paymentTerms: {
        ratePerLead,
        timing: paymentTiming,
        minimumPayoutThreshold: minimumPayout,
        paymentStructure: "per_lead", // Required for compliance - per lead, not per conversion
      },
      leadTypes,
      exclusivity,
      terminationNoticeDays: terminationDays,
      notes: notes || undefined,
      // Lead caps - buyer protection from unlimited lead obligations
      leadCaps: enableLeadCaps ? {
        weeklyLimit: weeklyLeadCap,
        monthlyLimit: monthlyLeadCap,
        pauseWhenCapReached,
      } : undefined,
      licensedStates, // States where buyer is licensed
      complianceAcknowledged: true, // Buyer sets terms = acknowledges compliance
      agreementVersion: "1.0.0",
    };

    setTermsForRequest(selectedRequest.id, terms);
    setShowTermsModal(false);
    setSelectedRequest(null);
  };

  const handleReject = (requestId: string) => {
    if (confirm("Are you sure you want to reject this connection request?")) {
      rejectRequest(requestId);
    }
  };

  const openEditTermsModal = (connection: import("@/lib/connection-types").Connection) => {
    setSelectedConnection(connection);
    setRatePerLead(connection.terms.paymentTerms.ratePerLead);
    setPaymentTiming(connection.terms.paymentTerms.timing);
    setMinimumPayout(connection.terms.paymentTerms.minimumPayoutThreshold);
    setLeadTypes(connection.terms.leadTypes);
    setExclusivity(connection.terms.exclusivity);
    setTerminationDays(connection.terms.terminationNoticeDays);
    setNotes(connection.terms.notes || "");
    // Load lead caps
    const caps = connection.terms.leadCaps;
    setEnableLeadCaps(!!caps);
    setWeeklyLeadCap(caps?.weeklyLimit);
    setMonthlyLeadCap(caps?.monthlyLimit);
    setPauseWhenCapReached(caps?.pauseWhenCapReached ?? true);
    setShowEditTermsModal(true);
  };

  const handleUpdateTerms = () => {
    if (!selectedConnection) return;

    const terms: ContractTerms = {
      paymentTerms: {
        ratePerLead,
        timing: paymentTiming,
        minimumPayoutThreshold: minimumPayout,
        paymentStructure: "per_lead", // Required for compliance - per lead, not per conversion
      },
      leadTypes,
      exclusivity,
      terminationNoticeDays: terminationDays,
      notes: notes || undefined,
      // Lead caps - buyer protection from unlimited lead obligations
      leadCaps: enableLeadCaps ? {
        weeklyLimit: weeklyLeadCap,
        monthlyLimit: monthlyLeadCap,
        pauseWhenCapReached,
      } : undefined,
      licensedStates, // States where buyer is licensed
      complianceAcknowledged: true,
      agreementVersion: "1.0.0",
    };

    updateConnectionTerms(selectedConnection.id, terms);
    setShowEditTermsModal(false);
    setSelectedConnection(null);
  };

  const handleTerminate = (connectionId: string, providerName: string) => {
    if (confirm(`Are you sure you want to terminate your connection with ${providerName}? They will no longer be able to submit leads.`)) {
      terminateConnection(connectionId, "buyer", "Terminated by business");
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
          {pendingRequests.length > 0 && (
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
              {pendingRequests.length} new
            </span>
          )}
        </div>

        {pendingRequests.length > 0 ? (
          <div className="space-y-4">
            {pendingRequests.map((request) => (
              <div key={request.id} className="border border-gray-200 rounded-xl p-4 hover:border-[#1e3a5f]/30 transition">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-[#1e3a5f] flex items-center justify-center">
                      <span className="text-xl font-bold text-white">{request.providerName.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{request.providerName}</p>
                      <p className="text-gray-500 text-sm">{request.providerEmail}</p>
                      <p className="text-gray-400 text-xs mt-1">
                        Requested {new Date(request.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openTermsModal(request)}
                      className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-4 py-2 rounded-lg font-medium transition text-sm"
                    >
                      Set Terms
                    </button>
                    <button
                      onClick={() => handleReject(request.id)}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition text-sm"
                    >
                      Reject
                    </button>
                  </div>
                </div>
                {request.message && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-gray-600 text-sm italic">&quot;{request.message}&quot;</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-400 py-8">No pending connection requests</p>
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
                      <span className="text-xl font-bold text-emerald-600">{connection.providerName.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{connection.providerName}</p>
                      <p className="text-gray-500 text-sm">{connection.providerEmail}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[#1e3a5f] font-medium">${connection.terms.paymentTerms.ratePerLead}/lead</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-500 text-sm">{formatPaymentTiming(connection.terms.paymentTerms.timing)}</span>
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
                      Connected since {new Date(connection.acceptedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-gray-500 text-sm">Total Leads</p>
                    <p className="text-xl font-bold text-[#1e3a5f]">{connection.stats.totalLeads}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">Total Paid</p>
                    <p className="text-xl font-bold text-emerald-600">${connection.stats.totalPaid}</p>
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
                  <p className="text-gray-400 text-sm">Terminated {connection.terminatedAt ? new Date(connection.terminatedAt).toLocaleDateString() : ""}</p>
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
                      Max cost per week: {weeklyLeadCap ? `$${weeklyLeadCap * ratePerLead}` : "Unlimited"}
                      {monthlyLeadCap && ` • Max cost per month: $${monthlyLeadCap * ratePerLead}`}
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
