"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Sidebar from "@/app/components/Sidebar";

const faqs = [
  {
    q: "Who can use WOML?",
    a: "WOML is built for two parties: auto insurance agencies (businesses) and the car salesmen they work with (providers). Agencies sign up directly. Providers are invited by the agency — they cannot sign up on their own.",
  },
  {
    q: "How do providers get paid?",
    a: "Providers connect their bank account through Stripe during onboarding. When a lead is accepted by the agency, payment is automatically transferred to their bank account. No invoicing required.",
  },
  {
    q: "Can a provider see other businesses on the platform?",
    a: "No. Every business channel is completely isolated. A provider can only see and interact with the business that invited them. Even if a provider is invited by multiple agencies, each channel is entirely separate.",
  },
  {
    q: "What information is required on a lead?",
    a: "Each agency configures their own lead criteria — required fields may include the customer's name, phone number, vehicle info, and a scanned driver's license. The agency defines what's mandatory vs. optional.",
  },
  {
    q: "Is WOML compliant with Pennsylvania insurance referral laws?",
    a: "WOML is currently undergoing a referral fee compliance review for PA insurance law. All platform agreements reflect applicable legal requirements and are updated as the review progresses.",
  },
  {
    q: "What happens if a payment fails?",
    a: "Lead submissions are atomic — if the financial transaction fails, the lead is not marked as complete. Both parties are notified and the lead remains in a pending state until resolved.",
  },
  {
    q: "How do I get support?",
    a: "Email us at support@womleads.com or visit our Contact page. We typically respond within one business day.",
  },
];

export default function FAQPage() {
  const [open, setOpen] = useState<number | null>(null);

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
        <h1 className="text-3xl font-bold text-[#152238] mb-2">FAQ</h1>
        <p className="text-gray-500 text-sm mb-10">Common questions about WOML.</p>

        <div className="divide-y divide-gray-200 border-t border-gray-200">
          {faqs.map((faq, i) => (
            <div key={i} className="py-5">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between text-left gap-4"
              >
                <span className="text-sm font-semibold text-[#152238]">{faq.q}</span>
                <span className="text-gray-400 text-lg leading-none shrink-0">
                  {open === i ? "−" : "+"}
                </span>
              </button>
              {open === i && (
                <p className="mt-3 text-sm text-gray-500 leading-relaxed">{faq.a}</p>
              )}
            </div>
          ))}
        </div>

        <p className="mt-12 text-sm text-gray-500">
          Still have questions?{" "}
          <Link href="/contact" className="text-[#E77500] hover:underline">Contact us</Link>.
        </p>
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
