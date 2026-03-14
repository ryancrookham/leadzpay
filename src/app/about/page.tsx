import Link from "next/link";
import Image from "next/image";
import Sidebar from "@/app/components/Sidebar";

export const metadata = {
  title: "About — WOML",
  description: "WOML connects businesses with their trusted referral partners through a private, automated account notification platform.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="flex items-center px-8 py-4 bg-white border-b border-gray-100 relative z-[60]">
        {/* Left: hamburger — flex-1 balances the right side */}
        <div className="flex-1 flex items-center">
          <Sidebar />
        </div>
        {/* Center: logo in document flow so nav height expands naturally */}
        <Link href="/">
          <Image src="/woml-alt-orange.png" alt="WOML - Word of Mouth Leads" width={360} height={108} className="h-[120px] w-auto object-contain" />
        </Link>
        {/* Right: auth buttons — flex-1 keeps logo centered */}
        <div className="flex-1 flex items-center justify-end gap-3">
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
          WOML — Word of Mouth Leads — is a private referral network platform built for businesses that run on relationships. We connect businesses directly with the trusted people in their network who send qualified referrals, creating a streamlined, private channel for referral flow and automatic payouts.
        </p>
        <p className="text-gray-600 leading-relaxed mb-6">
          Unlike open lead marketplaces, every WOML channel is completely private. A business creates their account, sets their lead criteria and payout rate, and personally invites their own network of providers. Providers can only see and interact with the businesses that have invited them — nothing else on the platform is visible to them.
        </p>

        <h2 className="text-xl font-semibold text-[#152238] mt-10 mb-4">Who It&apos;s For</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <div className="border border-gray-200 rounded-xl p-6">
            <h3 className="font-semibold text-[#152238] mb-2">Businesses</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Set your lead criteria, invite trusted providers from your existing network, and receive qualified leads with automatic billing — no chasing, no invoicing.
            </p>
          </div>
          <div className="border border-gray-200 rounded-xl p-6">
            <h3 className="font-semibold text-[#152238] mb-2">Lead Providers</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Submit leads from people you&apos;ve already spoken with and get paid automatically to your bank account the moment the lead is accepted.
            </p>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-[#152238] mb-4">Our Mission</h2>
        <p className="text-gray-600 leading-relaxed">
          Word of mouth has always been the most valuable source of leads in any business. WOML gives that process a formal structure — making it faster, more reliable, and fully transparent — without losing the personal relationships that make it work.
        </p>
      </main>

      <footer className="border-t border-gray-200 py-8 px-8 bg-[#152238]">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-4">
          <Image
            src="/woml-alt-white.png"
            alt="WOML - Word of Mouth Leads"
            width={120}
            height={36}
            className="h-9 w-auto object-contain"
          />
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
