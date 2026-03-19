import Link from "next/link";
import Image from "next/image";
import Sidebar from "@/app/components/Sidebar";

export const metadata = {
  title: "Pricing — WOML",
  description: "Transparent pricing for the WOML private referral network platform.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fc] flex flex-col">
      <nav className="flex items-center px-8 py-4 bg-[#212121] border-b border-white/10 relative z-[60]">
        {/* Left: hamburger — flex-1 balances the right side */}
        <div className="flex-1 flex items-center">
          <Sidebar />
        </div>
        {/* Center: logo in document flow so nav height expands naturally */}
        <Link href="/">
          <Image src="/woml-alt-white.png" alt="WOML - Word of Mouth Leads" width={360} height={108} className="h-[120px] w-auto object-contain" />
        </Link>
        {/* Right: auth buttons — flex-1 keeps logo centered */}
        <div className="flex-1 flex items-center justify-end gap-3">
          <Link href="/auth/login" className="text-white/80 hover:text-white px-3 py-2 font-medium transition">
            Sign In
          </Link>
          <Link href="/auth/register?role=buyer" className="bg-[#E77500] hover:bg-[#D47526] text-white px-4 py-2 rounded-lg font-medium transition">
            Business Sign Up
          </Link>
        </div>
      </nav>

      <main className="flex-1 px-8 py-16 max-w-3xl mx-auto w-full">
        <h1 className="text-3xl font-bold text-[#212121] mb-4">Pricing</h1>
        <p className="text-gray-500 text-sm mb-10">
          WOML uses a transparent spread model. The business sets the payout rate for providers — WOML charges a small platform fee on top of each accepted lead.
        </p>

        <div className="divide-y divide-gray-200 border-t border-b border-gray-200 mb-10">
          <div className="flex items-start justify-between py-5">
            <div>
              <h2 className="text-sm font-semibold text-[#212121] mb-1">Business</h2>
              <p className="text-gray-500 text-sm">Charged per accepted lead. You set the lead value — WOML&apos;s platform fee is added transparently on top.</p>
            </div>
          </div>
          <div className="flex items-start justify-between py-5">
            <div>
              <h2 className="text-sm font-semibold text-[#212121] mb-1">Provider</h2>
              <p className="text-gray-500 text-sm">Paid per accepted lead. You earn the payout rate set by the business — no deductions from your side.</p>
            </div>
          </div>
          <div className="flex items-start justify-between py-5">
            <div>
              <h2 className="text-sm font-semibold text-[#212121] mb-1">Platform Fee</h2>
              <p className="text-gray-500 text-sm">WOML&apos;s fee is configured by the platform administrator. The current fee structure is shown in your signed agreement and visible in your dashboard.</p>
            </div>
          </div>
        </div>

        <div className="p-6 border border-gray-200 rounded-xl bg-gray-50">
          <p className="text-sm text-gray-500 leading-relaxed">
            <span className="font-semibold text-[#212121]">All fees are disclosed upfront.</span>{" "}
            The exact fee structure is displayed in your Business or Provider Agreement before you sign. Providers approaching $600 in annual earnings are flagged for 1099 compliance.
          </p>
        </div>

        <div className="mt-10 text-center">
          <p className="text-gray-500 text-sm mb-4">Ready to get started?</p>
          <Link
            href="/auth/register?role=buyer"
            className="inline-block bg-[#E77500] hover:bg-[#D47526] text-white px-6 py-3 rounded-lg font-medium transition"
          >
            Create a Business Account
          </Link>
        </div>
      </main>

      <footer className="border-t border-gray-200 py-8 px-8 bg-[#212121]">
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
