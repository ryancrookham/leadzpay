"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/app/components/Sidebar";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [ridgeProgress, setRidgeProgress] = useState(0);
  const statsRef = useRef<HTMLElement>(null);
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

  useEffect(() => {
    if (!mounted) return;
    const handleScroll = () => {
      const el = statsRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // Start drawing when section enters viewport, finish when it leaves top
      const start = vh * 0.92;   // section top at 92% down = begin
      const end   = vh * -0.1;   // section top at -10% (just scrolled past) = done
      const p = Math.max(0, Math.min(1, (start - rect.top) / (start - end)));
      setRidgeProgress(p);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [mounted]);

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

        {/* ─── STATS — Light gray ──────────────────────────────────────────── */}
        <section ref={statsRef} className="py-24 px-8 relative z-[1] overflow-hidden bg-[#f8f9fc]">

          {/* Climber photo — shifted left to frame the figure, charcoal mountain */}
          <div
            className="absolute inset-0 pointer-events-none select-none"
            aria-hidden="true"
            style={{
              backgroundImage: "url('/stats-mountain.png')",
              backgroundSize: "130%",
              backgroundPosition: "12% center",
              backgroundRepeat: "no-repeat",
              opacity: 0.45,
              filter: "brightness(0.32) saturate(0.5)",
            }}
          />

          {/* Gradient — fades right side back to page bg, hides WOML text */}
          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
            style={{
              background: "linear-gradient(to right, rgba(248,249,252,0.05) 30%, rgba(248,249,252,0.88) 72%)",
            }}
          />

          {/* Scroll-driven orange ridge line — traces exact mountain profile */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            {(() => {
              // Waypoints measured from actual image pixels (stats-mountain.png 1584×672)
              // CSS: backgroundSize:130%, backgroundPosition:12% center, section≈420px tall
              const RIDGE_X = [335,350,355,360,364,374,383,393,402,411,448,484,521,557,594,630,667,676,686,695,705,714,723,733,742,752,761,771,780,790,799,809,818,823,827,832,870,920,970,1020,1080,1140,1200,1280,1360,1440];
              const RIDGE_Y = [300,291,281,276,272,264,258,220,182,149,114,81,48,21,29,36,44,50,55,60,58,55,53,50,47,43,39,34,28,23,17,13,9,8,6,5,7,5,8,5,7,5,8,6,8,7];
              const RIDGE_F = [0,0.0137,0.0225,0.0281,0.0325,0.0426,0.051,0.0819,0.1126,0.1394,0.1794,0.2177,0.2566,0.292,0.3217,0.3505,0.3802,0.3887,0.3975,0.4056,0.4136,0.421,0.4282,0.4364,0.4439,0.4523,0.4601,0.4689,0.4773,0.4861,0.4946,0.5031,0.5108,0.5148,0.5183,0.5223,0.5522,0.5915,0.6308,0.6701,0.7173,0.7644,0.8115,0.8744,0.9372,1];
              // Interpolate dot position at current progress
              let cx = RIDGE_X[0], cy = RIDGE_Y[0];
              if (ridgeProgress > 0.005) {
                const p = Math.min(ridgeProgress, 1);
                let i = RIDGE_F.findIndex(f => f >= p);
                if (i < 0) i = RIDGE_F.length - 1;
                if (i === 0) { cx = RIDGE_X[0]; cy = RIDGE_Y[0]; }
                else {
                  const t = (p - RIDGE_F[i-1]) / (RIDGE_F[i] - RIDGE_F[i-1]);
                  cx = RIDGE_X[i-1] + t * (RIDGE_X[i] - RIDGE_X[i-1]);
                  cy = RIDGE_Y[i-1] + t * (RIDGE_Y[i] - RIDGE_Y[i-1]);
                }
              }
              const pathD = "M335,300 L350,291 L355,281 L360,276 L364,272 L374,264 L383,258 L393,220 L402,182 L411,149 L448,114 L484,81 L521,48 L557,21 L594,29 L630,36 L667,44 L676,50 L686,55 L695,60 L705,58 L714,55 L723,53 L733,50 L742,47 L752,43 L761,39 L771,34 L780,28 L790,23 L799,17 L809,13 L818,9 L823,8 L827,6 L832,5 L870,7 L920,5 L970,8 L1020,5 L1080,7 L1140,5 L1200,8 L1280,6 L1360,8 L1440,7";
              return (
                <svg viewBox="0 0 1440 300" preserveAspectRatio="none" fill="none" className="w-full h-full">
                  {/* Glow */}
                  <path d={pathD} stroke="#E77500" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" opacity="0.18"
                    pathLength="1" style={{ strokeDasharray: `${ridgeProgress} 1`, strokeDashoffset: 0 }} />
                  {/* Core line */}
                  <path d={pathD} stroke="#E77500" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="1"
                    pathLength="1" style={{ strokeDasharray: `${ridgeProgress} 1`, strokeDashoffset: 0 }} />
                  {/* Dot at tip */}
                  {ridgeProgress > 0.01 && (
                    <>
                      <circle cx={cx} cy={cy} r="12" fill="#E77500" opacity="0.22" />
                      <circle cx={cx} cy={cy} r="5" fill="#E77500" opacity="1" />
                    </>
                  )}
                </svg>
              );
            })()}
          </div>

          <div className="max-w-5xl mx-auto relative z-10">
            <div className="grid md:grid-cols-3 gap-12 text-center">
              {[
                { value: "3,000+", label: "Leads Facilitated Monthly" },
                { value: "$500+", label: "Average Provider Earnings" },
                { value: "< 2 min", label: "Provider Onboarding" },
              ].map((stat, i) => (
                <div key={i}>
                  <div className="text-6xl md:text-7xl lg:text-8xl font-bold text-[#212121] mb-3 tracking-tight">
                    {stat.value}
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
