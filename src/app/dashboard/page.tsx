"use client";

import { useState } from "react";
import Link from "next/link";
import { useLeads, type Lead, type Provider } from "@/lib/leads-context";

type UserRole = "provider" | "receiver";

export default function Dashboard() {
  const [role, setRole] = useState<UserRole>("provider");
  const { leads, providers, claimLead, updateProviderRate, updateProviderStatus } = useLeads();

  // Get leads for current view
  const providerLeads = leads.filter((l) => l.providerId === "provider-1");
  const receiverLeads = leads;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-slate-700">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-lg bg-emerald-500 flex items-center justify-center">
            <span className="text-white font-bold text-xl">L</span>
          </div>
          <span className="text-2xl font-bold text-white">LeadzPay</span>
        </Link>

        {/* Role Toggle */}
        <div className="flex items-center gap-4">
          <div className="bg-slate-800 rounded-lg p-1 flex">
            <button
              onClick={() => setRole("provider")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                role === "provider"
                  ? "bg-emerald-500 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Provider View
            </button>
            <button
              onClick={() => setRole("receiver")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                role === "receiver"
                  ? "bg-emerald-500 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Receiver View
            </button>
          </div>

          {role === "provider" && (
            <Link
              href="/submit-lead"
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg transition flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Lead
            </Link>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {role === "provider" ? "Provider Dashboard" : "Receiver Dashboard"}
          </h1>
          <p className="text-slate-400">
            {role === "provider"
              ? "Track your submitted leads and earnings"
              : "Manage incoming leads, payouts, and providers"}
          </p>
        </div>

        {role === "provider" ? (
          <ProviderDashboard leads={providerLeads} provider={providers[0]} />
        ) : (
          <ReceiverDashboard
            leads={receiverLeads}
            providers={providers}
            onClaimLead={claimLead}
            onUpdateRate={updateProviderRate}
            onUpdateStatus={updateProviderStatus}
          />
        )}
      </main>
    </div>
  );
}

function ProviderDashboard({ leads, provider }: { leads: Lead[]; provider: Provider }) {
  const pendingLeads = leads.filter((l) => l.status === "pending");
  const claimedLeads = leads.filter((l) => l.status === "claimed");
  const totalEarnings = claimedLeads.reduce((sum, l) => sum + l.payout, 0);

  // Calculate this month's earnings
  const thisMonth = new Date().getMonth();
  const thisMonthLeads = claimedLeads.filter(
    (l) => l.claimedAt && new Date(l.claimedAt).getMonth() === thisMonth
  );
  const thisMonthEarnings = thisMonthLeads.reduce((sum, l) => sum + l.payout, 0);

  return (
    <>
      {/* Stripe Connect Banner */}
      {!provider?.stripeAccountId && (
        <div className="bg-purple-500/20 border border-purple-500/50 rounded-xl p-4 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <div>
              <p className="text-white font-medium">Connect Stripe to receive instant payouts</p>
              <p className="text-purple-300 text-sm">Get paid immediately when your leads are claimed</p>
            </div>
          </div>
          <button className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition">
            Connect Stripe
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Leads"
          value={leads.length.toString()}
          icon={<UsersIcon />}
          color="blue"
        />
        <StatCard
          title="Pending"
          value={pendingLeads.length.toString()}
          icon={<ClockIcon />}
          color="amber"
        />
        <StatCard
          title="Claimed"
          value={claimedLeads.length.toString()}
          icon={<CheckCircleIcon />}
          color="emerald"
        />
        <StatCard
          title="Total Earnings"
          value={`$${totalEarnings.toLocaleString()}`}
          subtitle={`$${thisMonthEarnings} this month`}
          icon={<DollarIcon />}
          color="emerald"
        />
      </div>

      {/* Current Rate */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Your Current Payout Rate</h3>
            <p className="text-slate-400 text-sm">Set by lead receivers based on your performance</p>
          </div>
          <div className="text-right">
            <span className="text-4xl font-bold text-emerald-400">${provider?.payoutRate || 50}</span>
            <span className="text-slate-400 ml-2">per lead</span>
          </div>
        </div>
      </div>

      {/* Recent Leads Table */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Your Lead History</h2>
        </div>
        {leads.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-slate-400 mb-4">No leads submitted yet</p>
            <Link
              href="/submit-lead"
              className="inline-block bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-lg transition"
            >
              Submit Your First Lead
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Vehicle</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Quote</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-700/50 transition">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-white">{lead.customerName}</div>
                        <div className="text-slate-500 text-sm">{lead.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-300">{lead.carModel}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <QuoteTypeBadge type={lead.quoteType} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                      {lead.quote ? `$${lead.quote.monthlyPremium}/mo` : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-400">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-emerald-400 font-medium">
                      {lead.payout > 0 ? `$${lead.payout}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function ReceiverDashboard({
  leads,
  providers,
  onClaimLead,
  onUpdateRate,
  onUpdateStatus,
}: {
  leads: Lead[];
  providers: Provider[];
  onClaimLead: (leadId: string, receiverId: string, receiverName: string) => void;
  onUpdateRate: (providerId: string, rate: number) => void;
  onUpdateStatus: (providerId: string, status: Provider["status"]) => void;
}) {
  const [activeTab, setActiveTab] = useState<"leads" | "providers" | "payouts">("leads");
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [newRate, setNewRate] = useState<string>("");

  const pendingLeads = leads.filter((l) => l.status === "pending");
  const claimedLeads = leads.filter((l) => l.status === "claimed" || l.receiverId === "receiver-1");
  const totalSpent = claimedLeads.reduce((sum, l) => sum + l.payout, 0);

  const handleClaim = async (lead: Lead) => {
    onClaimLead(lead.id, "receiver-1", "State Farm Agency");

    // Trigger Stripe payout (simulated)
    try {
      await fetch("/api/stripe/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: lead.providerId,
          amount: (providers.find((p) => p.id === lead.providerId)?.payoutRate || 50) * 100,
          leadId: lead.id,
        }),
      });
    } catch (err) {
      console.error("Payout error:", err);
    }
  };

  const handleSaveRate = (providerId: string) => {
    const rate = parseInt(newRate);
    if (rate > 0) {
      onUpdateRate(providerId, rate);
    }
    setEditingProvider(null);
    setNewRate("");
  };

  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Available Leads"
          value={pendingLeads.length.toString()}
          icon={<InboxIcon />}
          color="blue"
        />
        <StatCard
          title="Claimed Leads"
          value={claimedLeads.length.toString()}
          icon={<CheckCircleIcon />}
          color="emerald"
        />
        <StatCard
          title="Total Spent"
          value={`$${totalSpent.toLocaleString()}`}
          icon={<DollarIcon />}
          color="purple"
        />
        <StatCard
          title="Active Providers"
          value={providers.filter((p) => p.status === "active").length.toString()}
          icon={<UsersIcon />}
          color="amber"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {["leads", "providers", "payouts"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              activeTab === tab
                ? "bg-emerald-500 text-white"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {tab === "leads" ? "Incoming Leads" : tab === "providers" ? "Manage Providers" : "Payout History"}
          </button>
        ))}
      </div>

      {/* Leads Tab */}
      {activeTab === "leads" && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700">
            <h2 className="text-xl font-semibold text-white">Incoming Leads</h2>
          </div>
          {leads.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="text-slate-400">No leads available yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Vehicle</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Quote</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Provider</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Cost</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {leads.map((lead) => {
                    const provider = providers.find((p) => p.id === lead.providerId);
                    return (
                      <tr key={lead.id} className="hover:bg-slate-700/50 transition">
                        <td className="px-6 py-4 whitespace-nowrap text-white">{lead.customerName}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-emerald-400 font-medium">{lead.phone}</div>
                          <div className="text-slate-500 text-sm">{lead.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-300">{lead.carModel}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <QuoteTypeBadge type={lead.quoteType} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                          {lead.quote ? (
                            <div>
                              <div>${lead.quote.monthlyPremium}/mo</div>
                              <div className="text-slate-500 text-xs">{lead.quote.coverageType}</div>
                            </div>
                          ) : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-400">{lead.providerName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                          ${provider?.payoutRate || 50}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {lead.status === "pending" ? (
                            <button
                              onClick={() => handleClaim(lead)}
                              className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded-lg text-sm transition"
                            >
                              Claim Lead
                            </button>
                          ) : (
                            <span className="text-emerald-400 text-sm">Claimed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Providers Tab */}
      {activeTab === "providers" && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700">
            <h2 className="text-xl font-semibold text-white">Manage Providers</h2>
            <p className="text-slate-400 text-sm">Adjust payout rates or terminate providers</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Provider</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Total Leads</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Total Paid</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Payout Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {providers.map((provider) => (
                  <tr key={provider.id} className="hover:bg-slate-700/50 transition">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-white font-medium">{provider.name}</div>
                        <div className="text-slate-500 text-sm">{provider.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        provider.status === "active"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : provider.status === "suspended"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-red-500/20 text-red-400"
                      }`}>
                        {provider.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-300">{provider.totalLeads}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-300">${provider.totalEarnings}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingProvider === provider.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">$</span>
                          <input
                            type="number"
                            value={newRate}
                            onChange={(e) => setNewRate(e.target.value)}
                            className="w-20 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-white text-sm"
                            placeholder={provider.payoutRate.toString()}
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveRate(provider.id)}
                            className="text-emerald-400 hover:text-emerald-300"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => { setEditingProvider(null); setNewRate(""); }}
                            className="text-slate-400 hover:text-slate-300"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <span className="text-emerald-400 font-medium">${provider.payoutRate}/lead</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingProvider(provider.id);
                            setNewRate(provider.payoutRate.toString());
                          }}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Adjust Rate
                        </button>
                        {provider.status === "active" ? (
                          <button
                            onClick={() => onUpdateStatus(provider.id, "terminated")}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Terminate
                          </button>
                        ) : (
                          <button
                            onClick={() => onUpdateStatus(provider.id, "active")}
                            className="text-emerald-400 hover:text-emerald-300 text-sm"
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payouts Tab */}
      {activeTab === "payouts" && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700">
            <h2 className="text-xl font-semibold text-white">Payout History</h2>
          </div>
          {claimedLeads.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-slate-400">No payouts yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Lead</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Provider</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {claimedLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-700/50 transition">
                      <td className="px-6 py-4 whitespace-nowrap text-slate-400">
                        {lead.claimedAt ? new Date(lead.claimedAt).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-white">{lead.customerName}</div>
                          <div className="text-slate-500 text-sm">{lead.carModel}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-300">{lead.providerName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-emerald-400 font-medium">${lead.payout}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
                          Paid
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// UI Components
function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: "blue" | "emerald" | "amber" | "purple";
}) {
  const colorClasses = {
    blue: "bg-blue-500/20 text-blue-400",
    emerald: "bg-emerald-500/20 text-emerald-400",
    amber: "bg-amber-500/20 text-amber-400",
    purple: "bg-purple-500/20 text-purple-400",
  };

  return (
    <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
      <div className="flex items-center gap-4 mb-4">
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${colorClasses[color]}`}>
          {icon}
        </div>
        <span className="text-slate-400 font-medium">{title}</span>
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
      {subtitle && <div className="text-slate-500 text-sm mt-1">{subtitle}</div>}
    </div>
  );
}

function QuoteTypeBadge({ type }: { type: Lead["quoteType"] }) {
  const styles = {
    asap: "bg-red-500/20 text-red-400",
    switch: "bg-amber-500/20 text-amber-400",
    quote: "bg-blue-500/20 text-blue-400",
  };
  const labels = { asap: "ASAP", switch: "Switch", quote: "Quote" };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

function StatusBadge({ status }: { status: Lead["status"] }) {
  const styles = {
    pending: "bg-amber-500/20 text-amber-400",
    claimed: "bg-emerald-500/20 text-emerald-400",
    converted: "bg-blue-500/20 text-blue-400",
    expired: "bg-slate-500/20 text-slate-400",
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

// Icons
function UsersIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  );
}
