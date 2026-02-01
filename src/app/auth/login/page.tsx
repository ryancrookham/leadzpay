"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, currentUser, isLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const preselectedRole = searchParams.get("role") as "buyer" | "provider" | null;

  // Redirect if already authenticated (handles page refresh while logged in)
  useEffect(() => {
    if (!isLoading && isAuthenticated && currentUser) {
      if (currentUser.role === "buyer") {
        router.replace("/business");
      } else {
        router.replace("/provider-dashboard");
      }
    }
  }, [isAuthenticated, currentUser, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    const result = await login(email, password);

    if (result.success && result.role) {
      // Redirect immediately based on role - don't wait for state update
      if (result.role === "buyer") {
        router.replace("/business");
      } else {
        router.replace("/provider-dashboard");
      }
    } else {
      setError(result.error || "Login failed");
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

      <div className="relative z-10 bg-white p-8 rounded-2xl border border-gray-200 max-w-md w-full shadow-lg">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <Image
              src="/woml-logo.png"
              alt="WOML - Word of Mouth Leads"
              width={260}
              height={75}
              className="mx-auto mb-4 h-18 w-auto object-contain"
            />
          </Link>
          <h1 className="text-2xl font-bold text-[#1e3a5f] mb-2">Welcome Back</h1>
          <p className="text-gray-500">Sign in to your account</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
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
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition"
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
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition"
              placeholder="Enter your password"
              required
              disabled={isSubmitting}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
          <div className="grid grid-cols-2 gap-3">
            <Link
              href={`/auth/register?role=buyer${preselectedRole === "buyer" ? "&preselected=true" : ""}`}
              className={`py-3 px-4 border rounded-lg text-center font-medium transition ${
                preselectedRole === "buyer"
                  ? "border-[#1e3a5f] bg-[#1e3a5f]/5 text-[#1e3a5f]"
                  : "border-gray-200 text-gray-700 hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
              }`}
            >
              <div className="text-sm">I&apos;m a</div>
              <div className="font-semibold">Business</div>
            </Link>
            <Link
              href={`/auth/register?role=provider${preselectedRole === "provider" ? "&preselected=true" : ""}`}
              className={`py-3 px-4 border rounded-lg text-center font-medium transition ${
                preselectedRole === "provider"
                  ? "border-[#1e3a5f] bg-[#1e3a5f]/5 text-[#1e3a5f]"
                  : "border-gray-200 text-gray-700 hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
              }`}
            >
              <div className="text-sm">I&apos;m a</div>
              <div className="font-semibold">Provider</div>
            </Link>
          </div>
        </div>

        <div className="mt-6 text-center">
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

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoginContent />
    </Suspense>
  );
}
