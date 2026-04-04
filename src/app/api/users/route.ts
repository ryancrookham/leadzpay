import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConnectionsByUserId, getUsersByIds } from "@/lib/db";

// GET /api/users?role=buyer|provider - Connection-scoped discovery
// Providers only see buyers they are connected to; buyers only see their connected providers
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

    // Only return users this account is connected to
    const myConnections = await getConnectionsByUserId(userId, userRole);
    const connectedIds = myConnections.map((c) =>
      userRole === "provider" ? c.buyer_id : c.provider_id
    );

    if (connectedIds.length === 0) {
      return NextResponse.json({ users: [] });
    }

    const users = await getUsersByIds(connectedIds);

    const connectedUserIds = new Set(connectedIds);

    // Return public info and connection status
    const sanitizedUsers = users.map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
      businessName: user.business_name,
      location: user.location,
      licensedStates: user.licensed_states,
      email: user.email,
      phone: user.phone,
      profilePictureUrl: user.profile_picture_url,
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
