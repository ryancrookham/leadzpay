/**
 * AAMVA PDF417 driver's-license barcode parser.
 *
 * The barcode on the back of every US driver's license (post-2000) encodes
 * personal data as a structured payload defined by the American Association
 * of Motor Vehicle Administrators. Fields are 3-letter codes followed by
 * their value on the same line, separated by newlines.
 *
 * Reference: AAMVA Card Design Standard v10.
 */

export interface AAMVAData {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dateOfBirth?: string;        // YYYY-MM-DD
  street?: string;
  street2?: string;
  city?: string;
  state?: string;              // 2-letter code
  zip?: string;                // 5-digit
  licenseNumber?: string;
  expirationDate?: string;     // YYYY-MM-DD
  sex?: "M" | "F";
}

/**
 * Look up an AAMVA field code and return the value (trimmed).
 * Field codes are exactly 3 uppercase letters, immediately followed by the value.
 */
function getField(raw: string, code: string): string | undefined {
  // Match code at start of line, or after any whitespace/newline
  const re = new RegExp(`(?:^|[\\r\\n])${code}([^\\r\\n]*)`);
  const m = raw.match(re);
  const value = m?.[1]?.trim();
  return value || undefined;
}

/**
 * Convert MMDDCCYY (AAMVA) → YYYY-MM-DD (HTML5 date input format).
 */
function parseAamvaDate(raw: string | undefined): string | undefined {
  if (!raw || !/^\d{8}$/.test(raw)) return undefined;
  const mm = raw.slice(0, 2);
  const dd = raw.slice(2, 4);
  const yyyy = raw.slice(4, 8);
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse an AAMVA PDF417 payload into structured driver's-license data.
 * Returns null if the payload doesn't look like AAMVA (e.g., a random barcode).
 */
export function parseAAMVA(raw: string): AAMVAData | null {
  // Sanity check: real AAMVA payloads always contain DCS (last name) and DAC (first name)
  if (!raw.includes("DCS") || !raw.includes("DAC")) {
    return null;
  }

  const sexRaw = getField(raw, "DBC");
  let sex: "M" | "F" | undefined;
  if (sexRaw === "1") sex = "M";
  else if (sexRaw === "2") sex = "F";

  const zipRaw = getField(raw, "DAK");
  // ZIP is often ZIP+4 padded with zeros — trim to first 5 valid digits
  const zip = zipRaw ? zipRaw.replace(/[^0-9]/g, "").slice(0, 5) : undefined;

  return {
    firstName: getField(raw, "DAC"),
    middleName: getField(raw, "DAD"),
    lastName: getField(raw, "DCS"),
    dateOfBirth: parseAamvaDate(getField(raw, "DBB")),
    street: getField(raw, "DAG"),
    street2: getField(raw, "DAH"),
    city: getField(raw, "DAI"),
    state: getField(raw, "DAJ")?.slice(0, 2).toUpperCase(),
    zip: zip && zip.length === 5 ? zip : undefined,
    licenseNumber: getField(raw, "DAQ"),
    expirationDate: parseAamvaDate(getField(raw, "DBA")),
    sex,
  };
}
