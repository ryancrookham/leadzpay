"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LeadsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/business?tab=leads");
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-500">Redirecting to leads...</div>
    </div>
  );
}
