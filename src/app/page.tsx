"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/app/components/Sidebar";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated, currentUser, isLoading, logout } = useAuth();
  const dashboardUrl =
    currentUser?.role === "admin"
      ? "/admin"
      : currentUser?.role === "buyer"
      ? "/business"
      : "/provider-dashboard";

  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Stat counters ──────────────────────────────────────────────────────────
  const statsRef = useRef<HTMLDivElement>(null);
  const statsStartedRef = useRef(false);
  const [c0, setC0] = useState(0);   // 0 → 3000  "3,000+"
  const [c1, setC1] = useState(0);   // 0 → 100   "100%"
  const [c2, setC2] = useState(10);  // 10 → 2    "< X min"

  useEffect(() => {
    const animate = (
      from: number,
      to: number,
      duration: number,
      setter: (v: number) => void
    ) => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setter(Math.round(from + (to - from) * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const startCounters = () => {
      if (statsStartedRef.current) return;
      const el = statsRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.9) {
        statsStartedRef.current = true;
        animate(0,  3000, 1800, setC0);
        animate(0,  100,  1600, setC1);
        animate(10, 2,    1400, setC2);
        window.removeEventListener("scroll", startCounters);
      }
    };

    // Check immediately in case already in view, then listen for scroll
    startCounters();
    window.addEventListener("scroll", startCounters, { passive: true });
    return () => window.removeEventListener("scroll", startCounters);
  }, []);

if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-[#212121] flex items-center justify-center">
        <div className="text-center">
          <Image
            src="/woml-alt-white.png"
            alt="WOML"
            width={200}
            height={60}
            className="mx-auto mb-4 animate-pulse w-auto h-auto"
            priority
          />
          <div className="text-white/50 text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">

      {/* ─── WOML LOGO WATERMARK ────────────────────────────────────────────
          mix-blend-mode: multiply makes this invisible on dark/navy backgrounds
          and subtly visible on white/light backgrounds only               ── */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none select-none"
        style={{ mixBlendMode: "multiply" }}
        aria-hidden="true"
      >
        <Image
          src="/woml-navy.png"
          alt=""
          width={700}
          height={210}
          className="opacity-[0.045] w-[55vw] h-auto"
          priority
        />
      </div>

      {/* ─── NAVIGATION ─────────────────────────────────────────────────── */}
      <nav className="flex items-center px-8 py-4 bg-white border-b border-gray-100 relative z-50 sticky top-0">
        <div className="flex-1 flex items-center">
          <Sidebar />
        </div>
        <button
          onClick={() => { window.location.href = "/admin"; }}
          className="cursor-pointer"
        >
          <Image
            src="/woml-alt-orange.png"
            alt="WOML"
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
                className="bg-[#E77500] hover:bg-[#D47526] text-white px-5 py-2 rounded-lg font-medium transition flex items-center gap-2 text-sm"
              >
                Dashboard
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <button
                onClick={async () => { await logout(); window.location.reload(); }}
                className="text-[#212121]/50 hover:text-red-400 px-2 py-2 rounded-lg transition"
                title="Log Out"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <Link href="/auth/login" className="text-[#212121] hover:text-[#E77500] px-3 py-2 font-medium transition text-sm">
                Sign In
              </Link>
              <Link href="/auth/register?role=buyer" className="bg-[#E77500] hover:bg-[#D47526] text-white px-5 py-2 rounded-lg font-medium transition text-sm">
                Business Sign Up
              </Link>
            </>
          )}
        </div>
      </nav>

      <main className="flex-1 relative z-[1]">

        {/* ─── HERO — Dark Navy with fixed background image ────────────────── */}
        <section
          className="relative py-36 px-8 overflow-hidden"
          style={{ background: "#212121" }}
        >
          {/* Fixed parallax background image — stays put as you scroll through hero */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "url('/woml-icon-orange.png')",
              backgroundAttachment: "fixed",
              backgroundSize: "420%",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              opacity: 0.08,
            }}
          />
          {/* Ambient glow orbs */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#E77500]/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-5xl mx-auto text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs text-white/50 tracking-wider uppercase mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E77500] animate-pulse" />
              Facilitating 3,000+ leads monthly
            </div>
            <h1 className="text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold text-white leading-[1.05] mb-8 tracking-tight">
              Word of Mouth is Your
              <br />
              Best Lead Source.
              <br />
              <span className="text-[#E77500]">Now Make It Scalable.</span>
            </h1>
            <p className="text-lg md:text-xl text-white/55 mb-12 max-w-2xl mx-auto leading-relaxed">
              Create your private referral channel, invite your network, and receive verified leads with automatic payments.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/auth/register?role=buyer"
                className="bg-[#E77500] hover:bg-[#D47526] text-white px-10 py-4 rounded-lg font-semibold text-lg transition shadow-xl shadow-[#E77500]/25 hover:shadow-2xl hover:shadow-[#E77500]/35"
              >
                Start Your Free Channel
              </Link>
              <Link
                href="/how-it-works"
                className="border border-white/25 text-white/80 hover:bg-white/10 hover:border-white/40 px-10 py-4 rounded-lg font-semibold text-lg transition"
              >
                See How It Works
              </Link>
            </div>
          </div>
        </section>

        {/* ─── WHY WOML — White with glossy cards ─────────────────────────── */}
        <section className="py-28 px-8 bg-white relative z-[1]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#212121] mb-6 tracking-tight">
                Why Businesses Choose <span className="text-[#E77500]">WOML</span>
              </h2>
              <p className="text-[#212121]/45 text-lg max-w-2xl mx-auto">
                Your referral network is valuable. Keep it private, automated, and under your control.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  title: "Private Channels",
                  description: "Every business gets a completely isolated channel. Your providers, your leads, your data.",
                  icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
                },
                {
                  title: "Automated Payments",
                  description: "Stripe-powered payouts. Approve a lead, your provider gets paid instantly to their bank.",
                  icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
                },
                {
                  title: "Verified Leads",
                  description: "Built-in license verification catches fake or blurry IDs before they reach you.",
                  icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
                },
                {
                  title: "Real-Time Control",
                  description: "Accept, reject, or flag leads instantly. Track conversions and provider performance.",
                  icon: "M13 10V3L4 14h7v7l9-11h-7z",
                },
              ].map((card, i) => (
                <div
                  key={i}
                  className="rounded-2xl p-8 hover:-translate-y-1 transition-all duration-300 cursor-default"
                  style={{
                    background: "linear-gradient(145deg, rgba(255,255,255,0.9) 0%, rgba(248,249,252,0.95) 100%)",
                    border: "1px solid rgba(255,255,255,0.9)",
                    borderTop: "1px solid rgba(255,255,255,1)",
                    boxShadow: "0 4px 24px rgba(13,27,46,0.08), 0 1px 3px rgba(13,27,46,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <div className="w-14 h-14 bg-[#E77500]/10 rounded-xl flex items-center justify-center text-[#E77500] mb-5">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={card.icon} />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-[#212121] mb-3">{card.title}</h3>
                  <p className="text-[#212121]/45 text-sm leading-relaxed">{card.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── STATS ───────────────────────────────────────────────────────── */}
        <section className="py-24 px-8 bg-[#f8f9fc] relative z-[1]">
          <div className="max-w-5xl mx-auto">
            <div ref={statsRef} className="grid md:grid-cols-3 gap-12 text-center">
              {[
                {
                  display: `${c0.toLocaleString()}+`,
                  label: "Leads Facilitated Monthly",
                },
                {
                  display: `${c1}%`,
                  label: "Private Channels",
                },
                {
                  display: `< ${c2} min`,
                  label: "Provider Setup",
                },
              ].map((stat, i) => (
                <div key={i}>
                  <div className="text-6xl md:text-7xl lg:text-8xl font-bold text-[#212121] mb-3 tracking-tight tabular-nums">
                    {stat.display}
                  </div>
                  <div className="text-[#212121]/35 text-xs tracking-[0.2em] uppercase font-medium">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── HOW IT WORKS — White ────────────────────────────────────────── */}
        <section className="py-28 px-8 bg-white relative z-[1]">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#212121] mb-6 tracking-tight">
                Go Live in <span className="text-[#E77500]">4 Steps</span>
              </h2>
              <p className="text-[#212121]/45 text-lg">From setup to payout in under 10 minutes.</p>
            </div>
            <div className="space-y-10">
              {[
                { step: 1, title: "Create Your Channel", description: "Sign up, set your lead criteria, required fields, and payout rate per lead." },
                { step: 2, title: "Invite Your Providers", description: "Send branded SMS invites or share your unique link. Providers sign up in under 2 minutes, locked to your private channel." },
                { step: 3, title: "Receive & Review Leads", description: "Leads flow into your dashboard with verified info. Accept good ones, reject bad ones with a reason." },
                { step: 4, title: "Automatic Payouts", description: "Approved leads trigger instant Stripe payments. You only pay for leads you keep." },
              ].map((item) => (
                <div key={item.step} className="flex gap-8 items-start">
                  <div className="w-14 h-14 rounded-full bg-[#E77500] text-white flex items-center justify-center font-bold text-xl shrink-0 shadow-lg shadow-[#E77500]/30">
                    {item.step}
                  </div>
                  <div className="pt-2">
                    <h3 className="text-2xl font-bold text-[#212121] mb-2">{item.title}</h3>
                    <p className="text-[#212121]/45 text-lg leading-relaxed">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── PROVIDER CALLOUT — Light gray ───────────────────────────────── */}
        <section className="py-24 px-8 bg-[#f8f9fc] relative z-[1]">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-[#212121] mb-6 tracking-tight">
              Are You a Lead Provider?
            </h2>
            <p className="text-[#212121]/45 text-lg mb-10 leading-relaxed">
              Already referring customers to businesses you work with? Get paid for every referral. Your business will invite you when they&apos;re ready.
            </p>
            <Link href="/how-it-works" className="inline-flex items-center gap-2 text-[#E77500] hover:text-[#D47526] font-semibold text-lg transition">
              Learn More
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </section>

        {/* ─── FAQ — White ─────────────────────────────────────────────────── */}
        <section className="py-28 px-8 bg-white relative z-[1]">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#212121] mb-4 tracking-tight">Questions?</h2>
            </div>
            <div className="space-y-4">
              {[
                { q: "How much does WOML cost?", a: "WOML is free to set up. You only pay a small platform fee on each approved lead payout. No monthly fees, no hidden costs." },
                { q: "Can providers see other businesses?", a: "No. Each provider is locked to the specific business that invited them. They cannot see, access, or send leads to any other business on the platform." },
                { q: "How do payments work?", a: "When you approve a lead, the payout is automatically sent to your provider via Stripe. Funds are deposited directly to their linked bank account." },
                { q: "What if I want to reject a lead?", a: "You have full control. Reject any lead with a single click and optionally provide a reason. Rejected leads don't trigger any payment." },
                { q: "How do providers sign up?", a: "You invite providers via SMS or a unique link. They complete a simple 2-minute onboarding, verify their identity, and they're ready to send leads." },
              ].map((faq, i) => (
                <details
                  key={i}
                  className="group rounded-2xl overflow-hidden"
                  style={{
                    background: "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(248,249,252,0.95))",
                    border: "1px solid rgba(13,27,46,0.08)",
                    boxShadow: "0 2px 12px rgba(13,27,46,0.06)",
                  }}
                >
                  <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                    <span className="font-bold text-[#212121] text-lg">{faq.q}</span>
                    <svg className="w-5 h-5 text-[#212121]/25 group-open:rotate-180 transition-transform shrink-0 ml-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <div className="px-6 pb-6 text-[#212121]/45 leading-relaxed">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FINAL CTA — Dark Navy with fixed bg ─────────────────────────── */}
        <section
          className="py-32 px-8 relative overflow-hidden"
          style={{ background: "#212121" }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "url('/woml-icon-orange.png')",
              backgroundAttachment: "fixed",
              backgroundSize: "420%",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              opacity: 0.08,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#E77500]/5 to-transparent pointer-events-none" />
          <div className="max-w-3xl mx-auto text-center relative z-10">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight">
              Ready to Scale Your <span className="text-[#E77500]">Referrals</span>?
            </h2>
            <p className="text-white/45 text-lg mb-12 leading-relaxed">
              Join businesses using WOML to turn word of mouth into a predictable, automated lead engine.
            </p>
            <Link
              href="/auth/register?role=buyer"
              className="inline-block bg-[#E77500] hover:bg-[#D47526] text-white px-12 py-5 rounded-lg font-semibold text-lg transition shadow-xl shadow-[#E77500]/30 hover:shadow-2xl hover:shadow-[#E77500]/40"
            >
              Start Your Free Channel
            </Link>
          </div>
        </section>
      </main>

      {/* ─── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-10 px-8 bg-[#212121] relative z-[1]">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-5">
          <Image src="/woml-alt-white.png" alt="WOML" width={120} height={36} className="h-8 w-auto object-contain opacity-60" />
          <div className="text-white/20 text-xs italic text-center max-w-md">
            &ldquo;So whether you eat or drink or whatever you do, do it all for the glory of God.&rdquo;
            <span className="not-italic font-medium text-white/30 ml-1">— 1 Corinthians 10:31</span>
          </div>
          <div className="text-white/20 text-xs">© 2026 WOML LLC. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
