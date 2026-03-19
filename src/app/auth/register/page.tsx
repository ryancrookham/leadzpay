"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { registerProvider, registerBuyer, isAuthenticated, currentUser, isLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const requestedRole = searchParams.get("role");
  const tokenParam = searchParams.get("token");
  const inviteCodeParam = searchParams.get("invite");

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
  const [buyerFormStep, setBuyerFormStep] = useState<"account" | "pin" | "stripe">("account");
  const [buyerStripeLoading, setBuyerStripeLoading] = useState(false);
  const [buyerStripeError, setBuyerStripeError] = useState<string | null>(null);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [buyerPin, setBuyerPin] = useState("");
  const [buyerPinConfirm, setBuyerPinConfirm] = useState("");
  const [buyerPinError, setBuyerPinError] = useState("");
  const [buyerPinSaving, setBuyerPinSaving] = useState(false);

  // Provider profile fields
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Prevents auth redirect from firing while we're transitioning to the Stripe step
  const [pendingStripeConnect, setPendingStripeConnect] = useState(false);

  // Redirect token-based invites to new provider onboarding flow
  useEffect(() => {
    if (tokenParam) {
      router.replace(`/provider-onboarding?token=${tokenParam}`);
    }
  }, [tokenParam, router]);

  // Redirect if already authenticated (suppressed while awaiting Stripe Connect step)
  useEffect(() => {
    if (!isLoading && isAuthenticated && currentUser && !pendingStripeConnect) {
      const targetUrl = currentUser.role === "buyer" ? "/business" : "/provider-dashboard";
      window.location.href = targetUrl;
    }
  }, [isAuthenticated, currentUser, isLoading, pendingStripeConnect]);

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

  const validateProfile = (): boolean => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateProfile()) {
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
        inviteCode: inviteCodeParam && inviteCodeData?.valid ? inviteCodeParam : undefined,
      });

      if (result.success) {
        if ((result as { loginFailed?: boolean }).loginFailed) {
          window.location.href = "/auth/login?registered=true";
        } else {
          // Wait for the session cookie to be readable before redirecting.
          // signIn() with redirect:false resolves before the cookie is fully
          // written, so an immediate redirect causes the dashboard to see no
          // session and bounce back to login.
          let attempts = 0;
          const waitForSession = async () => {
            while (attempts < 10) {
              try {
                const res = await fetch("/api/auth/session", { cache: "no-store" });
                const data = await res.json();
                if (data?.user?.role) {
                  window.location.href = "/provider-dashboard";
                  return;
                }
              } catch { /* retry */ }
              attempts++;
              await new Promise(r => setTimeout(r, 300));
            }
            // Fallback — redirect anyway (dashboard will do its own server check)
            window.location.href = "/provider-dashboard";
          };
          waitForSession();
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
    setPendingStripeConnect(true); // MUST be set before async call to prevent redirect race
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
        setBuyerFormStep("pin");
      } else {
        setPendingStripeConnect(false);
        setBuyerError(result.error || "Registration failed");
      }
    } catch {
      setPendingStripeConnect(false);
      setBuyerError("Registration failed. Please try again.");
    } finally {
      setBuyerSubmitting(false);
    }
  };

  const handlePinSubmit = async () => {
    setBuyerPinError("");
    if (!/^\d{4}$/.test(buyerPin)) {
      setBuyerPinError("PIN must be exactly 4 digits");
      return;
    }
    if (buyerPin !== buyerPinConfirm) {
      setBuyerPinError("PINs do not match");
      return;
    }
    setBuyerPinSaving(true);
    try {
      const res = await fetch("/api/business/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: buyerPin }),
      });
      const data = await res.json();
      if (data.success) {
        setBuyerFormStep("stripe");
      } else {
        setBuyerPinError(data.error || "Failed to save PIN");
      }
    } catch {
      setBuyerPinError("Failed to save PIN. Please try again.");
    } finally {
      setBuyerPinSaving(false);
    }
  };

  const handleConnectBuyerStripe = async () => {
    setBuyerStripeLoading(true);
    setBuyerStripeError(null);
    try {
      // Record business agreement acceptance first
      await fetch("/api/stripe/record-agreement", { method: "POST" });

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

  // Block generic /auth/register (no role, no invite, no token) — redirect to homepage
  const hasValidParam = requestedRole || inviteCodeParam || tokenParam;
  useEffect(() => {
    if (!isLoading && !hasValidParam) {
      router.replace("/");
    }
  }, [isLoading, hasValidParam, router]);

  // Show spinner while redirecting token-based invites or loading auth
  if (isLoading || tokenParam || !hasValidParam) {
    return (
      <div className="min-h-screen bg-[#212121] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  // Block provider self-registration without a valid invite token
  if (requestedRole === "provider" && !inviteCodeParam) {
    router.replace("/auth/login?error=invite-required");
    return (
      <div className="min-h-screen bg-[#212121] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  // Buyer registration flow
  if (requestedRole === "buyer") {
    return (
      <div className="min-h-screen bg-[#f8f9fc] flex flex-col">
        <header className="bg-[#212121] px-8 py-4 flex items-center">
          <Link href="/" className="flex items-center">
            <Image src="/woml-alt-white.png" alt="WOML - Word of Mouth Leads" width={120} height={36} className="h-8 w-auto object-contain" />
          </Link>
        </header>
        <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl border border-gray-200 max-w-lg w-full shadow-sm">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-[#212121] mb-2">
              {buyerFormStep === "account" ? "Create Business Account" : buyerFormStep === "pin" ? "Set Your Portal PIN" : "Connect Your Bank"}
            </h1>
            <p className="text-gray-500">
              {buyerFormStep === "account" ? "Start receiving leads from your provider network" : buyerFormStep === "pin" ? "This PIN is required to access the Owner portal" : "Link your business bank account to pay lead rewards"}
            </p>
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mt-3">
              <div className={`w-2 h-2 rounded-full ${buyerFormStep === "account" ? "bg-[#E8822A]" : "bg-gray-300"}`} />
              <div className="w-6 h-0.5 bg-gray-200" />
              <div className={`w-2 h-2 rounded-full ${buyerFormStep === "pin" ? "bg-[#E8822A]" : "bg-gray-300"}`} />
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

          {buyerFormStep === "pin" && (
            <div className="space-y-4">
              {buyerPinError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{buyerPinError}</div>
              )}
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-sm text-gray-600 leading-relaxed">
                Your 4-digit PIN will be required each time an Owner logs into the business portal. Lead Chasers do not need a PIN.
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">Create PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={buyerPin}
                  onChange={(e) => setBuyerPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition text-center text-2xl tracking-[0.5em] font-mono"
                  placeholder="----"
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">Confirm PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={buyerPinConfirm}
                  onChange={(e) => setBuyerPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition text-center text-2xl tracking-[0.5em] font-mono"
                  placeholder="----"
                />
              </div>
              <button
                onClick={handlePinSubmit}
                disabled={buyerPinSaving || buyerPin.length !== 4 || buyerPinConfirm.length !== 4}
                className="w-full py-3 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {buyerPinSaving ? <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>Saving...</> : "Set PIN & Continue"}
              </button>
            </div>
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

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="business-agreement"
                  checked={agreementChecked}
                  onChange={(e) => setAgreementChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#E8822A] cursor-pointer flex-shrink-0"
                />
                <label htmlFor="business-agreement" className="text-sm text-gray-600 cursor-pointer leading-relaxed">
                  I have read and agree to the{" "}
                  <a href="/WOML_Business_Agreement.pdf" target="_blank" rel="noopener noreferrer" className="text-[#E8822A] hover:underline font-medium">
                    WOML Business Agreement
                  </a>
                  . I understand this is a binding legal agreement governing my use of the platform.
                </label>
              </div>

              <button
                onClick={handleConnectBuyerStripe}
                disabled={buyerStripeLoading || !agreementChecked}
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
            </div>
          )}

          <div className="mt-6 text-center space-y-2">
            <p className="text-gray-500 text-sm">Already have an account? <Link href="/auth/login" className="text-[#E8822A] hover:underline font-medium">Sign in</Link></p>
            <Link href="/" className="block text-sm text-gray-400 hover:text-[#E8822A] transition">Back to Home</Link>
          </div>
        </div>
        </div>
      </div>
    );
  }

  // Provider registration form (single step — direct or invite-code based)
  return (
    <div className="min-h-screen bg-[#f8f9fc] flex flex-col">
      <header className="bg-[#212121] px-8 py-4 flex items-center">
        <Link href="/" className="flex items-center">
          <Image src="/woml-alt-white.png" alt="WOML - Word of Mouth Leads" width={120} height={36} className="h-8 w-auto object-contain" />
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center p-4 relative">
      {/* Watermark Logo Background */}
      <div className="bg-white p-8 rounded-2xl border border-gray-200 max-w-lg w-full shadow-sm">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[#212121] mb-2">
            Create Your Profile
          </h1>
          <p className="text-gray-500">Set up your provider account</p>
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

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
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
            disabled={isSubmitting}
            className="w-full py-3 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Creating...
              </>
            ) : (
              "Create Account"
            )}
          </button>
        </form>

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
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-[#212121] flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
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
