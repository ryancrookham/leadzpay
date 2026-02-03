"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";

// Admin emails that can see the operator dashboard
const ADMIN_EMAILS = ["rcrookham@gmail.com"];

function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, currentUser, isLoading, logout } = useAuth();
  const [selectedRole, setSelectedRole] = useState<"provider" | "receiver" | null>(null);
  const [showSignUpMenu, setShowSignUpMenu] = useState(false);
  const signUpRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (signUpRef.current && !signUpRef.current.contains(event.target as Node)) {
        setShowSignUpMenu(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // Get dashboard URL based on user role
  const dashboardUrl = currentUser?.role === "buyer" ? "/business" : "/provider-dashboard";

  const handleContinue = () => {
    if (selectedRole === "provider") {
      router.push("/auth/register?role=provider");
    } else if (selectedRole === "receiver") {
      router.push("/auth/register?role=buyer");
    }
  };

  // Show minimal loading state only while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <Image
            src="/woml-logo.png"
            alt="WOML"
            width={200}
            height={60}
            className="mx-auto mb-4 animate-pulse"
            priority
          />
          <div className="text-gray-400 text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white relative">
      {/* Watermark Logo Background */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <Image
          src="/woml-logo.png"
          alt=""
          width={600}
          height={600}
          className="opacity-[0.03] select-none"
          priority
        />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center">
          <Image
            src="/woml-logo.png"
            alt="WOML - Word of Mouth Leads"
            width={280}
            height={80}
            className="h-20 w-auto object-contain"
          />
        </div>
        <div className="flex gap-3">
          {isAuthenticated ? (
            <div className="flex gap-2 items-center">
              {/* Admin Operator Button - only for admins */}
              {isAdmin(currentUser?.email) && (
                <Link
                  href="/admin/health"
                  className="text-gray-400 hover:text-[#1e3a5f] p-2 rounded-lg transition"
                  title="Operator Dashboard"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </Link>
              )}
              <Link
                href={dashboardUrl}
                className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"
              >
                Go to Dashboard
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <button
                onClick={() => {
                  logout();
                  window.location.reload();
                }}
                className="text-gray-500 hover:text-red-600 px-3 py-2 rounded-lg transition flex items-center gap-1"
                title="Log Out"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              {/* Sign Up Dropdown */}
              <div className="relative" ref={signUpRef}>
                <button
                  onClick={() => {
                    setShowSignUpMenu(!showSignUpMenu);
                  }}
                  className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-1"
                >
                  Sign Up
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showSignUpMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                    <div className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Sign up as</div>
                    <Link
                      href="/auth/register?role=buyer"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition"
                      onClick={() => setShowSignUpMenu(false)}
                    >
                      <div className="w-10 h-10 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#1e3a5f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Business</div>
                        <div className="text-xs text-gray-500">Insurance agency / Lead buyer</div>
                      </div>
                    </Link>
                    <Link
                      href="/auth/register?role=provider"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition"
                      onClick={() => setShowSignUpMenu(false)}
                    >
                      <div className="w-10 h-10 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#1e3a5f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Provider</div>
                        <div className="text-xs text-gray-500">Car salesperson / Lead provider</div>
                      </div>
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-5xl mx-auto px-8 py-8">
        <div className="text-center mb-2">
          <Image
            src="/woml-logo.png"
            alt="WOML - Word of Mouth Leads"
            width={1120}
            height={315}
            className="mx-auto w-full max-w-2xl h-auto object-contain"
          />
        </div>

        {/* Role Selection */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
          {/* Lead Provider Card */}
          <button
            onClick={() => setSelectedRole("provider")}
            className={`group p-8 rounded-2xl border-2 transition-all text-left ${
              selectedRole === "provider"
                ? "border-[#1e3a5f] bg-[#1e3a5f]/5 scale-[1.02] shadow-lg"
                : "border-gray-200 bg-white hover:border-[#1e3a5f]/50 hover:shadow-md"
            }`}
          >
            {selectedRole === "provider" && (
              <div className="absolute top-4 right-4">
                <div className="w-8 h-8 rounded-full bg-[#1e3a5f] flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            )}

            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-16 w-16 rounded-2xl bg-[#1e3a5f] flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#1e3a5f]">I Have a Customer</h3>
                  <p className="text-[#1e3a5f]/70 text-sm font-medium">Lead Provider / Car Salesperson</p>
                </div>
              </div>
              <p className="text-gray-600 mb-6 text-lg">
                I&apos;m a car salesperson or dealer connecting a driver with insurance so they can legally drive their new vehicle.
              </p>
              <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
                <h4 className="text-[#1e3a5f] font-semibold mb-3">What you&apos;ll do:</h4>
                <ul className="text-gray-600 space-y-2">
                  <li className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#1e3a5f] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Submit customer info for instant quotes
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#1e3a5f] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Get paid for every qualified lead
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#1e3a5f] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Choose payout: Venmo, PayPal, or Bank
                  </li>
                </ul>
              </div>
              <div className="flex items-center gap-2 text-[#1e3a5f] font-semibold">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
                </svg>
                Earn $50+ per lead
              </div>
            </div>
          </button>

          {/* Lead Receiver Card */}
          <button
            onClick={() => setSelectedRole("receiver")}
            className={`group p-8 rounded-2xl border-2 transition-all text-left ${
              selectedRole === "receiver"
                ? "border-[#1e3a5f] bg-[#1e3a5f]/5 scale-[1.02] shadow-lg"
                : "border-gray-200 bg-white hover:border-[#1e3a5f]/50 hover:shadow-md"
            }`}
          >
            {selectedRole === "receiver" && (
              <div className="absolute top-4 right-4">
                <div className="w-8 h-8 rounded-full bg-[#1e3a5f] flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            )}

            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-16 w-16 rounded-2xl bg-[#1e3a5f] flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#1e3a5f]">I&apos;m a Business Owner</h3>
                  <p className="text-[#1e3a5f]/70 text-sm font-medium">Lead Receiver / Insurance Agency</p>
                </div>
              </div>
              <p className="text-gray-600 mb-6 text-lg">
                I own an insurance agency and want to receive qualified leads, manage payouts to salespeople, and track my business.
              </p>
              <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
                <h4 className="text-[#1e3a5f] font-semibold mb-3">What you&apos;ll do:</h4>
                <ul className="text-gray-600 space-y-2">
                  <li className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#1e3a5f] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    View all incoming leads with quotes
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#1e3a5f] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Set & adjust payout rates per salesperson
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#1e3a5f] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Full ledger, charts & financial tracking
                  </li>
                </ul>
              </div>
              <div className="flex items-center gap-2 text-[#1e3a5f] font-semibold">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Secure Business Portal
              </div>
            </div>
          </button>
        </div>

        {/* Continue Button */}
        {selectedRole && (
          <div className="text-center mb-16">
            <button
              onClick={handleContinue}
              className="px-12 py-4 rounded-xl text-lg font-semibold transition-all transform hover:scale-105 bg-[#1e3a5f] text-white shadow-lg hover:shadow-xl hover:bg-[#2a4a6f]"
            >
              <span className="flex items-center gap-2">
                {selectedRole === "provider" ? "Get Started as Provider" : "Get Started as Business"}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: "$50+", label: "Per Lead Payout" },
              { value: "10+", label: "Insurance Carriers" },
              { value: "3", label: "Payment Methods" },
              { value: "100%", label: "Transparent Ledger" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl font-bold text-[#1e3a5f]">{stat.value}</div>
                <div className="text-gray-500 mt-2">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-100 py-8 px-8 mt-16 bg-white">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center">
            <Image
              src="/woml-logo.png"
              alt="WOML - Word of Mouth Leads"
              width={120}
              height={36}
              className="h-9 w-auto object-contain"
            />
          </div>
          <div className="text-gray-400 text-sm">© 2025 WOML. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
