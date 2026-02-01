"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RolodexRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/business?tab=rolodex");
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-500">Redirecting to rolodex...</div>
    </div>
  );
}
