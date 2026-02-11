"use client";

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
    <div className="min-h-screen bg-white flex flex-col">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center">
          <Image
            src="/woml-logo.png"
            alt="WOML - Word of Mouth Leads"
            width={280}
            height={80}
            className="h-20 w-auto object-contain"
          />
        </div>
        <div className="flex gap-3 items-center">
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
              <Link
                href="/auth/forgot-password"
                className="text-gray-500 hover:text-[#1e3a5f] px-3 py-2 text-sm transition"
              >
                Forgot Password?
              </Link>
              <Link
                href="/auth/login"
                className="text-[#1e3a5f] hover:text-[#2a4a6f] px-3 py-2 font-medium transition"
              >
                Sign In
              </Link>
              <Link
                href="/auth/register?role=provider"
                className="bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white px-4 py-2 rounded-lg font-medium transition"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Center Logo */}
      <main className="flex-1 flex items-center justify-center px-8">
        <div className="text-center">
          <Image
            src="/woml-logo.png"
            alt="WOML - Word of Mouth Leads"
            width={1120}
            height={315}
            className="mx-auto w-full max-w-3xl h-auto object-contain"
            priority
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-8 bg-white">
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
