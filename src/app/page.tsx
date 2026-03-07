"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";

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
      <div className="min-h-screen bg-[#E77500] flex items-center justify-center">
        <div className="text-center">
          <Image
            src="/woml-v3.png"
            alt="WOML"
            width={200}
            height={60}
            className="mx-auto mb-4 animate-pulse"
            priority
          />
          <div className="text-white/70 text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E77500] flex flex-col">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-white/20 bg-[#E77500]/80 backdrop-blur-sm">
        <button
          onClick={() => { window.location.href = "/admin"; }}
          className="flex items-center border-2 border-white/30 rounded-lg px-3 py-2 hover:border-white transition cursor-pointer"
        >
          <Image
            src="/woml-v3.png"
            alt="WOML - Word of Mouth Leads"
            width={280}
            height={80}
            className="h-20 w-auto object-contain"
          />
        </button>
        <div className="flex gap-3 items-center">
          {isAuthenticated ? (
            <div className="flex gap-2 items-center">
              <Link
                href={dashboardUrl}
                className="bg-white hover:bg-white/90 text-[#E77500] px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"
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
                className="text-white/70 hover:text-red-300 px-3 py-2 rounded-lg transition flex items-center gap-1"
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
                className="text-white/70 hover:text-white px-3 py-2 text-sm transition"
              >
                Forgot Password?
              </Link>
              <Link
                href="/auth/login"
                className="text-white hover:text-white/80 px-3 py-2 font-medium transition"
              >
                Sign In
              </Link>
              <Link
                href="/auth/register?role=provider"
                className="bg-white hover:bg-white/90 text-[#E77500] px-4 py-2 rounded-lg font-medium transition"
              >
                Provider Sign Up
              </Link>
              <Link
                href="/auth/register?role=buyer"
                className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg font-medium transition border border-white/30"
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
            src="/woml-v3.png"
            alt="WOML - Word of Mouth Leads"
            width={4480}
            height={1260}
            className="mx-auto w-full h-auto object-contain"
            priority
          />
        </div>
      </main>

      {/* Legal Documents Section */}
      <section className="border-t border-white/20 py-16 px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-white font-bold text-2xl mb-2">Legal Documents</h2>
            <p className="text-white/60 text-sm">
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
                    ? 'bg-white text-[#E77500] border-white'
                    : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                }`}
              >
                {doc.label}
              </button>
            ))}
          </div>
          <p className="text-center text-white/50 text-xs mb-4">
            {docs.find((d) => d.id === activeDoc)?.description}
          </p>
          <div className="rounded-xl border border-white/20 shadow-xl bg-white/10 p-8 text-center">
            <h3 className="text-white font-bold text-xl mb-2">
              {docs.find((d) => d.id === activeDoc)?.label}
            </h3>
            <p className="text-white/60 text-sm mb-6">
              {docs.find((d) => d.id === activeDoc)?.description}
            </p>
            <div className="flex justify-center gap-3">
              <a
                href={docs.find((d) => d.id === activeDoc)?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white hover:bg-white/90 text-[#E77500] px-6 py-2.5 rounded-lg font-medium transition"
              >
                View PDF
              </a>
              <a
                href={docs.find((d) => d.id === activeDoc)?.url}
                download
                className="bg-white hover:bg-white/90 text-[#E77500] px-6 py-2.5 rounded-lg font-medium transition"
              >
                Download
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/20 py-8 px-8 bg-[#E77500]">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-4">
          <Image
            src="/woml-v3.png"
            alt="WOML - Word of Mouth Leads"
            width={120}
            height={36}
            className="h-9 w-auto object-contain"
          />
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <a href="/WOML_Business_Agreement.pdf" target="_blank" rel="noopener noreferrer"
              className="text-white/50 hover:text-white/80 text-xs transition">
              Business Agreement
            </a>
            <span className="text-white/30 text-xs">·</span>
            <a href="/WOML_Provider_Agreement.pdf" target="_blank" rel="noopener noreferrer"
              className="text-white/50 hover:text-white/80 text-xs transition">
              Provider Agreement
            </a>
            <span className="text-white/30 text-xs">·</span>
            <a href="/WOML_Privacy_Policy.pdf" target="_blank" rel="noopener noreferrer"
              className="text-white/50 hover:text-white/80 text-xs transition">
              Privacy Policy
            </a>
          </div>
          <div className="text-white/40 text-xs">© 2026 WOML LLC. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
