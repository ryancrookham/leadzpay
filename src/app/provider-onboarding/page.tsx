"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

interface TokenData {
  valid: boolean;
  businessName: string;
  channelName?: string;
  channelDescription?: string;
  ratePerLead: number;
  paymentTiming: string;
  weeklyLeadCap: number | null;
  monthlyLeadCap: number | null;
  terminationNoticeDays: number;
  criteria: {
    id: string;
    payout_per_lead: number;
    weekly_cap: number | null;
    monthly_cap: number | null;
    payment_timing: string | null;
    termination_notice_days: number | null;
  } | null;
  criteriaFields: {
    id: string;
    field_type: "PHOTO" | "TEXT" | "BINARY";
    label: string;
    option_a: string | null;
    option_b: string | null;
    is_mandatory: boolean;
    sort_order: number;
  }[];
  error?: string;
}

const STEPS = [
  { num: 1, label: "Deal Terms" },
  { num: 2, label: "Lead Requirements" },
  { num: 3, label: "Create Profile" },
  { num: 4, label: "Bank Account" },
];

function ProviderOnboardingContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get("token");
  const stripeParam = searchParams.get("stripe");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mode: "token" (unauthenticated, steps 1-4) or "resume" (authenticated, step 4)
  const [mode, setMode] = useState<"loading" | "token" | "resume" | "error">("loading");
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Step tracking (1-4)
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1 state
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Step 2 state
  const [criteriaAcknowledged, setCriteriaAcknowledged] = useState(false);

  // Step 3 state
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");

  // Step 4 state
  const [stripeLoading, setStripeLoading] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  // Validate token on mount (Mode A: token-based)
  useEffect(() => {
    if (tokenParam) {
      fetch(`/api/invite-tokens/${tokenParam}`)
        .then(r => r.json())
        .then((data: TokenData) => {
          if (data.valid) {
            setTokenData(data);
            setMode("token");
          } else {
            setErrorMessage(data.error || "This invite link is invalid or has expired.");
            setMode("error");
          }
        })
        .catch(() => {
          setErrorMessage("Failed to validate invite link. Please try again.");
          setMode("error");
        });
      return;
    }

    // Mode B: authenticated resume (no token)
    if (status === "authenticated") {
      if (session?.user?.role !== "provider") {
        router.push("/");
        return;
      }
      if (session?.user?.onboardingComplete) {
        router.push("/provider-dashboard");
        return;
      }
      // Fetch onboarding state and resume at the right step
      fetch("/api/provider-onboarding")
        .then(r => r.json())
        .then(data => {
          if (data.complete) {
            router.push("/provider-dashboard");
            return;
          }
          setCurrentStep(data.step || 4);
          setMode("resume");
        })
        .catch(() => {
          setErrorMessage("Failed to load onboarding state.");
          setMode("error");
        });
    } else if (status === "unauthenticated" && !tokenParam) {
      router.push("/auth/register");
    }
  }, [tokenParam, status, session, router]);

  // Handle Stripe return
  useEffect(() => {
    if ((stripeParam === "success" || stripeParam === "pending") && mode === "resume") {
      const completeStripe = async () => {
        setAdvancing(true);
        try {
          const res = await fetch("/api/provider-onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "complete_stripe" }),
          });
          const data = await res.json();
          if (data.complete) {
            router.push("/provider-dashboard");
          }
        } catch {
          // Silent — user can retry
        } finally {
          setAdvancing(false);
        }
      };
      completeStripe();
    }
  }, [stripeParam, mode, router]);

  const formatTiming = (timing: string) => {
    switch (timing) {
      case "per_lead":
      case "immediate": return "Per Lead";
      case "weekly": return "Weekly";
      case "biweekly": return "Bi-Weekly";
      case "monthly": return "Monthly";
      default: return timing;
    }
  };

  const compressImage = useCallback((file: File): Promise<string> => {
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
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.onerror = reject;
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setRegisterError("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { setRegisterError("Image must be less than 5MB"); return; }
    try {
      const compressed = await compressImage(file);
      setProfilePicture(compressed);
      setRegisterError("");
    } catch {
      setRegisterError("Failed to process image");
    }
  };

  const handleRegister = async () => {
    setRegisterError("");
    if (!username.trim()) { setRegisterError("Username is required"); return; }
    if (!email.trim()) { setRegisterError("Email is required"); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { setRegisterError("Please enter a valid email address"); return; }
    if (!displayName.trim()) { setRegisterError("Display name is required"); return; }
    if (!password) { setRegisterError("Password is required"); return; }
    if (password.length < 8) { setRegisterError("Password must be at least 8 characters"); return; }
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) { setRegisterError("Password must contain at least one letter and one number"); return; }
    if (password !== confirmPassword) { setRegisterError("Passwords do not match"); return; }

    setRegistering(true);
    try {
      // Register user with invite token
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          password,
          username,
          role: "provider",
          displayName,
          phone: phone || undefined,
          location: location || undefined,
          profilePictureUrl: profilePicture || undefined,
          inviteToken: tokenParam,
        }),
      });
      const result = await res.json();

      if (!result.success) {
        setRegisterError(result.error || "Registration failed. Please try again.");
        setRegistering(false);
        return;
      }

      // Auto sign-in
      const signInResult = await signIn("credentials", {
        email: email.toLowerCase().trim(),
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        // Registration succeeded but auto-login failed
        router.push("/auth/login?registered=true");
        return;
      }

      // Advance to step 4 (Stripe)
      setCurrentStep(4);
      setMode("resume");
    } catch (err) {
      console.error("Registration error:", err);
      setRegisterError("Registration failed. Please try again.");
      setRegistering(false);
    }
  };

  const handleStripeConnect = async () => {
    setStripeLoading(true);
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" });
      const data = await res.json();
      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      } else if (data.status === "connected") {
        // Already connected, complete onboarding
        const completeRes = await fetch("/api/provider-onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete_stripe" }),
        });
        const completeData = await completeRes.json();
        if (completeData.complete) {
          router.push("/provider-dashboard");
        }
      } else {
        alert(data.error || "Failed to start Stripe setup");
      }
    } catch {
      alert("Failed to connect to Stripe");
    } finally {
      setStripeLoading(false);
    }
  };


  // Loading state
  if (mode === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8822A]"></div>
      </div>
    );
  }

  // Error state
  if (mode === "error") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl border border-gray-200 max-w-md w-full shadow-lg text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Invalid Invite Link</h2>
          <p className="text-gray-500 mb-6">{errorMessage}</p>
          <Link href="/" className="text-[#E8822A] hover:underline font-medium">Go to Home</Link>
        </div>
      </div>
    );
  }

  // Determine the effective step for display
  const displayStep = mode === "resume" ? currentStep : currentStep;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/">
            <Image
              src="/woml-v3.png"
              alt="WOML"
              width={200}
              height={60}
              className="mx-auto mb-4 h-14 w-auto object-contain"
            />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to WOMLeads</h1>
          {tokenData && (
            <p className="text-gray-500 mt-1">
              Join <span className="font-semibold text-gray-700">{tokenData.businessName}</span>&apos;s provider network
            </p>
          )}
          {mode === "resume" && (
            <p className="text-gray-500 mt-1">Complete setup to start submitting leads</p>
          )}
        </div>

        {/* Step Progress Bar */}
        <div className="flex items-center justify-between mb-10 px-4">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                  displayStep > s.num ? "bg-green-500 border-green-500 text-white" :
                  displayStep === s.num ? "bg-[#E8822A] border-[#E8822A] text-white" :
                  "bg-white border-gray-300 text-gray-400"
                }`}>
                  {displayStep > s.num ? "\u2713" : s.num}
                </div>
                <span className={`text-xs mt-1 ${displayStep >= s.num ? "text-gray-700 font-medium" : "text-gray-400"}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-12 md:w-20 h-0.5 mx-1 ${displayStep > s.num ? "bg-green-500" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">

          {/* Step 1: Deal Terms */}
          {displayStep === 1 && tokenData && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">What You Get</h2>
              <p className="text-gray-500 text-sm mb-6">Review the deal terms for this partnership.</p>

              <div className="rounded-xl border border-gray-200 overflow-hidden mb-6">
                <div className="bg-[#E8822A]/5 border-b border-gray-200 px-5 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Deal Terms</p>
                </div>
                <div className="divide-y divide-gray-100">
                  <div className="flex justify-between items-center px-5 py-3">
                    <span className="text-sm text-gray-600">Business</span>
                    <span className="text-sm font-semibold text-gray-800">{tokenData.businessName}</span>
                  </div>
                  <div className="flex justify-between items-center px-5 py-3">
                    <span className="text-sm text-gray-600">Rate per Lead</span>
                    <span className="text-lg font-bold text-[#E8822A]">${Number(tokenData.ratePerLead).toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between items-center px-5 py-3">
                    <span className="text-sm text-gray-600">Payment Timing</span>
                    <span className="text-sm font-semibold text-gray-800">
                      {formatTiming(tokenData.criteria?.payment_timing || tokenData.paymentTiming)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center px-5 py-3">
                    <span className="text-sm text-gray-600">Weekly Lead Cap</span>
                    <span className="text-sm font-semibold text-gray-800">
                      {tokenData.weeklyLeadCap ? `${tokenData.weeklyLeadCap} leads/week` : "Unlimited"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center px-5 py-3">
                    <span className="text-sm text-gray-600">Monthly Lead Cap</span>
                    <span className="text-sm font-semibold text-gray-800">
                      {tokenData.monthlyLeadCap ? `${tokenData.monthlyLeadCap} leads/month` : "Unlimited"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center px-5 py-3">
                    <span className="text-sm text-gray-600">Termination Notice</span>
                    <span className="text-sm font-semibold text-gray-800">
                      {tokenData.terminationNoticeDays === 0 ? "Anytime" : `${tokenData.terminationNoticeDays} days`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-6">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="rounded w-5 h-5 text-[#E8822A] mt-0.5 flex-shrink-0"
                  />
                  <span className="text-sm text-gray-700 font-medium">
                    I accept these terms and the{' '}
                    <a
                      href="/WOML_Provider_Agreement.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-500 underline hover:text-orange-600 font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      WOML Provider Agreement ↗
                    </a>
                  </span>
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => router.push("/")}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium transition hover:bg-gray-50"
                >
                  Decline
                </button>
                <button
                  onClick={() => setCurrentStep(2)}
                  disabled={!termsAccepted}
                  className="flex-1 py-3 bg-[#E8822A] text-white rounded-lg font-semibold hover:bg-[#d4751f] transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  Accept Terms & Continue
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Lead Criteria Preview */}
          {displayStep === 2 && tokenData && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">What You Need to Submit</h2>
              <p className="text-gray-500 text-sm mb-6">Every lead you submit must include all Required fields.</p>

              {tokenData.criteriaFields.length === 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6 text-center">
                  <p className="text-gray-500 text-sm">No custom field requirements for this business.</p>
                  <p className="text-gray-400 text-xs mt-1">Standard contact info will be collected with each lead.</p>
                </div>
              ) : (
                <div className="space-y-3 mb-6">
                  {tokenData.criteriaFields.map(f => (
                    <div key={f.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      {f.field_type === "PHOTO" && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          </svg>
                          PHOTO
                        </span>
                      )}
                      {f.field_type === "TEXT" && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">TEXT</span>
                      )}
                      {f.field_type === "BINARY" && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">CHOICE</span>
                      )}
                      <span className="text-gray-800 text-sm flex-1">{f.label}</span>
                      {f.field_type === "BINARY" && (
                        <span className="text-gray-400 text-xs">({f.option_a} / {f.option_b})</span>
                      )}
                      {f.is_mandatory ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">Required</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Optional</span>
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
                <span className="text-sm text-gray-700 font-medium">I understand what is required</span>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium transition hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                  </svg>
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(3)}
                  disabled={!criteriaAcknowledged}
                  className="flex-1 py-3 bg-[#E8822A] text-white rounded-lg font-semibold hover:bg-[#d4751f] transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  Understood — Continue
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Create Profile (Registration) */}
          {displayStep === 3 && tokenData && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Create Your Profile</h2>
              <p className="text-gray-500 text-sm mb-6">Set up your account to start submitting leads.</p>

              {registerError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{registerError}</div>
              )}

              <div className="space-y-4">
                {/* Profile Picture */}
                <div className="flex flex-col items-center mb-2">
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden hover:border-[#E8822A] transition group"
                  >
                    {profilePicture ? (
                      <img src={profilePicture} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-6 h-6 text-gray-400 group-hover:text-[#E8822A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                  <p className="text-xs text-gray-400 mt-1">{profilePicture ? "Click to change" : "Photo (optional)"}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                    <input
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="johndoe"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30 focus:border-[#E8822A]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30 focus:border-[#E8822A]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Name *</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30 focus:border-[#E8822A]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-gray-400">(optional)</span></label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30 focus:border-[#E8822A]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location <span className="text-gray-400">(optional)</span></label>
                    <input
                      type="text"
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      placeholder="Philadelphia, PA"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30 focus:border-[#E8822A]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30 focus:border-[#E8822A]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30 focus:border-[#E8822A]"
                    />
                  </div>
                </div>

                <p className="text-xs text-gray-400">Must be 8+ characters with at least one letter and one number.</p>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setCurrentStep(2)}
                  disabled={registering}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium transition hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                  </svg>
                  Back
                </button>
                <button
                  onClick={handleRegister}
                  disabled={registering}
                  className="flex-1 py-3 bg-[#E8822A] text-white rounded-lg font-semibold hover:bg-[#d4751f] transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {registering ? (
                    <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>Creating Account...</>
                  ) : (
                    "Create Account & Continue"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Bank Account (Stripe Connect) */}
          {displayStep === 4 && (
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
                className="w-full py-3 bg-[#635BFF] text-white rounded-lg font-semibold hover:bg-[#524AE8] transition disabled:opacity-50 mb-3 flex items-center justify-center gap-2"
              >
                {stripeLoading ? (
                  <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>Connecting...</>
                ) : (
                  "Connect with Stripe"
                )}
              </button>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProviderOnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8822A]"></div>
      </div>
    }>
      <ProviderOnboardingContent />
    </Suspense>
  );
}
