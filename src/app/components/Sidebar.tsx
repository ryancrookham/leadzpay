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

// Nav bar height in px — sidebar and overlay open below this line
const NAV_H = 97;

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Overlay — starts below the nav, never dims the top row */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 bg-black/20 z-40"
          style={{ top: NAV_H }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel — slides out below the nav */}
      <div
        className={`fixed inset-x-0 bottom-0 left-0 w-48 bg-white border-r border-gray-200 z-50 transition-transform duration-200 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ top: NAV_H }}
      >
        <nav className="py-2">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => setOpen(false)}
              className={`block px-6 py-[13px] text-sm font-medium transition-colors ${
                pathname === tab.href
                  ? "text-[#E77500] font-semibold"
                  : "text-[#E77500]/70 hover:text-[#E77500]"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Hamburger — 3 plain bars, no animation */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex flex-col gap-[5px] p-2 mr-1"
        aria-label="Toggle menu"
      >
        <span className="block w-[22px] h-[2px] bg-[#152238] rounded" />
        <span className="block w-[22px] h-[2px] bg-[#152238] rounded" />
        <span className="block w-[22px] h-[2px] bg-[#152238] rounded" />
      </button>
    </>
  );
}
