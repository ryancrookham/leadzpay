"use client";

import { SessionProvider } from "next-auth/react";
import { AuthProvider } from "./auth-context";
import { ConnectionProvider } from "./connection-context";
import { LeadsProvider } from "./leads-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthProvider>
        <ConnectionProvider>
          <LeadsProvider>{children}</LeadsProvider>
        </ConnectionProvider>
      </AuthProvider>
    </SessionProvider>
  );
}
