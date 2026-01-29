"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLeads, type Provider } from "@/lib/leads-context";
import {
  calculateMultiCarrierQuotes,
  type QuoteResult,
  type MultiCarrierQuoteInput,
  type CoverageOptions
} from "@/lib/insurance-calculator";

type QuoteType = "switch" | "quote" | null;
type PaymentMethod = "venmo" | "paypal" | "bank";

const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
];

// Coverage details for each plan type
const COVERAGE_DETAILS = {
  liability: {
    name: "Liability Only",
    summary: "Basic coverage required by law - covers damage you cause to others",
    coverages: [
      { name: "Bodily Injury Liability", limit: "$50,000/$100,000", description: "Covers medical expenses, lost wages, and legal fees if you injure someone" },
      { name: "Property Damage Liability", limit: "$50,000", description: "Pays for damage you cause to other people's property" },
      { name: "Uninsured Motorist", limit: "$25,000/$50,000", description: "Protects you if hit by an uninsured driver" },
    ],
    notCovered: ["Damage to your own vehicle", "Medical expenses for you/passengers", "Theft or vandalism", "Natural disasters"],
  },
  collision: {
    name: "Liability + Collision",
    summary: "Covers liability plus damage to your car from accidents",
    coverages: [
      { name: "Bodily Injury Liability", limit: "$100,000/$300,000", description: "Covers medical expenses, lost wages, and legal fees if you injure someone" },
      { name: "Property Damage Liability", limit: "$100,000", description: "Pays for damage you cause to other people's property" },
      { name: "Collision Coverage", limit: "Actual Cash Value", description: "Repairs your car after an accident, regardless of fault" },
      { name: "Uninsured Motorist", limit: "$50,000/$100,000", description: "Protects you if hit by an uninsured driver" },
    ],
    notCovered: ["Theft or vandalism", "Natural disasters", "Falling objects", "Animal collisions"],
  },
  comprehensive: {
    name: "Liability + Comprehensive",
    summary: "Covers liability plus non-collision damage (theft, weather, etc.)",
    coverages: [
      { name: "Bodily Injury Liability", limit: "$100,000/$300,000", description: "Covers medical expenses, lost wages, and legal fees if you injure someone" },
      { name: "Property Damage Liability", limit: "$100,000", description: "Pays for damage you cause to other people's property" },
      { name: "Comprehensive Coverage", limit: "Actual Cash Value", description: "Covers theft, vandalism, weather damage, fire, and animal collisions" },
      { name: "Uninsured Motorist", limit: "$50,000/$100,000", description: "Protects you if hit by an uninsured driver" },
    ],
    notCovered: ["Collision damage", "Mechanical breakdowns", "Wear and tear"],
  },
  full: {
    name: "Full Coverage",
    summary: "Complete protection - liability, collision, and comprehensive",
    coverages: [
      { name: "Bodily Injury Liability", limit: "$250,000/$500,000", description: "Covers medical expenses, lost wages, and legal fees if you injure someone" },
      { name: "Property Damage Liability", limit: "$250,000", description: "Pays for damage you cause to other people's property" },
      { name: "Collision Coverage", limit: "Actual Cash Value", description: "Repairs your car after an accident, regardless of fault" },
      { name: "Comprehensive Coverage", limit: "Actual Cash Value", description: "Covers theft, vandalism, weather damage, fire, and animal collisions" },
      { name: "Medical Payments", limit: "$10,000", description: "Covers medical expenses for you and passengers regardless of fault" },
      { name: "Uninsured/Underinsured Motorist", limit: "$100,000/$300,000", description: "Protects you if hit by an uninsured or underinsured driver" },
      { name: "Rental Reimbursement", limit: "$50/day", description: "Pays for a rental car while yours is being repaired" },
      { name: "Roadside Assistance", limit: "Included", description: "24/7 towing, jump starts, lockout service, and flat tire changes" },
    ],
    notCovered: ["Intentional damage", "Racing or reckless driving", "Commercial use (unless declared)"],
  },
};

interface ExtendedFormData {
  // Contact Info
  customerName: string;
  email: string;
  phone: string;
  // Demographics
  age: string;
  gender: "male" | "female" | "other";
  maritalStatus: "single" | "married" | "divorced" | "widowed";
  // Location
  state: string;
  zipCode: string;
  // Vehicle Info
  carModel: string;
  vehicleOwnership: "owned" | "financed" | "leased";
  primaryUse: "commute" | "pleasure" | "business";
  annualMileage: string;
  garageType: "garage" | "carport" | "street" | "parking_lot";
  antiTheft: boolean;
  safetyFeatures: boolean;
  // Driver Profile
  yearsLicensed: string;
  drivingHistory: "clean" | "minor_violations" | "major_violations" | "accidents" | "dui";
  priorInsurance: boolean;
  creditScore: "excellent" | "good" | "fair" | "poor";
  homeOwner: boolean;
  occupation: "standard" | "professional" | "military" | "student";
}

export default function SubmitLead() {
  const { addLead, getProvider, getProviderByEmail, addProvider, updateProvider, providers } = useLeads();
  const [step, setStep] = useState<"provider" | "form" | "questions" | "chatbot" | "quote" | "coverage" | "purchase" | "success">("provider");

  // Provider info
  const [providerData, setProviderData] = useState({
    name: "",
    email: "",
    phone: "",
    paymentMethod: "venmo" as PaymentMethod,
    venmoUsername: "",
    paypalEmail: "",
    bankAccountLast4: "",
  });
  const [currentProvider, setCurrentProvider] = useState<Provider | null>(null);
  const [isReturningProvider, setIsReturningProvider] = useState(false);

  // Check for existing provider session
  useEffect(() => {
    const savedProviderId = localStorage.getItem("leadzpay_provider_id");
    if (savedProviderId) {
      const provider = getProvider(savedProviderId);
      if (provider) {
        setCurrentProvider(provider);
        setIsReturningProvider(true);
        setStep("form");
      }
    }
  }, [getProvider]);

  const [formData, setFormData] = useState<ExtendedFormData>({
    customerName: "",
    email: "",
    phone: "",
    age: "35",
    gender: "other",
    maritalStatus: "single",
    state: "PA",
    zipCode: "",
    carModel: "",
    vehicleOwnership: "owned",
    primaryUse: "commute",
    annualMileage: "12000",
    garageType: "garage",
    antiTheft: false,
    safetyFeatures: true,
    yearsLicensed: "10",
    drivingHistory: "clean",
    priorInsurance: true,
    creditScore: "good",
    homeOwner: false,
    occupation: "standard",
  });
  const [quoteType, setQuoteType] = useState<QuoteType>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allQuotes, setAllQuotes] = useState<QuoteResult[]>([]);
  const [selectedCoverage, setSelectedCoverage] = useState<CoverageOptions["type"]>("full");
  const [selectedDeductible, setSelectedDeductible] = useState<CoverageOptions["deductible"]>(500);
  const [selectedQuote, setSelectedQuote] = useState<QuoteResult | null>(null);
  const [submittedLead, setSubmittedLead] = useState<{ id: string; payout: number } | null>(null);
  const [showCoverageModal, setShowCoverageModal] = useState(false);
  const [selectedCoverageType, setSelectedCoverageType] = useState<keyof typeof COVERAGE_DETAILS | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "ai"; text: string; action?: { type: "quote" | "buy"; data?: QuoteResult } }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [isPurchasing, setIsPurchasing] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    });
  };

  const handleCheckboxChange = (name: keyof ExtendedFormData) => {
    setFormData({
      ...formData,
      [name]: !formData[name],
    });
  };

  const handleQuoteTypeSelect = (type: QuoteType) => {
    setQuoteType(type);
  };

  const handleContinueFromForm = () => {
    setStep("questions");
  };

  const handleContinueFromQuestions = () => {
    generateAllQuotes();
    // Initialize the sales-focused chatbot with personalized greeting
    const cheapestQuote = allQuotes.length > 0 ? allQuotes[0] : null;
    setChatMessages([
      {
        role: "ai",
        text: `Great news, ${formData.customerName}! I've found some excellent rates for your ${formData.carModel}.\n\n` +
              `Based on your profile, you qualify for multiple discounts! Let me show you what I found...\n\n` +
              `Your BEST rate: $${cheapestQuote?.monthlyPremium || '---'}/month with ${cheapestQuote?.companyName || 'our top carrier'}\n\n` +
              `This rate is ${cheapestQuote?.totalDiscount || 15}% below average for your area. Want me to lock this in for you today?`
      }
    ]);
    setStep("chatbot");
  };

  const generateAllQuotes = () => {
    const input: MultiCarrierQuoteInput = {
      carModel: formData.carModel,
      state: formData.state,
      age: parseInt(formData.age) || 35,
      gender: formData.gender,
      maritalStatus: formData.maritalStatus,
      creditScore: formData.creditScore,
      homeOwner: formData.homeOwner,
      yearsLicensed: parseInt(formData.yearsLicensed) || 10,
      drivingHistory: formData.drivingHistory,
      priorInsurance: formData.priorInsurance,
      annualMileage: parseInt(formData.annualMileage) || 12000,
      vehicleOwnership: formData.vehicleOwnership,
      primaryUse: formData.primaryUse,
      garageType: formData.garageType,
      antiTheft: formData.antiTheft,
      safetyFeatures: formData.safetyFeatures,
      occupation: formData.occupation,
      coverageType: selectedCoverage,
      deductible: selectedDeductible,
    };

    const quotes = calculateMultiCarrierQuotes(input);
    setAllQuotes(quotes);
    if (quotes.length > 0 && !selectedQuote) {
      setSelectedQuote(quotes[0]); // Select cheapest by default
    }
  };

  const handleCoverageChange = (coverage: CoverageOptions["type"]) => {
    setSelectedCoverage(coverage);
    // Regenerate quotes with new coverage
    const input: MultiCarrierQuoteInput = {
      carModel: formData.carModel,
      state: formData.state,
      age: parseInt(formData.age) || 35,
      gender: formData.gender,
      maritalStatus: formData.maritalStatus,
      creditScore: formData.creditScore,
      homeOwner: formData.homeOwner,
      yearsLicensed: parseInt(formData.yearsLicensed) || 10,
      drivingHistory: formData.drivingHistory,
      priorInsurance: formData.priorInsurance,
      annualMileage: parseInt(formData.annualMileage) || 12000,
      vehicleOwnership: formData.vehicleOwnership,
      primaryUse: formData.primaryUse,
      garageType: formData.garageType,
      antiTheft: formData.antiTheft,
      safetyFeatures: formData.safetyFeatures,
      occupation: formData.occupation,
      coverageType: coverage,
      deductible: selectedDeductible,
    };
    const quotes = calculateMultiCarrierQuotes(input);
    setAllQuotes(quotes);
    setSelectedQuote(quotes[0]);
  };

  const handleDeductibleChange = (deductible: CoverageOptions["deductible"]) => {
    setSelectedDeductible(deductible);
    const input: MultiCarrierQuoteInput = {
      carModel: formData.carModel,
      state: formData.state,
      age: parseInt(formData.age) || 35,
      gender: formData.gender,
      maritalStatus: formData.maritalStatus,
      creditScore: formData.creditScore,
      homeOwner: formData.homeOwner,
      yearsLicensed: parseInt(formData.yearsLicensed) || 10,
      drivingHistory: formData.drivingHistory,
      priorInsurance: formData.priorInsurance,
      annualMileage: parseInt(formData.annualMileage) || 12000,
      vehicleOwnership: formData.vehicleOwnership,
      primaryUse: formData.primaryUse,
      garageType: formData.garageType,
      antiTheft: formData.antiTheft,
      safetyFeatures: formData.safetyFeatures,
      occupation: formData.occupation,
      coverageType: selectedCoverage,
      deductible: deductible,
    };
    const quotes = calculateMultiCarrierQuotes(input);
    setAllQuotes(quotes);
    setSelectedQuote(quotes[0]);
  };

  const handleChatSend = () => {
    if (!chatInput.trim()) return;

    const userMessage = chatInput.trim();
    setChatMessages(prev => [...prev, { role: "user", text: userMessage }]);
    setChatInput("");

    setTimeout(() => {
      let response = "";
      const lowerMessage = userMessage.toLowerCase();
      const cheapest = allQuotes[0];
      const secondCheapest = allQuotes[1];

      if (lowerMessage.includes("yes") || lowerMessage.includes("lock") || lowerMessage.includes("buy") || lowerMessage.includes("purchase") || lowerMessage.includes("get it") || lowerMessage.includes("sign up") || lowerMessage.includes("ready")) {
        response = `Excellent choice! Let's get you covered right now.\n\n` +
          `With ${cheapest?.companyName}, you're getting:\n` +
          `• ${cheapest?.coverageType} coverage\n` +
          `• $${cheapest?.deductible} deductible\n` +
          `• ${cheapest?.totalDiscount}% in discounts applied\n\n` +
          `Your rate: $${cheapest?.monthlyPremium}/month ($${cheapest?.annualPremium}/year)\n\n` +
          `Click the "Purchase Now" button below to finalize your policy. Your coverage starts immediately!`;
        setChatMessages(prev => [...prev, { role: "ai", text: response, action: { type: "buy", data: cheapest || undefined } }]);
        return;
      } else if (lowerMessage.includes("other") || lowerMessage.includes("options") || lowerMessage.includes("compare") || lowerMessage.includes("all")) {
        response = `Here are your top 3 options:\n\n` +
          `1. ${cheapest?.companyName} - $${cheapest?.monthlyPremium}/mo (BEST VALUE)\n` +
          `2. ${secondCheapest?.companyName} - $${secondCheapest?.monthlyPremium}/mo\n` +
          `3. ${allQuotes[2]?.companyName} - $${allQuotes[2]?.monthlyPremium}/mo\n\n` +
          `I recommend ${cheapest?.companyName} - they have a ${cheapest?.rating}/5 rating and you're saving ${cheapest?.totalDiscount}% with your discounts.\n\n` +
          `Want me to lock in ${cheapest?.companyName} for you? Or see the full comparison of all 10 carriers?`;
      } else if (lowerMessage.includes("think") || lowerMessage.includes("later") || lowerMessage.includes("not sure") || lowerMessage.includes("maybe")) {
        response = `I totally understand - this is an important decision!\n\n` +
          `Just so you know: these rates are valid for the next 24 hours. After that, they may change based on market conditions.\n\n` +
          `Here's what I can do:\n` +
          `• Email you a summary of all quotes\n` +
          `• Save your profile so you can come back anytime\n` +
          `• Answer any questions that might help you decide\n\n` +
          `What's holding you back? I might be able to help address your concerns.`;
      } else if (lowerMessage.includes("expensive") || lowerMessage.includes("cheaper") || lowerMessage.includes("less") || lowerMessage.includes("too much") || lowerMessage.includes("lower")) {
        const liabilityOnlyEstimate = Math.round(cheapest?.monthlyPremium ? cheapest.monthlyPremium * 0.4 : 45);
        response = `I hear you - let's find a rate that works for your budget!\n\n` +
          `Here are some ways to lower your premium:\n\n` +
          `1. Switch to Liability Only: ~$${liabilityOnlyEstimate}/mo (saves $${cheapest?.monthlyPremium ? cheapest.monthlyPremium - liabilityOnlyEstimate : 50}/mo)\n` +
          `2. Increase deductible to $1000: saves ~$15/mo\n` +
          `3. Bundle with home/renters insurance: saves 15-25%\n\n` +
          `Would you like me to recalculate with liability-only coverage? Or I can help you find additional discounts you might qualify for.`;
      } else if (lowerMessage.includes("coverage") || lowerMessage.includes("what's included") || lowerMessage.includes("what do i get")) {
        response = `Great question! With your ${cheapest?.coverageType} policy from ${cheapest?.companyName}, you get:\n\n` +
          `• Liability: Covers damage you cause to others\n` +
          `• Collision: Repairs your car after accidents\n` +
          `• Comprehensive: Theft, weather, vandalism\n` +
          `• Medical Payments: Covers your medical expenses\n` +
          `• Roadside Assistance: 24/7 towing & help\n\n` +
          `This is the coverage most people choose. Ready to get protected?`;
      } else if (lowerMessage.includes("discount") || lowerMessage.includes("save")) {
        response = `You're already getting great discounts! Here's what's applied:\n\n` +
          (cheapest?.discountsApplied.map(d => `• ${d}`).join('\n') || '• Standard rate') + `\n\n` +
          `Total savings: ${cheapest?.totalDiscount}% off!\n\n` +
          `Want to add more discounts?\n` +
          `• Bundle home/renters: +15% off\n` +
          `• Paperless billing: +3% off\n` +
          `• Pay in full annually: +5% off\n\n` +
          `Ready to lock in this rate before it changes?`;
      } else if (lowerMessage.includes("why") || lowerMessage.includes("recommend") || lowerMessage.includes("best")) {
        response = `I recommend ${cheapest?.companyName} for several reasons:\n\n` +
          `1. LOWEST RATE: $${cheapest?.monthlyPremium}/mo - best I found\n` +
          `2. HIGH RATING: ${cheapest?.rating}/5 customer satisfaction\n` +
          `3. YOUR DISCOUNTS: ${cheapest?.totalDiscount}% already applied\n` +
          `4. FAST CLAIMS: Average 24-48 hour processing\n\n` +
          `With ${secondCheapest?.companyName} you'd pay $${secondCheapest?.monthlyPremium}/mo - that's $${secondCheapest && cheapest ? (secondCheapest.monthlyPremium - cheapest.monthlyPremium) * 12 : 0} more per year.\n\n` +
          `Want me to get you started with ${cheapest?.companyName}?`;
      } else if (lowerMessage.includes("no") || lowerMessage.includes("not interested")) {
        response = `No problem at all! Before you go, let me make sure you have all the info:\n\n` +
          `• Your best rate: $${cheapest?.monthlyPremium}/mo with ${cheapest?.companyName}\n` +
          `• Quote valid for: 24 hours\n` +
          `• No obligation to buy\n\n` +
          `Is there anything specific about the coverage or price that doesn't work for you? I might be able to find a better solution.`;
      } else {
        response = `I can help you with that! But first - I found you a great rate of $${cheapest?.monthlyPremium}/mo with ${cheapest?.companyName}.\n\n` +
          `That's ${cheapest?.totalDiscount}% below average for your area!\n\n` +
          `Would you like to:\n` +
          `• Lock in this rate now\n` +
          `• See all 10 carrier quotes\n` +
          `• Learn more about what's covered\n\n` +
          `What sounds good?`;
      }

      setChatMessages(prev => [...prev, { role: "ai", text: response }]);
    }, 800);
  };

  const handleSubmitLead = async () => {
    setIsSubmitting(true);

    try {
      const provider = currentProvider || getProvider("provider-1");
      const payout = provider?.payoutRate || 50;
      const yearMatch = formData.carModel.match(/\b(19|20)\d{2}\b/);
      const carYear = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();

      const newLead = addLead({
        customerName: formData.customerName,
        email: formData.email,
        phone: formData.phone,
        carModel: formData.carModel,
        carYear,
        quoteType: quoteType || "quote",
        status: "pending",
        providerId: provider?.id || "provider-1",
        providerName: provider?.name || "Demo Provider",
        payout: 0,
        quote: selectedQuote ? {
          monthlyPremium: selectedQuote.monthlyPremium,
          annualPremium: selectedQuote.annualPremium,
          coverageType: selectedQuote.coverageType,
          deductible: selectedQuote.deductible,
          provider: selectedQuote.companyName,
        } : undefined,
      });

      setSubmittedLead({ id: newLead.id, payout });
      setStep("success");
    } catch (error) {
      console.error("Error submitting lead:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePurchase = async () => {
    setIsPurchasing(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setStep("purchase");
    setIsPurchasing(false);
  };

  const isBasicFormValid = formData.customerName && formData.email && formData.phone && formData.carModel && quoteType;

  // Coverage Modal
  const CoverageModal = () => {
    if (!showCoverageModal || !selectedCoverageType) return null;
    const coverage = COVERAGE_DETAILS[selectedCoverageType];

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-[#0d2240] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-cyan-500/20 shadow-[0_0_30px_rgba(34,211,238,0.1)]">
          <div className="p-6 border-b border-cyan-500/20 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">{coverage.name}</h2>
            <button onClick={() => setShowCoverageModal(false)} className="text-slate-400 hover:text-cyan-400 transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-6">
            <p className="text-slate-300 mb-6">{coverage.summary}</p>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              What&apos;s Covered
            </h3>
            <div className="space-y-4 mb-6">
              {coverage.coverages.map((item, index) => (
                <div key={index} className="bg-[#0a1628] rounded-lg p-4 border border-cyan-500/20">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-white">{item.name}</h4>
                    <span className="text-cyan-400 font-mono text-sm">{item.limit}</span>
                  </div>
                  <p className="text-slate-400 text-sm">{item.description}</p>
                </div>
              ))}
            </div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              Not Covered
            </h3>
            <ul className="space-y-2">
              {coverage.notCovered.map((item, index) => (
                <li key={index} className="text-slate-400 flex items-center gap-2">
                  <span className="text-red-400">×</span> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="p-6 border-t border-cyan-500/20">
            <button onClick={() => setShowCoverageModal(false)} className="w-full bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] py-3 rounded-lg font-medium transition shadow-[0_0_15px_rgba(34,211,238,0.3)]">
              Got It
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Purchase Success Screen
  if (step === "purchase") {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background circuit lines */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-10 w-px h-32 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
          <div className="absolute top-40 right-20 w-px h-48 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        </div>

        <div className="bg-[#0d2240] p-12 rounded-2xl text-center max-w-md w-full border border-cyan-500/20 shadow-[0_0_30px_rgba(34,211,238,0.1)] relative z-10">
          <div className="h-20 w-20 mx-auto mb-6 rounded-full bg-cyan-500/20 flex items-center justify-center shadow-[0_0_30px_rgba(34,211,238,0.3)]">
            <svg className="w-10 h-10 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Policy Purchased!</h2>
          <p className="text-slate-300 mb-6">Your {selectedQuote?.coverageType} policy with {selectedQuote?.companyName} is now active.</p>
          <div className="bg-[#0a1628] rounded-lg p-4 mb-6 text-left border border-cyan-500/20">
            <div className="flex justify-between mb-2">
              <span className="text-slate-400">Policy Holder</span>
              <span className="text-white">{formData.customerName}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-slate-400">Vehicle</span>
              <span className="text-white">{formData.carModel}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-slate-400">Insurer</span>
              <span className="text-white">{selectedQuote?.companyName}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-slate-400">Coverage</span>
              <span className="text-white">{selectedQuote?.coverageType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Monthly Premium</span>
              <span className="text-cyan-400 font-bold">${selectedQuote?.monthlyPremium}/mo</span>
            </div>
          </div>
          <p className="text-slate-400 text-sm mb-6">Policy documents have been sent to {formData.email}</p>
          <Link href="/" className="inline-block bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] px-6 py-3 rounded-lg transition font-semibold shadow-[0_0_15px_rgba(34,211,238,0.3)]">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // Success Screen
  if (step === "success") {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background circuit lines */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-10 w-px h-32 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
          <div className="absolute top-40 right-20 w-px h-48 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        </div>

        <div className="bg-[#0d2240] p-12 rounded-2xl text-center max-w-md w-full border border-cyan-500/20 shadow-[0_0_30px_rgba(34,211,238,0.1)] relative z-10">
          <div className="h-20 w-20 mx-auto mb-6 rounded-full bg-cyan-500/20 flex items-center justify-center shadow-[0_0_30px_rgba(34,211,238,0.3)]">
            <svg className="w-10 h-10 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Lead Submitted!</h2>
          <p className="text-slate-300 mb-4">Your information has been saved.</p>
          <div className="bg-[#0a1628] rounded-lg p-4 mb-6 border border-cyan-500/20">
            <p className="text-slate-400 text-sm mb-1">Estimated Payout</p>
            <p className="text-3xl font-bold text-cyan-400">${submittedLead?.payout}</p>
          </div>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => {
                setStep("form");
                setFormData({ ...formData, customerName: "", email: "", phone: "", carModel: "" });
                setQuoteType(null);
                setAllQuotes([]);
                setSelectedQuote(null);
              }}
              className="bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] px-6 py-3 rounded-lg transition font-semibold shadow-[0_0_15px_rgba(34,211,238,0.3)]"
            >
              Submit Another
            </button>
            <Link href="/dashboard" className="bg-[#0a1628] hover:bg-[#0a1628]/80 text-white px-6 py-3 rounded-lg transition border border-cyan-500/30">
              View Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Chatbot Screen - Sales Focused AI
  if (step === "chatbot") {
    const cheapest = allQuotes[0];

    return (
      <div className="min-h-screen bg-[#0a1628] flex flex-col relative overflow-hidden">
        {/* Background circuit lines */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-20 left-10 w-px h-32 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
          <div className="absolute top-40 right-20 w-px h-48 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        </div>

        <nav className="flex items-center justify-between px-8 py-4 relative z-10">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.4)]">
              <svg viewBox="0 0 40 40" className="w-6 h-6">
                <defs>
                  <linearGradient id="logoGradChat" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#e0f7fa" />
                  </linearGradient>
                </defs>
                <path d="M8 8 L8 28 L18 28" fill="none" stroke="url(#logoGradChat)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M22 8 L16 20 L22 20 L18 32" fill="none" stroke="url(#logoGradChat)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M26 28 L26 8 L32 8 Q36 8 36 14 Q36 20 32 20 L26 20" fill="none" stroke="url(#logoGradChat)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-white">LeadzPay</span>
          </Link>
          <button onClick={() => setStep("questions")} className="text-slate-300 hover:text-cyan-400 transition">Back</button>
        </nav>

        <div className="flex-1 max-w-4xl mx-auto w-full px-4 flex flex-col relative z-10">
          {/* Top Quote Banner */}
          {cheapest && (
            <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 rounded-xl p-4 mb-4 flex items-center justify-between shadow-[0_0_30px_rgba(34,211,238,0.3)]">
              <div>
                <p className="text-cyan-100 text-sm">Your Best Rate</p>
                <p className="text-white text-2xl font-bold">${cheapest.monthlyPremium}/mo with {cheapest.companyName}</p>
              </div>
              <button
                onClick={handlePurchase}
                className="bg-white text-cyan-600 px-6 py-3 rounded-lg font-bold hover:bg-cyan-50 transition flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Buy Now - Save ${cheapest.totalDiscount}%
              </button>
            </div>
          )}

          {/* Chat Area */}
          <div className="flex-1 bg-[#0d2240] rounded-2xl border border-cyan-500/20 p-4 overflow-y-auto space-y-4 min-h-[350px] max-h-[450px] shadow-[0_0_20px_rgba(34,211,238,0.05)]">
            {chatMessages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] ${msg.role === "user" ? "" : ""}`}>
                  <div className={`rounded-2xl px-4 py-3 ${msg.role === "user" ? "bg-cyan-500 text-white" : "bg-[#0a1628] text-slate-200 border border-cyan-500/20"}`}>
                    <p className="whitespace-pre-line text-sm">{msg.text}</p>
                  </div>
                  {/* Action buttons for AI messages with purchase CTA */}
                  {msg.action?.type === "buy" && msg.action.data && (
                    <div className="mt-3 bg-gradient-to-r from-cyan-600/20 to-cyan-500/20 border border-cyan-500/50 rounded-xl p-4 shadow-[0_0_15px_rgba(34,211,238,0.1)]">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-cyan-400 font-semibold">{msg.action.data.companyName}</p>
                          <p className="text-white text-xl font-bold">${msg.action.data.monthlyPremium}/month</p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-400 text-sm">You save</p>
                          <p className="text-cyan-400 font-bold">{msg.action.data.totalDiscount}%</p>
                        </div>
                      </div>
                      <button
                        onClick={handlePurchase}
                        className="w-full bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] py-3 rounded-lg font-bold transition flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Purchase Now - Get Covered Today
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Action Buttons */}
          <div className="bg-[#0d2240]/80 rounded-xl p-4 mt-4 border border-cyan-500/20">
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => { setChatInput("Yes, lock in this rate!"); handleChatSend(); }}
                className="bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] py-3 px-4 rounded-lg font-semibold transition text-sm shadow-[0_0_10px_rgba(34,211,238,0.2)]"
              >
                Yes, Lock In This Rate!
              </button>
              <button
                onClick={() => { setChatInput("Show me other options"); handleChatSend(); }}
                className="bg-[#0a1628] hover:bg-[#0a1628]/80 text-white py-3 px-4 rounded-lg font-semibold transition text-sm border border-cyan-500/30"
              >
                See Other Options
              </button>
              <button
                onClick={() => { setChatInput("What discounts do I have?"); handleChatSend(); }}
                className="bg-[#0a1628] hover:bg-[#0a1628]/80 text-white py-3 px-4 rounded-lg font-semibold transition text-sm border border-cyan-500/30"
              >
                My Discounts
              </button>
              <button
                onClick={() => { setChatInput("Can I get a lower price?"); handleChatSend(); }}
                className="bg-[#0a1628] hover:bg-[#0a1628]/80 text-white py-3 px-4 rounded-lg font-semibold transition text-sm border border-cyan-500/30"
              >
                Lower Price Options
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleChatSend()}
                placeholder="Ask me anything about your quote..."
                className="flex-1 px-4 py-3 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
              />
              <button onClick={handleChatSend} className="bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] px-4 py-3 rounded-lg transition shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="py-4 flex gap-3">
            <button
              onClick={() => setStep("quote")}
              className="flex-1 bg-[#0d2240] hover:bg-[#0d2240]/80 text-white py-4 rounded-xl font-semibold transition border border-cyan-500/30"
            >
              Compare All 10 Carriers
            </button>
            <button
              onClick={handlePurchase}
              disabled={isPurchasing}
              className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] py-4 rounded-xl font-semibold transition flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(34,211,238,0.3)]"
            >
              {isPurchasing ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Purchase ${cheapest?.monthlyPremium}/mo
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Quote Comparison Screen
  if (step === "quote") {
    return (
      <div className="min-h-screen bg-[#0a1628] relative overflow-hidden">
        {/* Background circuit lines */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-20 left-10 w-px h-32 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
          <div className="absolute top-40 right-20 w-px h-48 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        </div>

        <CoverageModal />

        <nav className="flex items-center justify-between px-8 py-6 relative z-10">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.4)]">
              <svg viewBox="0 0 40 40" className="w-6 h-6">
                <defs>
                  <linearGradient id="logoGradQuote" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#e0f7fa" />
                  </linearGradient>
                </defs>
                <path d="M8 8 L8 28 L18 28" fill="none" stroke="url(#logoGradQuote)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M22 8 L16 20 L22 20 L18 32" fill="none" stroke="url(#logoGradQuote)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M26 28 L26 8 L32 8 Q36 8 36 14 Q36 20 32 20 L26 20" fill="none" stroke="url(#logoGradQuote)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-white">LeadzPay</span>
          </Link>
          <button onClick={() => setStep("chatbot")} className="text-slate-300 hover:text-cyan-400 transition">Back</button>
        </nav>

        <main className="max-w-6xl mx-auto px-8 py-8 relative z-10">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Insurance Quotes for {formData.customerName}</h1>
            <p className="text-slate-400">{formData.carModel} in {US_STATES.find(s => s.code === formData.state)?.name}</p>
            <p className="text-cyan-400 text-sm mt-2">Comparing {allQuotes.length} insurance companies</p>
          </div>

          {/* Coverage & Deductible Selection */}
          <div className="bg-[#0d2240] rounded-xl border border-cyan-500/20 p-6 mb-8 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-3">Coverage Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["liability", "collision", "comprehensive", "full"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => handleCoverageChange(type)}
                      className={`p-3 rounded-lg text-sm font-medium transition flex items-center justify-between ${
                        selectedCoverage === type
                          ? "bg-cyan-500 text-[#0a1628] shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                          : "bg-[#0a1628] text-slate-300 hover:bg-[#0a1628]/80 border border-cyan-500/30"
                      }`}
                    >
                      <span>{type === "liability" ? "Liability" : type === "collision" ? "Collision" : type === "comprehensive" ? "Comprehensive" : "Full Coverage"}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedCoverageType(type); setShowCoverageModal(true); }}
                        className="ml-2 text-slate-400 hover:text-cyan-400"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-3">Deductible</label>
                <div className="grid grid-cols-4 gap-2">
                  {([250, 500, 1000, 2000] as const).map((ded) => (
                    <button
                      key={ded}
                      onClick={() => handleDeductibleChange(ded)}
                      className={`p-3 rounded-lg text-sm font-medium transition ${
                        selectedDeductible === ded
                          ? "bg-cyan-500 text-[#0a1628] shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                          : "bg-[#0a1628] text-slate-300 hover:bg-[#0a1628]/80 border border-cyan-500/30"
                      }`}
                    >
                      ${ded}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quotes Grid */}
          <div className="grid gap-4 mb-8">
            {allQuotes.map((quote, index) => (
              <div
                key={quote.companyId}
                onClick={() => setSelectedQuote(quote)}
                className={`bg-[#0d2240] rounded-xl border-2 p-6 cursor-pointer transition-all ${
                  selectedQuote?.companyId === quote.companyId
                    ? "border-cyan-500 bg-cyan-500/5 shadow-[0_0_20px_rgba(34,211,238,0.15)]"
                    : "border-cyan-500/20 hover:border-cyan-500/40"
                }`}
              >
                <div className="flex items-center gap-6">
                  {/* Rank Badge */}
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold ${
                    index === 0 ? "bg-cyan-500 text-[#0a1628] shadow-[0_0_15px_rgba(34,211,238,0.4)]" : "bg-[#0a1628] text-slate-400 border border-cyan-500/30"
                  }`}>
                    #{index + 1}
                  </div>

                  {/* Company Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-xl font-bold text-white">{quote.companyName}</h3>
                      {quote.exclusive && (
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                          {quote.companyId === "usaa" ? "Military Only" : "Direct Only"}
                        </span>
                      )}
                      <div className="flex items-center gap-1 text-amber-400">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="text-sm">{quote.rating}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {quote.discountsApplied.slice(0, 3).map((discount, i) => (
                        <span key={i} className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded">
                          {discount}
                        </span>
                      ))}
                      {quote.discountsApplied.length > 3 && (
                        <span className="text-xs text-slate-500">+{quote.discountsApplied.length - 3} more</span>
                      )}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="text-right">
                    <div className="text-3xl font-bold text-white">${quote.monthlyPremium}<span className="text-lg text-slate-400">/mo</span></div>
                    <div className="text-slate-500 text-sm">${quote.annualPremium}/year</div>
                    {quote.totalDiscount > 0 && (
                      <div className="text-cyan-400 text-sm">Saving {quote.totalDiscount}%</div>
                    )}
                  </div>

                  {/* Select Indicator */}
                  {selectedQuote?.companyId === quote.companyId && (
                    <svg className="w-6 h-6 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Selected Quote Details */}
          {selectedQuote && (
            <div className="bg-[#0d2240] rounded-xl border border-cyan-500/20 p-6 mb-8 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
              <h3 className="text-lg font-semibold text-white mb-4">{selectedQuote.companyName} Quote Breakdown</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-cyan-400 mb-2">Discounts Applied ({selectedQuote.totalDiscount}% off)</h4>
                  <ul className="space-y-1">
                    {selectedQuote.discountsApplied.map((d, i) => (
                      <li key={i} className="text-slate-300 text-sm flex items-center gap-2">
                        <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
                {selectedQuote.surchargesApplied.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-red-400 mb-2">Rate Adjustments</h4>
                    <ul className="space-y-1">
                      {selectedQuote.surchargesApplied.map((s, i) => (
                        <li key={i} className="text-slate-300 text-sm flex items-center gap-2">
                          <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                          </svg>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-4">
            <button
              onClick={handlePurchase}
              disabled={!selectedQuote || isPurchasing || selectedQuote.exclusive}
              className={`w-full py-4 rounded-xl text-lg font-semibold transition-all ${
                selectedQuote && !isPurchasing && !selectedQuote.exclusive
                  ? "bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] cursor-pointer shadow-[0_0_20px_rgba(34,211,238,0.3)]"
                  : "bg-[#0d2240] text-slate-400 cursor-not-allowed border border-cyan-500/20"
              }`}
            >
              {isPurchasing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing...
                </span>
              ) : selectedQuote?.exclusive ? (
                `Visit ${selectedQuote.companyName} directly to purchase`
              ) : (
                `Purchase ${selectedQuote?.companyName} - $${selectedQuote?.monthlyPremium}/mo`
              )}
            </button>

            {selectedQuote?.exclusive && (
              <p className="text-center text-amber-400 text-sm">
                {selectedQuote.companyId === "usaa"
                  ? "USAA is exclusive to military members - visit usaa.com to get a quote"
                  : `${selectedQuote.companyName} sells directly to consumers - visit their website to purchase`}
              </p>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Additional Questions Screen
  if (step === "questions") {
    return (
      <div className="min-h-screen bg-[#0a1628] relative overflow-hidden">
        {/* Background circuit lines */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-10 w-px h-32 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
          <div className="absolute top-40 right-20 w-px h-48 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        </div>

        <nav className="flex items-center justify-between px-8 py-6 relative z-10">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.4)]">
              <svg viewBox="0 0 40 40" className="w-6 h-6">
                <defs>
                  <linearGradient id="logoGradQ" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#e0f7fa" />
                  </linearGradient>
                </defs>
                <path d="M8 8 L8 28 L18 28" fill="none" stroke="url(#logoGradQ)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M22 8 L16 20 L22 20 L18 32" fill="none" stroke="url(#logoGradQ)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M26 28 L26 8 L32 8 Q36 8 36 14 Q36 20 32 20 L26 20" fill="none" stroke="url(#logoGradQ)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-white">LeadzPay</span>
          </Link>
          <button onClick={() => setStep("form")} className="text-slate-300 hover:text-cyan-400 transition">Back</button>
        </nav>

        <main className="max-w-3xl mx-auto px-8 py-8 relative z-10">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">A Few More Questions</h1>
            <p className="text-slate-400">This helps us get you the most accurate quotes from all carriers</p>
          </div>

          <div className="space-y-6">
            {/* Demographics */}
            <div className="bg-[#0d2240] p-6 rounded-2xl border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
              <h2 className="text-lg font-semibold text-white mb-4">About the Driver</h2>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 text-sm mb-2">Gender</label>
                  <select name="gender" value={formData.gender} onChange={handleInputChange} className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:border-cyan-400 focus:outline-none transition">
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other/Prefer not to say</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 text-sm mb-2">Marital Status</label>
                  <select name="maritalStatus" value={formData.maritalStatus} onChange={handleInputChange} className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:border-cyan-400 focus:outline-none transition">
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 text-sm mb-2">Occupation</label>
                  <select name="occupation" value={formData.occupation} onChange={handleInputChange} className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:border-cyan-400 focus:outline-none transition">
                    <option value="standard">Standard</option>
                    <option value="professional">Professional (Doctor, Lawyer, etc.)</option>
                    <option value="military">Military (Active/Veteran)</option>
                    <option value="student">Student</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Driving History */}
            <div className="bg-[#0d2240] p-6 rounded-2xl border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
              <h2 className="text-lg font-semibold text-white mb-4">Driving History</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 text-sm mb-2">Years Licensed</label>
                  <input type="number" name="yearsLicensed" value={formData.yearsLicensed} onChange={handleInputChange} min="0" max="70" className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:border-cyan-400 focus:outline-none transition" />
                </div>
                <div>
                  <label className="block text-slate-300 text-sm mb-2">Driving Record (Last 5 Years)</label>
                  <select name="drivingHistory" value={formData.drivingHistory} onChange={handleInputChange} className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:border-cyan-400 focus:outline-none transition">
                    <option value="clean">Clean - No violations or accidents</option>
                    <option value="minor_violations">Minor violations (speeding, etc.)</option>
                    <option value="major_violations">Major violations (reckless driving)</option>
                    <option value="accidents">At-fault accident</option>
                    <option value="dui">DUI/DWI</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 text-sm mb-2">Credit Score Range</label>
                  <select name="creditScore" value={formData.creditScore} onChange={handleInputChange} className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:border-cyan-400 focus:outline-none transition">
                    <option value="excellent">Excellent (750+)</option>
                    <option value="good">Good (700-749)</option>
                    <option value="fair">Fair (650-699)</option>
                    <option value="poor">Poor (Below 650)</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={formData.priorInsurance} onChange={() => handleCheckboxChange("priorInsurance")} className="w-5 h-5 rounded bg-[#0a1628] border-cyan-500/30 accent-cyan-400" />
                    <span className="text-slate-300">Currently have auto insurance</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Vehicle Details */}
            <div className="bg-[#0d2240] p-6 rounded-2xl border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
              <h2 className="text-lg font-semibold text-white mb-4">Vehicle Details</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 text-sm mb-2">Vehicle Ownership</label>
                  <select name="vehicleOwnership" value={formData.vehicleOwnership} onChange={handleInputChange} className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:border-cyan-400 focus:outline-none transition">
                    <option value="owned">Owned (paid off)</option>
                    <option value="financed">Financed (making payments)</option>
                    <option value="leased">Leased</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 text-sm mb-2">Primary Use</label>
                  <select name="primaryUse" value={formData.primaryUse} onChange={handleInputChange} className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:border-cyan-400 focus:outline-none transition">
                    <option value="commute">Commute to work/school</option>
                    <option value="pleasure">Pleasure/personal use only</option>
                    <option value="business">Business use</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 text-sm mb-2">Annual Mileage</label>
                  <select name="annualMileage" value={formData.annualMileage} onChange={handleInputChange} className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:border-cyan-400 focus:outline-none transition">
                    <option value="5000">Under 5,000 miles</option>
                    <option value="7500">5,000 - 7,500 miles</option>
                    <option value="10000">7,500 - 10,000 miles</option>
                    <option value="12000">10,000 - 15,000 miles</option>
                    <option value="20000">Over 15,000 miles</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 text-sm mb-2">Where is it parked overnight?</label>
                  <select name="garageType" value={formData.garageType} onChange={handleInputChange} className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:border-cyan-400 focus:outline-none transition">
                    <option value="garage">Private garage</option>
                    <option value="carport">Carport</option>
                    <option value="street">Street parking</option>
                    <option value="parking_lot">Parking lot</option>
                  </select>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={formData.antiTheft} onChange={() => handleCheckboxChange("antiTheft")} className="w-5 h-5 rounded bg-[#0a1628] border-cyan-500/30 accent-cyan-400" />
                  <span className="text-slate-300">Has anti-theft device</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={formData.safetyFeatures} onChange={() => handleCheckboxChange("safetyFeatures")} className="w-5 h-5 rounded bg-[#0a1628] border-cyan-500/30 accent-cyan-400" />
                  <span className="text-slate-300">Has safety features (ABS, airbags, etc.)</span>
                </label>
              </div>
            </div>

            {/* Additional Info */}
            <div className="bg-[#0d2240] p-6 rounded-2xl border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
              <h2 className="text-lg font-semibold text-white mb-4">Additional Discounts</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={formData.homeOwner} onChange={() => handleCheckboxChange("homeOwner")} className="w-5 h-5 rounded bg-[#0a1628] border-cyan-500/30 accent-cyan-400" />
                  <span className="text-slate-300">Homeowner (for bundling discount)</span>
                </label>
              </div>
            </div>

            <button
              onClick={handleContinueFromQuestions}
              className="w-full py-4 rounded-xl text-lg font-semibold bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] transition shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)]"
            >
              Get My Quotes
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Provider Registration/Login Screen
  if (step === "provider") {
    const handleProviderSubmit = () => {
      // Check if provider exists
      const existingProvider = getProviderByEmail(providerData.email);

      if (existingProvider) {
        // Update existing provider with payment info if changed
        updateProvider(existingProvider.id, {
          paymentMethod: providerData.paymentMethod,
          paymentDetails: {
            venmoUsername: providerData.venmoUsername,
            paypalEmail: providerData.paypalEmail,
            bankAccountLast4: providerData.bankAccountLast4,
          },
        });
        setCurrentProvider(existingProvider);
        localStorage.setItem("leadzpay_provider_id", existingProvider.id);
      } else {
        // Create new provider
        const newProvider = addProvider({
          name: providerData.name,
          email: providerData.email,
          phone: providerData.phone,
          payoutRate: 50,
          totalLeads: 0,
          totalEarnings: 0,
          status: "active",
          paymentMethod: providerData.paymentMethod,
          paymentDetails: {
            venmoUsername: providerData.venmoUsername,
            paypalEmail: providerData.paypalEmail,
            bankAccountLast4: providerData.bankAccountLast4,
          },
        });
        setCurrentProvider(newProvider);
        localStorage.setItem("leadzpay_provider_id", newProvider.id);
      }

      setStep("form");
    };

    const isProviderFormValid = providerData.name && providerData.email && providerData.paymentMethod && (
      (providerData.paymentMethod === "venmo" && providerData.venmoUsername) ||
      (providerData.paymentMethod === "paypal" && providerData.paypalEmail) ||
      (providerData.paymentMethod === "bank" && providerData.bankAccountLast4)
    );

    return (
      <div className="min-h-screen bg-[#0a1628] relative overflow-hidden">
        {/* Background circuit lines */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-10 w-px h-32 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
          <div className="absolute top-40 right-20 w-px h-48 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
          <div className="absolute bottom-32 left-1/4 w-24 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
        </div>

        <nav className="flex items-center justify-between px-8 py-6 relative z-10">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.4)]">
              <svg viewBox="0 0 40 40" className="w-6 h-6">
                <defs>
                  <linearGradient id="logoGradProv" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#e0f7fa" />
                  </linearGradient>
                </defs>
                <path d="M8 8 L8 28 L18 28" fill="none" stroke="url(#logoGradProv)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M22 8 L16 20 L22 20 L18 32" fill="none" stroke="url(#logoGradProv)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M26 28 L26 8 L32 8 Q36 8 36 14 Q36 20 32 20 L26 20" fill="none" stroke="url(#logoGradProv)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-white">LeadzPay</span>
          </Link>
          <Link href="/" className="text-slate-300 hover:text-cyan-400 transition">Back to Home</Link>
        </nav>

        <main className="max-w-xl mx-auto px-8 py-12 relative z-10">
          <div className="text-center mb-10">
            <div className="h-16 w-16 rounded-2xl bg-cyan-500/20 flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(34,211,238,0.3)]">
              <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Welcome, Lead Provider!</h1>
            <p className="text-slate-300">Set up your profile to start earning on every lead you submit</p>
          </div>

          <div className="space-y-6">
            {/* Your Info */}
            <div className="bg-[#0d2240] p-6 rounded-2xl border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
              <h2 className="text-lg font-semibold text-white mb-4">Your Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Your Name *</label>
                  <input
                    type="text"
                    value={providerData.name}
                    onChange={(e) => setProviderData({ ...providerData, name: e.target.value })}
                    placeholder="Your full name"
                    className="w-full px-4 py-3 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Your Email *</label>
                  <input
                    type="email"
                    value={providerData.email}
                    onChange={(e) => setProviderData({ ...providerData, email: e.target.value })}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Your Phone (Optional)</label>
                  <input
                    type="tel"
                    value={providerData.phone}
                    onChange={(e) => setProviderData({ ...providerData, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-3 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
                  />
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-[#0d2240] p-6 rounded-2xl border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
              <h2 className="text-lg font-semibold text-white mb-2">How Would You Like to Get Paid?</h2>
              <p className="text-slate-400 text-sm mb-4">Choose your preferred payment method for lead payouts</p>

              <div className="grid grid-cols-3 gap-3 mb-4">
                {/* Venmo */}
                <button
                  onClick={() => setProviderData({ ...providerData, paymentMethod: "venmo" })}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    providerData.paymentMethod === "venmo"
                      ? "border-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(34,211,238,0.2)]"
                      : "border-cyan-500/30 hover:border-cyan-500/50"
                  }`}
                >
                  <div className="text-2xl mb-1">V</div>
                  <div className={`font-medium ${providerData.paymentMethod === "venmo" ? "text-cyan-400" : "text-white"}`}>Venmo</div>
                </button>

                {/* PayPal */}
                <button
                  onClick={() => setProviderData({ ...providerData, paymentMethod: "paypal" })}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    providerData.paymentMethod === "paypal"
                      ? "border-indigo-500 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                      : "border-cyan-500/30 hover:border-cyan-500/50"
                  }`}
                >
                  <div className="text-2xl mb-1">P</div>
                  <div className={`font-medium ${providerData.paymentMethod === "paypal" ? "text-indigo-400" : "text-white"}`}>PayPal</div>
                </button>

                {/* Bank */}
                <button
                  onClick={() => setProviderData({ ...providerData, paymentMethod: "bank" })}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    providerData.paymentMethod === "bank"
                      ? "border-emerald-500 bg-emerald-500/10 shadow-[0_0_15px_rgba(52,211,153,0.2)]"
                      : "border-cyan-500/30 hover:border-cyan-500/50"
                  }`}
                >
                  <div className="text-2xl mb-1">$</div>
                  <div className={`font-medium ${providerData.paymentMethod === "bank" ? "text-emerald-400" : "text-white"}`}>Bank</div>
                </button>
              </div>

              {/* Payment Details */}
              {providerData.paymentMethod === "venmo" && (
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Venmo Username *</label>
                  <div className="flex items-center">
                    <span className="text-cyan-400 mr-2">@</span>
                    <input
                      type="text"
                      value={providerData.venmoUsername}
                      onChange={(e) => setProviderData({ ...providerData, venmoUsername: e.target.value })}
                      placeholder="yourvenmo"
                      className="flex-1 px-4 py-3 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
                    />
                  </div>
                </div>
              )}

              {providerData.paymentMethod === "paypal" && (
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">PayPal Email *</label>
                  <input
                    type="email"
                    value={providerData.paypalEmail}
                    onChange={(e) => setProviderData({ ...providerData, paypalEmail: e.target.value })}
                    placeholder="paypal@example.com"
                    className="w-full px-4 py-3 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 transition"
                  />
                </div>
              )}

              {providerData.paymentMethod === "bank" && (
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Bank Account (Last 4 digits) *</label>
                  <input
                    type="text"
                    value={providerData.bankAccountLast4}
                    onChange={(e) => setProviderData({ ...providerData, bankAccountLast4: e.target.value.slice(0, 4) })}
                    placeholder="1234"
                    maxLength={4}
                    className="w-full px-4 py-3 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 transition"
                  />
                  <p className="text-slate-500 text-xs mt-2">Full bank details will be collected securely via Stripe</p>
                </div>
              )}
            </div>

            {/* Payout Info */}
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-cyan-400 font-semibold">Earn $50+ per qualified lead</p>
                  <p className="text-slate-400 text-sm">Payouts are recorded on the ledger and tracked transparently</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleProviderSubmit}
              disabled={!isProviderFormValid}
              className={`w-full py-4 rounded-xl text-lg font-semibold transition-all ${
                isProviderFormValid
                  ? "bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)]"
                  : "bg-[#0d2240] text-slate-400 cursor-not-allowed border border-cyan-500/20"
              }`}
            >
              Continue to Submit Lead
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Initial Form Screen (Customer Info)
  return (
    <div className="min-h-screen bg-[#0a1628] relative overflow-hidden">
      {/* Background circuit lines */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-20 left-10 w-px h-32 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        <div className="absolute top-40 right-20 w-px h-48 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        <div className="absolute bottom-32 left-1/4 w-24 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
      </div>

      <nav className="flex items-center justify-between px-8 py-6 relative z-10">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.4)]">
            <svg viewBox="0 0 40 40" className="w-6 h-6">
              <defs>
                <linearGradient id="logoGradForm" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#e0f7fa" />
                </linearGradient>
              </defs>
              <path d="M8 8 L8 28 L18 28" fill="none" stroke="url(#logoGradForm)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22 8 L16 20 L22 20 L18 32" fill="none" stroke="url(#logoGradForm)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M26 28 L26 8 L32 8 Q36 8 36 14 Q36 20 32 20 L26 20" fill="none" stroke="url(#logoGradForm)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-2xl font-bold text-white">LeadzPay</span>
        </Link>
        <div className="flex items-center gap-4">
          {currentProvider && (
            <span className="text-slate-400 text-sm">
              Logged in as: <span className="text-cyan-400">{currentProvider.name}</span>
            </span>
          )}
          <button
            onClick={() => {
              localStorage.removeItem("leadzpay_provider_id");
              setCurrentProvider(null);
              setStep("provider");
            }}
            className="text-slate-300 hover:text-cyan-400 transition text-sm"
          >
            Switch Account
          </button>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-8 py-12 relative z-10">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-4">Submit a Lead</h1>
          <p className="text-slate-300">Enter your customer&apos;s info to get them instant quotes</p>
          {currentProvider && (
            <p className="text-cyan-400 text-sm mt-2">
              You&apos;ll earn ${currentProvider.payoutRate} for this lead via {currentProvider.paymentMethod || "your payment method"}
            </p>
          )}
        </div>

        <div className="space-y-8">
          {/* Customer Info */}
          <div className="bg-[#0d2240] p-8 rounded-2xl border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
            <h2 className="text-xl font-semibold text-white mb-6">Customer Information</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Full Name *</label>
                <input type="text" name="customerName" value={formData.customerName} onChange={handleInputChange} placeholder="John Smith" className="w-full px-4 py-3 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition" required />
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Email *</label>
                <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="john@example.com" className="w-full px-4 py-3 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition" required />
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Phone *</label>
                <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="(555) 123-4567" className="w-full px-4 py-3 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition" required />
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Age</label>
                <input type="number" name="age" value={formData.age} onChange={handleInputChange} min="16" max="100" className="w-full px-4 py-3 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:outline-none focus:border-cyan-400 transition" />
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">Vehicle *</label>
                <input type="text" name="carModel" value={formData.carModel} onChange={handleInputChange} placeholder="2024 Toyota Camry" className="w-full px-4 py-3 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition" required />
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">State *</label>
                <select name="state" value={formData.state} onChange={handleInputChange} className="w-full px-4 py-3 rounded-lg bg-[#0a1628] border border-cyan-500/30 text-white focus:outline-none focus:border-cyan-400 transition">
                  {US_STATES.map((state) => (
                    <option key={state.code} value={state.code}>{state.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Quote Type */}
          <div className="bg-[#0d2240] p-8 rounded-2xl border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.05)]">
            <h2 className="text-xl font-semibold text-white mb-6">What does the customer need?</h2>
            <div className="grid gap-4">
              <QuoteTypeButton type="quote" selected={quoteType} onSelect={handleQuoteTypeSelect} title="Get Instant Quotes" description="Compare rates from 10+ insurance companies instantly" color="cyan" />
              <QuoteTypeButton type="switch" selected={quoteType} onSelect={handleQuoteTypeSelect} title="Switch & Save" description="Currently insured but looking for a better deal" color="blue" />
            </div>
          </div>

          <button onClick={handleContinueFromForm} disabled={!isBasicFormValid} className={`w-full py-4 rounded-xl text-lg font-semibold transition-all ${isBasicFormValid ? "bg-cyan-500 hover:bg-cyan-400 text-[#0a1628] shadow-[0_0_20px_rgba(34,211,238,0.3)]" : "bg-[#0d2240] text-slate-400 cursor-not-allowed border border-cyan-500/20"}`}>
            Continue
          </button>
        </div>
      </main>
    </div>
  );
}

function QuoteTypeButton({ type, selected, onSelect, title, description, color }: {
  type: QuoteType; selected: QuoteType; onSelect: (type: QuoteType) => void; title: string; description: string; color: "cyan" | "blue";
}) {
  const isSelected = selected === type;
  const colors = {
    cyan: { border: "border-cyan-500", bg: "bg-cyan-500/10", icon: "text-cyan-400", shadow: "shadow-[0_0_15px_rgba(34,211,238,0.2)]" },
    blue: { border: "border-blue-500", bg: "bg-blue-500/10", icon: "text-blue-400", shadow: "shadow-[0_0_15px_rgba(59,130,246,0.2)]" },
  }[color];

  return (
    <button type="button" onClick={() => onSelect(type)} className={`p-4 rounded-xl border-2 text-left transition-all ${isSelected ? `${colors.border} ${colors.bg} ${colors.shadow}` : "border-cyan-500/30 hover:border-cyan-500/50"}`}>
      <div className="flex items-center gap-4">
        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isSelected ? colors.bg : "bg-[#0a1628]"}`}>
          <svg className={`w-5 h-5 ${isSelected ? colors.icon : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {type === "switch" && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />}
            {type === "quote" && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />}
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-slate-400 text-sm">{description}</p>
        </div>
        {isSelected && <svg className={`w-6 h-6 ${colors.icon}`} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
      </div>
    </button>
  );
}
