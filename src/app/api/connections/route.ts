import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getConnectionsByUserId,
  getPendingRequestsForBuyer,
  getPendingTermsForProvider,
  getActiveConnectionForProvider,
  getConnectionByProviderAndBuyer,
  createConnection,
  getUserById,
  getUserByEmail,
} from "@/lib/db";

// GET /api/connections - List connections for authenticated user
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";
    const userId = session.user.id;
    const role = (session.user as any).role as "provider" | "buyer";

    let connections;

    if (status === "pending" && role === "buyer") {
      // Buyer wants to see pending requests to review
      connections = await getPendingRequestsForBuyer(userId);
    } else if (status === "pending" && role === "provider") {
      // Provider wants to see pending terms to accept/decline
      connections = await getPendingTermsForProvider(userId);
    } else if (status === "active" && role === "provider") {
      // Provider's active connection
      const active = await getActiveConnectionForProvider(userId);
      connections = active ? [active] : [];
    } else {
      // All connections for user
      connections = await getConnectionsByUserId(userId, role);
    }

    // Enrich with user info
    const enrichedConnections = await Promise.all(
      connections.map(async (conn) => {
        const provider = await getUserById(conn.provider_id);
        const buyer = await getUserById(conn.buyer_id);
        return {
          ...conn,
          provider_name: provider?.display_name || provider?.username || "Unknown",
          provider_email: provider?.email || "",
          buyer_name: buyer?.business_name || buyer?.username || "Unknown",
          buyer_email: buyer?.email || "",
        };
      })
    );

    return NextResponse.json({ connections: enrichedConnections });
  } catch (error) {
    console.error("[CONNECTIONS] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch connections" }, { status: 500 });
  }
}

// POST /api/connections - Create a new connection request
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const userId = session.user.id;
    const role = (session.user as any).role as "provider" | "buyer";

    if (role === "provider") {
      // Provider initiates connection request to a buyer
      const { buyerId, message } = body;

      if (!buyerId) {
        return NextResponse.json({ error: "buyerId is required" }, { status: 400 });
      }

      // Check if connection already exists
      const existing = await getConnectionByProviderAndBuyer(userId, buyerId);
      if (existing) {
        return NextResponse.json({ error: "Connection already exists with this business" }, { status: 400 });
      }

      // Verify buyer exists
      const buyer = await getUserById(buyerId);
      if (!buyer || buyer.role !== "buyer") {
        return NextResponse.json({ error: "Business not found" }, { status: 404 });
      }

      const connection = await createConnection({
        provider_id: userId,
        buyer_id: buyerId,
        initiator: "provider",
        message,
        status: "pending_buyer_review",
      });

      return NextResponse.json({ success: true, connection });
    } else if (role === "buyer") {
      // Buyer sends invitation to provider with terms
      const { providerEmail, terms, message } = body;

      if (!providerEmail) {
        return NextResponse.json({ error: "providerEmail is required" }, { status: 400 });
      }

      // Find provider by email
      const provider = await getUserByEmail(providerEmail);
      if (!provider || provider.role !== "provider") {
        return NextResponse.json({ error: "Provider not found" }, { status: 404 });
      }

      // Check if connection already exists
      const existing = await getConnectionByProviderAndBuyer(provider.id, userId);
      if (existing) {
        return NextResponse.json({ error: "Connection already exists with this provider" }, { status: 400 });
      }

      const connection = await createConnection({
        provider_id: provider.id,
        buyer_id: userId,
        initiator: "buyer",
        message,
        status: "pending_provider_accept",
        rate_per_lead: terms?.ratePerLead || 50,
        payment_timing: terms?.paymentTiming || "per_lead",
        weekly_lead_cap: terms?.weeklyLeadCap,
        monthly_lead_cap: terms?.monthlyLeadCap,
        termination_notice_days: terms?.terminationNoticeDays || 7,
      });

      return NextResponse.json({ success: true, connection });
    }

    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  } catch (error) {
    console.error("[CONNECTIONS] POST error:", error);
    return NextResponse.json({ error: "Failed to create connection" }, { status: 500 });
  }
}
