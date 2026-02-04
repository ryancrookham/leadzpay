"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { useSession } from "next-auth/react";

// Connection type matching API response with camelCase aliases for dashboard compatibility
export interface ApiConnection {
  id: string;
  provider_id: string;
  buyer_id: string;
  status: string;
  rate_per_lead: number;
  payment_timing: string;
  weekly_lead_cap: number | null;
  monthly_lead_cap: number | null;
  total_leads: number;
  total_paid: number;
  termination_notice_days: number;
  terms_updated_at: string | null;
  initiator: string;
  message: string | null;
  created_at: string;
  accepted_at: string | null;
  // Enriched fields from API
  provider_name?: string;
  provider_email?: string;
  buyer_name?: string;
  buyer_email?: string;
  // CamelCase aliases for dashboard compatibility
  providerId: string;
  providerName: string;
  providerEmail: string;
  buyerId: string;
  buyerBusinessName: string;
  createdAt: string;
}

// Transform API response to add camelCase aliases
function transformConnection(conn: any): ApiConnection {
  return {
    ...conn,
    providerId: conn.provider_id,
    providerName: conn.provider_name || "",
    providerEmail: conn.provider_email || "",
    buyerId: conn.buyer_id,
    buyerBusinessName: conn.buyer_name || "",
    createdAt: conn.created_at,
  };
}

interface ConnectionContextType {
  // State
  connections: ApiConnection[];
  loading: boolean;
  error: string | null;

  // Refresh data from API
  refreshConnections: () => Promise<void>;

  // Provider actions
  sendConnectionRequest: (buyerId: string, message?: string) => Promise<ApiConnection | null>;
  acceptTerms: (connectionId: string) => Promise<boolean>;
  declineTerms: (connectionId: string) => Promise<boolean>;

  // Buyer actions
  sendInvitationToProvider: (
    providerEmail: string,
    terms: {
      ratePerLead: number;
      paymentTiming?: string;
      weeklyLeadCap?: number;
      monthlyLeadCap?: number;
      terminationNoticeDays?: number;
    },
    message?: string
  ) => Promise<ApiConnection | null>;
  setTermsForRequest: (
    connectionId: string,
    terms: {
      ratePerLead: number;
      paymentTiming?: string;
      weeklyLeadCap?: number;
      monthlyLeadCap?: number;
      terminationNoticeDays?: number;
    }
  ) => Promise<boolean>;
  rejectRequest: (connectionId: string) => Promise<boolean>;
  updateConnectionTerms: (
    connectionId: string,
    terms: {
      ratePerLead?: number;
      paymentTiming?: string;
      weeklyLeadCap?: number | null;
      monthlyLeadCap?: number | null;
      terminationNoticeDays?: number;
    }
  ) => Promise<boolean>;

  // Shared actions
  terminateConnection: (connectionId: string) => Promise<boolean>;

  // Helpers
  getConnectionsForBuyer: (buyerId: string) => ApiConnection[];
  getConnectionsForProvider: (providerId: string) => ApiConnection[];
  getActiveConnectionForProvider: (providerId: string) => ApiConnection | null;
  getPendingRequestsForBuyer: (buyerId: string) => ApiConnection[];
  getPendingTermsForProvider: (providerId: string) => ApiConnection[];

  // Legacy compatibility (used by existing dashboards)
  getRequestsForBuyer: (buyerId: string) => ApiConnection[];
  getRequestsForProvider: (providerId: string) => ApiConnection[];
  getInvitationsForProvider: (providerEmail: string) => ApiConnection[];
  getConnectionsByProviderEmail: (email: string) => ApiConnection[];
  updateConnectionStats: (connectionId: string, leadPayout: number) => void;
}

const ConnectionContext = createContext<ConnectionContextType | undefined>(undefined);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [connections, setConnections] = useState<ApiConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch connections from API
  const refreshConnections = useCallback(async () => {
    if (!session?.user) {
      setConnections([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/connections");
      if (!response.ok) {
        throw new Error("Failed to fetch connections");
      }
      const data = await response.json();
      setConnections((data.connections || []).map(transformConnection));
    } catch (err) {
      console.error("[ConnectionContext] Error fetching connections:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [session]);

  // Load connections on mount and when session changes
  useEffect(() => {
    refreshConnections();
  }, [refreshConnections]);

  // Provider sends connection request to buyer
  const sendConnectionRequest = useCallback(
    async (buyerId: string, message?: string): Promise<ApiConnection | null> => {
      try {
        const response = await fetch("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ buyerId, message }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to send request");
        }

        const data = await response.json();
        await refreshConnections();
        return data.connection;
      } catch (err) {
        console.error("[ConnectionContext] sendConnectionRequest error:", err);
        return null;
      }
    },
    [refreshConnections]
  );

  // Buyer sends invitation to provider with pre-set terms
  const sendInvitationToProvider = useCallback(
    async (
      providerEmail: string,
      terms: {
        ratePerLead: number;
        paymentTiming?: string;
        weeklyLeadCap?: number;
        monthlyLeadCap?: number;
        terminationNoticeDays?: number;
      },
      message?: string
    ): Promise<ApiConnection | null> => {
      try {
        const response = await fetch("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerEmail, terms, message }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to send invitation");
        }

        const data = await response.json();
        await refreshConnections();
        return data.connection;
      } catch (err) {
        console.error("[ConnectionContext] sendInvitationToProvider error:", err);
        return null;
      }
    },
    [refreshConnections]
  );

  // Buyer sets terms for a pending request
  const setTermsForRequest = useCallback(
    async (
      connectionId: string,
      terms: {
        ratePerLead: number;
        paymentTiming?: string;
        weeklyLeadCap?: number;
        monthlyLeadCap?: number;
        terminationNoticeDays?: number;
      }
    ): Promise<boolean> => {
      try {
        const response = await fetch(`/api/connections/${connectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set_terms", ...terms }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to set terms");
        }

        await refreshConnections();
        return true;
      } catch (err) {
        console.error("[ConnectionContext] setTermsForRequest error:", err);
        return false;
      }
    },
    [refreshConnections]
  );

  // Buyer rejects a request
  const rejectRequest = useCallback(
    async (connectionId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/connections/${connectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reject" }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to reject request");
        }

        await refreshConnections();
        return true;
      } catch (err) {
        console.error("[ConnectionContext] rejectRequest error:", err);
        return false;
      }
    },
    [refreshConnections]
  );

  // Provider accepts terms
  const acceptTerms = useCallback(
    async (connectionId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/connections/${connectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "accept" }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to accept terms");
        }

        await refreshConnections();
        return true;
      } catch (err) {
        console.error("[ConnectionContext] acceptTerms error:", err);
        return false;
      }
    },
    [refreshConnections]
  );

  // Provider declines terms
  const declineTerms = useCallback(
    async (connectionId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/connections/${connectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "decline" }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to decline terms");
        }

        await refreshConnections();
        return true;
      } catch (err) {
        console.error("[ConnectionContext] declineTerms error:", err);
        return false;
      }
    },
    [refreshConnections]
  );

  // Terminate a connection (either party)
  const terminateConnection = useCallback(
    async (connectionId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/connections/${connectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "terminate" }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to terminate connection");
        }

        await refreshConnections();
        return true;
      } catch (err) {
        console.error("[ConnectionContext] terminateConnection error:", err);
        return false;
      }
    },
    [refreshConnections]
  );

  // Buyer updates terms on active connection
  const updateConnectionTerms = useCallback(
    async (
      connectionId: string,
      terms: {
        ratePerLead?: number;
        paymentTiming?: string;
        weeklyLeadCap?: number | null;
        monthlyLeadCap?: number | null;
        terminationNoticeDays?: number;
      }
    ): Promise<boolean> => {
      try {
        const response = await fetch(`/api/connections/${connectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_terms", ...terms }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to update terms");
        }

        await refreshConnections();
        return true;
      } catch (err) {
        console.error("[ConnectionContext] updateConnectionTerms error:", err);
        return false;
      }
    },
    [refreshConnections]
  );

  // Helper: Get connections for buyer
  const getConnectionsForBuyer = useCallback(
    (buyerId: string) => {
      return connections.filter((c) => c.buyer_id === buyerId);
    },
    [connections]
  );

  // Helper: Get connections for provider
  const getConnectionsForProvider = useCallback(
    (providerId: string) => {
      return connections.filter((c) => c.provider_id === providerId);
    },
    [connections]
  );

  // Helper: Get active connection for provider
  const getActiveConnectionForProvider = useCallback(
    (providerId: string): ApiConnection | null => {
      return (
        connections.find(
          (c) => c.provider_id === providerId && c.status === "active"
        ) || null
      );
    },
    [connections]
  );

  // Helper: Get pending requests for buyer to review
  const getPendingRequestsForBuyer = useCallback(
    (buyerId: string) => {
      return connections.filter(
        (c) => c.buyer_id === buyerId && c.status === "pending_buyer_review"
      );
    },
    [connections]
  );

  // Helper: Get pending terms for provider to accept/decline
  const getPendingTermsForProvider = useCallback(
    (providerId: string) => {
      return connections.filter(
        (c) => c.provider_id === providerId && c.status === "pending_provider_accept"
      );
    },
    [connections]
  );

  // Legacy compatibility: Get all requests for buyer (any status)
  const getRequestsForBuyer = useCallback(
    (buyerId: string) => {
      return connections.filter((c) => c.buyer_id === buyerId);
    },
    [connections]
  );

  // Legacy compatibility: Get all requests for provider (any status)
  const getRequestsForProvider = useCallback(
    (providerId: string) => {
      return connections.filter((c) => c.provider_id === providerId);
    },
    [connections]
  );

  // Legacy compatibility: Get invitations for provider (terms already set by buyer)
  const getInvitationsForProvider = useCallback(
    (providerEmail: string) => {
      return connections.filter(
        (c) =>
          c.provider_email?.toLowerCase() === providerEmail.toLowerCase() &&
          c.status === "pending_provider_accept"
      );
    },
    [connections]
  );

  // Legacy compatibility: Get connections by provider email
  const getConnectionsByProviderEmail = useCallback(
    (email: string) => {
      return connections.filter(
        (c) => c.provider_email?.toLowerCase() === email.toLowerCase()
      );
    },
    [connections]
  );

  // Legacy compatibility: Update connection stats (currently just refreshes from API)
  const updateConnectionStats = useCallback(
    (connectionId: string, leadPayout: number) => {
      // Stats are tracked server-side, just refresh to get latest
      refreshConnections();
    },
    [refreshConnections]
  );

  return (
    <ConnectionContext.Provider
      value={{
        connections,
        loading,
        error,
        refreshConnections,
        sendConnectionRequest,
        sendInvitationToProvider,
        setTermsForRequest,
        rejectRequest,
        acceptTerms,
        declineTerms,
        terminateConnection,
        updateConnectionTerms,
        getConnectionsForBuyer,
        getConnectionsForProvider,
        getActiveConnectionForProvider,
        getPendingRequestsForBuyer,
        getPendingTermsForProvider,
        // Legacy compatibility
        getRequestsForBuyer,
        getRequestsForProvider,
        getInvitationsForProvider,
        getConnectionsByProviderEmail,
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
