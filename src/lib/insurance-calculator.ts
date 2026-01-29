// Multi-carrier insurance quote calculator with actuarial tables
// Includes: State Farm, Progressive, Allstate, GEICO, Liberty Mutual, Nationwide, Farmers, USAA, Travelers, American Family

export interface DriverProfile {
  age: number;
  gender: "male" | "female" | "other";
  maritalStatus: "single" | "married" | "divorced" | "widowed";
  creditScore: "excellent" | "good" | "fair" | "poor";
  homeOwner: boolean;
  yearsLicensed: number;
  drivingHistory: "clean" | "minor_violations" | "major_violations" | "accidents" | "dui";
  priorInsurance: boolean;
  priorInsuranceLapse: number; // days without insurance
  education: "high_school" | "bachelors" | "masters" | "doctorate";
  occupation: "standard" | "professional" | "military" | "student";
  annualMileage: number;
}

export interface VehicleProfile {
  year: number;
  make: string;
  model: string;
  vin?: string;
  ownership: "owned" | "financed" | "leased";
  primaryUse: "commute" | "pleasure" | "business";
  garageType: "garage" | "carport" | "street" | "parking_lot";
  antiTheft: boolean;
  safetyFeatures: boolean; // airbags, ABS, etc.
}

export interface CoverageOptions {
  type: "liability" | "collision" | "comprehensive" | "full";
  deductible: 250 | 500 | 1000 | 2000;
  bodilyInjuryLimit: "30/60" | "50/100" | "100/300" | "250/500";
  propertyDamageLimit: 25000 | 50000 | 100000 | 250000;
  uninsuredMotorist: boolean;
  medicalPayments: boolean;
  rentalReimbursement: boolean;
  roadsideAssistance: boolean;
}

export interface InsuranceCompany {
  id: string;
  name: string;
  logo?: string;
  color: string;
  exclusive: boolean; // If true, agent can only sell this company
  avgRating: number;
  baseRates: Record<CoverageOptions["type"], number>;
  discounts: CompanyDiscounts;
  surcharges: CompanySurcharges;
  stateMultipliers: Record<string, number>;
  available: boolean;
}

interface CompanyDiscounts {
  multiPolicy: number;      // Home + auto bundle
  goodDriver: number;       // Clean record
  goodStudent: number;      // Student with good grades
  defensive: number;        // Defensive driving course
  antiTheft: number;        // Anti-theft devices
  safety: number;           // Safety features
  loyalty: number;          // Years with company
  payInFull: number;        // Pay annual premium upfront
  paperless: number;        // Paperless billing
  military: number;         // Military discount
  homeOwner: number;        // Home ownership
  married: number;          // Married discount
  lowMileage: number;       // Under 7,500 miles/year
  goodCredit: number;       // Excellent credit
}

interface CompanySurcharges {
  youngDriver: number;      // Under 25
  seniorDriver: number;     // Over 70
  poorCredit: number;       // Poor credit score
  noHistory: number;        // No prior insurance
  lapse: number;           // Gap in coverage
  minorViolation: number;   // Speeding ticket, etc.
  majorViolation: number;   // Reckless driving
  accident: number;         // At-fault accident
  dui: number;             // DUI/DWI
  highMileage: number;      // Over 15,000 miles/year
  newDriver: number;        // Less than 3 years licensed
}

// Insurance company configurations with their actuarial factors
const INSURANCE_COMPANIES: InsuranceCompany[] = [
  {
    id: "state_farm",
    name: "State Farm",
    color: "#E31837",
    exclusive: false,
    avgRating: 4.5,
    baseRates: { liability: 480, collision: 720, comprehensive: 840, full: 1440 },
    discounts: {
      multiPolicy: 0.20, goodDriver: 0.15, goodStudent: 0.10, defensive: 0.05,
      antiTheft: 0.03, safety: 0.05, loyalty: 0.10, payInFull: 0.05,
      paperless: 0.02, military: 0.05, homeOwner: 0.05, married: 0.05,
      lowMileage: 0.08, goodCredit: 0.10
    },
    surcharges: {
      youngDriver: 0.85, seniorDriver: 0.15, poorCredit: 0.35, noHistory: 0.20,
      lapse: 0.15, minorViolation: 0.15, majorViolation: 0.40, accident: 0.45,
      dui: 0.90, highMileage: 0.10, newDriver: 0.25
    },
    stateMultipliers: { MI: 1.8, FL: 1.4, LA: 1.35, NY: 1.3, CA: 1.25, NJ: 1.25, TX: 1.15, PA: 1.1, OH: 0.9, NC: 0.9, ID: 0.85 },
    available: true
  },
  {
    id: "progressive",
    name: "Progressive",
    color: "#0077C8",
    exclusive: false,
    avgRating: 4.3,
    baseRates: { liability: 420, collision: 660, comprehensive: 780, full: 1320 },
    discounts: {
      multiPolicy: 0.15, goodDriver: 0.18, goodStudent: 0.08, defensive: 0.05,
      antiTheft: 0.05, safety: 0.07, loyalty: 0.08, payInFull: 0.07,
      paperless: 0.03, military: 0.03, homeOwner: 0.03, married: 0.04,
      lowMileage: 0.12, goodCredit: 0.12 // Snapshot program
    },
    surcharges: {
      youngDriver: 0.75, seniorDriver: 0.12, poorCredit: 0.30, noHistory: 0.18,
      lapse: 0.12, minorViolation: 0.12, majorViolation: 0.35, accident: 0.40,
      dui: 0.85, highMileage: 0.08, newDriver: 0.22
    },
    stateMultipliers: { MI: 1.75, FL: 1.38, LA: 1.32, NY: 1.28, CA: 1.22, NJ: 1.22, TX: 1.12, PA: 1.08, OH: 0.88, NC: 0.88, ID: 0.83 },
    available: true
  },
  {
    id: "geico",
    name: "GEICO",
    color: "#007A33",
    exclusive: true, // Direct-to-consumer, exclusive
    avgRating: 4.4,
    baseRates: { liability: 390, collision: 600, comprehensive: 720, full: 1200 }, // Generally lower base rates
    discounts: {
      multiPolicy: 0.25, goodDriver: 0.22, goodStudent: 0.15, defensive: 0.08,
      antiTheft: 0.05, safety: 0.05, loyalty: 0.15, payInFull: 0.08,
      paperless: 0.05, military: 0.15, homeOwner: 0.05, married: 0.05,
      lowMileage: 0.10, goodCredit: 0.08
    },
    surcharges: {
      youngDriver: 0.70, seniorDriver: 0.10, poorCredit: 0.25, noHistory: 0.15,
      lapse: 0.10, minorViolation: 0.10, majorViolation: 0.30, accident: 0.35,
      dui: 0.80, highMileage: 0.06, newDriver: 0.20
    },
    stateMultipliers: { MI: 1.70, FL: 1.35, LA: 1.28, NY: 1.25, CA: 1.20, NJ: 1.20, TX: 1.10, PA: 1.05, OH: 0.85, NC: 0.85, ID: 0.80 },
    available: true
  },
  {
    id: "allstate",
    name: "Allstate",
    color: "#0033A0",
    exclusive: false,
    avgRating: 4.2,
    baseRates: { liability: 540, collision: 780, comprehensive: 900, full: 1560 },
    discounts: {
      multiPolicy: 0.25, goodDriver: 0.20, goodStudent: 0.12, defensive: 0.10,
      antiTheft: 0.05, safety: 0.08, loyalty: 0.12, payInFull: 0.05,
      paperless: 0.03, military: 0.05, homeOwner: 0.08, married: 0.06,
      lowMileage: 0.10, goodCredit: 0.15
    },
    surcharges: {
      youngDriver: 0.90, seniorDriver: 0.18, poorCredit: 0.40, noHistory: 0.22,
      lapse: 0.18, minorViolation: 0.18, majorViolation: 0.45, accident: 0.50,
      dui: 0.95, highMileage: 0.12, newDriver: 0.28
    },
    stateMultipliers: { MI: 1.85, FL: 1.42, LA: 1.38, NY: 1.32, CA: 1.28, NJ: 1.28, TX: 1.18, PA: 1.12, OH: 0.92, NC: 0.92, ID: 0.88 },
    available: true
  },
  {
    id: "liberty_mutual",
    name: "Liberty Mutual",
    color: "#F5B400",
    exclusive: false,
    avgRating: 4.1,
    baseRates: { liability: 510, collision: 750, comprehensive: 870, full: 1500 },
    discounts: {
      multiPolicy: 0.18, goodDriver: 0.12, goodStudent: 0.08, defensive: 0.05,
      antiTheft: 0.10, safety: 0.10, loyalty: 0.10, payInFull: 0.05,
      paperless: 0.03, military: 0.08, homeOwner: 0.10, married: 0.05,
      lowMileage: 0.08, goodCredit: 0.08
    },
    surcharges: {
      youngDriver: 0.82, seniorDriver: 0.14, poorCredit: 0.32, noHistory: 0.18,
      lapse: 0.14, minorViolation: 0.14, majorViolation: 0.38, accident: 0.42,
      dui: 0.88, highMileage: 0.10, newDriver: 0.24
    },
    stateMultipliers: { MI: 1.78, FL: 1.40, LA: 1.34, NY: 1.30, CA: 1.24, NJ: 1.24, TX: 1.14, PA: 1.10, OH: 0.90, NC: 0.90, ID: 0.85 },
    available: true
  },
  {
    id: "nationwide",
    name: "Nationwide",
    color: "#0047BB",
    exclusive: false,
    avgRating: 4.3,
    baseRates: { liability: 470, collision: 710, comprehensive: 830, full: 1420 },
    discounts: {
      multiPolicy: 0.20, goodDriver: 0.15, goodStudent: 0.10, defensive: 0.08,
      antiTheft: 0.05, safety: 0.06, loyalty: 0.12, payInFull: 0.06,
      paperless: 0.03, military: 0.05, homeOwner: 0.06, married: 0.05,
      lowMileage: 0.10, goodCredit: 0.10
    },
    surcharges: {
      youngDriver: 0.80, seniorDriver: 0.12, poorCredit: 0.30, noHistory: 0.18,
      lapse: 0.12, minorViolation: 0.12, majorViolation: 0.35, accident: 0.40,
      dui: 0.85, highMileage: 0.08, newDriver: 0.22
    },
    stateMultipliers: { MI: 1.76, FL: 1.38, LA: 1.32, NY: 1.28, CA: 1.22, NJ: 1.22, TX: 1.12, PA: 1.08, OH: 0.88, NC: 0.88, ID: 0.83 },
    available: true
  },
  {
    id: "farmers",
    name: "Farmers",
    color: "#ED1C24",
    exclusive: false,
    avgRating: 4.0,
    baseRates: { liability: 530, collision: 770, comprehensive: 890, full: 1540 },
    discounts: {
      multiPolicy: 0.22, goodDriver: 0.18, goodStudent: 0.12, defensive: 0.10,
      antiTheft: 0.08, safety: 0.08, loyalty: 0.15, payInFull: 0.05,
      paperless: 0.02, military: 0.05, homeOwner: 0.08, married: 0.05,
      lowMileage: 0.08, goodCredit: 0.12
    },
    surcharges: {
      youngDriver: 0.88, seniorDriver: 0.16, poorCredit: 0.38, noHistory: 0.20,
      lapse: 0.16, minorViolation: 0.16, majorViolation: 0.42, accident: 0.48,
      dui: 0.92, highMileage: 0.10, newDriver: 0.26
    },
    stateMultipliers: { MI: 1.82, FL: 1.42, LA: 1.36, NY: 1.30, CA: 1.26, NJ: 1.26, TX: 1.16, PA: 1.10, OH: 0.90, NC: 0.90, ID: 0.86 },
    available: true
  },
  {
    id: "usaa",
    name: "USAA",
    color: "#1C3F6E",
    exclusive: true, // Military only
    avgRating: 4.8,
    baseRates: { liability: 360, collision: 540, comprehensive: 660, full: 1080 }, // Best rates for military
    discounts: {
      multiPolicy: 0.20, goodDriver: 0.20, goodStudent: 0.15, defensive: 0.10,
      antiTheft: 0.08, safety: 0.08, loyalty: 0.18, payInFull: 0.08,
      paperless: 0.05, military: 0.25, homeOwner: 0.08, married: 0.08,
      lowMileage: 0.12, goodCredit: 0.12
    },
    surcharges: {
      youngDriver: 0.60, seniorDriver: 0.08, poorCredit: 0.20, noHistory: 0.12,
      lapse: 0.08, minorViolation: 0.08, majorViolation: 0.25, accident: 0.30,
      dui: 0.70, highMileage: 0.05, newDriver: 0.15
    },
    stateMultipliers: { MI: 1.65, FL: 1.30, LA: 1.25, NY: 1.22, CA: 1.18, NJ: 1.18, TX: 1.08, PA: 1.02, OH: 0.82, NC: 0.82, ID: 0.78 },
    available: true
  },
  {
    id: "travelers",
    name: "Travelers",
    color: "#CC0000",
    exclusive: false,
    avgRating: 4.2,
    baseRates: { liability: 490, collision: 730, comprehensive: 850, full: 1460 },
    discounts: {
      multiPolicy: 0.18, goodDriver: 0.15, goodStudent: 0.08, defensive: 0.06,
      antiTheft: 0.05, safety: 0.06, loyalty: 0.10, payInFull: 0.05,
      paperless: 0.02, military: 0.05, homeOwner: 0.06, married: 0.05,
      lowMileage: 0.08, goodCredit: 0.10
    },
    surcharges: {
      youngDriver: 0.82, seniorDriver: 0.14, poorCredit: 0.32, noHistory: 0.18,
      lapse: 0.14, minorViolation: 0.14, majorViolation: 0.38, accident: 0.42,
      dui: 0.88, highMileage: 0.10, newDriver: 0.24
    },
    stateMultipliers: { MI: 1.78, FL: 1.40, LA: 1.34, NY: 1.30, CA: 1.24, NJ: 1.24, TX: 1.14, PA: 1.10, OH: 0.90, NC: 0.90, ID: 0.85 },
    available: true
  },
  {
    id: "american_family",
    name: "American Family",
    color: "#00529B",
    exclusive: false,
    avgRating: 4.1,
    baseRates: { liability: 460, collision: 700, comprehensive: 820, full: 1400 },
    discounts: {
      multiPolicy: 0.20, goodDriver: 0.15, goodStudent: 0.12, defensive: 0.08,
      antiTheft: 0.05, safety: 0.05, loyalty: 0.12, payInFull: 0.05,
      paperless: 0.03, military: 0.05, homeOwner: 0.05, married: 0.05,
      lowMileage: 0.10, goodCredit: 0.10
    },
    surcharges: {
      youngDriver: 0.78, seniorDriver: 0.12, poorCredit: 0.28, noHistory: 0.16,
      lapse: 0.12, minorViolation: 0.12, majorViolation: 0.34, accident: 0.38,
      dui: 0.82, highMileage: 0.08, newDriver: 0.20
    },
    stateMultipliers: { MI: 1.74, FL: 1.36, LA: 1.30, NY: 1.26, CA: 1.20, NJ: 1.20, TX: 1.10, PA: 1.06, OH: 0.86, NC: 0.86, ID: 0.82 },
    available: true
  },
];

// Vehicle make factors for all companies
const VEHICLE_MAKE_FACTORS: Record<string, number> = {
  bmw: 1.35, mercedes: 1.40, audi: 1.30, lexus: 1.25, porsche: 1.60,
  tesla: 1.45, jaguar: 1.35, "land rover": 1.30, infiniti: 1.25, acura: 1.20,
  corvette: 1.50, mustang: 1.20, camaro: 1.25, challenger: 1.20, charger: 1.18,
  toyota: 0.90, honda: 0.90, ford: 1.00, chevrolet: 1.00, hyundai: 0.95,
  kia: 0.95, nissan: 0.95, mazda: 0.95, subaru: 1.00, volkswagen: 1.05,
  jeep: 1.05, ram: 1.05, gmc: 1.05, buick: 0.95, chrysler: 1.00,
  default: 1.00,
};

// Age factors
function getAgeFactor(age: number): number {
  if (age < 18) return 3.00;
  if (age < 20) return 2.50;
  if (age < 22) return 2.00;
  if (age < 25) return 1.60;
  if (age < 30) return 1.15;
  if (age < 40) return 1.00;
  if (age < 50) return 0.95;
  if (age < 60) return 0.92;
  if (age < 65) return 0.95;
  if (age < 70) return 1.00;
  if (age < 75) return 1.10;
  return 1.25;
}

// Vehicle year factor
function getVehicleYearFactor(year: number): number {
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;
  if (age <= 0) return 1.50;
  if (age <= 1) return 1.40;
  if (age <= 2) return 1.30;
  if (age <= 3) return 1.20;
  if (age <= 5) return 1.10;
  if (age <= 8) return 1.00;
  if (age <= 10) return 0.92;
  if (age <= 15) return 0.85;
  return 0.75;
}

function getVehicleMakeFactor(make: string): number {
  const normalizedMake = make.toLowerCase().trim();
  return VEHICLE_MAKE_FACTORS[normalizedMake] || VEHICLE_MAKE_FACTORS.default;
}

function getStateFactor(company: InsuranceCompany, state: string): number {
  const normalizedState = state.toUpperCase().trim();
  return company.stateMultipliers[normalizedState] || 1.0;
}

// Parse car model string
export function parseCarModel(carModel: string): { year: number; make: string; model: string } {
  const parts = carModel.trim().split(/\s+/);
  let year = new Date().getFullYear();
  let make = "";
  let model = "";

  const potentialYear = parseInt(parts[0]);
  if (potentialYear >= 1990 && potentialYear <= new Date().getFullYear() + 1) {
    year = potentialYear;
    make = parts[1] || "";
    model = parts.slice(2).join(" ");
  } else {
    make = parts[0] || "";
    model = parts.slice(1).join(" ");
  }

  return { year, make, model };
}

export interface QuoteResult {
  companyId: string;
  companyName: string;
  companyColor: string;
  exclusive: boolean;
  rating: number;
  monthlyPremium: number;
  annualPremium: number;
  sixMonthPremium: number;
  coverageType: string;
  deductible: number;
  discountsApplied: string[];
  totalDiscount: number;
  surchargesApplied: string[];
  totalSurcharge: number;
  breakdown: {
    basePremium: number;
    ageFactor: number;
    vehicleFactor: number;
    stateFactor: number;
    discountAmount: number;
    surchargeAmount: number;
  };
}

export interface MultiCarrierQuoteInput {
  carModel: string;
  state: string;
  age: number;
  gender: DriverProfile["gender"];
  maritalStatus: DriverProfile["maritalStatus"];
  creditScore: DriverProfile["creditScore"];
  homeOwner: boolean;
  yearsLicensed: number;
  drivingHistory: DriverProfile["drivingHistory"];
  priorInsurance: boolean;
  annualMileage: number;
  vehicleOwnership: VehicleProfile["ownership"];
  primaryUse: VehicleProfile["primaryUse"];
  garageType: VehicleProfile["garageType"];
  antiTheft: boolean;
  safetyFeatures: boolean;
  occupation: DriverProfile["occupation"];
  coverageType: CoverageOptions["type"];
  deductible: CoverageOptions["deductible"];
}

export function calculateMultiCarrierQuotes(input: MultiCarrierQuoteInput): QuoteResult[] {
  const { year, make } = parseCarModel(input.carModel);
  const results: QuoteResult[] = [];

  for (const company of INSURANCE_COMPANIES) {
    if (!company.available) continue;

    // Skip USAA for non-military
    if (company.id === "usaa" && input.occupation !== "military") continue;

    const basePremium = company.baseRates[input.coverageType];
    const ageFactor = getAgeFactor(input.age);
    const vehicleYearFactor = getVehicleYearFactor(year);
    const vehicleMakeFactor = getVehicleMakeFactor(make);
    const vehicleFactor = vehicleYearFactor * vehicleMakeFactor;
    const stateFactor = getStateFactor(company, input.state);

    // Calculate discounts
    const discountsApplied: string[] = [];
    let totalDiscount = 0;

    if (input.homeOwner) {
      totalDiscount += company.discounts.homeOwner;
      discountsApplied.push(`Homeowner (-${Math.round(company.discounts.homeOwner * 100)}%)`);
    }

    if (input.maritalStatus === "married") {
      totalDiscount += company.discounts.married;
      discountsApplied.push(`Married (-${Math.round(company.discounts.married * 100)}%)`);
    }

    if (input.drivingHistory === "clean" && input.yearsLicensed >= 3) {
      totalDiscount += company.discounts.goodDriver;
      discountsApplied.push(`Good Driver (-${Math.round(company.discounts.goodDriver * 100)}%)`);
    }

    if (input.creditScore === "excellent") {
      totalDiscount += company.discounts.goodCredit;
      discountsApplied.push(`Excellent Credit (-${Math.round(company.discounts.goodCredit * 100)}%)`);
    } else if (input.creditScore === "good") {
      totalDiscount += company.discounts.goodCredit * 0.5;
      discountsApplied.push(`Good Credit (-${Math.round(company.discounts.goodCredit * 50)}%)`);
    }

    if (input.annualMileage < 7500) {
      totalDiscount += company.discounts.lowMileage;
      discountsApplied.push(`Low Mileage (-${Math.round(company.discounts.lowMileage * 100)}%)`);
    }

    if (input.antiTheft) {
      totalDiscount += company.discounts.antiTheft;
      discountsApplied.push(`Anti-Theft Device (-${Math.round(company.discounts.antiTheft * 100)}%)`);
    }

    if (input.safetyFeatures) {
      totalDiscount += company.discounts.safety;
      discountsApplied.push(`Safety Features (-${Math.round(company.discounts.safety * 100)}%)`);
    }

    if (input.occupation === "military") {
      totalDiscount += company.discounts.military;
      discountsApplied.push(`Military (-${Math.round(company.discounts.military * 100)}%)`);
    }

    // Calculate surcharges
    const surchargesApplied: string[] = [];
    let totalSurcharge = 0;

    if (input.age < 25) {
      totalSurcharge += company.surcharges.youngDriver;
      surchargesApplied.push(`Young Driver (+${Math.round(company.surcharges.youngDriver * 100)}%)`);
    }

    if (input.age > 70) {
      totalSurcharge += company.surcharges.seniorDriver;
      surchargesApplied.push(`Senior Driver (+${Math.round(company.surcharges.seniorDriver * 100)}%)`);
    }

    if (input.creditScore === "poor") {
      totalSurcharge += company.surcharges.poorCredit;
      surchargesApplied.push(`Credit Score (+${Math.round(company.surcharges.poorCredit * 100)}%)`);
    } else if (input.creditScore === "fair") {
      totalSurcharge += company.surcharges.poorCredit * 0.5;
      surchargesApplied.push(`Credit Score (+${Math.round(company.surcharges.poorCredit * 50)}%)`);
    }

    if (!input.priorInsurance) {
      totalSurcharge += company.surcharges.noHistory;
      surchargesApplied.push(`No Prior Insurance (+${Math.round(company.surcharges.noHistory * 100)}%)`);
    }

    if (input.yearsLicensed < 3) {
      totalSurcharge += company.surcharges.newDriver;
      surchargesApplied.push(`New Driver (+${Math.round(company.surcharges.newDriver * 100)}%)`);
    }

    if (input.drivingHistory === "minor_violations") {
      totalSurcharge += company.surcharges.minorViolation;
      surchargesApplied.push(`Violation (+${Math.round(company.surcharges.minorViolation * 100)}%)`);
    } else if (input.drivingHistory === "major_violations") {
      totalSurcharge += company.surcharges.majorViolation;
      surchargesApplied.push(`Major Violation (+${Math.round(company.surcharges.majorViolation * 100)}%)`);
    } else if (input.drivingHistory === "accidents") {
      totalSurcharge += company.surcharges.accident;
      surchargesApplied.push(`At-Fault Accident (+${Math.round(company.surcharges.accident * 100)}%)`);
    } else if (input.drivingHistory === "dui") {
      totalSurcharge += company.surcharges.dui;
      surchargesApplied.push(`DUI (+${Math.round(company.surcharges.dui * 100)}%)`);
    }

    if (input.annualMileage > 15000) {
      totalSurcharge += company.surcharges.highMileage;
      surchargesApplied.push(`High Mileage (+${Math.round(company.surcharges.highMileage * 100)}%)`);
    }

    // Deductible discount
    const deductibleDiscounts: Record<number, number> = { 250: 0, 500: 0.08, 1000: 0.15, 2000: 0.22 };
    const deductibleDiscount = deductibleDiscounts[input.deductible] || 0;
    if (deductibleDiscount > 0) {
      totalDiscount += deductibleDiscount;
      discountsApplied.push(`$${input.deductible} Deductible (-${Math.round(deductibleDiscount * 100)}%)`);
    }

    // Calculate final premium
    let annualPremium = basePremium * ageFactor * vehicleFactor * stateFactor;
    const discountAmount = annualPremium * Math.min(totalDiscount, 0.50); // Cap at 50%
    const surchargeAmount = annualPremium * totalSurcharge;
    annualPremium = annualPremium - discountAmount + surchargeAmount;
    annualPremium = Math.round(Math.max(annualPremium, 300)); // Minimum $300/year

    const coverageLabels: Record<CoverageOptions["type"], string> = {
      liability: "Liability Only",
      collision: "Liability + Collision",
      comprehensive: "Liability + Comprehensive",
      full: "Full Coverage",
    };

    results.push({
      companyId: company.id,
      companyName: company.name,
      companyColor: company.color,
      exclusive: company.exclusive,
      rating: company.avgRating,
      monthlyPremium: Math.round(annualPremium / 12),
      annualPremium,
      sixMonthPremium: Math.round(annualPremium / 2),
      coverageType: coverageLabels[input.coverageType],
      deductible: input.deductible,
      discountsApplied,
      totalDiscount: Math.round(Math.min(totalDiscount, 0.50) * 100),
      surchargesApplied,
      totalSurcharge: Math.round(totalSurcharge * 100),
      breakdown: {
        basePremium,
        ageFactor: Math.round(ageFactor * 100) / 100,
        vehicleFactor: Math.round(vehicleFactor * 100) / 100,
        stateFactor: Math.round(stateFactor * 100) / 100,
        discountAmount: Math.round(discountAmount),
        surchargeAmount: Math.round(surchargeAmount),
      },
    });
  }

  // Sort by monthly premium
  return results.sort((a, b) => a.monthlyPremium - b.monthlyPremium);
}

// Generate quotes for all coverage types for a single company (legacy support)
export function generateQuoteOptions(carModel: string, state?: string): QuoteResult[] {
  const input: MultiCarrierQuoteInput = {
    carModel,
    state: state || "PA",
    age: 35,
    gender: "other",
    maritalStatus: "single",
    creditScore: "good",
    homeOwner: false,
    yearsLicensed: 10,
    drivingHistory: "clean",
    priorInsurance: true,
    annualMileage: 12000,
    vehicleOwnership: "owned",
    primaryUse: "commute",
    garageType: "garage",
    antiTheft: false,
    safetyFeatures: true,
    occupation: "standard",
    coverageType: "full",
    deductible: 500,
  };

  const coverageTypes: CoverageOptions["type"][] = ["liability", "collision", "comprehensive", "full"];
  const results: QuoteResult[] = [];

  for (const type of coverageTypes) {
    const quotes = calculateMultiCarrierQuotes({ ...input, coverageType: type });
    // Get State Farm quote for backward compatibility
    const stateFarmQuote = quotes.find(q => q.companyId === "state_farm");
    if (stateFarmQuote) {
      results.push(stateFarmQuote);
    }
  }

  return results;
}

// Get all available companies
export function getAvailableCompanies(): InsuranceCompany[] {
  return INSURANCE_COMPANIES.filter(c => c.available);
}

// Get company by ID
export function getCompanyById(id: string): InsuranceCompany | undefined {
  return INSURANCE_COMPANIES.find(c => c.id === id);
}
