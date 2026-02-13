"use client";

import { useState } from "react";

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

interface InfoTabProps {
  detailedUsers: DetailedUser[];
  onToggleUser: (userId: string, isActive: boolean) => void;
  recentLeads: AdminLead[];
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export default function InfoTab({ detailedUsers, onToggleUser, recentLeads }: InfoTabProps) {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [expandedBuyer, setExpandedBuyer] = useState<string | null>(null);

  const providers = detailedUsers.filter(u => u.role === "provider");
  const buyers = detailedUsers.filter(u => u.role === "buyer");

  return (
    <div className="space-y-6">
      {/* All Leads Section */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        <h2 className="text-xl font-semibold text-white mb-4">All Leads ({recentLeads.length})</h2>
        {recentLeads.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No leads yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 text-gray-400 text-sm">Date</th>
                  <th className="text-left py-2 text-gray-400 text-sm">Provider</th>
                  <th className="text-left py-2 text-gray-400 text-sm">Business</th>
                  <th className="text-left py-2 text-gray-400 text-sm">Vehicle</th>
                  <th className="text-right py-2 text-gray-400 text-sm">Rate</th>
                  <th className="text-right py-2 text-gray-400 text-sm">WOML Fee</th>
                  <th className="text-center py-2 text-gray-400 text-sm">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-gray-800/50">
                    <td className="py-3 text-gray-300 text-sm">
                      {new Date(lead.submittedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-white font-medium">{lead.providerName}</td>
                    <td className="py-3 text-gray-300">{lead.buyerName}</td>
                    <td className="py-3 text-gray-400 text-sm">{lead.vehicleInfo || "-"}</td>
                    <td className="py-3 text-right text-white">${Number(lead.payoutAmount).toFixed(2)}</td>
                    <td className="py-3 text-right text-[#C5B358] font-medium">${Number(lead.platformFee).toFixed(2)}</td>
                    <td className="py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        lead.payoutStatus === "completed"
                          ? "bg-[#C5B358]/20 text-[#C5B358]"
                          : lead.payoutStatus === "processing"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-amber-500/20 text-amber-400"
                      }`}>
                        {lead.payoutStatus === "completed" ? "Forwarded" : lead.payoutStatus === "processing" ? "Awaiting Forward" : "Pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Providers Section */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Providers ({providers.length})
        </h2>
        {providers.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No providers registered</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 text-gray-400 text-sm">Name</th>
                  <th className="text-left py-2 text-gray-400 text-sm">Payout</th>
                  <th className="text-right py-2 text-gray-400 text-sm">Leads</th>
                  <th className="text-right py-2 text-gray-400 text-sm">WOML Fees</th>
                  <th className="text-right py-2 text-gray-400 text-sm">Earned</th>
                  <th className="text-left py-2 text-gray-400 text-sm">Last Lead</th>
                  <th className="text-center py-2 text-gray-400 text-sm">1099</th>
                  <th className="text-center py-2 text-gray-400 text-sm">Status</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((user) => (
                  <>
                    <tr
                      key={user.id}
                      className="border-b border-gray-800/50 cursor-pointer hover:bg-gray-800/30 transition"
                      onClick={() => setExpandedProvider(expandedProvider === user.id ? null : user.id)}
                    >
                      <td className="py-3">
                        <div className="text-white font-medium">{user.displayName}</div>
                        <div className="text-gray-500 text-xs">{user.email}</div>
                      </td>
                      <td className="py-3 text-gray-400 text-sm">
                        {user.payoutMethod ? (
                          <span className="capitalize">{user.payoutMethod}{user.payoutVenmo ? `: @${user.payoutVenmo}` : ""}</span>
                        ) : (
                          <span className="text-red-400">Not set</span>
                        )}
                      </td>
                      <td className="py-3 text-right text-white">{user.totalLeads}</td>
                      <td className="py-3 text-right text-[#C5B358] font-medium">${user.platformFeesEarned.toFixed(2)}</td>
                      <td className="py-3 text-right text-emerald-400 font-medium">${Number(user.totalVolume).toFixed(2)}</td>
                      <td className="py-3 text-gray-400 text-sm">{timeAgo(user.lastLeadAt)}</td>
                      <td className="py-3 text-center">
                        {user.needs1099 ? (
                          <span className="px-2 py-1 rounded text-[10px] font-bold bg-red-500/20 text-red-400">
                            1099 (${user.yearlyEarnings.toFixed(0)})
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400/70">
                            ${user.yearlyEarnings.toFixed(0)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`${user.isActive ? "Deactivate" : "Activate"} ${user.displayName}?`)) {
                              onToggleUser(user.id, !user.isActive);
                            }
                          }}
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            user.isActive
                              ? "bg-[#C5B358]/20 text-[#C5B358] hover:bg-[#C5B358]/40"
                              : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                          } transition`}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                    </tr>
                    {expandedProvider === user.id && (
                      <tr key={`${user.id}-detail`}>
                        <td colSpan={8} className="pb-4">
                          <div className="bg-gray-800/40 rounded-lg p-4 mx-2 border border-gray-700/50">
                            <div className="grid grid-cols-4 gap-4">
                              <div>
                                <div className="text-gray-500 text-xs mb-1">Joined</div>
                                <div className="text-white text-sm">{new Date(user.createdAt).toLocaleDateString()}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 text-xs mb-1">Phone</div>
                                <div className="text-white text-sm">{user.phone || "Not provided"}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 text-xs mb-1">Yearly Earnings (1099)</div>
                                <div className={`text-sm font-medium ${user.needs1099 ? "text-red-400" : "text-emerald-400"}`}>
                                  ${user.yearlyEarnings.toFixed(2)} {user.needs1099 ? "- 1099 REQUIRED" : `of $600 threshold`}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-500 text-xs mb-1">WOML Revenue from Provider</div>
                                <div className="text-[#C5B358] text-sm font-medium">${user.platformFeesEarned.toFixed(2)}</div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Businesses Section */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Businesses ({buyers.length})
        </h2>
        {buyers.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No businesses registered</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 text-gray-400 text-sm">Business</th>
                  <th className="text-left py-2 text-gray-400 text-sm">Location</th>
                  <th className="text-right py-2 text-gray-400 text-sm">Leads</th>
                  <th className="text-right py-2 text-gray-400 text-sm">WOML Fees</th>
                  <th className="text-right py-2 text-gray-400 text-sm">Total Spent</th>
                  <th className="text-center py-2 text-gray-400 text-sm">Status</th>
                </tr>
              </thead>
              <tbody>
                {buyers.map((user) => (
                  <>
                    <tr
                      key={user.id}
                      className="border-b border-gray-800/50 cursor-pointer hover:bg-gray-800/30 transition"
                      onClick={() => setExpandedBuyer(expandedBuyer === user.id ? null : user.id)}
                    >
                      <td className="py-3">
                        <div className="text-white font-medium">{user.businessName || user.displayName}</div>
                        <div className="text-gray-500 text-xs">{user.email}</div>
                      </td>
                      <td className="py-3 text-gray-400 text-sm">{user.location || "-"}</td>
                      <td className="py-3 text-right text-white">{user.totalLeads}</td>
                      <td className="py-3 text-right text-[#C5B358] font-medium">${user.platformFeesEarned.toFixed(2)}</td>
                      <td className="py-3 text-right text-gray-300">${Number(user.totalVolume).toFixed(2)}</td>
                      <td className="py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          user.isActive
                            ? "bg-[#C5B358]/20 text-[#C5B358]"
                            : "bg-red-500/20 text-red-400"
                        }`}>
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                    {expandedBuyer === user.id && (
                      <tr key={`${user.id}-detail`}>
                        <td colSpan={6} className="pb-4">
                          <div className="bg-gray-800/40 rounded-lg p-4 mx-2 border border-gray-700/50">
                            <div className="grid grid-cols-4 gap-4">
                              <div>
                                <div className="text-gray-500 text-xs mb-1">Joined</div>
                                <div className="text-white text-sm">{new Date(user.createdAt).toLocaleDateString()}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 text-xs mb-1">Phone</div>
                                <div className="text-white text-sm">{user.phone || "Not provided"}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 text-xs mb-1">Last Lead Received</div>
                                <div className="text-white text-sm">{timeAgo(user.lastLeadAt)}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 text-xs mb-1">WOML Revenue from Business</div>
                                <div className="text-[#C5B358] text-sm font-medium">${user.platformFeesEarned.toFixed(2)}</div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 1099 Summary */}
      {providers.some(p => p.needs1099) && (
        <div className="bg-red-500/10 rounded-xl border border-red-500/20 p-6">
          <h3 className="text-lg font-semibold text-red-400 mb-3">1099 Required</h3>
          <p className="text-gray-400 text-sm mb-3">
            The following providers have earned $600+ this calendar year and require a 1099-NEC form:
          </p>
          <div className="space-y-2">
            {providers.filter(p => p.needs1099).map(p => (
              <div key={p.id} className="flex items-center justify-between bg-red-500/5 rounded-lg p-3 border border-red-500/10">
                <div>
                  <span className="text-white font-medium">{p.displayName}</span>
                  <span className="text-gray-500 text-sm ml-2">{p.email}</span>
                </div>
                <span className="text-red-400 font-bold">${p.yearlyEarnings.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
