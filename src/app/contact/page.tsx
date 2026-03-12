import Link from "next/link";
import Image from "next/image";
import Sidebar from "@/app/components/Sidebar";

export const metadata = {
  title: "Contact — WOML",
  description: "Get in touch with the WOML team.",
};

export default function ContactPage() {
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
        <h1 className="text-3xl font-bold text-[#152238] mb-4">Contact</h1>
        <p className="text-gray-500 text-sm mb-10">
          Have a question or need help? Reach out and we&apos;ll get back to you within one business day.
        </p>

        <div className="divide-y divide-gray-200 border-t border-b border-gray-200 mb-10">
          <div className="flex items-start gap-4 py-5">
            <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-[#E77500]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#152238] mb-1">Email</p>
              <a
                href="mailto:support@womleads.com"
                className="text-sm text-[#E77500] hover:underline"
              >
                support@womleads.com
              </a>
            </div>
          </div>

          <div className="flex items-start gap-4 py-5">
            <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-[#E77500]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#152238] mb-1">Website</p>
              <a
                href="https://womleads.com"
                className="text-sm text-[#E77500] hover:underline"
              >
                womleads.com
              </a>
            </div>
          </div>

          <div className="flex items-start gap-4 py-5">
            <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-[#E77500]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#152238] mb-1">Location</p>
              <p className="text-sm text-gray-500">Pennsylvania, United States</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          For SMS opt-out requests, reply STOP to any message you received from WOML or email us at support@womleads.com.
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
