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
  getPlatformSettings,
  getActiveBusinessCriteria,
  getCriteriaFields,
  ensureDuplicateCheckColumns,
  checkDuplicateLead,
  hashIdentifier,
  getSmsAlertSettings,
} from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import { calculateFeeBreakdown } from "@/lib/platform-fees";
import twilio from "twilio";

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
    const { connectionId, customerData, vehicleData, criteriaFieldsData } = body;

    if (!connectionId || !customerData) {
      return NextResponse.json(
        { error: "connectionId and customerData are required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!customerData.email || !emailRegex.test(customerData.email)) {
      return NextResponse.json(
        { error: "A valid email address is required (e.g. name@gmail.com)" },
        { status: 400 }
      );
    }

    // Duplicate detection — hash email and phone, check platform-wide
    await ensureDuplicateCheckColumns();
    const emailHash = customerData.email
      ? await hashIdentifier(customerData.email)
      : null;
    const phoneHash = customerData.phone
      ? await hashIdentifier(customerData.phone)
      : null;
    const duplicateLeadId = await checkDuplicateLead(emailHash, phoneHash);
    if (duplicateLeadId) {
      return NextResponse.json(
        {
          error: "Duplicate lead detected. This individual has already been submitted on the WOML platform and cannot be submitted again.",
          duplicateLeadId,
        },
        { status: 409 }
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

    // 2b. Check for active criteria — use criteria payout rate if available
    const activeCriteria = await getActiveBusinessCriteria(connection.buyer_id);
    let ratePerLead = Number(connection.rate_per_lead) || 0;

    if (activeCriteria) {
      ratePerLead = Number(activeCriteria.payout_per_lead) || ratePerLead;

      // Validate mandatory criteria fields
      if (criteriaFieldsData && Array.isArray(criteriaFieldsData)) {
        const criteriaFields = await getCriteriaFields(activeCriteria.id);
        const mandatoryFields = criteriaFields.filter(f => f.is_mandatory);
        for (const mf of mandatoryFields) {
          const submitted = criteriaFieldsData.find((d: { fieldId?: string }) => d.fieldId === mf.id);
          if (!submitted || !submitted.value) {
            return NextResponse.json(
              { error: `Missing required field: ${mf.label}` },
              { status: 400 }
            );
          }
        }
      }
    }

    // 3. Calculate fees (from DB settings)
    const platformFees = await getPlatformSettings();
    const fees = calculateFeeBreakdown(ratePerLead, platformFees);

    // 4. Encrypt customer PII
    const { encrypted, iv } = await encrypt(customerData);

    // 5. Insert lead into database (payout pending — business pays manually)
    const lead = await createLead({
      provider_id: session.user.id,
      buyer_id: buyer.id,
      connection_id: connectionId,
      customer_data_encrypted: encrypted,
      customer_data_iv: iv,
      customer_email_hash: emailHash ?? undefined,
      customer_phone_hash: phoneHash ?? undefined,
      customer_state: vehicleData?.state || customerData?.state || null,
      vehicle_year: vehicleData?.year || null,
      vehicle_make: vehicleData?.make || null,
      vehicle_model: vehicleData?.model || null,
      payout_amount: ratePerLead,
      criteria_fields_data: criteriaFieldsData || undefined,
    });

    // 6. Record transactions (all pending until business marks as paid)
    // Lead payout transaction (provider earning)
    await createTransaction({
      type: "lead_payout",
      status: "pending",
      amount: ratePerLead,
      fee_amount: fees.providerFee,
      net_amount: fees.providerNet,
      from_account_id: buyer.id,
      to_account_id: session.user.id,
      lead_id: lead.id,
      connection_id: connectionId,
      description: `Lead payout - $${ratePerLead.toFixed(2)}/lead (net $${fees.providerNet.toFixed(2)} after $${fees.providerFee.toFixed(2)} fee)`,
    });

    // Platform fee transaction
    await createTransaction({
      type: "platform_fee",
      status: "pending",
      amount: fees.totalPlatformFee,
      fee_amount: 0,
      net_amount: fees.totalPlatformFee,
      from_account_id: buyer.id,
      to_account_id: null,
      lead_id: lead.id,
      connection_id: connectionId,
      description: `Platform fee ($${fees.buyerFee.toFixed(2)} from buyer + $${fees.providerFee.toFixed(2)} from provider)`,
    });

    // 7. Update connection stats
    await updateConnection(connectionId, {
      total_leads: Number(connection.total_leads || 0) + 1,
      total_paid: Number(connection.total_paid || 0) + ratePerLead,
    });

    // 8. Fire SMS lead alert to business (non-blocking — never fails the lead submission)
    try {
      const smsSettings = await getSmsAlertSettings(buyer.id);
      if (smsSettings.smsAlertsEnabled && (smsSettings.smsAlertPhone1 || smsSettings.smsAlertPhone2)) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
        if (accountSid && authToken && twilioPhone) {
          const client = twilio(accountSid, authToken);
          const providerUser = await getUserById(session.user.id);
          const providerName = providerUser?.display_name || providerUser?.username || "A provider";
          const customerName = customerData?.name || customerData?.customerName || "Unknown";
          const customerPhone = customerData?.phone || "";
          const phoneSegment = customerPhone ? `, call at ${customerPhone}` : "";
          const messageBody = `WOML LEAD FROM ${providerName.toUpperCase()}: ${customerName}${phoneSegment}. View leads: https://womleads.com/business`;
          const phones = [smsSettings.smsAlertPhone1, smsSettings.smsAlertPhone2].filter(Boolean) as string[];
          for (const phone of phones) {
            await client.messages.create({ body: messageBody, from: twilioPhone, to: phone }).catch((err: any) => {
              console.error(`[LEAD-SMS-ALERT] Failed to send to ${phone}:`, err?.message);
            });
          }
          console.log(`[LEAD-SMS-ALERT] Alert sent for lead ${lead.id} to ${phones.length} number(s)`);
        }
      }
    } catch (smsErr: any) {
      // SMS failure should never block lead submission
      console.error("[LEAD-SMS-ALERT] Non-blocking SMS error:", smsErr?.message);
    }

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      fees: {
        buyerTotal: fees.buyerTotal,
        platformFee: fees.totalPlatformFee,
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

    // Decrypt customer data — buyers see full PII they paid for
    const sanitized = await Promise.all(leads.map(async (lead) => {
      let customerName = "Unknown";
      let customerEmail: string | null = null;
      let customerPhone: string | null = null;
      let customerLicenseImage: string | null = null;
      let customerMaritalStatus: string | null = null;
      let customerHasInsurance: string | null = null;
      try {
        const decrypted = await decrypt(lead.customer_data_encrypted, lead.customer_data_iv);
        const parsed = JSON.parse(decrypted);
        customerName = parsed.name || parsed.customerName || "Unknown";
        if (role === "buyer") {
          customerEmail = parsed.email || null;
          customerPhone = parsed.phone || null;
          customerLicenseImage = parsed.licenseImage || null;
          customerMaritalStatus = parsed.maritalStatus || null;
          customerHasInsurance = parsed.hasInsurance || null;
        }
      } catch { /* decryption may fail if key changed */ }

      return {
        id: lead.id,
        providerId: lead.provider_id,
        buyerId: lead.buyer_id,
        connectionId: lead.connection_id,
        status: lead.status,
        customerName,
        customerEmail: role === "buyer" ? customerEmail : undefined,
        customerPhone: role === "buyer" ? customerPhone : undefined,
        customerLicenseImage: role === "buyer" ? customerLicenseImage : undefined,
        customerMaritalStatus: role === "buyer" ? customerMaritalStatus : undefined,
        customerHasInsurance: role === "buyer" ? customerHasInsurance : undefined,
        customerState: lead.customer_state,
        vehicleYear: lead.vehicle_year,
        vehicleMake: lead.vehicle_make,
        vehicleModel: lead.vehicle_model,
        payoutAmount: lead.payout_amount,
        payoutStatus: lead.payout_status,
        payoutCompletedAt: lead.payout_completed_at,
        submittedAt: lead.submitted_at,
        providerName: lead.provider_name || null,
        buyerName: lead.buyer_name || null,
        buyerBusinessName: lead.buyer_business_name || null,
        criteriaFieldsData: role === "buyer" ? lead.criteria_fields_data : undefined,
      };
    }));

    return NextResponse.json({ success: true, leads: sanitized });
  } catch (error) {
    console.error("Get leads error:", error);
    return NextResponse.json({ error: "Failed to get leads" }, { status: 500 });
  }
}
