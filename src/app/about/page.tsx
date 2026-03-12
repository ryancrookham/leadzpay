import Link from "next/link";
import Image from "next/image";
import Sidebar from "@/app/components/Sidebar";

export const metadata = {
  title: "About — WOML",
  description: "WOML connects auto insurance agencies with car salesmen through a private lead generation platform.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="flex items-center justify-between px-8 py-4 bg-white border-b border-gray-100 relative z-[60]">
        {/* Left: hamburger */}
        <div className="flex items-center">
          <Sidebar />
        </div>
        {/* Center: logo absolutely centered */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <Link href="/" className="flex items-center border-2 border-gray-200 rounded-lg px-3 py-2 hover:border-[#E77500] transition">
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
        <h1 className="text-3xl font-bold text-[#152238] mb-4">About WOML</h1>
        <p className="text-gray-600 leading-relaxed mb-6">
          WOML — Word of Mouth Leads — is a private lead generation platform built specifically for the auto insurance industry. We connect insurance agencies directly with the car salesmen they already trust, creating a streamlined, private channel for qualified lead flow and automatic payouts.
        </p>
        <p className="text-gray-600 leading-relaxed mb-6">
          Unlike open lead marketplaces, every WOML channel is completely private. An insurance agency creates their account, sets their lead criteria and payout rate, and personally invites their own network of car salesmen. Providers can only see and interact with the businesses that have invited them — nothing else on the platform is visible to them.
        </p>

        <h2 className="text-xl font-semibold text-[#152238] mt-10 mb-4">Who It&apos;s For</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <div className="border border-gray-200 rounded-xl p-6">
            <h3 className="font-semibold text-[#152238] mb-2">Insurance Agencies</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Set your lead criteria, invite trusted car salesmen, and receive qualified leads with automatic billing — no chasing, no invoicing.
            </p>
          </div>
          <div className="border border-gray-200 rounded-xl p-6">
            <h3 className="font-semibold text-[#152238] mb-2">Car Salesmen</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Submit leads from customers you&apos;ve already spoken with and get paid automatically to your bank account the moment the lead is accepted.
            </p>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-[#152238] mb-4">Our Mission</h2>
        <p className="text-gray-600 leading-relaxed">
          Word of mouth has always been the most valuable source of leads in the insurance business. WOML gives that process a formal structure — making it faster, more reliable, and fully compliant — without losing the personal relationships that make it work.
        </p>
      </main>

      <footer className="border-t border-gray-200 py-8 px-8 bg-[#152238]">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-3">
          <Image src="/woml-alt-white.png" alt="WOML" width={100} height={30} className="h-8 w-auto object-contain" />
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Link href="/legal" className="text-white/60 hover:text-white text-xs transition">Legal</Link>
            <span className="text-white/40 text-xs">·</span>
            <Link href="/contact" className="text-white/60 hover:text-white text-xs transition">Contact</Link>
            <span className="text-white/40 text-xs">·</span>
            <Link href="/privacy" className="text-white/60 hover:text-white text-xs transition">Privacy Policy</Link>
          </div>
          <div className="text-white/40 text-xs">© 2026 WOML LLC. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
