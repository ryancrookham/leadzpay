"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";

type PayoutMethod = "venmo" | "paypal" | "cashapp" | "bank";

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { registerProvider, registerBuyer, isAuthenticated, currentUser, isLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const requestedRole = searchParams.get("role");
  const tokenParam = searchParams.get("token");
  const inviteCodeParam = searchParams.get("invite");

  // Invite token state (from invite_tokens system)
  const [inviteData, setInviteData] = useState<{
    businessName: string;
    ratePerLead: number;
    paymentTiming: string;
    channelName?: string;
    weeklyLeadCap?: number;
    monthlyLeadCap?: number;
    terminationNoticeDays?: number;
  } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(!!tokenParam);

  // Invite code state (from invites system)
  const [inviteCodeData, setInviteCodeData] = useState<{
    valid: boolean;
    businessName?: string;
    ratePerLead?: number;
    message?: string;
  } | null>(null);
  const [inviteCodeLoading, setInviteCodeLoading] = useState(!!inviteCodeParam);

  // Buyer registration state (used when role=buyer)
  const [buyerBusinessName, setBuyerBusinessName] = useState("");
  const [buyerBusinessType, setBuyerBusinessType] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPassword, setBuyerPassword] = useState("");
  const [buyerUsername, setBuyerUsername] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerSubmitting, setBuyerSubmitting] = useState(false);
  const [buyerError, setBuyerError] = useState("");
  const [buyerFormStep, setBuyerFormStep] = useState<"account" | "stripe">("account");
  const [buyerStripeLoading, setBuyerStripeLoading] = useState(false);
  const [buyerStripeError, setBuyerStripeError] = useState<string | null>(null);

  // Step management
  const [step, setStep] = useState(1);
  // Provider form step: terms → account → stripe (terms only shown when invite token present)
  const [formStep, setFormStep] = useState<"terms" | "account" | "stripe">(tokenParam ? "terms" : "account");
  const [termsDeclined, setTermsDeclined] = useState(false);

  // Step 1: Profile fields
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Step 2: Payout fields
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod | null>(null);
  const [venmoUsername, setVenmoUsername] = useState("");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [cashappTag, setCashappTag] = useState("");
  const [bankRouting, setBankRouting] = useState("");
  const [bankAccount, setBankAccount] = useState("");

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Prevents auth redirect from firing while we're transitioning to the Stripe step
  const [pendingStripeConnect, setPendingStripeConnect] = useState(false);

  // Redirect if already authenticated (suppressed while awaiting Stripe Connect step)
  useEffect(() => {
    if (!isLoading && isAuthenticated && currentUser && !pendingStripeConnect) {
      const targetUrl = currentUser.role === "buyer" ? "/business" : "/provider-dashboard";
      window.location.href = targetUrl;
    }
  }, [isAuthenticated, currentUser, isLoading, pendingStripeConnect]);

  // Validate invite token from URL on mount
  useEffect(() => {
    if (!tokenParam) return;
    setTokenLoading(true);
    fetch(`/api/invite-tokens/${tokenParam}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setInviteData({
            businessName: data.businessName,
            ratePerLead: data.ratePerLead,
            paymentTiming: data.paymentTiming,
            channelName: data.channelName,
            weeklyLeadCap: data.weeklyLeadCap,
            monthlyLeadCap: data.monthlyLeadCap,
            terminationNoticeDays: data.terminationNoticeDays,
          });
        } else {
          setInviteError(data.error || "This invite link is invalid or has expired.");
        }
      })
      .catch(() => setInviteError("Failed to validate invite link. Please try again."))
      .finally(() => setTokenLoading(false));
  }, [tokenParam]);

  // Verify invite code if present
  useEffect(() => {
    if (!inviteCodeParam) return;
    setInviteCodeLoading(true);
    fetch(`/api/invites/verify?code=${encodeURIComponent(inviteCodeParam)}`)
      .then(res => res.json())
      .then(data => {
        setInviteCodeData(data);
        setInviteCodeLoading(false);
      })
      .catch(() => {
        setInviteCodeData({ valid: false });
        setInviteCodeLoading(false);
      });
  }, [inviteCodeParam]);

  const handleProfilePictureClick = () => {
    fileInputRef.current?.click();
  };

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
            if (width > maxSize) {
              height = (height * maxSize) / width;
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = (width * maxSize) / height;
              height = maxSize;
            }
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
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("Image must be less than 5MB");
        return;
      }

      try {
        const compressed = await compressImage(file);
        setProfilePicture(compressed);
        setError("");
      } catch {
        setError("Failed to process image");
      }
    }
  };

  const validateStep1 = (): boolean => {
    setError("");

    if (!username.trim()) {
      setError("Username is required");
      return false;
    }
    if (!email.trim()) {
      setError("Email is required");
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      return false;
    }
    if (!displayName.trim()) {
      setError("Display name is required");
      return false;
    }
    if (!password) {
      setError("Password is required");
      return false;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return false;
    }
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      setError("Password must contain at least one letter and one number");
      return false;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }

    return true;
  };

  const validateStep2 = (): boolean => {
    setError("");

    if (!payoutMethod) {
      setError("Please select a payout method");
      return false;
    }

    if (payoutMethod === "venmo" && !venmoUsername.trim()) {
      setError("Please enter your Venmo username");
      return false;
    }
    if (payoutMethod === "paypal" && !paypalEmail.trim()) {
      setError("Please enter your PayPal email");
      return false;
    }
    if (payoutMethod === "cashapp" && !cashappTag.trim()) {
      setError("Please enter your Cash App $cashtag");
      return false;
    }
    if (payoutMethod === "bank") {
      if (!bankRouting.trim()) {
        setError("Please enter your bank routing number");
        return false;
      }
      if (!bankAccount.trim()) {
        setError("Please enter your bank account number");
        return false;
      }
      if (!/^\d{9}$/.test(bankRouting)) {
        setError("Routing number must be exactly 9 digits");
        return false;
      }
    }

    return true;
  };

  const handleContinue = () => {
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleBack = () => {
    setError("");
    setStep(1);
  };

  const formatTiming = (timing: string) => {
    switch (timing) {
      case "immediate": return "Immediate";
      case "weekly": return "Weekly";
      case "biweekly": return "Bi-Weekly";
      case "monthly": return "Monthly";
      default: return timing;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateStep2()) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setPendingStripeConnect(true);
    try {
      const result = await registerProvider({
        email,
        password,
        username,
        displayName,
        phone: phone || undefined,
        location: location || undefined,
        profilePictureUrl: profilePicture || undefined,
        payoutMethod: payoutMethod || undefined,
        payoutVenmo: payoutMethod === "venmo" ? venmoUsername : undefined,
        payoutPaypal: payoutMethod === "paypal" ? paypalEmail : undefined,
        payoutCashapp: payoutMethod === "cashapp" ? cashappTag : undefined,
        payoutBankRouting: payoutMethod === "bank" ? bankRouting : undefined,
        payoutBankAccount: payoutMethod === "bank" ? bankAccount : undefined,
        inviteToken: tokenParam || undefined,
        inviteCode: inviteCodeParam && inviteCodeData?.valid ? inviteCodeParam : undefined,
      });

      if (result.success) {
        if ((result as { loginFailed?: boolean }).loginFailed) {
          window.location.href = "/auth/login?registered=true";
        } else {
          window.location.href = "/provider-dashboard";
        }
      } else {
        setPendingStripeConnect(false);
        setError(result.error || "Registration failed. Please try again.");
        setIsSubmitting(false);
      }
    } catch (err) {
      setPendingStripeConnect(false);
      const message = err instanceof Error ? err.message : "Unknown error";
      setError("Registration failed. Please try again.");
      console.error("Registration error:", message);
      setIsSubmitting(false);
    }
  };

  // Buyer registration submit
  const handleBuyerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuyerError("");
    if (!buyerBusinessName.trim() || !buyerBusinessType || !buyerEmail.trim() || !buyerPassword || !buyerUsername.trim()) {
      setBuyerError("All fields are required");
      return;
    }
    setBuyerSubmitting(true);
    try {
      const result = await registerBuyer({
        email: buyerEmail,
        password: buyerPassword,
        username: buyerUsername,
        businessName: buyerBusinessName,
        businessType: buyerBusinessType as any,
        phone: buyerPhone,
        licensedStates: [],
        complianceAcknowledged: true,
      });
      if (result.success) {
        setPendingStripeConnect(true);
        setBuyerFormStep("stripe");
      } else {
        setBuyerError(result.error || "Registration failed");
      }
    } catch {
      setBuyerError("Registration failed. Please try again.");
    } finally {
      setBuyerSubmitting(false);
    }
  };

  const handleConnectBuyerStripe = async () => {
    setBuyerStripeLoading(true);
    setBuyerStripeError(null);
    try {
      const res = await fetch("/api/stripe/setup-customer", { method: "POST" });
      const data = await res.json();
      if (data.setupUrl) {
        window.location.href = data.setupUrl;
      } else {
        setBuyerStripeError(data.error || "Failed to connect. Please try again.");
        setBuyerStripeLoading(false);
      }
    } catch {
      setBuyerStripeError("Failed to connect Stripe. Please try again.");
      setBuyerStripeLoading(false);
    }
  };

  if (isLoading || tokenLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8822A]"></div>
      </div>
    );
  }

  // Buyer registration flow
  if (requestedRole === "buyer" && !tokenParam) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 relative">
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
          <Image src="/woml-v3.png" alt="" width={500} height={500} className="opacity-[0.03] select-none" priority />
        </div>
        <div className="relative z-10 bg-white p-8 rounded-2xl border border-gray-200 max-w-lg w-full shadow-lg">
          <div className="text-center mb-6">
            <Link href="/">
              <Image src="/woml-v3.png" alt="WOML" width={260} height={75} className="mx-auto mb-4 h-18 w-auto object-contain" />
            </Link>
            <h1 className="text-2xl font-bold text-[#E8822A] mb-2">
              {buyerFormStep === "account" ? "Create Business Account" : "Connect Your Bank"}
            </h1>
            <p className="text-gray-500">
              {buyerFormStep === "account" ? "Start receiving leads from your provider network" : "Link your business bank account to pay lead rewards"}
            </p>
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mt-3">
              <div className={`w-2 h-2 rounded-full ${buyerFormStep === "account" ? "bg-[#E8822A]" : "bg-gray-300"}`} />
              <div className="w-6 h-0.5 bg-gray-200" />
              <div className={`w-2 h-2 rounded-full ${buyerFormStep === "stripe" ? "bg-[#E8822A]" : "bg-gray-300"}`} />
            </div>
          </div>

          {buyerFormStep === "account" && (
            <>
              {buyerError && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{buyerError}</div>
              )}
              <form onSubmit={handleBuyerSubmit} className="space-y-4">
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">Business Name</label>
                  <input type="text" value={buyerBusinessName} onChange={(e) => setBuyerBusinessName(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition" placeholder="Acme Services LLC" required />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">Business Type</label>
                  <select value={buyerBusinessType} onChange={(e) => setBuyerBusinessType(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition" required>
                    <option value="">Select type...</option>
                    <option value="agency">Agency</option>
                    <option value="dealership">Dealership</option>
                    <option value="broker">Broker</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Username</label>
                    <input type="text" value={buyerUsername} onChange={(e) => setBuyerUsername(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition" placeholder="acmeauto" required />
                  </div>
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">Phone</label>
                    <input type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition" placeholder="(555) 123-4567" />
                  </div>
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">Email</label>
                  <input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition" placeholder="you@business.com" required />
                </div>
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">Password</label>
                  <input type="password" value={buyerPassword} onChange={(e) => setBuyerPassword(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition" placeholder="Min. 8 characters" required />
                </div>
                <button type="submit" disabled={buyerSubmitting} className="w-full py-3 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2 mt-6">
                  {buyerSubmitting ? <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>Creating...</> : "Create Business Account"}
                </button>
              </form>
            </>
          )}

          {buyerFormStep === "stripe" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-[#E8822A]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[#E8822A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Link your business bank account to pay lead providers securely through Stripe.
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Secure bank-level encryption via Stripe
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  All transactions tracked for tax documentation
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Takes about 2 minutes to set up
                </div>
              </div>

              {buyerStripeError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{buyerStripeError}</div>
              )}

              <button
                onClick={handleConnectBuyerStripe}
                disabled={buyerStripeLoading}
                className="w-full py-3 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {buyerStripeLoading ? (
                  <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>Connecting...</>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    Connect Business Bank Account
                  </>
                )}
              </button>

              <p className="text-xs text-gray-400 text-center">
                You can also complete this from your dashboard settings later.{" "}
                <button
                  onClick={() => { window.location.href = "/business"; }}
                  className="text-[#E8822A] hover:underline"
                >
                  Skip for now
                </button>
              </p>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-gray-500 text-sm">Already have an account? <Link href="/auth/login" className="text-[#E8822A] hover:underline font-medium">Sign in</Link></p>
          </div>
        </div>
      </div>
    );
  }

  // If token was provided but is invalid, show error and block registration
  if (tokenParam && inviteError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl border border-gray-200 max-w-md w-full shadow-lg text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Invalid Invite Link</h2>
          <p className="text-gray-500 mb-6">{inviteError}</p>
          <Link href="/auth/login" className="text-[#E8822A] hover:underline font-medium">Go to Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 relative">
      {/* Watermark Logo Background */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <Image
          src="/woml-v3.png"
          alt=""
          width={500}
          height={500}
          className="opacity-[0.03] select-none"
          priority
        />
      </div>

      <div className="relative z-10 bg-white p-8 rounded-2xl border border-gray-200 max-w-lg w-full shadow-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-block">
            <Image
              src="/woml-v3.png"
              alt="WOML - Word of Mouth Leads"
              width={260}
              height={75}
              className="mx-auto mb-4 h-18 w-auto object-contain"
            />
          </Link>
          <h1 className="text-2xl font-bold text-[#E8822A] mb-2">
            {step === 1 ? "Create Your Profile" : "Set Up Your Payouts"}
          </h1>
          {inviteData && (
            <div className="mt-2 mb-1 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-semibold text-sm">
                Join {inviteData.businessName}&apos;s Network — Earn ${inviteData.ratePerLead}/lead
              </p>
              {inviteData.channelName && (
                <p className="text-green-700 text-xs mt-0.5">{inviteData.channelName}</p>
              )}
            </div>
          )}
          <p className="text-gray-500">
            Step {step} of 2 {step === 1 ? "- Your provider profile" : "- How would you like to be paid?"}
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center mb-6">
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
              step >= 1 ? "bg-[#E8822A] text-white" : "bg-gray-200 text-gray-500"
            }`}>
              1
            </div>
            <div className={`w-16 h-1 ${step >= 2 ? "bg-[#E8822A]" : "bg-gray-200"}`}></div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
              step >= 2 ? "bg-[#E8822A] text-white" : "bg-gray-200 text-gray-500"
            }`}>
              2
            </div>
          </div>
        </div>

        {/* Invite Code Banner */}
        {inviteCodeParam && !inviteCodeLoading && inviteCodeData?.valid && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-semibold text-emerald-800">You&apos;ve been invited!</p>
            </div>
            <p className="text-emerald-700 text-sm">
              <strong>{inviteCodeData.businessName}</strong> has invited you to become a lead provider
              {inviteCodeData.ratePerLead ? ` at $${Number(inviteCodeData.ratePerLead).toFixed(2)}/lead` : ""}.
            </p>
            {inviteCodeData.message && (
              <p className="text-emerald-600 text-sm mt-1 italic">&quot;{inviteCodeData.message}&quot;</p>
            )}
          </div>
        )}
        {inviteCodeParam && !inviteCodeLoading && inviteCodeData && !inviteCodeData.valid && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-amber-700 text-sm">This invite link is no longer valid. You can still register below.</p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Terms Declined */}
        {termsDeclined && (
          <div className="text-center space-y-4">
            <p className="text-gray-600">You declined the terms. You can close this page or go back to review.</p>
            <button
              onClick={() => { setTermsDeclined(false); setFormStep("terms"); }}
              className="text-[#E8822A] hover:underline font-medium"
            >
              Review Terms Again
            </button>
          </div>
        )}

        {/* ── Step 0: Terms Review ── */}
        {!termsDeclined && formStep === "terms" && inviteData && (
          <div className="space-y-4">
            <p className="text-gray-500 text-sm text-center">Review the terms of this deal before creating your account.</p>

            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-[#E8822A]/5 border-b border-gray-200 px-5 py-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Deal Terms</p>
              </div>
              <div className="divide-y divide-gray-100">
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-600">Business</span>
                  <span className="text-sm font-semibold text-gray-800">{inviteData.businessName}</span>
                </div>
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-600">Rate per Lead</span>
                  <span className="text-lg font-bold text-[#E8822A]">${inviteData.ratePerLead}</span>
                </div>
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-600">Payment Timing</span>
                  <span className="text-sm font-semibold text-gray-800">{formatTiming(inviteData.paymentTiming)}</span>
                </div>
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-600">Weekly Lead Cap</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {inviteData.weeklyLeadCap ? `${inviteData.weeklyLeadCap} leads/week` : "Unlimited"}
                  </span>
                </div>
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-600">Monthly Lead Cap</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {inviteData.monthlyLeadCap ? `${inviteData.monthlyLeadCap} leads/month` : "Unlimited"}
                  </span>
                </div>
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-gray-600">Termination Notice</span>
                  <span className="text-sm font-semibold text-gray-800">{inviteData.terminationNoticeDays === 0 ? "Anytime" : `${inviteData.terminationNoticeDays} days`}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center px-2">
              By accepting, you agree to submit leads exclusively to this business under the terms above.
              Payouts are made via bank transfer through Stripe.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setTermsDeclined(true)}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium transition hover:bg-gray-50"
              >
                Decline
              </button>
              <button
                onClick={() => setFormStep("account")}
                className="flex-1 py-3 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
              >
                Accept Terms & Continue
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Profile Information */}
        {formStep === "account" && step === 1 && (
          <form onSubmit={(e) => { e.preventDefault(); handleContinue(); }} className="space-y-4">
            {/* Profile Picture */}
            <div className="flex flex-col items-center mb-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={handleProfilePictureClick}
                className="w-24 h-24 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden hover:border-[#E8822A] hover:bg-gray-50 transition group"
              >
                {profilePicture ? (
                  <img
                    src={profilePicture}
                    alt="Profile preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center">
                    <svg className="w-8 h-8 mx-auto text-gray-400 group-hover:text-[#E8822A] transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                )}
              </button>
              <p className="text-sm text-gray-500 mt-2">
                {profilePicture ? "Click to change photo" : "Add a photo (optional)"}
              </p>
            </div>

            {/* Username and Email */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition"
                  placeholder="johndoe"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition"
                placeholder="John Doe"
                required
              />
            </div>

            {/* Phone and Location */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  Phone <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition"
                  placeholder="(555) 123-4567"
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
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition"
                  placeholder="Philadelphia, PA"
                />
              </div>
            </div>

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
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition"
                  placeholder="Min. 8 characters"
                  required
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
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition"
                  placeholder="Confirm password"
                  required
                />
              </div>
            </div>

            <p className="text-xs text-gray-400">
              Password must be at least 8 characters with at least one letter and one number.
            </p>

            <button
              type="submit"
              className="w-full py-3 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-medium transition flex items-center justify-center gap-2 mt-6"
            >
              Continue
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </form>
        )}

        {/* Step 2: Payout Setup */}
        {formStep === "account" && step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-gray-600 text-sm mb-4">
              Choose how you&apos;d like to receive payments for your leads.
            </p>

            {/* Venmo Option */}
            <div
              className={`border rounded-lg p-4 cursor-pointer transition ${
                payoutMethod === "venmo"
                  ? "border-[#E8822A] bg-[#E8822A]/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setPayoutMethod("venmo")}
            >
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="payoutMethod"
                  checked={payoutMethod === "venmo"}
                  onChange={() => setPayoutMethod("venmo")}
                  className="w-4 h-4 text-[#E8822A]"
                />
                <span className="ml-3 font-medium text-gray-900">Venmo</span>
              </label>
              {payoutMethod === "venmo" && (
                <div className="mt-3 ml-7">
                  <input
                    type="text"
                    value={venmoUsername}
                    onChange={(e) => setVenmoUsername(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition"
                    placeholder="@john-doe"
                  />
                </div>
              )}
            </div>

            {/* PayPal Option */}
            <div
              className={`border rounded-lg p-4 cursor-pointer transition ${
                payoutMethod === "paypal"
                  ? "border-[#E8822A] bg-[#E8822A]/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setPayoutMethod("paypal")}
            >
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="payoutMethod"
                  checked={payoutMethod === "paypal"}
                  onChange={() => setPayoutMethod("paypal")}
                  className="w-4 h-4 text-[#E8822A]"
                />
                <span className="ml-3 font-medium text-gray-900">PayPal</span>
              </label>
              {payoutMethod === "paypal" && (
                <div className="mt-3 ml-7">
                  <input
                    type="email"
                    value={paypalEmail}
                    onChange={(e) => setPaypalEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition"
                    placeholder="paypal@example.com"
                  />
                </div>
              )}
            </div>

            {/* CashApp Option */}
            <div
              className={`border rounded-lg p-4 cursor-pointer transition ${
                payoutMethod === "cashapp"
                  ? "border-[#E8822A] bg-[#E8822A]/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setPayoutMethod("cashapp")}
            >
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="payoutMethod"
                  checked={payoutMethod === "cashapp"}
                  onChange={() => setPayoutMethod("cashapp")}
                  className="w-4 h-4 text-[#E8822A]"
                />
                <span className="ml-3 font-medium text-gray-900">Cash App</span>
              </label>
              {payoutMethod === "cashapp" && (
                <div className="mt-3 ml-7">
                  <input
                    type="text"
                    value={cashappTag}
                    onChange={(e) => setCashappTag(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition"
                    placeholder="$johndoe"
                  />
                </div>
              )}
            </div>

            {/* Bank Account Option */}
            <div
              className={`border rounded-lg p-4 cursor-pointer transition ${
                payoutMethod === "bank"
                  ? "border-[#E8822A] bg-[#E8822A]/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setPayoutMethod("bank")}
            >
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="payoutMethod"
                  checked={payoutMethod === "bank"}
                  onChange={() => setPayoutMethod("bank")}
                  className="w-4 h-4 text-[#E8822A]"
                />
                <span className="ml-3 font-medium text-gray-900">Bank Account</span>
              </label>
              {payoutMethod === "bank" && (
                <div className="mt-3 ml-7 space-y-3">
                  <input
                    type="text"
                    value={bankRouting}
                    onChange={(e) => setBankRouting(e.target.value.replace(/\D/g, "").slice(0, 9))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition"
                    placeholder="Routing Number (9 digits)"
                  />
                  <input
                    type="text"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value.replace(/\D/g, ""))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition"
                    placeholder="Account Number"
                  />
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium transition hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                </svg>
                Back
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-3 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  "Complete Registration"
                )}
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 text-center">
          <p className="text-gray-500 text-sm">
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="text-[#E8822A] hover:underline font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-[#E8822A] transition"
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
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8822A]"></div>
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
