"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<"provider" | "receiver" | null>(null);

  const handleContinue = () => {
    if (selectedRole === "provider") {
      router.push("/submit-lead");
    } else if (selectedRole === "receiver") {
      router.push("/business");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a1628] relative overflow-hidden">
      {/* Background circuit lines effect */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-20 left-10 w-px h-32 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        <div className="absolute top-40 left-10 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" />
        <div className="absolute top-20 right-20 w-px h-48 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        <div className="absolute top-[68px] right-20 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" />
        <div className="absolute bottom-40 right-10 w-px h-24 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        <div className="absolute bottom-40 right-10 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          {/* Logo matching the image */}
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-[#1e3a5f] to-[#0d2240] border border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.3)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg viewBox="0 0 40 40" className="w-8 h-8">
                {/* L shape */}
                <path
                  d="M8 8 L8 28 L18 28"
                  fill="none"
                  stroke="url(#logoGradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-[0_0_8px_#22d3ee]"
                />
                {/* Lightning bolt */}
                <path
                  d="M22 8 L16 20 L22 20 L18 32"
                  fill="none"
                  stroke="url(#logoGradient)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-[0_0_8px_#22d3ee]"
                />
                {/* P shape */}
                <path
                  d="M26 28 L26 8 L32 8 Q36 8 36 14 Q36 20 32 20 L26 20"
                  fill="none"
                  stroke="url(#logoGradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-[0_0_8px_#22d3ee]"
                />
                <defs>
                  <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#67e8f9" />
                    <stop offset="100%" stopColor="#22d3ee" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
          <span className="text-2xl font-bold text-white tracking-wide">
            Leadz<span className="text-cyan-400">Pay</span>
          </span>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => router.push("/business")}
            className="text-slate-300 hover:text-cyan-400 transition px-4 py-2 rounded-lg border border-transparent hover:border-cyan-500/30"
          >
            Business Login
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-5xl mx-auto px-8 py-12">
        <div className="text-center mb-12">
          <div className="inline-block mb-4 px-4 py-2 bg-cyan-500/10 rounded-full border border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.15)]">
            <span className="text-cyan-400 text-sm font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
              </svg>
              Car Insurance Lead Marketplace
            </span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Who Are You?
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Select your role to get started with LeadzPay
          </p>
        </div>

        {/* Role Selection */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
          {/* Lead Provider Card */}
          <button
            onClick={() => setSelectedRole("provider")}
            className={`group p-8 rounded-2xl border-2 transition-all text-left relative overflow-hidden ${
              selectedRole === "provider"
                ? "border-cyan-500 bg-cyan-500/10 scale-[1.02] shadow-[0_0_40px_rgba(34,211,238,0.2)]"
                : "border-slate-700/50 bg-[#0d2240]/50 hover:border-cyan-500/50 hover:bg-[#0d2240]"
            }`}
          >
            {/* Glow effect */}
            <div className={`absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 transition-opacity ${
              selectedRole === "provider" ? "opacity-100" : "group-hover:opacity-50"
            }`} />

            {selectedRole === "provider" && (
              <div className="absolute top-4 right-4">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                  <svg className="w-5 h-5 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            )}

            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#1e3a5f] to-[#0d2240] border border-cyan-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                  <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">I Have a Customer</h3>
                  <p className="text-cyan-400 text-sm font-medium">Lead Provider / Car Salesperson</p>
                </div>
              </div>
              <p className="text-slate-300 mb-6 text-lg">
                I&apos;m a car salesperson or dealer connecting a driver with insurance so they can legally drive their new vehicle.
              </p>
              <div className="bg-[#0a1628]/80 rounded-xl p-4 mb-4 border border-slate-700/50">
                <h4 className="text-white font-semibold mb-3">What you&apos;ll do:</h4>
                <ul className="text-slate-400 space-y-2">
                  <li className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-cyan-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Submit customer info for instant quotes
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-cyan-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Get paid for every qualified lead
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-cyan-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Choose payout: Venmo, PayPal, or Bank
                  </li>
                </ul>
              </div>
              <div className="flex items-center gap-2 text-cyan-400 font-semibold">
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
            className={`group p-8 rounded-2xl border-2 transition-all text-left relative overflow-hidden ${
              selectedRole === "receiver"
                ? "border-cyan-500 bg-cyan-500/10 scale-[1.02] shadow-[0_0_40px_rgba(34,211,238,0.2)]"
                : "border-slate-700/50 bg-[#0d2240]/50 hover:border-cyan-500/50 hover:bg-[#0d2240]"
            }`}
          >
            {/* Glow effect */}
            <div className={`absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 transition-opacity ${
              selectedRole === "receiver" ? "opacity-100" : "group-hover:opacity-50"
            }`} />

            {selectedRole === "receiver" && (
              <div className="absolute top-4 right-4">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                  <svg className="w-5 h-5 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            )}

            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#1e3a5f] to-[#0d2240] border border-cyan-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                  <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">I&apos;m a Business Owner</h3>
                  <p className="text-cyan-400 text-sm font-medium">Lead Receiver / Insurance Agency</p>
                </div>
              </div>
              <p className="text-slate-300 mb-6 text-lg">
                I own an insurance agency and want to receive qualified leads, manage payouts to salespeople, and track my business.
              </p>
              <div className="bg-[#0a1628]/80 rounded-xl p-4 mb-4 border border-slate-700/50">
                <h4 className="text-white font-semibold mb-3">What you&apos;ll do:</h4>
                <ul className="text-slate-400 space-y-2">
                  <li className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-cyan-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    View all incoming leads with quotes
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-cyan-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Set & adjust payout rates per salesperson
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-cyan-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Full ledger, charts & financial tracking
                  </li>
                </ul>
              </div>
              <div className="flex items-center gap-2 text-cyan-400 font-semibold">
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
              className="relative px-12 py-4 rounded-xl text-lg font-semibold transition-all transform hover:scale-105 bg-gradient-to-r from-cyan-500 to-cyan-400 text-[#0a1628] shadow-[0_0_30px_rgba(34,211,238,0.4)] hover:shadow-[0_0_40px_rgba(34,211,238,0.6)]"
            >
              <span className="relative z-10 flex items-center gap-2">
                {selectedRole === "provider" ? "Submit a Lead & Get Paid" : "Sign In to Business Portal"}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            </button>
          </div>
        )}

        {/* How It Works */}
        <div className="mt-16 mb-24">
          <h2 className="text-3xl font-bold text-white text-center mb-12">How LeadzPay Works</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { num: "1", title: "Customer Walks In", desc: "A car buyer needs insurance to drive off the lot legally", color: "from-cyan-500 to-cyan-400" },
              { num: "2", title: "Salesperson Submits", desc: "Enter customer info, get instant quotes from 10+ carriers", color: "from-cyan-400 to-cyan-300" },
              { num: "3", title: "Customer Buys Policy", desc: "AI chatbot closes the deal with best rate", color: "from-cyan-300 to-cyan-200" },
              { num: "4", title: "Everyone Gets Paid", desc: "Salesperson paid via Venmo/PayPal/Bank, recorded on ledger", color: "from-cyan-200 to-white" },
            ].map((step, i) => (
              <div key={i} className="text-center group">
                <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(34,211,238,0.3)] group-hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] transition-shadow`}>
                  <span className="text-2xl font-bold text-[#0a1628]">{step.num}</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-slate-400 text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="bg-gradient-to-br from-[#0d2240] to-[#0a1628] rounded-2xl border border-cyan-500/20 p-8 shadow-[0_0_40px_rgba(34,211,238,0.1)]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: "$50+", label: "Per Lead Payout" },
              { value: "10+", label: "Insurance Carriers" },
              { value: "3", label: "Payment Methods" },
              { value: "100%", label: "Transparent Ledger" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl font-bold text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">{stat.value}</div>
                <div className="text-slate-400 mt-2">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-700/50 py-8 px-8 mt-16">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#1e3a5f] to-[#0d2240] border border-cyan-500/30 flex items-center justify-center">
              <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-white">Leadz<span className="text-cyan-400">Pay</span></span>
          </div>
          <div className="text-slate-500 text-sm">© 2025 LeadzPay. All rights reserved.</div>
        </div>
      </footer>

      {/* Sparkle decoration */}
      <div className="absolute bottom-20 right-20 opacity-60">
        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
        </svg>
      </div>
    </div>
  );
}
