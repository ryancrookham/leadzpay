import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getUserById,
  getConnectionById,
  createLead,
  getLeadsByProviderId,
  getLeadsByBuyerId,
  createTransaction,
  updateConnection,
} from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import {
  PLATFORM_FEE_TOTAL,
  PLATFORM_FEE_PROVIDER,
  PLATFORM_FEE_BUYER,
  calculateFeeBreakdown,
} from "@/lib/platform-fees";

/**
 * POST /api/leads - Provider submits a lead
 * 1. Validates connection is active
 * 2. Encrypts customer data
 * 3. Inserts lead into DB
 * 4. Records transactions (pending — business pays provider manually)
 * 5. Updates connection stats
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if ((session.user as any).role !== "provider") {
      return NextResponse.json({ error: "Only providers can submit leads" }, { status: 403 });
    }

    const body = await request.json();
    const { connectionId, customerData, vehicleData } = body;

    if (!connectionId || !customerData) {
      return NextResponse.json(
        { error: "connectionId and customerData are required" },
        { status: 400 }
      );
    }

    // 1. Validate the connection
    const connection = await getConnectionById(connectionId);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (connection.provider_id !== session.user.id) {
      return NextResponse.json({ error: "Not your connection" }, { status: 403 });
    }
    if (connection.status !== "active") {
      return NextResponse.json(
        { error: "Connection is not active. Both parties must accept terms first." },
        { status: 400 }
      );
    }

    // 2. Get buyer info
    const buyer = await getUserById(connection.buyer_id);
    if (!buyer) {
      return NextResponse.json({ error: "Buyer account not found" }, { status: 404 });
    }

    // 3. Calculate fees
    const ratePerLead = Number(connection.rate_per_lead) || 0;
    const fees = calculateFeeBreakdown(ratePerLead);

    // 4. Encrypt customer PII
    const { encrypted, iv } = await encrypt(customerData);

    // 5. Insert lead into database (payout pending — business pays manually)
    const lead = await createLead({
      provider_id: session.user.id,
      buyer_id: buyer.id,
      connection_id: connectionId,
      customer_data_encrypted: encrypted,
      customer_data_iv: iv,
      customer_state: vehicleData?.state || customerData?.state || null,
      vehicle_year: vehicleData?.year || null,
      vehicle_make: vehicleData?.make || null,
      vehicle_model: vehicleData?.model || null,
      payout_amount: ratePerLead,
    });

    // 6. Record transactions (all pending until business marks as paid)
    // Lead payout transaction (provider earning)
    await createTransaction({
      type: "lead_payout",
      status: "pending",
      amount: ratePerLead,
      fee_amount: PLATFORM_FEE_PROVIDER,
      net_amount: fees.providerNet,
      from_account_id: buyer.id,
      to_account_id: session.user.id,
      lead_id: lead.id,
      connection_id: connectionId,
      description: `Lead payout - $${ratePerLead.toFixed(2)}/lead (net $${fees.providerNet.toFixed(2)} after $${PLATFORM_FEE_PROVIDER.toFixed(2)} fee)`,
    });

    // Platform fee transaction
    await createTransaction({
      type: "platform_fee",
      status: "pending",
      amount: PLATFORM_FEE_TOTAL,
      fee_amount: 0,
      net_amount: PLATFORM_FEE_TOTAL,
      from_account_id: buyer.id,
      to_account_id: null,
      lead_id: lead.id,
      connection_id: connectionId,
      description: `Platform fee ($${PLATFORM_FEE_BUYER.toFixed(2)} from buyer + $${PLATFORM_FEE_PROVIDER.toFixed(2)} from provider)`,
    });

    // 7. Update connection stats
    await updateConnection(connectionId, {
      total_leads: Number(connection.total_leads || 0) + 1,
      total_paid: Number(connection.total_paid || 0) + ratePerLead,
    });

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      fees: {
        buyerTotal: fees.buyerTotal,
        platformFee: PLATFORM_FEE_TOTAL,
        providerNet: fees.providerNet,
        ratePerLead,
      },
    });
  } catch (error) {
    console.error("Lead submission error:", error);
    return NextResponse.json(
      { error: "Failed to submit lead" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/leads - Get leads for current user (provider or buyer)
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const role = (session.user as any).role;
    let leads;

    if (role === "provider") {
      leads = await getLeadsByProviderId(session.user.id);
    } else {
      leads = await getLeadsByBuyerId(session.user.id);
    }

    // Decrypt customer name only (not email/phone/address for security)
    const sanitized = await Promise.all(leads.map(async (lead) => {
      let customerName = "Unknown";
      try {
        const decrypted = await decrypt(lead.customer_data_encrypted, lead.customer_data_iv);
        const parsed = JSON.parse(decrypted);
        customerName = parsed.name || parsed.customerName || "Unknown";
      } catch { /* decryption may fail if key changed */ }

      return {
        id: lead.id,
        providerId: lead.provider_id,
        buyerId: lead.buyer_id,
        connectionId: lead.connection_id,
        status: lead.status,
        customerName,
        customerState: lead.customer_state,
        vehicleYear: lead.vehicle_year,
        vehicleMake: lead.vehicle_make,
        vehicleModel: lead.vehicle_model,
        payoutAmount: lead.payout_amount,
        payoutStatus: lead.payout_status,
        payoutCompletedAt: lead.payout_completed_at,
        submittedAt: lead.submitted_at,
        providerName: lead.provider_name || null,
        providerVenmo: role === "buyer" ? (lead.provider_venmo || null) : undefined,
        buyerName: lead.buyer_name || null,
        buyerBusinessName: lead.buyer_business_name || null,
      };
    }));

    return NextResponse.json({ success: true, leads: sanitized });
  } catch (error) {
    console.error("Get leads error:", error);
    return NextResponse.json({ error: "Failed to get leads" }, { status: 500 });
  }
}
