"use client";

export type UserRole = "buyer" | "provider";

// Stored separately for security
export interface UserCredentials {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  role: UserRole;
}

export interface BaseUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  profileImage?: string;
  isActive: boolean;
}

// Buyer Stats for Baseball Card
export interface BuyerStats {
  totalLeadsPurchased: number;
  totalAmountPaid: number;
  averagePayoutRate: number;
  activeProviders: number;
  memberSince: string;
  conversionRate: number;
  responseTimeHours: number;
  rating: number;
  totalRatings: number;
}

// Provider Stats for Baseball Card
export interface ProviderStats {
  totalLeadsSubmitted: number;
  totalEarnings: number;
  averageLeadQuality: number;
  conversionRate: number;
  activeConnections: number;
  memberSince: string;
  rating: number;
  totalRatings: number;
  topCategory?: string;
}

// Lead Buyer (Business Owner) - The Priority User
export interface LeadBuyer extends BaseUser {
  role: "buyer";
  businessName: string;
  businessType: "insurance_agency" | "dealership" | "broker" | "other";
  phone: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  stats: BuyerStats;
  connectionIds: string[];
}

// Lead Provider (Generator)
export interface LeadProvider extends BaseUser {
  role: "provider";
  displayName: string;
  phone?: string;
  location?: string;
  bio?: string;
  paymentMethod?: "venmo" | "paypal" | "bank";
  paymentDetails?: {
    venmoUsername?: string;
    paypalEmail?: string;
    bankAccountLast4?: string;
    bankRoutingLast4?: string;
  };
  stats: ProviderStats;
  connectionIds: string[];
}

// Union type for any user
export type User = LeadBuyer | LeadProvider;

// Session stored in localStorage
export interface Session {
  userId: string;
  role: UserRole;
  token: string;
  expiresAt: string;
  createdAt: string;
}

// Registration data
export interface BuyerRegistrationData {
  email: string;
  password: string;
  username: string;
  businessName: string;
  businessType: LeadBuyer["businessType"];
  phone: string;
}

export interface ProviderRegistrationData {
  email: string;
  password: string;
  username: string;
  displayName: string;
  phone?: string;
  location?: string;
}

// Helper to check user type
export function isBuyer(user: User): user is LeadBuyer {
  return user.role === "buyer";
}

export function isProvider(user: User): user is LeadProvider {
  return user.role === "provider";
}

// Default stats for new users
export function getDefaultBuyerStats(): BuyerStats {
  return {
    totalLeadsPurchased: 0,
    totalAmountPaid: 0,
    averagePayoutRate: 0,
    activeProviders: 0,
    memberSince: new Date().toISOString(),
    conversionRate: 0,
    responseTimeHours: 0,
    rating: 0,
    totalRatings: 0,
  };
}

export function getDefaultProviderStats(): ProviderStats {
  return {
    totalLeadsSubmitted: 0,
    totalEarnings: 0,
    averageLeadQuality: 0,
    conversionRate: 0,
    activeConnections: 0,
    memberSince: new Date().toISOString(),
    rating: 0,
    totalRatings: 0,
  };
}
