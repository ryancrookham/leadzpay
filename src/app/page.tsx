"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/app/components/Sidebar";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated, currentUser, isLoading, logout } = useAuth();
  const dashboardUrl = currentUser?.role === "admin" ? "/admin" : currentUser?.role === "buyer" ? "/business" : "/provider-dashboard";

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show loading state only after client mount to avoid hydration mismatch
  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-[#0d1b2e] flex items-center justify-center">
        <div className="text-center">
          <Image
            src="/woml-alt-white.png"
            alt="WOML"
            width={200}
            height={60}
            className="mx-auto mb-4 animate-pulse w-auto h-auto"
            priority
          />
          <div className="text-white/50 text-sm font-sans">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Fixed Watermark */}
      <div 
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none select-none"
        aria-hidden="true"
      >
        <Image
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/black%20orange%20fill%403x-vH0gXy64jc2rCyf5HVrtWl6Fll3usO.png"
          alt=""
          width={800}
          height={800}
          className="w-[40vw] h-auto opacity-[0.035]"
          priority
        />
      </div>

      {/* Navigation - Dark */}
      <nav className="flex items-center px-8 py-4 bg-[#0d1b2e] border-b border-white/10 relative z-10">
        <div className="flex-1 flex items-center">
          <Sidebar />
        </div>
        <button
          onClick={() => { window.location.href = "/admin"; }}
          className="cursor-pointer"
        >
          <Image
            src="/woml-alt-white.png"
            alt="WOML - Word of Mouth Leads"
            width={180}
            height={54}
            className="h-auto w-auto max-h-12 object-contain"
          />
        </button>
        <div className="flex-1 flex items-center justify-end gap-3">
          {isAuthenticated ? (
            <div className="flex gap-2 items-center">
              <Link
                href={dashboardUrl}
                className="bg-[#E77500] hover:bg-[#D47526] text-white px-5 py-2.5 rounded-lg font-medium transition flex items-center gap-2 font-sans"
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
                className="text-white/60 hover:text-red-400 px-3 py-2 rounded-lg transition flex items-center gap-1"
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
                href="/auth/login"
                className="text-white/80 hover:text-white px-3 py-2 font-medium transition font-sans"
              >
                Sign In
              </Link>
              <Link
                href="/auth/register?role=buyer"
                className="bg-[#E77500] hover:bg-[#D47526] text-white px-5 py-2.5 rounded-lg font-medium transition font-sans"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      <main className="flex-1 relative z-[1]">
        {/* Hero Section - Dark Navy */}
        <section className="relative py-32 px-8 bg-[#0d1b2e] overflow-hidden">
          {/* Background mesh gradient */}
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#E77500]/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#E77500]/10 rounded-full blur-3xl" />
          </div>
          
          <div className="max-w-5xl mx-auto text-center relative z-10">
            <h1 className="text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold text-white leading-[1.05] mb-8 font-heading tracking-tight">
              Word of Mouth is Your
              <br />
              Best Lead Source.
              <br />
              <span className="text-[#E77500]">Now Make It Scalable.</span>
            </h1>
            <p className="text-lg md:text-xl text-white/60 mb-12 max-w-2xl mx-auto leading-relaxed font-sans">
              Create your private referral channel, invite your network, and receive verified leads with automatic payments. Join businesses facilitating over 3,000 leads monthly.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/auth/register?role=buyer"
                className="bg-[#E77500] hover:bg-[#D47526] text-white px-10 py-4 rounded-lg font-medium text-lg transition shadow-xl shadow-[#E77500]/25 hover:shadow-2xl hover:shadow-[#E77500]/30 font-sans"
              >
                Start Your Free Channel
              </Link>
              <Link
                href="/how-it-works"
                className="border border-white/30 text-white/90 hover:bg-white/10 hover:border-white/50 px-10 py-4 rounded-lg font-medium text-lg transition font-sans"
              >
                See How It Works
              </Link>
            </div>
          </div>
        </section>

        {/* Why WOML Section - White */}
        <section className="py-28 px-8 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#0d1b2e] mb-6 font-heading tracking-tight">Why Businesses Choose WOML</h2>
              <p className="text-[#0d1b2e]/50 text-lg max-w-2xl mx-auto font-sans">Your referral network is valuable. Keep it private, automated, and under your control.</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  title: "Private Channels",
                  description: "Every business gets a completely isolated channel. Your providers, your leads, your data.",
                  icon: (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  ),
                },
                {
                  title: "Automated Payments",
                  description: "Stripe-powered payouts. Approve a lead, your provider gets paid instantly to their bank.",
                  icon: (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                },
                {
                  title: "Verified Leads",
                  description: "Built-in license verification catches fake or blurry IDs before they reach you.",
                  icon: (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  ),
                },
                {
                  title: "Real-Time Control",
                  description: "Accept, reject, or flag leads instantly. Track conversions and provider performance.",
                  icon: (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  ),
                },
              ].map((card, i) => (
                <div
                  key={i}
                  className="glass-card rounded-2xl p-8 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="w-14 h-14 bg-[#E77500]/10 rounded-xl flex items-center justify-center text-[#E77500] mb-5">
                    {card.icon}
                  </div>
                  <h3 className="text-xl font-bold text-[#0d1b2e] mb-3 font-heading">{card.title}</h3>
                  <p className="text-[#0d1b2e]/50 text-sm leading-relaxed font-sans">{card.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Section - White with big numbers */}
        <section className="py-24 px-8 bg-[#f8f9fc]">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-3 gap-12 text-center">
              {[
                { value: "3,000+", label: "Leads Facilitated Monthly" },
                { value: "$500+", label: "Average Provider Earnings" },
                { value: "< 2 min", label: "Provider Onboarding" },
              ].map((stat, i) => (
                <div key={i}>
                  <div className="text-6xl md:text-7xl lg:text-8xl font-bold text-[#0d1b2e] mb-3 font-heading tracking-tight">{stat.value}</div>
                  <div className="text-[#0d1b2e]/40 text-sm tracking-widest uppercase font-sans font-medium">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Section - White */}
        <section className="py-28 px-8 bg-white">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#0d1b2e] mb-6 font-heading tracking-tight">4 Easy Steps</h2>
              <p className="text-[#0d1b2e]/50 text-lg font-sans">From setup to payout in under 10 minutes.</p>
            </div>
            <div className="space-y-10">
              {[
                {
                  step: 1,
                  title: "Create Your Channel",
                  description: "Sign up, set your lead criteria, required fields, and payout rate per lead.",
                },
                {
                  step: 2,
                  title: "Invite Your Providers",
                  description: "Send branded SMS invites or share your unique link. Providers sign up in under 2 minutes.",
                },
                {
                  step: 3,
                  title: "Receive & Review Leads",
                  description: "Leads flow into your dashboard with verified info. Accept good ones, reject bad ones.",
                },
                {
                  step: 4,
                  title: "Automatic Payouts",
                  description: "Approved leads trigger instant Stripe payments. You only pay for leads you keep.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex gap-8 items-start"
                >
                  <div className="w-14 h-14 rounded-full bg-[#E77500] text-white flex items-center justify-center font-bold text-xl shrink-0 font-heading">
                    {item.step}
                  </div>
                  <div className="pt-2">
                    <h3 className="text-2xl font-bold text-[#0d1b2e] mb-2 font-heading">{item.title}</h3>
                    <p className="text-[#0d1b2e]/50 text-lg leading-relaxed font-sans">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Provider Callout - Light gray */}
        <section className="py-24 px-8 bg-[#f8f9fc]">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-[#0d1b2e] mb-6 font-heading tracking-tight">Are You a Lead Provider?</h2>
            <p className="text-[#0d1b2e]/50 text-lg mb-10 font-sans leading-relaxed">
              Already referring customers to businesses you work with? Get paid for every referral. Your business will invite you when they&apos;re ready.
            </p>
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-2 text-[#E77500] hover:text-[#D47526] font-medium text-lg transition font-sans"
            >
              Learn More
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </section>

        {/* FAQ Section - White */}
        <section className="py-28 px-8 bg-white">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#0d1b2e] mb-4 font-heading tracking-tight">Questions?</h2>
            </div>
            <div className="space-y-4">
              {[
                {
                  q: "How much does WOML cost?",
                  a: "WOML is free to set up. You only pay a small platform fee on each approved lead payout. No monthly fees, no hidden costs.",
                },
                {
                  q: "Can providers see other businesses?",
                  a: "No. Each provider is locked to the specific business that invited them. They cannot see, access, or send leads to any other business on the platform.",
                },
                {
                  q: "How do payments work?",
                  a: "When you approve a lead, the payout is automatically sent to your provider via Stripe. Funds are deposited directly to their linked bank account.",
                },
                {
                  q: "What if I want to reject a lead?",
                  a: "You have full control. Reject any lead with a single click and optionally provide a reason. Rejected leads don't trigger any payment.",
                },
                {
                  q: "How do providers sign up?",
                  a: "You invite providers via SMS or a unique link. They complete a simple 2-minute onboarding, verify their identity, and they're ready to send leads.",
                },
              ].map((faq, i) => (
                <details
                  key={i}
                  className="group glass-card rounded-2xl overflow-hidden"
                >
                  <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                    <span className="font-bold text-[#0d1b2e] text-lg font-heading">{faq.q}</span>
                    <svg
                      className="w-5 h-5 text-[#0d1b2e]/30 group-open:rotate-180 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <div className="px-6 pb-6 text-[#0d1b2e]/50 leading-relaxed font-sans">
                    {faq.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA - Dark Navy */}
        <section className="py-32 px-8 bg-[#0d1b2e]">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 font-heading tracking-tight">
              Ready to Scale Your <span className="text-[#E77500]">Referrals</span>?
            </h2>
            <p className="text-white/50 text-lg mb-12 font-sans leading-relaxed">
              Join businesses using WOML to turn word of mouth into a predictable lead engine.
            </p>
            <Link
              href="/auth/register?role=buyer"
              className="inline-block bg-[#E77500] hover:bg-[#D47526] text-white px-12 py-5 rounded-lg font-medium text-lg transition shadow-xl shadow-[#E77500]/30 hover:shadow-2xl hover:shadow-[#E77500]/40 font-sans"
            >
              Start Your Free Channel
            </Link>
          </div>
        </section>
      </main>

      {/* Footer - Dark Navy */}
      <footer className="border-t border-white/10 py-10 px-8 bg-[#0d1b2e] relative z-[1]">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-5">
          <Image
            src="/woml-alt-white.png"
            alt="WOML - Word of Mouth Leads"
            width={120}
            height={36}
            className="h-auto w-auto max-h-10 object-contain"
          />
          <div className="text-white/25 text-xs italic text-center font-sans max-w-md">
            &ldquo;So whether you eat or drink or whatever you do, do it all for the glory of God.&rdquo;
            <span className="not-italic font-medium text-white/35 ml-1">— 1 Corinthians 10:31</span>
          </div>
          <div className="text-white/25 text-xs font-sans">© 2026 WOML LLC. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
