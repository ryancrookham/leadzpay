import Link from "next/link";
import Image from "next/image";
import Sidebar from "@/app/components/Sidebar";

export const metadata = {
  title: "Legal — WOML",
  description: "WOML platform agreements and policies.",
};

const docs = [
  {
    id: "business",
    label: "Business Agreement",
    description: "Terms governing insurance agency accounts, lead channels, and payout structures.",
    url: "/WOML_Business_Agreement.pdf",
  },
  {
    id: "provider",
    label: "Provider Agreement",
    description: "Terms for lead providers — submissions, earnings, and platform conduct.",
    url: "/WOML_Provider_Agreement.pdf",
  },
  {
    id: "privacy",
    label: "Privacy Policy",
    description: "How WOML collects, uses, and protects your data.",
    url: "/WOML_Privacy_Policy.pdf",
  },
];

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="flex items-center justify-between px-8 py-6 border-b border-gray-200 bg-white backdrop-blur-sm relative z-[60]">
        <div className="flex items-center gap-2">
          <Sidebar />
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
        <h1 className="text-3xl font-bold text-[#152238] mb-2">Legal Documents</h1>
        <p className="text-gray-500 text-sm mb-10">
          All WOML platform agreements and policies are publicly available below.
        </p>

        <div className="divide-y divide-gray-200 border-t border-gray-200">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between py-6">
              <div>
                <h2 className="text-base font-semibold text-[#152238] mb-1">{doc.label}</h2>
                <p className="text-gray-500 text-sm">{doc.description}</p>
              </div>
              <div className="flex gap-2 ml-6 shrink-0">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-[#152238] hover:bg-gray-50 transition"
                >
                  View
                </a>
                <a
                  href={doc.url}
                  download
                  className="px-4 py-2 text-sm font-medium bg-[#E77500] hover:bg-[#D47526] text-white rounded-lg transition"
                >
                  Save
                </a>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-gray-200 py-8 px-8 bg-[#152238]">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-3">
          <Image src="/woml-alt-white.png" alt="WOML" width={100} height={30} className="h-8 w-auto object-contain" />
          <div className="text-white/40 text-xs">© 2026 WOML LLC. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
