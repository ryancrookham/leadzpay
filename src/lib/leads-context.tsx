"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

// Extended customer profile for quote generation
export interface CustomerProfile {
  age: number;
  gender: "male" | "female" | "other";
  maritalStatus: "single" | "married" | "divorced" | "widowed";
  state: string;
  zipCode: string;
  creditScore: "excellent" | "good" | "fair" | "poor";
  homeOwner: boolean;
  yearsLicensed: number;
  drivingHistory: "clean" | "minor_violations" | "major_violations" | "at_fault_accident" | "dui" | "multiple_incidents";
  priorInsurance: boolean;
  annualMileage: number;
  vehicleOwnership: "owned" | "financed" | "leased";
  primaryUse: "commute" | "pleasure" | "business";
  garageType: "garage" | "carport" | "street" | "driveway";
  antiTheft: boolean;
  safetyFeatures: boolean;
  occupation: "standard" | "military" | "teacher" | "engineer" | "medical";
  coverageType: "liability" | "collision" | "comprehensive" | "full";
  deductible: number;
}

export interface Lead {
  id: string;
  customerName: string;
  email: string;
  phone: string;
  carModel: string;
  carYear: number;
  quoteType: "asap" | "switch" | "quote";
  status: "pending" | "claimed" | "converted" | "expired";
  providerId: string;
  providerName: string;
  receiverId?: string;
  receiverName?: string;
  connectionId?: string;  // ID of the connection this lead was submitted through
  buyerId?: string;       // ID of the buyer receiving this lead
  payout: number;
  quote?: InsuranceQuote;
  createdAt: string;
  claimedAt?: string;
  // ASAP channel tracking
  asapCallInitiated?: boolean;
  asapCallSid?: string;
  asapCallTime?: string;
  // Extended customer profile for Quote channel
  customerProfile?: CustomerProfile;
  // Simple quote flow - driver's license image
  licenseImage?: string;
  // Extracted license data
  extractedLicenseData?: {
    firstName: string;
    lastName: string;
    fullName: string;
    dateOfBirth: string;
    age: number;
    gender: "male" | "female" | "other";
    licenseNumber: string;
    licenseState: string;
    expirationDate: string;
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      fullAddress: string;
    };
    isExpired: boolean;
    isValid: boolean;
  };
  // CRM integration tracking
  crmPushed?: boolean;
  crmLeadId?: string;
}

export interface InsuranceQuote {
  monthlyPremium: number;
  annualPremium: number;
  coverageType: string;
  deductible: number;
  provider: string;
}

export interface Provider {
  id: string;
  name: string;
  email: string;
  phone?: string;
  stripeAccountId?: string;
  payoutRate: number; // $ per lead
  totalLeads: number;
  totalEarnings: number;
  status: "active" | "inactive" | "suspended" | "terminated";
  paymentMethod?: "venmo" | "paypal" | "bank";
  paymentDetails?: {
    venmoUsername?: string;
    paypalEmail?: string;
    bankAccountLast4?: string;
    bankRoutingLast4?: string;
  };
  recurringPayout?: boolean;
  payoutFrequency?: "per_lead" | "weekly" | "biweekly" | "monthly";
}

interface LeadsContextType {
  leads: Lead[];
  providers: Provider[];
  addLead: (lead: Omit<Lead, "id" | "createdAt">) => Lead;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  deleteLead: (id: string) => void;
  claimLead: (leadId: string, receiverId: string, receiverName: string) => void;
  getProviderLeads: (providerId: string) => Lead[];
  getReceiverLeads: (receiverId: string) => Lead[];
  addProvider: (provider: Omit<Provider, "id">) => Provider;
  updateProvider: (id: string, updates: Partial<Provider>) => void;
  deleteProvider: (id: string) => void;
  updateProviderRate: (providerId: string, newRate: number) => void;
  updateProviderStatus: (providerId: string, status: Provider["status"]) => void;
  getProvider: (providerId: string) => Provider | undefined;
  getProviderByEmail: (email: string) => Provider | undefined;
}

const LeadsContext = createContext<LeadsContextType | undefined>(undefined);

export function LeadsProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    const savedLeads = localStorage.getItem("leadzpay_leads");
    const savedProviders = localStorage.getItem("leadzpay_providers");

    if (savedLeads) {
      setLeads(JSON.parse(savedLeads));
    }
    if (savedProviders) {
      setProviders(JSON.parse(savedProviders));
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem("leadzpay_leads", JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem("leadzpay_providers", JSON.stringify(providers));
  }, [providers]);

  const addLead = (leadData: Omit<Lead, "id" | "createdAt">): Lead => {
    const provider = providers.find(p => p.id === leadData.providerId);
    const payout = provider?.payoutRate || 50;

    const newLead: Lead = {
      ...leadData,
      id: `lead-${Date.now()}`,
      createdAt: new Date().toISOString(),
      payout,
    };

    setLeads((prev) => [newLead, ...prev]);

    // Update provider stats
    setProviders((prev) =>
      prev.map((p) =>
        p.id === leadData.providerId
          ? { ...p, totalLeads: p.totalLeads + 1, totalEarnings: p.totalEarnings + payout }
          : p
      )
    );

    return newLead;
  };

  const updateLead = (id: string, updates: Partial<Lead>) => {
    setLeads((prev) =>
      prev.map((lead) => (lead.id === id ? { ...lead, ...updates } : lead))
    );
  };

  const deleteLead = (id: string) => {
    setLeads((prev) => prev.filter((lead) => lead.id !== id));
  };

  const claimLead = (leadId: string, receiverId: string, receiverName: string) => {
    setLeads((prev) =>
      prev.map((lead) => {
        if (lead.id === leadId) {
          const provider = providers.find((p) => p.id === lead.providerId);
          const payout = provider?.payoutRate || 50;

          return {
            ...lead,
            status: "claimed" as const,
            receiverId,
            receiverName,
            payout,
            claimedAt: new Date().toISOString(),
          };
        }
        return lead;
      })
    );
  };

  const getProviderLeads = (providerId: string) => {
    return leads.filter((lead) => lead.providerId === providerId);
  };

  const getReceiverLeads = (receiverId: string) => {
    return leads.filter((lead) => lead.receiverId === receiverId || lead.status === "pending");
  };

  const addProvider = (providerData: Omit<Provider, "id">): Provider => {
    const newProvider: Provider = {
      ...providerData,
      id: `provider-${Date.now()}`,
    };
    setProviders((prev) => [...prev, newProvider]);
    return newProvider;
  };

  const updateProvider = (id: string, updates: Partial<Provider>) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  const deleteProvider = (id: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== id));
  };

  const updateProviderRate = (providerId: string, newRate: number) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === providerId ? { ...p, payoutRate: newRate } : p))
    );
  };

  const updateProviderStatus = (providerId: string, status: Provider["status"]) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === providerId ? { ...p, status } : p))
    );
  };

  const getProvider = (providerId: string) => {
    return providers.find((p) => p.id === providerId);
  };

  const getProviderByEmail = (email: string) => {
    return providers.find((p) => p.email.toLowerCase() === email.toLowerCase());
  };

  return (
    <LeadsContext.Provider
      value={{
        leads,
        providers,
        addLead,
        updateLead,
        deleteLead,
        claimLead,
        getProviderLeads,
        getReceiverLeads,
        addProvider,
        updateProvider,
        deleteProvider,
        updateProviderRate,
        updateProviderStatus,
        getProvider,
        getProviderByEmail,
      }}
    >
      {children}
    </LeadsContext.Provider>
  );
}

export function useLeads() {
  const context = useContext(LeadsContext);
  if (!context) {
    throw new Error("useLeads must be used within a LeadsProvider");
  }
  return context;
}
