"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if user hasn't already accepted
    const accepted = localStorage.getItem("woml_cookie_consent");
    if (!accepted) {
      // Small delay so it doesn't flash on page load
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("woml_cookie_consent", "accepted");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 sm:p-6 animate-in slide-in-from-bottom">
      <div className="max-w-4xl mx-auto bg-[#212121] border border-white/10 rounded-xl shadow-2xl px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1 text-sm text-gray-300 leading-relaxed">
          This site uses cookies to keep you signed in and improve your experience.
          We do not use advertising or third-party tracking cookies.{" "}
          <Link
            href="/legal"
            className="text-[#E8822A] hover:text-[#F09A4A] underline underline-offset-2 transition"
          >
            Privacy Policy
          </Link>
        </div>
        <button
          onClick={handleAccept}
          className="shrink-0 bg-[#E77500] hover:bg-[#D47526] text-white text-sm font-medium px-6 py-2 rounded-lg transition"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
