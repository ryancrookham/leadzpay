import Link from "next/link";
import Image from "next/image";
import Sidebar from "@/app/components/Sidebar";

export const metadata = {
  title: "Social Media — WOML",
  description: "Follow WOML on social media and stay connected.",
};

const LINKEDIN_URL = "https://www.linkedin.com/company/woml-llc/";

export default function SocialPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fc] flex flex-col">
      <nav className="flex items-center px-8 py-4 bg-[#212121] border-b border-white/10 relative z-[60]">
        <div className="flex-1 flex items-center">
          <Sidebar />
        </div>
        <Link href="/">
          <Image
            src="/woml-alt-white.png"
            alt="WOML - Word of Mouth Leads"
            width={360}
            height={108}
            className="h-[120px] w-auto object-contain"
          />
        </Link>
        <div className="flex-1 flex items-center justify-end gap-3">
          <Link
            href="/auth/login"
            className="text-white/80 hover:text-white px-3 py-2 font-medium transition"
          >
            Sign In
          </Link>
          <Link
            href="/auth/register?role=buyer"
            className="bg-[#E77500] hover:bg-[#D47526] text-white px-4 py-2 rounded-lg font-medium transition"
          >
            Business Sign Up
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-16">
        <h1 className="text-3xl font-bold text-[#212121] mb-3 text-center">
          Follow Us on Social Media
        </h1>
        <p className="text-gray-500 text-sm mb-12 text-center max-w-md">
          Stay up to date with platform news, tips for lead providers, and updates from the WOML team.
        </p>

        {/* LinkedIn Card */}
        <a
          href={LINKEDIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group w-full max-w-sm border border-gray-200 rounded-2xl p-6 flex items-center gap-5 shadow-sm hover:shadow-md hover:border-[#0A66C2]/30 transition-all duration-200"
        >
          {/* LinkedIn Logo */}
          <div className="w-14 h-14 rounded-xl bg-[#0A66C2] flex items-center justify-center shrink-0 shadow-sm">
            <svg
              className="w-8 h-8 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-[#212121] group-hover:text-[#0A66C2] transition-colors">
              LinkedIn
            </p>
            <p className="text-sm text-gray-400 truncate">linkedin.com/company/woml-llc</p>
          </div>

          {/* Arrow */}
          <svg
            className="w-5 h-5 text-gray-300 group-hover:text-[#0A66C2] group-hover:translate-x-0.5 transition-all shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>

        <p className="mt-6 text-xs text-gray-400">
          Tap the card above — opens LinkedIn in your browser or app.
        </p>
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
