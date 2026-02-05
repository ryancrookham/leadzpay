import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConnectionById, updateConnection } from "@/lib/db";

// PATCH /api/connections/[id] - Update connection (set terms, accept, decline, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, ...data } = body;
    const userId = session.user.id;
    const role = (session.user as any).role as "provider" | "buyer";

    // Get the connection
    const connection = await getConnectionById(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    // Verify user is part of this connection
    const isProvider = connection.provider_id === userId;
    const isBuyer = connection.buyer_id === userId;

    if (!isProvider && !isBuyer) {
      return NextResponse.json({ error: "Not authorized for this connection" }, { status: 403 });
    }

    switch (action) {
      case "set_terms": {
        // Buyer sets terms for a pending request
        console.log("[CONNECTIONS] set_terms called:", { id, userId, role, data });
        console.log("[CONNECTIONS] Current connection:", {
          id: connection.id,
          status: connection.status,
          buyer_id: connection.buyer_id,
          provider_id: connection.provider_id
        });

        if (!isBuyer) {
          console.log("[CONNECTIONS] REJECTED: User is not the buyer");
          return NextResponse.json({ error: "Only business can set terms" }, { status: 403 });
        }
        if (connection.status !== "pending_buyer_review") {
          console.log("[CONNECTIONS] REJECTED: Wrong status, expected pending_buyer_review, got:", connection.status);
          return NextResponse.json({ error: "Connection not pending review" }, { status: 400 });
        }

        const { ratePerLead, paymentTiming, weeklyLeadCap, monthlyLeadCap, terminationNoticeDays } = data;
        console.log("[CONNECTIONS] Extracted terms:", { ratePerLead, paymentTiming, weeklyLeadCap, monthlyLeadCap, terminationNoticeDays });

        try {
          const updateData = {
            status: "pending_provider_accept" as const,
            rate_per_lead: ratePerLead || connection.rate_per_lead,
            payment_timing: paymentTiming || connection.payment_timing,
            weekly_lead_cap: weeklyLeadCap,
            monthly_lead_cap: monthlyLeadCap,
            termination_notice_days: terminationNoticeDays || 7,
          };
          console.log("[CONNECTIONS] Calling updateConnection with:", updateData);

          const updated = await updateConnection(id, updateData);
          console.log("[CONNECTIONS] updateConnection result:", updated);

          if (!updated) {
            console.log("[CONNECTIONS] ERROR: updateConnection returned null");
            return NextResponse.json({ error: "Failed to update connection" }, { status: 500 });
          }

          return NextResponse.json({ success: true, connection: updated });
        } catch (updateError) {
          console.error("[CONNECTIONS] updateConnection threw error:", updateError);
          throw updateError;
        }
      }

      case "accept": {
        // Provider accepts the terms
        if (!isProvider) {
          return NextResponse.json({ error: "Only provider can accept terms" }, { status: 403 });
        }
        if (connection.status !== "pending_provider_accept") {
          return NextResponse.json({ error: "No terms to accept" }, { status: 400 });
        }

        const updated = await updateConnection(id, {
          status: "active",
          accepted_at: new Date().toISOString(),
        });

        return NextResponse.json({ success: true, connection: updated });
      }

      case "decline": {
        // Provider declines the terms
        if (!isProvider) {
          return NextResponse.json({ error: "Only provider can decline terms" }, { status: 403 });
        }
        if (connection.status !== "pending_provider_accept") {
          return NextResponse.json({ error: "No terms to decline" }, { status: 400 });
        }

        const updated = await updateConnection(id, {
          status: "declined_by_provider",
        });

        return NextResponse.json({ success: true, connection: updated });
      }

      case "reject": {
        // Buyer rejects a provider's request
        if (!isBuyer) {
          return NextResponse.json({ error: "Only business can reject requests" }, { status: 403 });
        }
        if (connection.status !== "pending_buyer_review") {
          return NextResponse.json({ error: "Request not pending review" }, { status: 400 });
        }

        const updated = await updateConnection(id, {
          status: "rejected_by_buyer",
        });

        return NextResponse.json({ success: true, connection: updated });
      }

      case "terminate": {
        // Either party can terminate an active connection
        if (connection.status !== "active") {
          return NextResponse.json({ error: "Connection not active" }, { status: 400 });
        }

        const updated = await updateConnection(id, {
          status: "terminated",
        });

        return NextResponse.json({ success: true, connection: updated });
      }

      case "update_terms": {
        // Buyer updates terms on active connection
        if (!isBuyer) {
          return NextResponse.json({ error: "Only business can update terms" }, { status: 403 });
        }
        if (connection.status !== "active") {
          return NextResponse.json({ error: "Connection not active" }, { status: 400 });
        }

        const { ratePerLead, paymentTiming, weeklyLeadCap, monthlyLeadCap, terminationNoticeDays } = data;

        const updated = await updateConnection(id, {
          rate_per_lead: ratePerLead,
          payment_timing: paymentTiming,
          weekly_lead_cap: weeklyLeadCap,
          monthly_lead_cap: monthlyLeadCap,
          termination_notice_days: terminationNoticeDays,
        });

        return NextResponse.json({ success: true, connection: updated });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("[CONNECTIONS] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update connection" }, { status: 500 });
  }
}

// GET /api/connections/[id] - Get single connection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    const connection = await getConnectionById(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    // Verify user is part of this connection
    if (connection.provider_id !== userId && connection.buyer_id !== userId) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    return NextResponse.json({ connection });
  } catch (error) {
    console.error("[CONNECTIONS] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch connection" }, { status: 500 });
  }
}
