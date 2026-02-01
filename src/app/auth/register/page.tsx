"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { LeadBuyer } from "@/lib/auth-types";
import { DISCLAIMERS } from "@/lib/payment-types";

type RegistrationRole = "buyer" | "provider";

// US States for licensing
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

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { registerBuyer, registerProvider, isAuthenticated, currentUser, isLoading } = useAuth();

  const preselectedRole = searchParams.get("role") as RegistrationRole | null;
  const [activeRole, setActiveRole] = useState<RegistrationRole>(preselectedRole || "buyer");

  // Common fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");

  // Buyer-specific fields
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<LeadBuyer["businessType"]>("insurance_agency");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [licensedStates, setLicensedStates] = useState<string[]>([]);
  const [nationalProducerNumber, setNationalProducerNumber] = useState("");
  const [complianceAcknowledged, setComplianceAcknowledged] = useState(false);

  // Provider-specific fields
  const [displayName, setDisplayName] = useState("");
  const [providerPhone, setProviderPhone] = useState("");
  const [location, setLocation] = useState("");

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated && currentUser) {
      if (currentUser.role === "buyer") {
        router.push("/business");
      } else {
        router.push("/provider-dashboard");
      }
    }
  }, [isAuthenticated, currentUser, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate passwords match
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // Validate buyer-specific requirements
    if (activeRole === "buyer") {
      if (licensedStates.length === 0) {
        setError("Please select at least one state where you are licensed");
        return;
      }
      if (!complianceAcknowledged) {
        setError("Please acknowledge the per-lead payment terms");
        return;
      }
    }

    setIsSubmitting(true);

    let result;

    if (activeRole === "buyer") {
      result = await registerBuyer({
        email,
        password,
        username,
        businessName,
        businessType,
        phone: buyerPhone,
        licensedStates,
        nationalProducerNumber: nationalProducerNumber || undefined,
        complianceAcknowledged,
      });
    } else {
      result = await registerProvider({
        email,
        password,
        username,
        displayName,
        phone: providerPhone || undefined,
        location: location || undefined,
      });
    }

    if (result.success) {
      // Registration successful - redirect to dashboard
      const targetUrl = activeRole === "buyer" ? "/business" : "/provider-dashboard";
      // Use window.location for reliable navigation
      window.location.href = targetUrl;
    } else {
      setError(result.error || "Registration failed. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 relative">
      {/* Watermark Logo Background */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <Image
          src="/woml-logo.png"
          alt=""
          width={500}
          height={500}
          className="opacity-[0.03] select-none"
          priority
        />
      </div>

      <div className="relative z-10 bg-white p-8 rounded-2xl border border-gray-200 max-w-lg w-full shadow-lg">
        <div className="text-center mb-6">
          <Link href="/" className="inline-block">
            <Image
              src="/woml-logo.png"
              alt="WOML - Word of Mouth Leads"
              width={260}
              height={75}
              className="mx-auto mb-4 h-18 w-auto object-contain"
            />
          </Link>
          <h1 className="text-2xl font-bold text-[#1e3a5f] mb-2">Create Account</h1>
          <p className="text-gray-500">Join the WOML marketplace</p>
        </div>

        {/* Role Tabs */}
        <div className="flex mb-6 bg-gray-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveRole("buyer")}
            className={`flex-1 py-3 px-4 rounded-md font-medium transition ${
              activeRole === "buyer"
                ? "bg-white text-[#1e3a5f] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <div className="text-xs uppercase tracking-wide opacity-70">I Buy Leads</div>
            <div className="font-semibold">Business Owner</div>
          </button>
          <button
            type="button"
            onClick={() => setActiveRole("provider")}
            className={`flex-1 py-3 px-4 rounded-md font-medium transition ${
              activeRole === "provider"
                ? "bg-white text-[#1e3a5f] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <div className="text-xs uppercase tracking-wide opacity-70">I Submit Leads</div>
            <div className="font-semibold">Lead Provider</div>
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Common Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition"
                placeholder="johndoe"
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition"
                placeholder="you@example.com"
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Role-Specific Fields */}
          {activeRole === "buyer" ? (
            <>
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  Business Name
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition"
                  placeholder="Acme Insurance Agency"
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Business Type
                  </label>
                  <select
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value as LeadBuyer["businessType"])}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition bg-white"
                    required
                    disabled={isSubmitting}
                  >
                    <option value="insurance_agency">Insurance Agency</option>
                    <option value="dealership">Dealership</option>
                    <option value="broker">Broker</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition"
                    placeholder="(555) 123-4567"
                    required
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* Licensed States - Required for Insurance */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  Licensed States <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Select all states where you hold valid insurance licenses. You will only receive leads from these states.
                </p>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {US_STATES.map((state) => (
                      <label key={state.value} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded">
                        <input
                          type="checkbox"
                          checked={licensedStates.includes(state.value)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setLicensedStates([...licensedStates, state.value]);
                            } else {
                              setLicensedStates(licensedStates.filter(s => s !== state.value));
                            }
                          }}
                          disabled={isSubmitting}
                          className="w-4 h-4 text-[#1e3a5f] rounded"
                        />
                        <span className="text-sm text-gray-700">{state.value}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {licensedStates.length > 0 && (
                  <p className="text-xs text-emerald-600 mt-2">
                    Selected: {licensedStates.join(", ")} ({licensedStates.length} state{licensedStates.length > 1 ? "s" : ""})
                  </p>
                )}
              </div>

              {/* National Producer Number (Optional) */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  National Producer Number (NPN) <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={nationalProducerNumber}
                  onChange={(e) => setNationalProducerNumber(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition"
                  placeholder="e.g., 12345678"
                  disabled={isSubmitting}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Your NPN can be found on your state insurance license or at nipr.com
                </p>
              </div>

              {/* Compliance Acknowledgment */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="font-medium text-amber-800 mb-2">Per-Lead Payment Agreement</h4>
                <p className="text-xs text-amber-700 mb-3">
                  {DISCLAIMERS.perLeadPaymentNotice}
                </p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={complianceAcknowledged}
                    onChange={(e) => setComplianceAcknowledged(e.target.checked)}
                    disabled={isSubmitting}
                    className="w-5 h-5 mt-0.5 text-[#1e3a5f] rounded"
                  />
                  <span className="text-sm text-amber-800">
                    I understand and agree that lead providers are paid <strong>per qualified lead submitted</strong>, not per customer conversion or policy sale. I acknowledge this payment structure ensures fair market competition.
                  </span>
                </label>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition"
                  placeholder="John Doe"
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Phone <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={providerPhone}
                    onChange={(e) => setProviderPhone(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition"
                    placeholder="(555) 123-4567"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Location <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition"
                    placeholder="Philadelphia, PA"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </>
          )}

          {/* Password Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition"
                placeholder="Min. 8 characters"
                required
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition"
                placeholder="Confirm password"
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Password must be at least 8 characters with at least one letter and one number.
          </p>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Creating Account...
              </>
            ) : (
              `Create ${activeRole === "buyer" ? "Business" : "Provider"} Account`
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-500 text-sm">
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="text-[#1e3a5f] hover:underline font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-[#1e3a5f] transition"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RegisterContent />
    </Suspense>
  );
}
