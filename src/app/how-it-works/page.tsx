import Link from "next/link";
import Image from "next/image";
import Sidebar from "@/app/components/Sidebar";

export const metadata = {
  title: "How It Works — WOML",
  description: "Learn how WOML connects insurance agencies with lead providers.",
};

const steps = [
  {
    num: "1",
    title: "Agency Creates a Channel",
    body: "The insurance agency signs up, sets their lead criteria (what information they need on each lead), and configures a payout rate per accepted lead.",
  },
  {
    num: "2",
    title: "Providers Are Invited",
    body: "The agency invites car salesmen via a unique link or branded SMS. Each provider signs up through that link and is scoped exclusively to that agency's private channel.",
  },
  {
    num: "3",
    title: "Leads Are Submitted",
    body: "Providers submit leads from their personal network — customers who have recently purchased a vehicle and may need auto insurance.",
  },
  {
    num: "4",
    title: "Payouts Fire Automatically",
    body: "When a lead is accepted, the agency is charged via Stripe, WOML takes a small platform fee, and the provider is paid directly to their bank account — no invoicing, no waiting.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="flex items-center justify-between px-8 py-4 bg-white border-b border-gray-100 relative z-[60]">
        {/* Left: hamburger */}
        <div className="flex items-center">
          <Sidebar />
        </div>
        {/* Center: logo absolutely centered */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <Link href="/" className="flex items-center">
            <Image src="/woml-alt-orange.png" alt="WOML" width={120} height={36} className="h-9 w-auto object-contain" />
          </Link>
        </div>
        <div className="flex gap-3 items-center">
          <Link href="/auth/login" className="text-[#152238] hover:text-[#E77500] px-3 py-2 font-medium transition">
            Sign In
          </Link>
          <Link href="/auth/register?role=buyer" className="bg-[#E77500] hover:bg-[#D47526] text-white px-4 py-2 rounded-lg font-medium transition">
            Business Sign Up
          </Link>
        </div>
      </nav>

      <main className="flex-1 px-8 py-16 max-w-3xl mx-auto w-full">
        <h1 className="text-3xl font-bold text-[#152238] mb-4">How It Works</h1>
        <p className="text-gray-500 text-sm mb-12">
          WOML runs on a simple four-step flow — from signup to automatic payout.
        </p>

        <div className="flex flex-col gap-10">
          {steps.map((step) => (
            <div key={step.num} className="flex gap-5 items-start">
              <div className="w-9 h-9 rounded-full bg-[#E77500] text-white font-bold text-sm flex items-center justify-center shrink-0">
                {step.num}
              </div>
              <div>
                <h2 className="text-base font-semibold text-[#152238] mb-1">{step.title}</h2>
                <p className="text-gray-500 text-sm leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 p-6 border border-gray-200 rounded-xl bg-gray-50">
          <p className="text-sm text-gray-500 leading-relaxed">
            <span className="font-semibold text-[#152238]">Privacy by design.</span>{" "}
            Every business channel on WOML is fully isolated. Lead providers you invite cannot see or interact with any other business on the platform — only yours.
          </p>
        </div>
      </main>

      <footer className="border-t border-gray-200 py-8 px-8 bg-[#152238]">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-3">
          <Image src="/woml-alt-white.png" alt="WOML" width={100} height={30} className="h-8 w-auto object-contain" />
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Link href="/legal" className="text-white/60 hover:text-white text-xs transition">Legal</Link>
            <span className="text-white/40 text-xs">·</span>
            <Link href="/contact" className="text-white/60 hover:text-white text-xs transition">Contact</Link>
          </div>
          <div className="text-white/40 text-xs">© 2026 WOML LLC. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
