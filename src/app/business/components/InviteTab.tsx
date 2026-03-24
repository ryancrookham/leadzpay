"use client";

import { useState, useCallback } from "react";

export interface InviteToken {
  id: string;
  token: string;
  label: string | null;
  channel_name: string | null;
  channel_description: string | null;
  is_active: boolean;
  use_count: number;
  max_uses: number | null;
  expires_at: string | null;
  rate_per_lead: number;
  payment_timing: string;
  weekly_lead_cap: number | null;
  monthly_lead_cap: number | null;
  termination_notice_days: number;
  created_at: string;
}

interface CriteriaField {
  fieldType: "PHOTO" | "TEXT" | "BINARY";
  label: string;
  optionA?: string;
  optionB?: string;
  isMandatory: boolean;
  sortOrder: number;
}

export interface SavedCriteria {
  id: string;
  payout_per_lead: number;
  weekly_cap: number | null;
  monthly_cap: number | null;
  payment_timing: string | null;
  termination_notice_days: number | null;
  is_active: boolean;
}

export interface SavedField {
  id: string;
  field_type: "PHOTO" | "TEXT" | "BINARY";
  label: string;
  option_a: string | null;
  option_b: string | null;
  is_mandatory: boolean;
  sort_order: number;
}

interface InviteTabProps {
  businessName: string;
  initialTokens: InviteToken[];
  initialCriteria: SavedCriteria | null;
  initialFields: SavedField[];
  defaultPaymentMode?: string; // From Settings — pre-fills new deal payment mode
}

const BASE_URL = "https://www.womleads.com";

export default function InviteTab({ businessName, initialTokens, initialCriteria, initialFields, defaultPaymentMode }: InviteTabProps) {
  const [tokens, setTokens] = useState<InviteToken[]>(initialTokens);
  const [dataLoaded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Criteria state
  const [savedCriteria, setSavedCriteria] = useState<SavedCriteria | null>(initialCriteria);
  const [savedFields, setSavedFields] = useState<SavedField[]>(initialFields);
  const [criteriaEditing, setCriteriaEditing] = useState(false);
  const [criteriaSaving, setCriteriaSaving] = useState(false);
  const [criteriaPayoutPerLead, setCriteriaPayoutPerLead] = useState(50);
  const [criteriaEnableWeeklyCap, setCriteriaEnableWeeklyCap] = useState(false);
  const [criteriaWeeklyCap, setCriteriaWeeklyCap] = useState(20);
  const [criteriaEnableMonthlyCap, setCriteriaEnableMonthlyCap] = useState(false);
  const [criteriaMonthlyCap, setCriteriaMonthlyCap] = useState(80);
  const [criteriaPaymentTiming, setCriteriaPaymentTiming] = useState<"instant" | "manual" | "scheduled">("instant");
  const [criteriaScheduledCadence, setCriteriaScheduledCadence] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [criteriaTerminationDays, setCriteriaTerminationDays] = useState(7);
  const [criteriaFields, setCriteriaFields] = useState<CriteriaField[]>([]);
  const [terminateConfirm, setTerminateConfirm] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);

  // Generate form state
  const [label, setLabel] = useState("");
  const [enableExpiry, setEnableExpiry] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");
  const [enableMaxUses, setEnableMaxUses] = useState(false);
  const [maxUses, setMaxUses] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newInviteUrl, setNewInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // SMS panel state
  const [smsPhone, setSmsPhone] = useState("");
  const [smsProviderName, setSmsProviderName] = useState("");
  const [smsTokenId, setSmsTokenId] = useState<string>("");
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsResult, setSmsResult] = useState<{ success: boolean; message: string } | null>(null);

  // Consent modal state
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [smsConsentChecked, setSmsConsentChecked] = useState(false);

  const fetchTokens = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/invite-tokens");
      const data = await res.json();
      if (data.tokens) {
        setTokens(data.tokens);
        // Default SMS token to first active token
        const firstActive = data.tokens.find((t: InviteToken) => t.is_active);
        if (firstActive && !smsTokenId) setSmsTokenId(firstActive.id);
      } else {
        setError(data.error || "Failed to load invite links");
      }
    } catch {
      setError("Failed to load invite links");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCriteria = useCallback(async () => {
    try {
      const res = await fetch("/api/business-criteria");
      const data = await res.json();
      if (data.criteria) {
        setSavedCriteria(data.criteria);
        setSavedFields(data.fields || []);
      } else {
        setSavedCriteria(null);
        setSavedFields([]);
      }
    } catch {
      // silently fail
    }
  }, []);

  const startEditCriteria = () => {
    if (savedCriteria) {
      setCriteriaPayoutPerLead(Number(savedCriteria.payout_per_lead));
      setCriteriaEnableWeeklyCap(!!savedCriteria.weekly_cap);
      setCriteriaWeeklyCap(savedCriteria.weekly_cap || 20);
      setCriteriaEnableMonthlyCap(!!savedCriteria.monthly_cap);
      setCriteriaMonthlyCap(savedCriteria.monthly_cap || 80);
      const pt = savedCriteria.payment_timing || "instant";
      if (pt === "instant" || pt === "manual" || pt === "scheduled") {
        setCriteriaPaymentTiming(pt);
      } else if (pt === "per_lead") {
        setCriteriaPaymentTiming("instant");
      } else if (pt === "weekly" || pt === "biweekly" || pt === "monthly") {
        setCriteriaPaymentTiming("scheduled");
        setCriteriaScheduledCadence(pt as "weekly" | "biweekly" | "monthly");
      } else if (pt.startsWith("scheduled_")) {
        setCriteriaPaymentTiming("scheduled");
        setCriteriaScheduledCadence((pt.replace("scheduled_", "") as "weekly" | "biweekly" | "monthly") || "weekly");
      } else {
        setCriteriaPaymentTiming("instant");
      }
      setCriteriaTerminationDays(savedCriteria.termination_notice_days ?? 7);
      setCriteriaFields(savedFields.map(f => ({
        fieldType: f.field_type,
        label: f.label,
        optionA: f.option_a || undefined,
        optionB: f.option_b || undefined,
        isMandatory: f.is_mandatory,
        sortOrder: f.sort_order,
      })));
    } else {
      // New deal — pre-fill payment mode from Settings default
      setCriteriaPayoutPerLead(50);
      setCriteriaEnableWeeklyCap(false);
      setCriteriaEnableMonthlyCap(false);
      const def = defaultPaymentMode || "instant";
      if (def === "instant" || def === "manual") {
        setCriteriaPaymentTiming(def);
      } else if (def === "weekly" || def === "biweekly" || def === "monthly" || def.startsWith("scheduled_")) {
        setCriteriaPaymentTiming("scheduled");
        const cadence = def.replace("scheduled_", "") as "weekly" | "biweekly" | "monthly";
        setCriteriaScheduledCadence(cadence || "monthly");
      } else {
        setCriteriaPaymentTiming("instant");
      }
      setCriteriaTerminationDays(7);
      setCriteriaFields([]);
    }
    setCriteriaEditing(true);
  };

  const addCriteriaField = (type: "PHOTO" | "TEXT" | "BINARY") => {
    setCriteriaFields(prev => [...prev, {
      fieldType: type,
      label: "",
      optionA: type === "BINARY" ? "Yes" : undefined,
      optionB: type === "BINARY" ? "No" : undefined,
      isMandatory: true,
      sortOrder: prev.length,
    }]);
  };

  const removeCriteriaField = (index: number) => {
    setCriteriaFields(prev => prev.filter((_, i) => i !== index).map((f, i) => ({ ...f, sortOrder: i })));
  };

  const updateCriteriaField = (index: number, updates: Partial<CriteriaField>) => {
    setCriteriaFields(prev => prev.map((f, i) => i === index ? { ...f, ...updates } : f));
  };

  const moveCriteriaField = (index: number, direction: "up" | "down") => {
    if ((direction === "up" && index === 0) || (direction === "down" && index === criteriaFields.length - 1)) return;
    const newFields = [...criteriaFields];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    [newFields[index], newFields[swapIdx]] = [newFields[swapIdx], newFields[index]];
    setCriteriaFields(newFields.map((f, i) => ({ ...f, sortOrder: i })));
  };

  const handleSaveCriteria = async () => {
    if (criteriaPayoutPerLead < 5 || criteriaPayoutPerLead > 500) {
      alert("Payout per lead must be between $5 and $500");
      return;
    }
    for (const f of criteriaFields) {
      if (!f.label.trim()) {
        alert("All fields must have a label");
        return;
      }
    }
    setCriteriaSaving(true);
    try {
      const payload = {
        payoutPerLead: criteriaPayoutPerLead,
        weeklyCap: criteriaEnableWeeklyCap ? criteriaWeeklyCap : null,
        monthlyCap: criteriaEnableMonthlyCap ? criteriaMonthlyCap : null,
        paymentTiming: criteriaPaymentTiming === "scheduled" ? `scheduled_${criteriaScheduledCadence}` : criteriaPaymentTiming,
        terminationNoticeDays: criteriaTerminationDays,
        fields: criteriaFields,
      };

      if (savedCriteria) {
        await fetch(`/api/business-criteria/${savedCriteria.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/business-criteria", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setCriteriaEditing(false);
      await fetchCriteria();
    } catch {
      alert("Failed to save criteria");
    } finally {
      setCriteriaSaving(false);
    }
  };

  const handleTerminateDeal = async () => {
    if (!savedCriteria) return;
    setIsTerminating(true);
    try {
      const res = await fetch(`/api/business-criteria/${savedCriteria.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        alert(`Deal terminated. ${data.connectionsTerminated} connection(s) ended, ${data.payoutsFlagged} pending payout(s) flagged.`);
        setSavedCriteria(null);
        setSavedFields([]);
        setCriteriaEditing(false);
        setTerminateConfirm(false);
        await fetchCriteria();
      }
    } catch {
      alert("Failed to terminate deal");
    } finally {
      setIsTerminating(false);
    }
  };

  const handleGenerate = async () => {
    if (!savedCriteria) return;
    setIsGenerating(true);
    setNewInviteUrl(null);
    try {
      const res = await fetch("/api/invite-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label || null,
          ratePerLead: Number(savedCriteria.payout_per_lead),
          paymentTiming: savedCriteria.payment_timing || "instant",
          weeklyCap: savedCriteria.weekly_cap,
          monthlyCap: savedCriteria.monthly_cap,
          expiresAt: enableExpiry ? new Date(expiryDate).toISOString() : null,
          maxUses: enableMaxUses ? maxUses : null,
          terminationNoticeDays: savedCriteria.termination_notice_days ?? 7,
        }),
      });
      const data = await res.json();
      if (data.inviteUrl) {
        setNewInviteUrl(data.inviteUrl);
        setLabel("");
        setEnableExpiry(false);
        setEnableMaxUses(false);
        await fetchTokens();
      } else {
        alert(data.error || "Failed to generate invite link");
      }
    } catch {
      alert("Failed to generate invite link. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      alert("Copy failed — please copy the URL manually");
    }
  };

  const handleDeactivate = async (tokenId: string) => {
    if (!confirm("Deactivate this invite link? New providers won't be able to use it, but existing connections are unaffected.")) return;
    try {
      await fetch(`/api/invite-tokens/${tokens.find(t => t.id === tokenId)?.token}`, {
        method: "DELETE",
      });
      await fetchTokens();
    } catch {
      alert("Failed to deactivate link");
    }
  };

  const handleReactivate = async (tokenId: string) => {
    try {
      await fetch(`/api/invite-tokens/${tokens.find(t => t.id === tokenId)?.token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      await fetchTokens();
    } catch {
      alert("Failed to reactivate link");
    }
  };

  const handleDeletePermanently = async (tokenId: string) => {
    if (!confirm("Permanently delete this invite link? This cannot be undone.")) return;
    try {
      await fetch(`/api/invite-tokens/${tokens.find(t => t.id === tokenId)?.token}?permanent=true`, {
        method: "DELETE",
      });
      await fetchTokens();
    } catch {
      alert("Failed to delete link");
    }
  };

  const handleOpenConsentModal = () => {
    if (!smsPhone) {
      alert("Please enter a phone number");
      return;
    }
    setSmsResult(null);
    setShowConsentModal(true);
  };

  const handleSendSms = async () => {
    setShowConsentModal(false);
    setSmsConsentChecked(false);
    const selectedToken = tokens.find(t => t.id === smsTokenId);
    setIsSendingSms(true);
    setSmsResult(null);
    try {
      const res = await fetch("/api/invite-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: smsPhone,
          businessName,
          inviteToken: selectedToken?.token || null,
          ratePerLead: selectedToken?.rate_per_lead || null,
          providerName: smsProviderName.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSmsResult({ success: true, message: `Text sent to ${smsPhone}!` });
        setSmsPhone("");
        setSmsProviderName("");
      } else {
        setSmsResult({ success: false, message: data.error || "Failed to send text" });
      }
    } catch {
      setSmsResult({ success: false, message: "Failed to send text. Please try again." });
    } finally {
      setIsSendingSms(false);
    }
  };

  const activeTokens = tokens.filter(t => t.is_active);
  const formatTiming = (t: string) => {
    if (t === "instant" || t === "per_lead") return "Instant";
    if (t === "manual") return "Manual";
    if (t === "scheduled") return "Scheduled";
    if (t === "scheduled_weekly") return "Scheduled · Weekly";
    if (t === "scheduled_biweekly") return "Scheduled · Bi-weekly";
    if (t === "scheduled_monthly") return "Scheduled · Monthly";
    if (t === "weekly") return "Scheduled · Weekly";
    if (t === "biweekly") return "Scheduled · Bi-weekly";
    if (t === "monthly") return "Scheduled · Monthly";
    return t;
  };

  const fieldTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      PHOTO: "bg-purple-100 text-purple-700",
      TEXT: "bg-blue-100 text-blue-700",
      BINARY: "bg-amber-100 text-amber-700",
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[type] || "bg-gray-100 text-gray-600"}`}>{type}</span>;
  };

  if (!dataLoaded) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="bg-gray-200 rounded-xl h-48" />
        <div className="bg-gray-200 rounded-xl h-36" />
        <div className="bg-gray-200 rounded-xl h-24" />
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Lead Criteria Builder */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#E8822A] mb-1">Lead Criteria</h3>
        <p className="text-gray-500 text-sm mb-5">
          Define your deal terms and what information providers must submit with each lead.
        </p>

        {!savedCriteria && !criteriaEditing ? (
          <button
            onClick={startEditCriteria}
            className="px-6 py-2.5 bg-[#E8822A] text-white rounded-lg font-medium hover:bg-[#d4751f] transition"
          >
            Set Up Lead Criteria
          </button>
        ) : criteriaEditing ? (
          <div className="space-y-5">
            {/* Deal Terms */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payout Per Lead ($)</label>
                <input
                  type="number"
                  value={criteriaPayoutPerLead}
                  onChange={e => setCriteriaPayoutPerLead(Number(e.target.value))}
                  min={5} max={500}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                <select
                  value={criteriaPaymentTiming}
                  onChange={e => setCriteriaPaymentTiming(e.target.value as typeof criteriaPaymentTiming)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30"
                >
                  <option value="instant">Instant — paid per lead immediately</option>
                  <option value="manual">Manual — business pays when ready</option>
                  <option value="scheduled">Scheduled — paid on a set cadence</option>
                </select>
                {criteriaPaymentTiming === "scheduled" && (
                  <select
                    value={criteriaScheduledCadence}
                    onChange={e => setCriteriaScheduledCadence(e.target.value as typeof criteriaScheduledCadence)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Termination Notice (days)</label>
                <input
                  type="number"
                  value={criteriaTerminationDays}
                  onChange={e => setCriteriaTerminationDays(Number(e.target.value))}
                  min={0} max={90}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={criteriaEnableWeeklyCap} onChange={e => setCriteriaEnableWeeklyCap(e.target.checked)} className="rounded" />
                  Weekly Cap
                </label>
                {criteriaEnableWeeklyCap && (
                  <input type="number" value={criteriaWeeklyCap} onChange={e => setCriteriaWeeklyCap(Number(e.target.value))} min={1} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={criteriaEnableMonthlyCap} onChange={e => setCriteriaEnableMonthlyCap(e.target.checked)} className="rounded" />
                  Monthly Cap
                </label>
                {criteriaEnableMonthlyCap && (
                  <input type="number" value={criteriaMonthlyCap} onChange={e => setCriteriaMonthlyCap(Number(e.target.value))} min={1} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                )}
              </div>
            </div>

            {/* Dynamic Fields */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-700">Required Fields</label>
                <div className="flex gap-2">
                  <button onClick={() => addCriteriaField("PHOTO")} className="text-xs px-3 py-1 border border-purple-200 text-purple-600 rounded-lg hover:bg-purple-50 transition">+ Photo</button>
                  <button onClick={() => addCriteriaField("TEXT")} className="text-xs px-3 py-1 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition">+ Text</button>
                  <button onClick={() => addCriteriaField("BINARY")} className="text-xs px-3 py-1 border border-amber-200 text-amber-600 rounded-lg hover:bg-amber-50 transition">+ Yes/No</button>
                </div>
              </div>

              {/* Locked default fields — always collected */}
              <div className="space-y-2 mb-3">
                {["Name", "Email", "Phone"].map(label => (
                  <div key={label} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg opacity-60">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Default</span>
                    <span className="flex-1 text-sm text-gray-700">{label}</span>
                    <span className="text-xs text-gray-400">Always required</span>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                ))}
              </div>

              {criteriaFields.length > 0 && (
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Custom Fields</p>
              )}

              {criteriaFields.length === 0 ? (
                <p className="text-gray-400 text-sm italic">No custom fields yet. Add fields above to define what providers must submit.</p>
              ) : (
                <div className="space-y-3">
                  {criteriaFields.map((field, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      {fieldTypeBadge(field.fieldType)}
                      <input
                        type="text"
                        value={field.label}
                        onChange={e => updateCriteriaField(i, { label: e.target.value })}
                        placeholder="Field label (e.g. Driver's License Photo)"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30"
                      />
                      {field.fieldType === "BINARY" && (
                        <>
                          <input
                            type="text"
                            value={field.optionA || ""}
                            onChange={e => updateCriteriaField(i, { optionA: e.target.value })}
                            placeholder="Option A"
                            className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                          />
                          <input
                            type="text"
                            value={field.optionB || ""}
                            onChange={e => updateCriteriaField(i, { optionB: e.target.value })}
                            placeholder="Option B"
                            className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                          />
                        </>
                      )}
                      <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
                        <input type="checkbox" checked={field.isMandatory} onChange={e => updateCriteriaField(i, { isMandatory: e.target.checked })} className="rounded" />
                        Required
                      </label>
                      <button onClick={() => moveCriteriaField(i, "up")} disabled={i === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-sm">&#9650;</button>
                      <button onClick={() => moveCriteriaField(i, "down")} disabled={i === criteriaFields.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-sm">&#9660;</button>
                      <button onClick={() => removeCriteriaField(i)} className="text-red-400 hover:text-red-600 text-sm">&#10005;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSaveCriteria}
                disabled={criteriaSaving}
                className="px-6 py-2.5 bg-[#E8822A] text-white rounded-lg font-medium hover:bg-[#d4751f] transition disabled:opacity-50"
              >
                {criteriaSaving ? "Saving..." : "Save Criteria"}
              </button>
              <button
                onClick={() => setCriteriaEditing(false)}
                className="px-6 py-2.5 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : savedCriteria ? (
          <div className="space-y-4">
            {/* Read-only summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Payout Per Lead</p>
                <p className="text-lg font-bold text-[#E8822A]">${Number(savedCriteria.payout_per_lead).toFixed(2)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Payment Mode</p>
                <p className="text-lg font-bold text-gray-800">{formatTiming(savedCriteria.payment_timing || "instant")}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Termination Notice</p>
                <p className="text-lg font-bold text-gray-800">{savedCriteria.termination_notice_days ?? 0} days</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Weekly Cap</p>
                <p className="text-lg font-bold text-gray-800">{savedCriteria.weekly_cap ?? "None"}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Monthly Cap</p>
                <p className="text-lg font-bold text-gray-800">{savedCriteria.monthly_cap ?? "None"}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Required Fields ({3 + savedFields.length})</p>
              <div className="space-y-2">
                {["Name", "Email", "Phone"].map(label => (
                  <div key={label} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-sm opacity-60">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Default</span>
                    <span className="text-gray-800">{label}</span>
                    <span className="text-gray-400 text-xs">Always required</span>
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                ))}
                {savedFields.map(f => (
                  <div key={f.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-sm">
                    {fieldTypeBadge(f.field_type)}
                    <span className="text-gray-800">{f.label}</span>
                    {f.field_type === "BINARY" && <span className="text-gray-500 text-xs">({f.option_a} / {f.option_b})</span>}
                    {f.is_mandatory && <span className="text-red-500 text-xs font-medium">Required</span>}
                    {!f.is_mandatory && <span className="text-gray-400 text-xs">Optional</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={startEditCriteria}
                className="px-5 py-2 bg-[#E8822A] text-white rounded-lg text-sm font-medium hover:bg-[#d4751f] transition"
              >
                Edit Deal
              </button>
              {!terminateConfirm ? (
                <button
                  onClick={() => setTerminateConfirm(true)}
                  className="px-5 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition"
                >
                  Terminate Deal
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-red-600 text-sm font-medium">Are you sure? This cannot be undone.</span>
                  <button
                    onClick={handleTerminateDeal}
                    disabled={isTerminating}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {isTerminating ? "Terminating..." : "Confirm"}
                  </button>
                  <button
                    onClick={() => setTerminateConfirm(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Generate Invite Link */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#E8822A] mb-1">Generate Invite Link</h3>
        <p className="text-gray-500 text-sm mb-5">
          Create a unique link to invite providers. They'll see your business name and earn rate when they sign up.
        </p>

        {!savedCriteria ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-amber-800 text-sm font-medium">Set your Lead Criteria above before generating invite links.</p>
          </div>
        ) : savedCriteria ? (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Link Label (internal)</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. Facebook Ads Campaign"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30"
              />
            </div>

            {/* Optional constraints */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={enableExpiry} onChange={e => setEnableExpiry(e.target.checked)} className="rounded" />
                  Set Expiry Date
                </label>
                {enableExpiry && (
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={e => setExpiryDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={enableMaxUses} onChange={e => setEnableMaxUses(e.target.checked)} className="rounded" />
                  Limit Max Uses
                </label>
                {enableMaxUses && (
                  <input
                    type="number"
                    value={maxUses}
                    onChange={e => setMaxUses(Number(e.target.value))}
                    min={1}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                )}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-6 py-2.5 bg-[#E8822A] text-white rounded-lg font-medium hover:bg-[#d4751f] transition disabled:opacity-50"
            >
              {isGenerating ? "Generating..." : "Generate Invite Link"}
            </button>
          </>
        ) : null}

        {newInviteUrl && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800 font-semibold text-sm mb-2">Invite link created!</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={newInviteUrl}
                className="flex-1 border border-green-300 rounded-lg px-3 py-2 text-sm bg-white font-mono"
              />
              <button
                onClick={() => handleCopy(newInviteUrl, "new")}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
              >
                {copied === "new" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active Invite Links Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#E8822A] mb-4">Your Invite Links</h3>

        {error ? (
          <p className="text-red-500 text-sm">{error}</p>
        ) : tokens.length === 0 ? (
          <p className="text-gray-400 text-sm">No invite links yet. Generate one above to start inviting providers.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="pb-3 font-medium">Label</th>
                  <th className="pb-3 font-medium">Rate</th>
                  <th className="pb-3 font-medium">Timing</th>
                  <th className="pb-3 font-medium">Uses</th>
                  <th className="pb-3 font-medium">Expires</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map(token => {
                  const inviteUrl = `${BASE_URL}/provider-onboarding?token=${token.token}`;
                  const usesDisplay = token.max_uses !== null
                    ? `${token.use_count}/${token.max_uses}`
                    : `${token.use_count}/∞`;
                  const expiresDisplay = token.expires_at
                    ? new Date(token.expires_at).toLocaleDateString()
                    : "Never";
                  return (
                    <tr key={token.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                      <td className="py-3 pr-4 text-gray-800">{token.label || <span className="text-gray-400 italic">No label</span>}</td>
                      <td className="py-3 pr-4 font-semibold text-[#E8822A]">${Number(token.rate_per_lead).toFixed(0)}/lead</td>
                      <td className="py-3 pr-4 text-gray-600">{formatTiming(token.payment_timing)}</td>
                      <td className="py-3 pr-4 text-gray-600">{usesDisplay}</td>
                      <td className="py-3 pr-4 text-gray-600">{expiresDisplay}</td>
                      <td className="py-3 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${token.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {token.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCopy(inviteUrl, token.id)}
                            className="text-xs px-3 py-1 border border-gray-200 rounded-lg hover:border-[#E8822A] hover:text-[#E8822A] transition"
                          >
                            {copied === token.id ? "Copied!" : "Copy URL"}
                          </button>
                          {token.is_active ? (
                            <button
                              onClick={() => handleDeactivate(token.id)}
                              className="text-xs px-3 py-1 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleReactivate(token.id)}
                                className="text-xs px-3 py-1 border border-green-200 text-green-600 rounded-lg hover:bg-green-50 transition"
                              >
                                Reactivate
                              </button>
                              <button
                                onClick={() => handleDeletePermanently(token.id)}
                                className="text-xs px-3 py-1 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Send SMS Invite */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[#E8822A] mb-1">Send Text Invite</h3>
        <p className="text-gray-500 text-sm mb-5">
          Text a provider their personalized invite link directly.
        </p>

        {activeTokens.length === 0 ? (
          <p className="text-gray-400 text-sm">Generate an active invite link above before sending a text.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider's Phone Number</label>
                <input
                  type="tel"
                  value={smsPhone}
                  onChange={e => setSmsPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider's Name <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={smsProviderName}
                  onChange={e => setSmsProviderName(e.target.value)}
                  placeholder="e.g. Mike"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invite Link to Send</label>
                <select
                  value={smsTokenId}
                  onChange={e => setSmsTokenId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30"
                >
                  {activeTokens.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.label || `$${t.rate_per_lead}/lead`} — ${t.rate_per_lead}/lead
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleOpenConsentModal}
              disabled={isSendingSms || !smsPhone}
              className="px-6 py-2.5 bg-[#E8822A] text-white rounded-lg font-medium hover:bg-[#d4751f] transition disabled:opacity-50"
            >
              {isSendingSms ? "Sending..." : "Send Text Invite"}
            </button>

            {smsResult && (
              <div className={`p-3 rounded-lg text-sm font-medium ${smsResult.success ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {smsResult.message}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Consent Modal */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#E8822A]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#E8822A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Confirm SMS Invite</h3>
                <p className="text-sm text-gray-500 mt-0.5">Review the details before sending</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Sending to</span>
                <span className="font-medium text-gray-800">{smsPhone}</span>
              </div>
              {smsProviderName && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Provider name</span>
                  <span className="font-medium text-gray-800">{smsProviderName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">From</span>
                <span className="font-medium text-gray-800">{businessName} via WOML</span>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={smsConsentChecked}
                onChange={e => setSmsConsentChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-[#E8822A] cursor-pointer flex-shrink-0"
              />
              <span className="text-sm text-gray-700 leading-relaxed">
                I confirm that {smsProviderName ? <strong>{smsProviderName}</strong> : "this person"} has given me prior express consent to receive this text message from WOML LLC. Message and data rates may apply.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowConsentModal(false); setSmsConsentChecked(false); }}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSendSms}
                disabled={!smsConsentChecked}
                className="flex-1 px-4 py-2.5 bg-[#E8822A] text-white rounded-lg font-medium hover:bg-[#d4751f] transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
