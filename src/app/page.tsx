"use client";

import { useState, useEffect, useRef } from "react";
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
  const { isAuthenticated, currentUser, isLoading, logout } = useAuth();
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
                        <div className="font-medium text-gray-900">Lead Provider</div>
                        <div className="text-xs text-gray-500">Car salesperson / Dealer</div>
                      </div>
                    </Link>
                    <div className="border-t border-gray-100 my-2"></div>
                    <Link
                      href="/auth/login"
                      className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition text-gray-500"
                      onClick={() => setShowSignUpMenu(false)}
                    >
                      <div className="text-xs">Business owner? <span className="text-[#1e3a5f]">Sign in here</span></div>
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
        <div className="text-center mb-4">
          <Image
            src="/woml-logo.png"
            alt="WOML - Word of Mouth Leads"
            width={1120}
            height={315}
            className="mx-auto w-full max-w-2xl h-auto object-contain"
          />
          <p className="text-[#1e3a5f]/70 text-lg mt-2">
            Powered by <span className="font-semibold text-[#1e3a5f]">Options Insurance Agency</span>
          </p>
        </div>

        {/* Provider Sign-Up Card - Single Focused Card */}
        <div className="max-w-2xl mx-auto mb-12">
          <div className="p-8 rounded-2xl border-2 border-[#1e3a5f] bg-[#1e3a5f]/5 shadow-lg text-left">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-16 w-16 rounded-2xl bg-[#1e3a5f] flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-[#1e3a5f]">Become a Lead Provider</h3>
                <p className="text-[#1e3a5f]/70 text-sm font-medium">Partner with Options Insurance Agency</p>
              </div>
            </div>
            <p className="text-gray-600 mb-6 text-lg">
              Are you a car salesperson or dealer? Help your customers get insured and earn money for every qualified lead you send to Options Insurance Agency.
            </p>
            <div className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
              <h4 className="text-[#1e3a5f] font-semibold mb-3">How it works:</h4>
              <ul className="text-gray-600 space-y-2">
                <li className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-[#1e3a5f] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Sign up and connect with Options Insurance
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-[#1e3a5f] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Submit customer info (phone, email, driver&apos;s license)
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
                  Choose payout: Venmo, PayPal, or Bank Transfer
                </li>
              </ul>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Link
                href="/auth/register?role=provider"
                className="w-full sm:w-auto px-8 py-4 rounded-xl text-lg font-semibold transition-all transform hover:scale-105 bg-[#1e3a5f] text-white shadow-lg hover:shadow-xl hover:bg-[#2a4a6f] text-center"
              >
                <span className="flex items-center justify-center gap-2">
                  Get Started
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </Link>
              <div className="flex items-center gap-2 text-[#1e3a5f] font-semibold">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
                </svg>
                Earn money per lead
              </div>
            </div>
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
