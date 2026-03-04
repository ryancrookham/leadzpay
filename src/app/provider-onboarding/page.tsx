"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface OnboardingState {
  step: number;
  complete: boolean;
  connection: {
    id: string;
    buyerId: string;
    ratePerLead: number;
    weeklyCap: number | null;
    monthlyCap: number | null;
  } | null;
  criteria: {
    id: string;
    payout_per_lead: number;
    weekly_cap: number | null;
    monthly_cap: number | null;
  } | null;
  fields: {
    id: string;
    field_type: "PHOTO" | "TEXT" | "BINARY";
    label: string;
    option_a: string | null;
    option_b: string | null;
    is_mandatory: boolean;
    sort_order: number;
  }[];
  profile: {
    displayName: string | null;
    phone: string | null;
    location: string | null;
    profilePictureUrl: string | null;
  } | null;
}

const STEPS = [
  { num: 1, label: "Deal Terms" },
  { num: 2, label: "Lead Requirements" },
  { num: 3, label: "Your Profile" },
  { num: 4, label: "Bank Account" },
];

export default function ProviderOnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);

  // Step 1 state
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Step 2 state
  const [criteriaAcknowledged, setCriteriaAcknowledged] = useState(false);

  // Step 3 state
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);

  // Step 4 state
  const [stripeLoading, setStripeLoading] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/provider-onboarding");
      const data = await res.json();
      if (data.complete) {
        router.push("/provider-dashboard");
        return;
      }
      setState(data);
      // Pre-fill profile fields
      if (data.profile) {
        setDisplayName(data.profile.displayName || "");
        setPhone(data.profile.phone || "");
        setLocation(data.profile.location || "");
        setProfilePicture(data.profile.profilePictureUrl || null);
      }
    } catch {
      // handle error silently
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      if (session?.user?.role !== "provider") {
        router.push("/");
        return;
      }
      if (session?.user?.onboardingComplete) {
        router.push("/provider-dashboard");
        return;
      }
      fetchState();
    }
  }, [status, session, router, fetchState]);

  const advanceStep = async (action: string, extra?: Record<string, unknown>) => {
    setAdvancing(true);
    try {
      const res = await fetch("/api/provider-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (data.complete) {
        router.push("/provider-dashboard");
        return;
      }
      if (data.error) {
        alert(data.error);
      } else {
        await fetchState();
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setAdvancing(false);
    }
  };

  const handleProfilePictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be less than 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProfilePicture(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleStripeConnect = async () => {
    setStripeLoading(true);
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" });
      const data = await res.json();
      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      } else if (data.status === "connected") {
        await advanceStep("complete_stripe");
      } else {
        alert(data.error || "Failed to start Stripe setup");
      }
    } catch {
      alert("Failed to connect to Stripe");
    } finally {
      setStripeLoading(false);
    }
  };

  if (loading || status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-red-500">Failed to load onboarding state</div>
      </div>
    );
  }

  const currentStep = state.step;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Welcome to WOMLeads</h1>
          <p className="text-gray-500 mt-1">Complete these steps to start submitting leads</p>
        </div>

        {/* Step Progress Bar */}
        <div className="flex items-center justify-between mb-10 px-4">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                  currentStep > s.num ? "bg-green-500 border-green-500 text-white" :
                  currentStep === s.num ? "bg-[#E8822A] border-[#E8822A] text-white" :
                  "bg-white border-gray-300 text-gray-400"
                }`}>
                  {currentStep > s.num ? "\u2713" : s.num}
                </div>
                <span className={`text-xs mt-1 ${currentStep >= s.num ? "text-gray-700 font-medium" : "text-gray-400"}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-12 md:w-20 h-0.5 mx-1 ${currentStep > s.num ? "bg-green-500" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          {/* Step 1: Deal Terms */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">What You Get</h2>
              <p className="text-gray-500 text-sm mb-6">Review the deal terms for this partnership.</p>

              <div className="bg-gray-50 rounded-lg p-5 mb-6 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Payout Per Lead</span>
                  <span className="text-lg font-bold text-[#E8822A]">
                    ${state.criteria ? Number(state.criteria.payout_per_lead).toFixed(2) : state.connection ? state.connection.ratePerLead.toFixed(2) : "—"}
                  </span>
                </div>
                {(state.criteria?.weekly_cap || state.connection?.weeklyCap) && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Weekly Lead Cap</span>
                    <span className="font-semibold text-gray-800">{state.criteria?.weekly_cap ?? state.connection?.weeklyCap}</span>
                  </div>
                )}
                {(state.criteria?.monthly_cap || state.connection?.monthlyCap) && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Monthly Lead Cap</span>
                    <span className="font-semibold text-gray-800">{state.criteria?.monthly_cap ?? state.connection?.monthlyCap}</span>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-800">
                <p className="font-semibold mb-2">Terms & Conditions</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700">
                  <li>You will be paid the rate above for each qualified lead you submit.</li>
                  <li>Leads must contain accurate, real customer information.</li>
                  <li>Submitting duplicate or fraudulent leads may result in account termination.</li>
                  <li>Payout rates may be updated by the business at any time for future submissions.</li>
                </ul>
              </div>

              <label className="flex items-center gap-3 cursor-pointer mb-6">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)}
                  className="rounded w-5 h-5 text-[#E8822A]"
                />
                <span className="text-sm text-gray-700 font-medium">I accept these terms and conditions</span>
              </label>

              <button
                onClick={() => advanceStep("accept_terms")}
                disabled={!termsAccepted || advancing}
                className="w-full py-3 bg-[#E8822A] text-white rounded-lg font-semibold hover:bg-[#d4751f] transition disabled:opacity-50"
              >
                {advancing ? "Processing..." : "Continue"}
              </button>
            </div>
          )}

          {/* Step 2: Lead Requirements */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">What You Need to Submit</h2>
              <p className="text-gray-500 text-sm mb-6">Review the information you will need to provide with each lead.</p>

              {state.fields.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-800">
                  Your business partner is still configuring lead requirements. You can continue — requirements will be shown when you submit leads.
                </div>
              ) : (
                <div className="space-y-3 mb-6">
                  {state.fields.map(f => (
                    <div key={f.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        f.field_type === "PHOTO" ? "bg-purple-100 text-purple-700" :
                        f.field_type === "TEXT" ? "bg-blue-100 text-blue-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>{f.field_type}</span>
                      <span className="text-gray-800 text-sm flex-1">{f.label}</span>
                      {f.field_type === "BINARY" && <span className="text-gray-400 text-xs">({f.option_a} / {f.option_b})</span>}
                      {f.is_mandatory ? (
                        <span className="text-red-500 text-xs font-medium">Required</span>
                      ) : (
                        <span className="text-gray-400 text-xs">Optional</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <label className="flex items-center gap-3 cursor-pointer mb-6">
                <input
                  type="checkbox"
                  checked={criteriaAcknowledged}
                  onChange={e => setCriteriaAcknowledged(e.target.checked)}
                  className="rounded w-5 h-5 text-[#E8822A]"
                />
                <span className="text-sm text-gray-700 font-medium">I understand what is required for each lead</span>
              </label>

              <button
                onClick={() => advanceStep("acknowledge_criteria")}
                disabled={!criteriaAcknowledged || advancing}
                className="w-full py-3 bg-[#E8822A] text-white rounded-lg font-semibold hover:bg-[#d4751f] transition disabled:opacity-50"
              >
                {advancing ? "Processing..." : "Continue"}
              </button>
            </div>
          )}

          {/* Step 3: Profile */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Create Your Profile</h2>
              <p className="text-gray-500 text-sm mb-6">Set up your profile so businesses know who you are.</p>

              <div className="space-y-4 mb-6">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden mb-2">
                    {profilePicture ? (
                      <img src={profilePicture} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-gray-400 text-2xl">?</span>
                    )}
                  </div>
                  <label className="text-sm text-[#E8822A] font-medium cursor-pointer hover:underline">
                    Upload Photo
                    <input type="file" accept="image/*" onChange={handleProfilePictureUpload} className="hidden" />
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Name *</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                  <input
                    type="text"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="City, State"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30"
                  />
                </div>
              </div>

              <button
                onClick={() => advanceStep("update_profile", {
                  displayName,
                  phone,
                  location,
                  profilePictureUrl: profilePicture,
                })}
                disabled={!displayName || !phone || !location || advancing}
                className="w-full py-3 bg-[#E8822A] text-white rounded-lg font-semibold hover:bg-[#d4751f] transition disabled:opacity-50"
              >
                {advancing ? "Saving..." : "Save & Continue"}
              </button>
            </div>
          )}

          {/* Step 4: Bank Account */}
          {currentStep === 4 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Connect Your Bank Account</h2>
              <p className="text-gray-500 text-sm mb-6">Set up your payment method to receive lead payouts.</p>

              <div className="bg-gray-50 rounded-lg p-6 mb-6 text-center">
                <div className="text-4xl mb-3">&#127974;</div>
                <p className="text-gray-700 font-medium mb-2">Secure payments via Stripe</p>
                <p className="text-gray-500 text-sm">We use Stripe to securely process payments directly to your bank account.</p>
              </div>

              <button
                onClick={handleStripeConnect}
                disabled={stripeLoading}
                className="w-full py-3 bg-[#635BFF] text-white rounded-lg font-semibold hover:bg-[#524AE8] transition disabled:opacity-50 mb-3"
              >
                {stripeLoading ? "Connecting..." : "Connect with Stripe"}
              </button>

              <button
                onClick={() => advanceStep("skip_stripe")}
                disabled={advancing}
                className="w-full py-3 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition disabled:opacity-50"
              >
                {advancing ? "Processing..." : "Skip for Now (Coming Soon)"}
              </button>
              <p className="text-gray-400 text-xs text-center mt-2">You can always connect your bank account later from your dashboard settings.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
