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
      {/* Invisible click-away — no dimming, no shade */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-40"
          style={{ top: NAV_H }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel — slides out below the nav */}
      <div
        className={`fixed left-0 bottom-0 w-52 bg-white z-50 transition-transform duration-200 ease-in-out`}
        style={{
          top: NAV_H,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          boxShadow: "2px 0 12px rgba(0,0,0,0.10)",
          borderRight: "1px solid #e5e7eb",
        }}
      >
        <nav className="py-4">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => setOpen(false)}
              className={`flex items-center justify-center py-5 text-sm font-semibold tracking-wide transition-colors ${
                pathname === tab.href
                  ? "text-[#E77500]"
                  : "text-[#E77500]/60 hover:text-[#E77500]"
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
