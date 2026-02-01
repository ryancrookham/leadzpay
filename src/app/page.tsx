"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, currentUser, isLoading } = useAuth();
  const [selectedRole, setSelectedRole] = useState<"provider" | "receiver" | null>(null);

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
            <Link
              href={dashboardUrl}
              className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"
            >
              Go to Dashboard
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="text-gray-600 hover:text-[#1e3a5f] transition px-4 py-2 rounded-lg hover:bg-gray-50"
              >
                Sign In
              </Link>
              <Link
                href="/auth/register"
                className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-4 py-2 rounded-lg font-medium transition"
              >
                Sign Up
              </Link>
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
