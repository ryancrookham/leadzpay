import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

interface QuoteResult {
  companyId: string;
  companyName: string;
  monthlyPremium: number;
  annualPremium: number;
  coverageType: string;
  deductible: number;
  totalDiscount: number;
  discountsApplied: string[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  customerProfile: {
    name: string;
    vehicleInfo: string;
    state: string;
  };
  quotes: QuoteResult[];
  selectedQuote: QuoteResult | null;
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      // Return a simulated response if no API key
      return NextResponse.json({
        message: generateFallbackResponse(body),
        action: null,
      });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const bestQuote = body.quotes[0];
    const quotesInfo = body.quotes
      .slice(0, 5)
      .map(
        (q, i) =>
          `${i + 1}. ${q.companyName}: $${q.monthlyPremium}/mo (${q.coverageType} coverage, $${q.deductible} deductible, ${q.totalDiscount}% savings)`
      )
      .join("\n");

    const systemPrompt = `You are an expert insurance advisor for LeadzPay, helping customers find the best auto insurance. Your goal is to help customers understand their options and guide them toward purchasing the right policy.

CUSTOMER INFORMATION:
- Name: ${body.customerProfile.name}
- Vehicle: ${body.customerProfile.vehicleInfo}
- Location: ${body.customerProfile.state}

AVAILABLE QUOTES (sorted by price, best first):
${quotesInfo}

BEST RATE: ${bestQuote?.companyName} at $${bestQuote?.monthlyPremium}/month with ${bestQuote?.totalDiscount}% savings

YOUR APPROACH:
1. Be friendly, professional, and conversational - not pushy
2. Always recommend the best value option but explain why
3. When asked about coverage, explain it in simple terms
4. Address concerns about price by mentioning discounts they qualify for
5. Create gentle urgency ("rates valid for 24 hours")
6. If customer seems ready to buy, encourage them to click the Purchase button
7. Keep responses concise (2-3 paragraphs max)
8. Use the customer's name occasionally to personalize

COMPLIANCE REQUIREMENTS (IMPORTANT):
1. If asked about your license or credentials, explain that LeadzPay connects customers with licensed insurance agents
2. Clarify that quotes are estimates - final rates determined by the carrier
3. If a customer mentions they're in a different state than shown, ask them to confirm their state of residence
4. Remind customers that a licensed agent will finalize their policy
5. Never guarantee specific rates - use phrases like "based on your profile" or "estimated rate"

COVERAGE EXPLANATIONS:
- Liability: Covers damage you cause to others (required by law)
- Collision: Covers damage to your car from accidents
- Comprehensive: Covers theft, vandalism, weather damage
- Full Coverage: All of the above for maximum protection

STATE VERIFICATION:
If the customer's state hasn't been confirmed or they mention being in a different state, say:
"Just to make sure I'm showing you accurate rates - can you confirm you're looking for coverage in ${body.customerProfile.state}? Rates can vary significantly by state."

When customer wants to purchase, tell them to click the "Purchase" button below the chat. Remind them that a licensed agent will contact them to finalize the policy.`;

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 400,
      system: systemPrompt,
      messages: body.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const messageContent = response.content[0];
    const messageText =
      messageContent.type === "text" ? messageContent.text : "";

    // Detect if user wants to purchase
    const lastUserMessage =
      body.messages[body.messages.length - 1]?.content.toLowerCase() || "";
    const purchaseIntent =
      lastUserMessage.includes("yes") ||
      lastUserMessage.includes("lock in") ||
      lastUserMessage.includes("purchase") ||
      lastUserMessage.includes("buy") ||
      lastUserMessage.includes("get it") ||
      lastUserMessage.includes("sign up");

    return NextResponse.json({
      message: messageText,
      action: purchaseIntent ? { type: "show_purchase" } : null,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        message:
          "I apologize, I'm having trouble connecting right now. Please try again or click 'Compare All Carriers' to see your quotes directly.",
        action: null,
      },
      { status: 500 }
    );
  }
}

// Fallback response generator when API key is not configured
function generateFallbackResponse(body: ChatRequest): string {
  const lastMessage =
    body.messages[body.messages.length - 1]?.content.toLowerCase() || "";
  const bestQuote = body.quotes[0];
  const customerName = body.customerProfile.name.split(" ")[0];

  if (
    lastMessage.includes("yes") ||
    lastMessage.includes("lock") ||
    lastMessage.includes("purchase")
  ) {
    return `Excellent choice, ${customerName}! To complete your purchase with ${bestQuote?.companyName} at $${bestQuote?.monthlyPremium}/month, just click the "Purchase" button below. Your policy will be active within minutes!`;
  }

  if (lastMessage.includes("other") || lastMessage.includes("option")) {
    const topThree = body.quotes.slice(0, 3);
    return `Here are your top options, ${customerName}:\n\n${topThree.map((q, i) => `${i + 1}. **${q.companyName}**: $${q.monthlyPremium}/mo`).join("\n")}\n\nAll include ${topThree[0]?.coverageType} coverage. Would you like details on any of these?`;
  }

  if (lastMessage.includes("discount")) {
    const discounts = bestQuote?.discountsApplied || [];
    return `Great news, ${customerName}! You qualify for these discounts:\n\n${discounts.map((d) => `• ${d}`).join("\n")}\n\nThese save you ${bestQuote?.totalDiscount}% on your premium!`;
  }

  if (
    lastMessage.includes("cover") ||
    lastMessage.includes("what") ||
    lastMessage.includes("include")
  ) {
    return `Your ${bestQuote?.coverageType} coverage includes:\n\n• **Liability**: Covers damage you cause to others\n• **Collision**: Repairs to your car from accidents\n• **Comprehensive**: Protection from theft, weather, vandalism\n\nWith a $${bestQuote?.deductible} deductible, you're well protected. Ready to lock in this rate?`;
  }

  if (lastMessage.includes("price") || lastMessage.includes("lower")) {
    return `I understand budget is important, ${customerName}. Your rate of $${bestQuote?.monthlyPremium}/mo is already ${bestQuote?.totalDiscount}% below average for your area. You could also consider:\n\n• Raising your deductible to $1000 for additional savings\n• Bundling with home insurance for multi-policy discount\n\nWant me to explore these options?`;
  }

  // Default response
  return `${customerName}, based on your profile, ${bestQuote?.companyName} offers the best value at $${bestQuote?.monthlyPremium}/month. This includes ${bestQuote?.coverageType} coverage with a $${bestQuote?.deductible} deductible.\n\nYou're saving ${bestQuote?.totalDiscount}% compared to average rates in ${body.customerProfile.state}. Would you like to lock in this rate, or do you have any questions about the coverage?`;
}
