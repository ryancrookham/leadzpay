"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import {
  Connection,
  ConnectionRequest,
  ContractTerms,
  getWeekStartDate,
  getMonthStartDate,
} from "./connection-types";

const STORAGE_KEYS = {
  REQUESTS: "leadzpay_connection_requests",
  CONNECTIONS: "leadzpay_connections",
};

interface ConnectionContextType {
  // Connection Requests
  requests: ConnectionRequest[];
  getRequestsForBuyer: (buyerId: string) => ConnectionRequest[];
  getRequestsForProvider: (providerId: string) => ConnectionRequest[];

  // Provider actions
  sendConnectionRequest: (
    providerId: string,
    providerName: string,
    providerEmail: string,
    buyerId: string,
    buyerBusinessName: string,
    message?: string
  ) => ConnectionRequest;
  acceptTerms: (requestId: string) => Connection | null;
  declineTerms: (requestId: string) => void;

  // Buyer actions
  setTermsForRequest: (requestId: string, terms: ContractTerms) => void;
  rejectRequest: (requestId: string) => void;

  // Connections
  connections: Connection[];
  getConnectionsForBuyer: (buyerId: string) => Connection[];
  getConnectionsForProvider: (providerId: string) => Connection[];
  getConnectionsByProviderEmail: (email: string) => Connection[];
  getActiveConnectionForProvider: (providerId: string) => Connection | null;
  terminateConnection: (connectionId: string, terminatedBy: "buyer" | "provider", reason?: string) => void;
  updateConnectionTerms: (connectionId: string, terms: ContractTerms) => void;

  // Stats
  updateConnectionStats: (connectionId: string, leadPayout: number) => void;
}

const ConnectionContext = createContext<ConnectionContextType | undefined>(undefined);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);

  // Demo companies to filter out (these were accidentally created during testing)
  const DEMO_COMPANIES_TO_REMOVE = [
    "ABC Insurance Agency",
    "Premier Auto Insurance",
    "SafeGuard Insurance Co.",
  ];

  // Load from localStorage on mount and filter out demo data
  useEffect(() => {
    try {
      const savedRequests = localStorage.getItem(STORAGE_KEYS.REQUESTS);
      const savedConnections = localStorage.getItem(STORAGE_KEYS.CONNECTIONS);

      if (savedRequests) {
        try {
          const parsed = JSON.parse(savedRequests);
          if (Array.isArray(parsed)) {
            // Filter out demo companies
            const filtered = parsed.filter((r: ConnectionRequest) =>
              !DEMO_COMPANIES_TO_REMOVE.includes(r.buyerBusinessName)
            );
            setRequests(filtered);
            // Also clean up localStorage
            if (filtered.length !== parsed.length) {
              localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(filtered));
            }
          }
        } catch (e) {
          console.error("[ConnectionContext] Failed to parse requests:", e);
          localStorage.removeItem(STORAGE_KEYS.REQUESTS);
        }
      }
      if (savedConnections) {
        try {
          const parsed = JSON.parse(savedConnections);
          if (Array.isArray(parsed)) {
            // Filter out demo companies
            const filtered = parsed.filter((c: Connection) =>
              !DEMO_COMPANIES_TO_REMOVE.includes(c.buyerBusinessName)
            );
            setConnections(filtered);
            // Also clean up localStorage
            if (filtered.length !== parsed.length) {
              localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify(filtered));
            }
          }
        } catch (e) {
          console.error("[ConnectionContext] Failed to parse connections:", e);
          localStorage.removeItem(STORAGE_KEYS.CONNECTIONS);
        }
      }
    } catch (e) {
      console.error("[ConnectionContext] localStorage error:", e);
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify(connections));
  }, [connections]);

  // Get requests for a buyer
  const getRequestsForBuyer = useCallback(
    (buyerId: string) => {
      return requests.filter((r) => r.buyerId === buyerId);
    },
    [requests]
  );

  // Get requests for a provider
  const getRequestsForProvider = useCallback(
    (providerId: string) => {
      return requests.filter((r) => r.providerId === providerId);
    },
    [requests]
  );

  // Provider sends connection request to buyer
  const sendConnectionRequest = useCallback(
    (
      providerId: string,
      providerName: string,
      providerEmail: string,
      buyerId: string,
      buyerBusinessName: string,
      message?: string
    ): ConnectionRequest => {
      // Check if request already exists
      const existingRequest = requests.find(
        (r) => r.providerId === providerId && r.buyerId === buyerId && r.status === "pending"
      );
      if (existingRequest) {
        return existingRequest;
      }

      const newRequest: ConnectionRequest = {
        id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        providerId,
        providerName,
        providerEmail,
        buyerId,
        buyerBusinessName,
        message,
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      setRequests((prev) => [...prev, newRequest]);
      return newRequest;
    },
    [requests]
  );

  // Buyer sets terms for a request
  const setTermsForRequest = useCallback(
    (requestId: string, terms: ContractTerms) => {
      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: "terms_set" as const,
                proposedTerms: terms,
                reviewedAt: new Date().toISOString(),
              }
            : r
        )
      );
    },
    []
  );

  // Buyer rejects a request
  const rejectRequest = useCallback((requestId: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: "rejected" as const,
              reviewedAt: new Date().toISOString(),
            }
          : r
      )
    );
  }, []);

  // Provider accepts terms - creates connection
  const acceptTerms = useCallback(
    (requestId: string): Connection | null => {
      const request = requests.find((r) => r.id === requestId);
      if (!request || request.status !== "terms_set" || !request.proposedTerms) {
        return null;
      }

      // Create the connection
      const now = new Date().toISOString();
      const newConnection: Connection = {
        id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        providerId: request.providerId,
        providerName: request.providerName,
        providerEmail: request.providerEmail,
        buyerId: request.buyerId,
        buyerBusinessName: request.buyerBusinessName,
        status: "active",
        terms: request.proposedTerms,
        requestedAt: request.createdAt,
        termsSetAt: request.reviewedAt || now,
        acceptedAt: now,
        stats: {
          totalLeads: 0,
          totalPaid: 0,
          leadsThisWeek: 0,
          leadsThisMonth: 0,
          weekStartDate: getWeekStartDate(),
          monthStartDate: getMonthStartDate(),
        },
      };

      setConnections((prev) => [...prev, newConnection]);

      // Update request status
      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: "accepted" as const,
                respondedAt: now,
              }
            : r
        )
      );

      return newConnection;
    },
    [requests]
  );

  // Provider declines terms
  const declineTerms = useCallback((requestId: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: "declined" as const,
              respondedAt: new Date().toISOString(),
            }
          : r
      )
    );
  }, []);

  // Get connections for buyer
  const getConnectionsForBuyer = useCallback(
    (buyerId: string) => {
      return connections.filter((c) => c.buyerId === buyerId);
    },
    [connections]
  );

  // Get connections for provider
  const getConnectionsForProvider = useCallback(
    (providerId: string) => {
      return connections.filter((c) => c.providerId === providerId);
    },
    [connections]
  );

  // Get connections by provider email (for cross-system compatibility)
  const getConnectionsByProviderEmail = useCallback(
    (email: string) => {
      return connections.filter((c) => c.providerEmail.toLowerCase() === email.toLowerCase());
    },
    [connections]
  );

  // Get active connection for provider
  const getActiveConnectionForProvider = useCallback(
    (providerId: string): Connection | null => {
      return connections.find(
        (c) => c.providerId === providerId && c.status === "active"
      ) || null;
    },
    [connections]
  );

  // Terminate a connection
  const terminateConnection = useCallback(
    (connectionId: string, terminatedBy: "buyer" | "provider", reason?: string) => {
      setConnections((prev) =>
        prev.map((c) =>
          c.id === connectionId
            ? {
                ...c,
                status: "terminated" as const,
                terminatedAt: new Date().toISOString(),
                terminatedBy,
                terminationReason: reason,
              }
            : c
        )
      );
    },
    []
  );

  // Update connection terms (buyer only)
  const updateConnectionTerms = useCallback(
    (connectionId: string, terms: ContractTerms) => {
      setConnections((prev) =>
        prev.map((c) =>
          c.id === connectionId
            ? {
                ...c,
                terms,
              }
            : c
        )
      );
    },
    []
  );

  // Update connection stats when lead is submitted
  const updateConnectionStats = useCallback(
    (connectionId: string, leadPayout: number) => {
      const currentWeekStart = getWeekStartDate();
      const currentMonthStart = getMonthStartDate();

      setConnections((prev) =>
        prev.map((c) => {
          if (c.id !== connectionId) return c;

          // Check if we need to reset weekly/monthly counters
          const resetWeekly = c.stats.weekStartDate !== currentWeekStart;
          const resetMonthly = c.stats.monthStartDate !== currentMonthStart;

          return {
            ...c,
            stats: {
              totalLeads: c.stats.totalLeads + 1,
              totalPaid: c.stats.totalPaid + leadPayout,
              lastLeadAt: new Date().toISOString(),
              lastPaymentAt: new Date().toISOString(),
              leadsThisWeek: resetWeekly ? 1 : c.stats.leadsThisWeek + 1,
              leadsThisMonth: resetMonthly ? 1 : c.stats.leadsThisMonth + 1,
              weekStartDate: currentWeekStart,
              monthStartDate: currentMonthStart,
            },
          };
        })
      );
    },
    []
  );

  return (
    <ConnectionContext.Provider
      value={{
        requests,
        getRequestsForBuyer,
        getRequestsForProvider,
        sendConnectionRequest,
        acceptTerms,
        declineTerms,
        setTermsForRequest,
        rejectRequest,
        connections,
        getConnectionsForBuyer,
        getConnectionsForProvider,
        getConnectionsByProviderEmail,
        getActiveConnectionForProvider,
        terminateConnection,
        updateConnectionTerms,
        updateConnectionStats,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnections() {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error("useConnections must be used within a ConnectionProvider");
  }
  return context;
}
