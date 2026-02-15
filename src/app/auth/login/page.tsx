"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

function LoginContent() {
  const { login, isAuthenticated, currentUser, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(false);
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated && currentUser) {
      const targetUrl = currentUser.role === "admin" ? "/admin" : currentUser.role === "buyer" ? "/business" : "/provider-dashboard";
      window.location.href = targetUrl;
    }
  }, [isAuthenticated, currentUser, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDebugInfo("");
    setIsSubmitting(true);

    try {
      // Show what we're attempting
      setDebugInfo(`Attempting login for: ${email.trim()}`);

      const result = await login(email.trim(), password, staySignedIn);

      if (result.success && result.role) {
        setDebugInfo(`Login successful! Role: ${result.role}. Redirecting...`);
        const targetUrl = result.role === "admin" ? "/admin" : result.role === "buyer" ? "/business" : "/provider-dashboard";
        window.location.href = targetUrl;
      } else {
        setError(result.error || "Invalid email or password");
        setDebugInfo(`Login failed: ${result.error || "Unknown error"}`);
        setIsSubmitting(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError("Login failed. Please try again.");
      setDebugInfo(`Exception: ${message}`);
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8822A]"></div>
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

      <div className="relative z-10 bg-white p-8 rounded-2xl border border-gray-200 max-w-md w-full shadow-lg">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <Image
              src="/woml-v3.png"
              alt="WOML - Word of Mouth Leads"
              width={260}
              height={75}
              className="mx-auto mb-4 h-18 w-auto object-contain"
            />
          </Link>
          <h1 className="text-2xl font-bold text-[#E8822A] mb-2">Welcome Back</h1>
          <p className="text-gray-500">Sign in to your account</p>
        </div>

        {justRegistered && !error && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            Account created successfully! Please sign in.
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {debugInfo && (
          <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-orange-700 text-xs font-mono">
            {debugInfo}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E8822A]/20 focus:border-[#E8822A] transition"
              placeholder="Enter your password"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={staySignedIn}
                onChange={(e) => setStaySignedIn(e.target.checked)}
                disabled={isSubmitting}
                className="w-4 h-4 text-[#E8822A] rounded border-gray-300 focus:ring-[#E8822A]"
              />
              Stay signed in
            </label>
            <Link
              href="/auth/forgot-password"
              className="text-sm text-[#E8822A] hover:underline"
            >
              Forgot Password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-[#E8822A] hover:bg-[#D47526] text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-center text-gray-500 text-sm mb-4">
            Don&apos;t have an account?
          </p>
          <Link
            href="/auth/register?role=provider"
            className="block w-full py-3 px-4 border border-[#E8822A] bg-[#E8822A]/5 rounded-lg text-center font-medium transition hover:bg-[#E8822A]/10 text-[#E8822A]"
          >
            Sign up as Lead Provider
          </Link>
        </div>

        <div className="mt-6 text-center">
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

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoginContent />
    </Suspense>
  );
}
