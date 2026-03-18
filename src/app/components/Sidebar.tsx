"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs: { label: string; href: string; external?: boolean }[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
  { label: "Social Media", href: "/social" },
  { label: "Legal", href: "/legal" },
];

// Nav bar height — py-3 (24px top+bottom) + h-10 logo (40px) = 64px
const NAV_H = 64;

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Invisible click-away — no shade */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-40"
          style={{ top: NAV_H }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <div
        className="fixed left-0 bottom-0 w-52 bg-white z-50 transition-transform duration-200 ease-in-out shadow-md"
        style={{
          top: NAV_H,
          transform: open ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        <nav className="py-4">
          {tabs.map((tab) =>
            tab.external ? (
              <a
                key={tab.href}
                href={tab.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center py-5 text-sm tracking-wide transition-colors text-[#E77500]/60 hover:text-[#E77500]"
              >
                {tab.label}
              </a>
            ) : (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-center py-5 text-sm tracking-wide transition-colors ${
                  pathname === tab.href
                    ? "text-[#E77500]"
                    : "text-[#E77500]/60 hover:text-[#E77500]"
                }`}
              >
                {tab.label}
              </Link>
            )
          )}
        </nav>
      </div>

      {/* Hamburger — 3 plain bars */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex flex-col gap-[5px] p-2 mr-1"
        aria-label="Toggle menu"
      >
        <span className="block w-[22px] h-[2px] bg-white rounded" />
        <span className="block w-[22px] h-[2px] bg-white rounded" />
        <span className="block w-[22px] h-[2px] bg-white rounded" />
      </button>
    </>
  );
}
