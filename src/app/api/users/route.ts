import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUsersByRole, getConnectionsByUserId } from "@/lib/db";

// GET /api/users?role=buyer|provider - Discovery endpoint
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role") as "provider" | "buyer" | null;

    if (!role || (role !== "provider" && role !== "buyer")) {
      return NextResponse.json({ error: "role parameter required (provider or buyer)" }, { status: 400 });
    }

    const userId = session.user.id;
    const userRole = (session.user as any).role as "provider" | "buyer";

    // Get users of the specified role (excluding self)
    const users = await getUsersByRole(role, userId);

    // Get existing connections to mark users as "already connected"
    const myConnections = await getConnectionsByUserId(userId, userRole);
    const connectedUserIds = new Set(
      myConnections.map((c) => (userRole === "provider" ? c.buyer_id : c.provider_id))
    );

    // Filter to only return public info and connection status
    const sanitizedUsers = users.map((user) => ({
      id: user.id,
      displayName: user.display_name || user.username,
      businessName: user.business_name,
      location: user.location,
      licensedStates: user.licensed_states,
      email: user.email,
      isConnected: connectedUserIds.has(user.id),
      connectionStatus: myConnections.find(
        (c) => (userRole === "provider" ? c.buyer_id : c.provider_id) === user.id
      )?.status,
    }));

    return NextResponse.json({ users: sanitizedUsers });
  } catch (error) {
    console.error("[USERS] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
