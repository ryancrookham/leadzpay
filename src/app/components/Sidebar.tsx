"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "About", href: "/about" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
  { label: "Legal", href: "/legal" },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={`fixed top-0 left-0 h-full w-60 bg-white border-r border-gray-200 z-50 transition-transform duration-200 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-200">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="font-bold text-[#152238] text-base tracking-widest"
          >
            WOML
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Nav tabs */}
        <nav className="py-1">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => setOpen(false)}
              className={`block px-6 py-[14px] text-sm font-medium transition-colors ${
                pathname === tab.href
                  ? "text-[#E77500] bg-orange-50"
                  : "text-[#152238] hover:bg-gray-50"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Hamburger button — 3 plain bars, no animation */}
      <button
        onClick={() => setOpen(true)}
        className="flex flex-col gap-[5px] p-2 mr-1"
        aria-label="Open menu"
      >
        <span className="block w-[22px] h-[2px] bg-[#152238] rounded" />
        <span className="block w-[22px] h-[2px] bg-[#152238] rounded" />
        <span className="block w-[22px] h-[2px] bg-[#152238] rounded" />
      </button>
    </>
  );
}
