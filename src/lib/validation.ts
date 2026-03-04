import { z } from "zod";

// ============================================
// Common Validators
// ============================================

export const emailSchema = z
  .string()
  .email("Invalid email address")
  .max(255, "Email too long")
  .transform((email) => email.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password too long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(50, "Username too long")
  .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens");

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{9,14}$/, "Invalid phone number")
  .optional()
  .or(z.literal(""));

export const stateCodeSchema = z
  .string()
  .length(2, "State code must be 2 characters")
  .regex(/^[A-Z]{2}$/, "Invalid state code")
  .toUpperCase();

export const zipCodeSchema = z
  .string()
  .regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code");

export const uuidSchema = z.string().uuid("Invalid ID format");

// ============================================
// User Schemas
// ============================================

export const registerProviderSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  displayName: z.string().min(1).max(100).optional(),
  phone: phoneSchema,
  location: z.string().max(255).optional(),
});

export const registerBuyerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  businessName: z.string().min(1, "Business name required").max(255),
  businessType: z.string().min(1, "Business type required").max(100),
  phone: phoneSchema,
  licensedStates: z.array(stateCodeSchema).min(1, "At least one licensed state required"),
  npn: z.string().max(50).optional(),
  complianceAcknowledged: z.literal(true, "You must acknowledge the compliance terms"),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password required"),
});

export const updateProfileSchema = z.object({
  displayName: z.string().max(100).optional(),
  phone: phoneSchema,
  location: z.string().max(255).optional(),
});

// ============================================
// Lead Schemas
// ============================================

export const customerInfoSchema = z.object({
  firstName: z.string().min(1, "First name required").max(100),
  lastName: z.string().min(1, "Last name required").max(100),
  middleName: z.string().max(100).optional(),
  email: emailSchema,
  phone: z.string().regex(/^\+?[1-9]\d{9,14}$/, "Invalid phone number"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  gender: z.enum(["male", "female", "other"]),
});

export const addressSchema = z.object({
  street: z.string().min(1, "Street address required").max(255),
  city: z.string().min(1, "City required").max(100),
  state: stateCodeSchema,
  zipCode: zipCodeSchema,
});

export const submitLeadSchema = z.object({
  connectionId: uuidSchema,
  customerInfo: customerInfoSchema,
  address: addressSchema,
  notes: z.string().max(1000).optional(),
});

export const claimLeadSchema = z.object({
  leadId: uuidSchema,
});

// ============================================
// Connection Schemas
// ============================================

export const connectionRequestSchema = z.object({
  buyerId: uuidSchema,
  message: z.string().max(500).optional(),
});

export const connectionTermsSchema = z.object({
  ratePerLead: z.number().min(5, "Minimum $5 per lead").max(500, "Maximum $500 per lead"),
  paymentTiming: z.enum(["per_lead", "weekly", "biweekly", "monthly"]),
  weeklyLeadCap: z.number().int().min(1).max(1000).optional(),
  monthlyLeadCap: z.number().int().min(1).max(10000).optional(),
  capStrategy: z.enum(["pause", "reject"]).optional(),
  allowedStates: z.array(stateCodeSchema).optional(),
});

export const acceptConnectionSchema = z.object({
  connectionId: uuidSchema,
  terms: connectionTermsSchema,
});

export const updateConnectionTermsSchema = z.object({
  connectionId: uuidSchema,
  terms: connectionTermsSchema.partial(),
});

// ============================================
// Payment Schemas
// ============================================

export const createPaymentSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  providerId: uuidSchema,
  leadId: uuidSchema,
  description: z.string().max(500).optional(),
});

export const payoutSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  providerId: uuidSchema,
  stripeAccountId: z.string().min(1, "Stripe account ID required"),
});

// ============================================
// Admin Schemas
// ============================================

export const adminLoginSchema = z.object({
  password: z.string().min(1, "Password required"),
});

// ============================================
// API Response Schemas
// ============================================

export const apiErrorSchema = z.object({
  error: z.string(),
  details: z.record(z.string(), z.string()).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// ============================================
// Helper Functions
// ============================================

/**
 * Validate data and return result with typed errors
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    errors[path || "root"] = issue.message;
  }

  return { success: false, errors };
}

/**
 * Validate or throw (for API routes)
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Create validation middleware for API routes
 */
export function createValidator<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): T => {
    const result = schema.safeParse(data);
    if (!result.success) {
      const errors = result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`);
      throw new Error(`Validation failed: ${errors.join(", ")}`);
    }
    return result.data;
  };
}

// ============================================
// Type Exports
// ============================================

export type RegisterProviderInput = z.infer<typeof registerProviderSchema>;
export type RegisterBuyerInput = z.infer<typeof registerBuyerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CustomerInfoInput = z.infer<typeof customerInfoSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type SubmitLeadInput = z.infer<typeof submitLeadSchema>;
export type ConnectionTermsInput = z.infer<typeof connectionTermsSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type PayoutInput = z.infer<typeof payoutSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
