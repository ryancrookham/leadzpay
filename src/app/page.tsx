"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/app/components/Sidebar";

export default function Home() {
  const { isAuthenticated, currentUser, isLoading, logout } = useAuth();
  const [activeDoc, setActiveDoc] = useState<'business' | 'provider' | 'privacy'>('business');

  // Get dashboard URL based on user role
  const dashboardUrl = currentUser?.role === "admin" ? "/admin" : currentUser?.role === "buyer" ? "/business" : "/provider-dashboard";

  const docs = [
    {
      id: 'business',
      label: 'Business Agreement',
      description: 'Terms governing business accounts, lead channels, and payout structures.',
      url: '/WOML_Business_Agreement.pdf',
    },
    {
      id: 'provider',
      label: 'Provider Agreement',
      description: 'Terms for lead providers — submissions, earnings, and platform conduct.',
      url: '/WOML_Provider_Agreement.pdf',
    },
    {
      id: 'privacy',
      label: 'Privacy Policy',
      description: 'How WOML collects, uses, protects, and in limited cases commercializes data.',
      url: '/WOML_Privacy_Policy.pdf',
    },
  ] as const;

  // Show minimal loading state only while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <Image
            src="/woml-alt-orange.png"
            alt="WOML"
            width={200}
            height={60}
            className="mx-auto mb-4 animate-pulse"
            priority
          />
          <div className="text-[#E77500]/70 text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Navigation */}
      <nav className="flex items-center px-8 py-4 bg-white border-b border-gray-100 relative z-[60]">
        {/* Left: hamburger — flex-1 balances the right side */}
        <div className="flex-1 flex items-center">
          <Sidebar />
        </div>
        {/* Center: logo in document flow so nav height expands naturally */}
        <button
          onClick={() => { window.location.href = "/admin"; }}
          className="cursor-pointer"
        >
          <Image
            src="/woml-alt-orange.png"
            alt="WOML - Word of Mouth Leads"
            width={360}
            height={108}
            className="h-10 w-auto object-contain"
          />
        </button>
        {/* Right: auth buttons — flex-1 keeps logo centered */}
        <div className="flex-1 flex items-center justify-end gap-3">
          {isAuthenticated ? (
            <div className="flex gap-2 items-center">
              <Link
                href={dashboardUrl}
                className="bg-[#E77500] hover:bg-[#D47526] text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"
              >
                Go to Dashboard
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <button
                onClick={async () => {
                  await logout();
                  window.location.reload();
                }}
                className="text-gray-500 hover:text-red-500 px-3 py-2 rounded-lg transition flex items-center gap-1"
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
                className="text-gray-500 hover:text-[#E77500] px-3 py-2 text-sm transition"
              >
                Forgot Password?
              </Link>
              <Link
                href="/auth/login"
                className="text-[#152238] hover:text-[#E77500] px-3 py-2 font-medium transition"
              >
                Sign In
              </Link>
              <Link
                href="/auth/register?role=buyer"
                className="bg-[#E77500] hover:bg-[#D47526] text-white px-4 py-2 rounded-lg font-medium transition border border-[#E77500]"
              >
                Business Sign Up
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Center Logo */}
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Image
            src="/woml-alt-orange.png"
            alt="WOML - Word of Mouth Leads"
            width={4480}
            height={1260}
            className="mx-auto w-full h-auto object-contain"
            priority
          />
        </div>
      </main>

      {/* Legal Documents Section */}
      <section className="border-t border-gray-200 py-16 px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-[#152238] font-bold text-2xl mb-2">Legal Documents</h2>
            <p className="text-gray-500 text-sm">
              All WOML platform agreements and policies are publicly available below.
              Documents are updated here whenever changes are made.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {docs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setActiveDoc(doc.id)}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition border ${
                  activeDoc === doc.id
                    ? 'bg-[#E77500] text-white border-[#E77500]'
                    : 'bg-white text-[#152238] border-gray-200 hover:bg-gray-50'
                }`}
              >
                {doc.label}
              </button>
            ))}
          </div>
          <p className="text-center text-gray-500 text-xs mb-4">
            {docs.find((d) => d.id === activeDoc)?.description}
          </p>
          <div className="rounded-xl border border-gray-200 shadow-xl bg-[#F5F5F5] p-8 text-center">
            <h3 className="text-[#152238] font-bold text-xl mb-2">
              {docs.find((d) => d.id === activeDoc)?.label}
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              {docs.find((d) => d.id === activeDoc)?.description}
            </p>
            <div className="flex justify-center gap-3">
              <a
                href={docs.find((d) => d.id === activeDoc)?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#E77500] hover:bg-[#D47526] text-white px-6 py-2.5 rounded-lg font-medium transition"
              >
                View PDF
              </a>
              <a
                href={docs.find((d) => d.id === activeDoc)?.url}
                download
                className="bg-[#E77500] hover:bg-[#D47526] text-white px-6 py-2.5 rounded-lg font-medium transition"
              >
                Download
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 py-8 px-8 bg-[#152238]">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-4">
          <Image
            src="/woml-alt-white.png"
            alt="WOML - Word of Mouth Leads"
            width={120}
            height={36}
            className="h-9 w-auto object-contain"
          />
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <a href="/WOML_Business_Agreement.pdf" target="_blank" rel="noopener noreferrer"
              className="text-white/60 hover:text-white text-xs transition">
              Business Agreement
            </a>
            <span className="text-white/40 text-xs">·</span>
            <a href="/WOML_Provider_Agreement.pdf" target="_blank" rel="noopener noreferrer"
              className="text-white/60 hover:text-white text-xs transition">
              Provider Agreement
            </a>
            <span className="text-white/40 text-xs">·</span>
            <a href="/WOML_Privacy_Policy.pdf" target="_blank" rel="noopener noreferrer"
              className="text-white/60 hover:text-white text-xs transition">
              Privacy Policy
            </a>
          </div>
          <div className="text-sm text-white/60">
            Need help? Email us at{" "}
            <a
              href="mailto:support@womleads.com?subject=WOML Support Request"
              className="text-white/80 hover:text-white underline underline-offset-2 transition"
            >
              support@womleads.com
            </a>
          </div>
          <div className="text-white/40 text-xs italic text-center">
            &ldquo;So whether you eat or drink or whatever you do, do it all for the glory of God.&rdquo;
            <span className="not-italic font-medium text-white/50 ml-1">— 1 Corinthians 10:31</span>
          </div>
          <div className="text-white/40 text-xs">© 2026 WOML LLC. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
