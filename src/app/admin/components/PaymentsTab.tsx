"use client";

import { useState, useEffect } from "react";
import { calculateFeeBreakdown } from "@/lib/platform-fees";

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

interface PendingPayoutGroup {
  providerId: string;
  providerName: string;
  providerVenmo: string | null;
  providerPayoutMethod: string | null;
  leads: { id: string; buyerName: string; vehicleInfo: string | null; providerNet: number; submittedAt: string }[];
  totalNet: number;
}

interface PaymentsTabProps {
  platformFees: PlatformFees;
  onFeesSaved: (fees: PlatformFees) => void;
  pendingPayouts: PendingPayoutGroup[];
  completedRevenue: number;
  pendingRevenue: number;
  onPayoutForwarded: () => void;
}

export default function PaymentsTab({ platformFees, onFeesSaved, pendingPayouts, completedRevenue, pendingRevenue, onPayoutForwarded }: PaymentsTabProps) {
  const [feeType, setFeeType] = useState<"flat" | "percent" | "mixed">(platformFees.fee_type);
  const [flatForm, setFlatForm] = useState({
    fee_total: platformFees.fee_total,
    fee_buyer: platformFees.fee_buyer,
    fee_provider: platformFees.fee_provider,
  });
  const [percentForm, setPercentForm] = useState({
    fee_percent: platformFees.fee_percent,
    fee_percent_buyer_share: platformFees.fee_percent_buyer_share,
  });
  const [mixedForm, setMixedForm] = useState({
    fee_mixed_flat: platformFees.fee_mixed_flat,
    fee_mixed_percent: platformFees.fee_mixed_percent,
    fee_mixed_buyer_share: platformFees.fee_mixed_buyer_share,
  });
  const [previewRate, setPreviewRate] = useState(50);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reset forms when platformFees changes
  useEffect(() => {
    setFeeType(platformFees.fee_type);
    setFlatForm({ fee_total: platformFees.fee_total, fee_buyer: platformFees.fee_buyer, fee_provider: platformFees.fee_provider });
    setPercentForm({ fee_percent: platformFees.fee_percent, fee_percent_buyer_share: platformFees.fee_percent_buyer_share });
    setMixedForm({ fee_mixed_flat: platformFees.fee_mixed_flat, fee_mixed_percent: platformFees.fee_mixed_percent, fee_mixed_buyer_share: platformFees.fee_mixed_buyer_share });
  }, [platformFees]);

  // Build preview settings based on current form
  const previewSettings = feeType === "flat"
    ? { fee_type: "flat" as const, ...flatForm }
    : feeType === "percent"
    ? { fee_type: "percent" as const, ...percentForm }
    : { fee_type: "mixed" as const, ...mixedForm };

  const preview = calculateFeeBreakdown(previewRate, previewSettings);

  // Validation
  const flatValid = Math.round((flatForm.fee_buyer + flatForm.fee_provider) * 100) === Math.round(flatForm.fee_total * 100);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const body: Record<string, any> = { fee_type: feeType };
      if (feeType === "flat") {
        Object.assign(body, flatForm);
      } else if (feeType === "percent") {
        Object.assign(body, percentForm);
      } else {
        Object.assign(body, mixedForm);
      }
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        onFeesSaved(data.settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (e) {
      console.error("Save settings failed:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Fee Type Selector */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Fee Structure</h2>
        <p className="text-gray-400 text-sm mb-4">Choose how WOML charges platform fees on each lead transaction.</p>

        <div className="flex gap-2 mb-6">
          {([
            { type: "flat" as const, label: "Flat ($)", desc: "Fixed dollar amount per lead" },
            { type: "percent" as const, label: "Percent (%)", desc: "Percentage of lead rate" },
            { type: "mixed" as const, label: "Mixed ($ + %)", desc: "Flat fee plus percentage" },
          ] as const).map(({ type, label, desc }) => (
            <button
              key={type}
              onClick={() => setFeeType(type)}
              className={`flex-1 p-3 rounded-lg border text-left transition ${
                feeType === type
                  ? "bg-[#C5B358]/10 border-[#C5B358]/40 ring-1 ring-[#C5B358]/20"
                  : "bg-gray-800/50 border-gray-700 hover:border-gray-600"
              }`}
            >
              <div className={`font-medium text-sm ${feeType === type ? "text-[#C5B358]" : "text-gray-300"}`}>
                {label}
              </div>
              <div className="text-gray-500 text-xs mt-0.5">{desc}</div>
            </button>
          ))}
        </div>

        {/* Dynamic Form */}
        {feeType === "flat" && (
          <div className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-1">Total Platform Fee ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={flatForm.fee_total}
                onChange={(e) => {
                  const total = Number(e.target.value);
                  setFlatForm({
                    fee_total: total,
                    fee_buyer: Math.round(total / 2 * 100) / 100,
                    fee_provider: Math.round(total / 2 * 100) / 100,
                  });
                }}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#C5B358]/40 focus:border-[#C5B358] transition"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">Buyer Portion ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={flatForm.fee_buyer}
                  onChange={(e) => setFlatForm(prev => ({ ...prev, fee_buyer: Number(e.target.value) }))}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#C5B358]/40 focus:border-[#C5B358] transition"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">Provider Portion ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={flatForm.fee_provider}
                  onChange={(e) => setFlatForm(prev => ({ ...prev, fee_provider: Number(e.target.value) }))}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#C5B358]/40 focus:border-[#C5B358] transition"
                />
              </div>
            </div>
            {!flatValid && (
              <p className="text-red-400 text-sm">Buyer + Provider portions must equal the total fee.</p>
            )}
          </div>
        )}

        {feeType === "percent" && (
          <div className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-1">Fee Percentage (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={percentForm.fee_percent}
                onChange={(e) => setPercentForm(prev => ({ ...prev, fee_percent: Number(e.target.value) }))}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#C5B358]/40 focus:border-[#C5B358] transition"
              />
              <p className="text-gray-500 text-xs mt-1">Percentage of the per-lead rate charged as platform fee</p>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">Buyer Share of Fee (%)</label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={percentForm.fee_percent_buyer_share}
                onChange={(e) => setPercentForm(prev => ({ ...prev, fee_percent_buyer_share: Number(e.target.value) }))}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#C5B358]/40 focus:border-[#C5B358] transition"
              />
              <p className="text-gray-500 text-xs mt-1">
                {percentForm.fee_percent_buyer_share}% charged to buyer, {100 - percentForm.fee_percent_buyer_share}% deducted from provider
              </p>
            </div>
          </div>
        )}

        {feeType === "mixed" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">Flat Fee Portion ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={mixedForm.fee_mixed_flat}
                  onChange={(e) => setMixedForm(prev => ({ ...prev, fee_mixed_flat: Number(e.target.value) }))}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#C5B358]/40 focus:border-[#C5B358] transition"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">Percentage Portion (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={mixedForm.fee_mixed_percent}
                  onChange={(e) => setMixedForm(prev => ({ ...prev, fee_mixed_percent: Number(e.target.value) }))}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#C5B358]/40 focus:border-[#C5B358] transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">Buyer Share of Total Fee (%)</label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={mixedForm.fee_mixed_buyer_share}
                onChange={(e) => setMixedForm(prev => ({ ...prev, fee_mixed_buyer_share: Number(e.target.value) }))}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#C5B358]/40 focus:border-[#C5B358] transition"
              />
              <p className="text-gray-500 text-xs mt-1">
                {mixedForm.fee_mixed_buyer_share}% charged to buyer, {100 - mixedForm.fee_mixed_buyer_share}% deducted from provider
              </p>
            </div>
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || (feeType === "flat" && !flatValid)}
          className="mt-4 w-full py-3 bg-[#C5B358] hover:bg-[#b8a64e] text-black rounded-lg font-semibold transition disabled:opacity-50"
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Fee Settings"}
        </button>
        <p className="text-gray-500 text-xs mt-2 text-center">Changes apply to new leads only. Existing leads keep their original fee structure.</p>
      </div>

      {/* Live Preview */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Fee Preview</h2>
        <div className="mb-4">
          <label className="block text-gray-400 text-sm mb-1">Example Lead Rate ($)</label>
          <input
            type="number"
            step="1"
            min="0"
            value={previewRate}
            onChange={(e) => setPreviewRate(Number(e.target.value))}
            className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#C5B358]/40"
          />
        </div>
        <div className="space-y-3">
          <div className="flex justify-between p-3 bg-[#C5B358]/10 rounded-lg border border-[#C5B358]/20">
            <span className="text-[#C5B358]">WOML Platform Fee</span>
            <span className="text-[#C5B358] font-bold">${preview.totalPlatformFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between p-3 bg-gray-800/50 rounded-lg">
            <span className="text-gray-300">Buyer pays</span>
            <span className="text-white font-medium">${preview.buyerTotal.toFixed(2)} <span className="text-gray-500 text-xs">(${previewRate} + ${preview.buyerFee.toFixed(2)} fee)</span></span>
          </div>
          <div className="flex justify-between p-3 bg-gray-800/50 rounded-lg">
            <span className="text-gray-300">Provider receives</span>
            <span className="text-white font-medium">${preview.providerNet.toFixed(2)} <span className="text-gray-500 text-xs">(${previewRate} - ${preview.providerFee.toFixed(2)} fee)</span></span>
          </div>
        </div>
      </div>

      {/* Payout Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#C5B358]/10 rounded-xl border border-[#C5B358]/20 p-5">
          <div className="text-[#C5B358] text-sm mb-1">Forwarded (Completed)</div>
          <div className="text-2xl font-bold text-[#C5B358]">${completedRevenue.toFixed(2)}</div>
          <div className="text-gray-500 text-xs mt-1">WOML fees earned</div>
        </div>
        <div className="bg-blue-500/10 rounded-xl border border-blue-500/20 p-5">
          <div className="text-blue-400 text-sm mb-1">Held (Awaiting Forward)</div>
          <div className="text-2xl font-bold text-blue-400">
            ${pendingPayouts.reduce((sum, p) => sum + p.totalNet, 0).toFixed(2)}
          </div>
          <div className="text-gray-500 text-xs mt-1">
            to forward to providers ({pendingPayouts.reduce((sum, p) => sum + p.leads.length, 0)} leads)
          </div>
        </div>
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/20 p-5">
          <div className="text-amber-400 text-sm mb-1">Pending (Not Received)</div>
          <div className="text-2xl font-bold text-amber-400">${pendingRevenue.toFixed(2)}</div>
          <div className="text-gray-500 text-xs mt-1">buyers haven&apos;t paid yet</div>
        </div>
      </div>

      {/* Pending Payouts by Provider */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Pending Provider Payouts ({pendingPayouts.length} providers)
        </h2>
        {pendingPayouts.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No payouts pending. All caught up!</p>
        ) : (
          <div className="space-y-4">
            {pendingPayouts.map((group) => (
              <ProviderPayoutGroup
                key={group.providerId}
                group={group}
                onForwarded={onPayoutForwarded}
              />
            ))}
          </div>
        )}
      </div>

      {/* Venmo Info Card */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-3">Payment Method</h3>
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-6 h-6 text-[#008CFF]" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 3.5c.8 1.3 1.2 2.7 1.2 4.3 0 3.4-2.9 7.8-5.2 10.9H9.2L7 4.6l5-.5.9 7.3c.8-1.3 1.8-3.4 1.8-4.8 0-1-.2-1.7-.4-2.3l5.2-1z"/></svg>
            <div>
              <div className="text-white font-medium">Venmo @womleads</div>
              <div className="text-gray-400 text-sm">All payments processed via Venmo</div>
            </div>
          </div>
          <p className="text-gray-500 text-xs">Buyers pay WOML via Venmo. WOML forwards provider payouts via Venmo.</p>
        </div>
      </div>
    </div>
  );
}

function ProviderPayoutGroup({ group, onForwarded }: { group: PendingPayoutGroup; onForwarded: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [forwarding, setForwarding] = useState(false);

  const handleForwardAll = async () => {
    if (!confirm(`Forward $${group.totalNet.toFixed(2)} to ${group.providerName}? (${group.leads.length} leads)`)) return;
    setForwarding(true);
    try {
      const res = await fetch("/api/admin/forward-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: group.leads.map(l => l.id) }),
      });
      if (res.ok) {
        onForwarded();
      }
    } catch (e) {
      console.error("Forward failed:", e);
    } finally {
      setForwarding(false);
    }
  };

  return (
    <div className="bg-black/50 rounded-lg border border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-900/50" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
            <span className="text-blue-400 font-bold text-sm">{group.providerName.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <div className="text-white font-medium">{group.providerName}</div>
            <div className="text-gray-400 text-sm">
              {group.providerVenmo ? `@${group.providerVenmo}` : group.providerPayoutMethod || "No payout method"}
              {" · "}{group.leads.length} lead{group.leads.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-white">${group.totalNet.toFixed(2)}</span>
          <svg className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-800">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-2 text-gray-500 text-xs">Date</th>
                <th className="text-left px-4 py-2 text-gray-500 text-xs">Business</th>
                <th className="text-left px-4 py-2 text-gray-500 text-xs">Vehicle</th>
                <th className="text-right px-4 py-2 text-gray-500 text-xs">Net</th>
              </tr>
            </thead>
            <tbody>
              {group.leads.map((lead) => (
                <tr key={lead.id} className="border-b border-gray-900">
                  <td className="px-4 py-2 text-gray-400 text-sm">{new Date(lead.submittedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-gray-300 text-sm">{lead.buyerName}</td>
                  <td className="px-4 py-2 text-gray-400 text-sm">{lead.vehicleInfo || "-"}</td>
                  <td className="px-4 py-2 text-right text-white text-sm">${lead.providerNet.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-end gap-3 p-4 bg-gray-900/30">
            {group.providerVenmo && (
              <a
                href={`https://venmo.com/${group.providerVenmo.replace(/^@/, '')}?txn=pay&amount=${group.totalNet.toFixed(2)}&note=${encodeURIComponent(`WOML Payout - ${group.leads.length} lead${group.leads.length !== 1 ? "s" : ""}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-white bg-[#008CFF] hover:bg-[#0074d4] px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 3.5c.8 1.3 1.2 2.7 1.2 4.3 0 3.4-2.9 7.8-5.2 10.9H9.2L7 4.6l5-.5.9 7.3c.8-1.3 1.8-3.4 1.8-4.8 0-1-.2-1.7-.4-2.3l5.2-1z"/></svg>
                Pay ${group.totalNet.toFixed(2)} via Venmo
              </a>
            )}
            <button
              onClick={handleForwardAll}
              disabled={forwarding}
              className="inline-flex items-center gap-1.5 bg-[#C5B358] hover:bg-[#b8a64e] text-black px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {forwarding ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Forwarding...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Mark All Forwarded
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
