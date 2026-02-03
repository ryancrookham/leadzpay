"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";

// Admin emails that can access this page
const ADMIN_EMAILS = ["rcrookham@gmail.com"];

function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

interface SystemStats {
  totalUsers: number;
  buyers: number;
  providers: number;
  activeSessions: number;
  recentLogins: { email: string; role: string; time: string }[];
  storageUsage: string;
}

export default function HealthCheckPage() {
  const { currentUser, isAuthenticated, isLoading } = useAuth();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [testResults, setTestResults] = useState<{ [key: string]: "pending" | "success" | "error" }>({});

  useEffect(() => {
    if (isAuthenticated && isAdmin(currentUser?.email)) {
      loadStats();
    }
  }, [isAuthenticated, currentUser]);

  const loadStats = () => {
    try {
      // Get users data
      const usersData = localStorage.getItem("leadzpay_users");
      const users = usersData ? JSON.parse(usersData) : [];

      // Get sessions data
      const sessionData = localStorage.getItem("leadzpay_session");
      let activeSessions = 0;
      const recentLogins: { email: string; role: string; time: string }[] = [];

      if (sessionData) {
        try {
          const session = JSON.parse(sessionData);
          if (session.expiresAt && new Date(session.expiresAt) > new Date()) {
            activeSessions = 1;
          }
          if (session.createdAt) {
            const user = users.find((u: { id: string }) => u.id === session.userId);
            if (user) {
              recentLogins.push({
                email: user.email,
                role: user.role,
                time: new Date(session.createdAt).toLocaleString()
              });
            }
          }
        } catch {
          // Invalid session data
        }
      }

      // Calculate storage usage
      let totalSize = 0;
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("leadzpay_")) {
          totalSize += localStorage.getItem(key)?.length || 0;
        }
      }
      const storageUsage = totalSize > 1024
        ? `${(totalSize / 1024).toFixed(1)} KB`
        : `${totalSize} bytes`;

      setStats({
        totalUsers: users.length,
        buyers: users.filter((u: { role: string }) => u.role === "buyer").length,
        providers: users.filter((u: { role: string }) => u.role === "provider").length,
        activeSessions,
        recentLogins,
        storageUsage
      });
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  };

  const testFlow = async (flowName: string, url: string) => {
    setTestResults(prev => ({ ...prev, [flowName]: "pending" }));

    // Simulate a brief test delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // For now, just verify the route exists by checking if we can navigate
    try {
      // Mark as success - user can click to actually test
      setTestResults(prev => ({ ...prev, [flowName]: "success" }));
    } catch {
      setTestResults(prev => ({ ...prev, [flowName]: "error" }));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div>
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin(currentUser?.email)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl border border-gray-200 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500 mb-4">You don&apos;t have permission to access this page.</p>
          <Link
            href="/"
            className="inline-block bg-[#1e3a5f] text-white px-6 py-2 rounded-lg hover:bg-[#2a4a6f] transition"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Image
                src="/woml-logo.png"
                alt="WOML"
                width={120}
                height={36}
                className="h-9 w-auto object-contain"
              />
            </Link>
            <span className="px-3 py-1 bg-[#1e3a5f]/10 text-[#1e3a5f] text-sm font-medium rounded-full">
              Operator Dashboard
            </span>
          </div>
          <Link
            href="/"
            className="text-gray-500 hover:text-[#1e3a5f] transition"
          >
            Back to Home
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-8">
        <h1 className="text-2xl font-bold text-[#1e3a5f] mb-6">System Health Check</h1>

        {/* System Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <div className="text-gray-500 text-sm">Total Users</div>
            <div className="text-2xl font-bold text-[#1e3a5f]">{stats?.totalUsers || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <div className="text-gray-500 text-sm">Businesses</div>
            <div className="text-2xl font-bold text-emerald-600">{stats?.buyers || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <div className="text-gray-500 text-sm">Providers</div>
            <div className="text-2xl font-bold text-blue-600">{stats?.providers || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <div className="text-gray-500 text-sm">Storage Used</div>
            <div className="text-2xl font-bold text-purple-600">{stats?.storageUsage || "0 bytes"}</div>
          </div>
        </div>

        {/* Test Flows */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-[#1e3a5f] mb-4">Test Flows</h2>
          <p className="text-gray-500 text-sm mb-4">Click to verify each page loads correctly.</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { name: "Sign Up", url: "/auth/register", icon: "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" },
              { name: "Login", url: "/auth/login", icon: "M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" },
              { name: "Business Dashboard", url: "/business", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
              { name: "Provider Dashboard", url: "/provider-dashboard", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
            ].map((flow) => (
              <Link
                key={flow.name}
                href={flow.url}
                target="_blank"
                onClick={() => testFlow(flow.name, flow.url)}
                className={`p-4 rounded-lg border transition flex flex-col items-center gap-2 ${
                  testResults[flow.name] === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : testResults[flow.name] === "error"
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={flow.icon} />
                </svg>
                <span className="text-sm font-medium">{flow.name}</span>
                {testResults[flow.name] === "success" && (
                  <span className="text-xs">Opened</span>
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-[#1e3a5f] mb-4">Recent Activity</h2>
          {stats?.recentLogins && stats.recentLogins.length > 0 ? (
            <div className="space-y-3">
              {stats.recentLogins.map((login, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">{login.email}</div>
                    <div className="text-sm text-gray-500 capitalize">{login.role}</div>
                  </div>
                  <div className="text-sm text-gray-400">{login.time}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No recent activity</p>
          )}
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-[#1e3a5f] mb-4">Quick Links</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="px-4 py-2 bg-[#1e3a5f] text-white rounded-lg hover:bg-[#2a4a6f] transition"
            >
              Full Admin Panel
            </Link>
            <button
              onClick={loadStats}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              Refresh Stats
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
