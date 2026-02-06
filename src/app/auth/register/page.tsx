"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { registerProvider, isAuthenticated, currentUser, isLoading } = useAuth();

  // Provider-only registration - redirect if trying to access as buyer
  const requestedRole = searchParams.get("role");

  // Common fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");

  // Provider-specific fields
  const [displayName, setDisplayName] = useState("");
  const [providerPhone, setProviderPhone] = useState("");
  const [location, setLocation] = useState("");

  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated && currentUser) {
      const targetUrl = currentUser.role === "buyer" ? "/business" : "/provider-dashboard";
      window.location.href = targetUrl;
    }
  }, [isAuthenticated, currentUser, isLoading]);

  // Redirect buyer registration attempts to login
  useEffect(() => {
    if (requestedRole === "buyer") {
      router.replace("/auth/login");
    }
  }, [requestedRole, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDebugInfo("");

    // Validate passwords match
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    setDebugInfo("Registering as provider...");

    try {
      const result = await registerProvider({
        email,
        password,
        username,
        displayName,
        phone: providerPhone || undefined,
        location: location || undefined,
      });

      if (result.success) {
        setDebugInfo("Registration successful! Redirecting to dashboard...");
        window.location.href = "/provider-dashboard";
      } else {
        setError(result.error || "Registration failed. Please try again.");
        setDebugInfo(`Registration failed: ${result.error}`);
        setIsSubmitting(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError("Registration failed. Please try again.");
      setDebugInfo(`Exception: ${message}`);
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
          <h1 className="text-2xl font-bold text-[#1e3a5f] mb-2">Become a Lead Provider</h1>
          <p className="text-gray-500">Partner with Options Insurance Agency</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {debugInfo && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-xs font-mono">
            {debugInfo}
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

          {/* Provider Fields */}
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
              "Create Provider Account"
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
