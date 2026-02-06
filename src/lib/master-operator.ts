// Master Operator Configuration
// This application is tailored for a single business: Options Insurance Agency

export const MASTER_OPERATOR = {
  email: "rcrookham@gmail.com",
  businessName: "Options Insurance Agency",
  phone: "267-393-5417",
  name: "Ryan Crookham",
};

/**
 * Check if an email belongs to the master operator
 */
export function isMasterOperator(email: string): boolean {
  return email.toLowerCase() === MASTER_OPERATOR.email.toLowerCase();
}

/**
 * Check if a user ID belongs to the master operator (requires database lookup)
 */
export function isMasterOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === MASTER_OPERATOR.email.toLowerCase();
}
