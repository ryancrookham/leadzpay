"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/app/components/Sidebar";

export default function Home() {
  const { isAuthenticated, currentUser, isLoading, logout } = useAuth();
  const dashboardUrl = currentUser?.role === "admin" ? "/admin" : currentUser?.role === "buyer" ? "/business" : "/provider-dashboard";

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
          <div className="text-[#E77500]/70 text-sm font-sans">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white via-[#f8f9fc] via-60% to-[#0d1b2e]">
      {/* Navigation */}
      <nav className="flex items-center px-8 py-4 bg-white/80 backdrop-blur-md border-b border-gray-100 relative z-[60]">
        <div className="flex-1 flex items-center">
          <Sidebar />
        </div>
        <button
          onClick={() => { window.location.href = "/admin"; }}
          className="cursor-pointer"
        >
          <Image
            src="/woml-alt-orange.png"
            alt="WOML - Word of Mouth Leads"
            width={360}
            height={108}
            className="h-[120px] w-auto object-contain"
          />
        </button>
        <div className="flex-1 flex items-center justify-end gap-3">
          {isAuthenticated ? (
            <div className="flex gap-2 items-center">
              <Link
                href={dashboardUrl}
                className="bg-[#E77500] hover:bg-[#D47526] text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 font-sans"
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
                className="text-[#0d1b2e]/60 hover:text-red-500 px-3 py-2 rounded-lg transition flex items-center gap-1"
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
                className="text-[#0d1b2e] hover:text-[#E77500] px-3 py-2 font-medium transition font-sans"
              >
                Sign In
              </Link>
              <Link
                href="/auth/register?role=buyer"
                className="bg-[#E77500] hover:bg-[#D47526] text-white px-4 py-2 rounded-lg font-medium transition font-sans"
              >
                Business Sign Up
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="py-24 px-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="text-center lg:text-left">
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-[#0d1b2e] leading-[1.1] mb-8 font-heading">
                  <span className="text-balance">Word of Mouth is Your Best Lead Source.</span>
                  <br />
                  <span className="text-[#E77500] text-balance">Now Make It Scalable.</span>
                </h1>
                <p className="text-lg md:text-xl text-[#0d1b2e]/60 mb-10 max-w-xl mx-auto lg:mx-0 text-pretty leading-relaxed font-sans">
                  Create your private referral channel, invite your network, and receive verified leads with automatic payments. Join businesses facilitating <span className="font-medium text-[#0d1b2e]">3,000+ leads monthly</span>.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                  <Link
                    href="/auth/register?role=buyer"
                    className="bg-[#E77500] hover:bg-[#D47526] text-white px-8 py-4 rounded-lg font-medium text-lg transition shadow-lg shadow-[#E77500]/20 hover:shadow-xl hover:shadow-[#E77500]/30 font-sans"
                  >
                    Start Your Free Channel
                  </Link>
                  <Link
                    href="/how-it-works"
                    className="border-2 border-[#0d1b2e] text-[#0d1b2e] hover:bg-[#0d1b2e] hover:text-white px-8 py-4 rounded-lg font-medium text-lg transition font-sans"
                  >
                    See How It Works
                  </Link>
                </div>
              </div>
              <div className="relative">
                <div className="glass-card rounded-2xl overflow-hidden">
                  <Image
                    src="/WOMLdesktopvisual.png"
                    alt="WOML Dashboard Preview"
                    width={800}
                    height={600}
                    className="w-full h-auto"
                    priority
                  />
                </div>
                <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-[#E77500]/10 rounded-full blur-3xl" />
                <div className="absolute -top-6 -right-6 w-40 h-40 bg-[#0d1b2e]/5 rounded-full blur-3xl" />
              </div>
            </div>
          </div>
        </section>

        {/* Why WOML Section */}
        <section className="py-24 px-8 bg-[#f0f2f7]/50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-[#0d1b2e] mb-4 font-heading">Why Businesses Choose WOML</h2>
              <p className="text-[#0d1b2e]/60 text-lg max-w-2xl mx-auto font-sans">Your referral network is valuable. Keep it private, automated, and under your control.</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  title: "Private Channels",
                  description: "Every business gets a completely isolated channel. Your providers, your leads, your data. No one else sees it.",
                  icon: (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  ),
                },
                {
                  title: "Automated Payments",
                  description: "Stripe-powered payouts. Approve a lead, your provider gets paid instantly to their bank. No manual transfers.",
                  icon: (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                },
                {
                  title: "Verified Leads",
                  description: "Built-in license verification catches fake or blurry IDs before they reach you. Only real leads get through.",
                  icon: (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  ),
                },
                {
                  title: "Real-Time Control",
                  description: "Accept, reject, or flag leads instantly. Track conversions, spend, and provider performance from your dashboard.",
                  icon: (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  ),
                },
              ].map((card, i) => (
                <div
                  key={i}
                  className="glass-card rounded-xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="w-12 h-12 bg-[#E77500]/10 rounded-lg flex items-center justify-center text-[#E77500] mb-4">
                    {card.icon}
                  </div>
                  <h3 className="text-lg font-bold text-[#0d1b2e] mb-2 font-heading">{card.title}</h3>
                  <p className="text-[#0d1b2e]/60 text-sm leading-relaxed font-sans">{card.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4 Easy Steps Section */}
        <section className="py-24 px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-[#0d1b2e] mb-4 font-heading">4 Easy Steps to Scale Your Referrals</h2>
              <p className="text-[#0d1b2e]/60 text-lg font-sans">From setup to payout in under 10 minutes.</p>
            </div>
            <div className="space-y-8">
              {[
                {
                  step: 1,
                  title: "Create Your Channel",
                  description: "Sign up, set your lead criteria, required fields, and payout rate per lead.",
                },
                {
                  step: 2,
                  title: "Invite Your Providers",
                  description: "Send branded SMS invites or share your unique link. Providers sign up in under 2 minutes, locked to your private channel.",
                },
                {
                  step: 3,
                  title: "Receive & Review Leads",
                  description: "Leads flow into your dashboard with verified info. Accept good ones, reject bad ones with a reason.",
                },
                {
                  step: 4,
                  title: "Automatic Payouts",
                  description: "Approved leads trigger instant Stripe payments. You only pay for leads you keep.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex gap-6 items-start"
                >
                  <div className="w-10 h-10 rounded-full bg-[#E77500] text-white flex items-center justify-center font-bold text-sm shrink-0 font-sans">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#0d1b2e] mb-1 font-heading">{item.title}</h3>
                    <p className="text-[#0d1b2e]/60 leading-relaxed font-sans">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="py-20 px-8 bg-[#0d1b2e]">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8 text-center">
              {[
                { value: "3,000+", label: "Leads Facilitated Monthly" },
                { value: "$500+", label: "Average Provider Monthly Earnings" },
                { value: "< 2 min", label: "Provider Onboarding Time" },
              ].map((stat, i) => (
                <div key={i}>
                  <div className="text-4xl md:text-5xl font-bold text-white mb-2 font-heading">{stat.value}</div>
                  <div className="text-white/50 text-sm tracking-wide uppercase font-sans">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Provider Callout */}
        <section className="py-24 px-8 bg-[#0d1b2e]">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 font-heading">Are You a Lead Provider?</h2>
            <p className="text-white/60 text-lg mb-8 font-sans">
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

        {/* FAQ Section */}
        <section className="py-24 px-8 bg-[#0d1b2e]">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 font-heading">Frequently Asked Questions</h2>
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
                  className="group glass-card rounded-xl overflow-hidden"
                >
                  <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                    <span className="font-bold text-[#0d1b2e] font-heading">{faq.q}</span>
                    <svg
                      className="w-5 h-5 text-[#0d1b2e]/40 group-open:rotate-180 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <div className="px-6 pb-6 text-[#0d1b2e]/60 leading-relaxed font-sans">
                    {faq.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 px-8 bg-[#0d1b2e]">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 font-heading">Ready to Scale Your Referrals?</h2>
            <p className="text-white/60 text-lg mb-10 font-sans">
              Join businesses using WOML to turn word of mouth into a predictable lead engine.
            </p>
            <Link
              href="/auth/register?role=buyer"
              className="inline-block bg-[#E77500] hover:bg-[#D47526] text-white px-10 py-4 rounded-lg font-medium text-lg transition shadow-lg shadow-[#E77500]/30 hover:shadow-xl hover:shadow-[#E77500]/40 font-sans"
            >
              Start Your Free Channel
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-8 px-8 bg-[#0d1b2e]">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-4">
          <Image
            src="/woml-alt-white.png"
            alt="WOML - Word of Mouth Leads"
            width={120}
            height={36}
            className="h-9 w-auto object-contain"
          />
          <div className="text-white/30 text-xs italic text-center font-sans">
            &ldquo;So whether you eat or drink or whatever you do, do it all for the glory of God.&rdquo;
            <span className="not-italic font-medium text-white/40 ml-1">— 1 Corinthians 10:31</span>
          </div>
          <div className="text-white/30 text-xs font-sans">© 2026 WOML LLC. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
