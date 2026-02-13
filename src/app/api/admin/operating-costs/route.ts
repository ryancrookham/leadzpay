import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOperatingCosts, upsertOperatingCost, deleteOperatingCost } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 401 });
    }
    const costs = await getOperatingCosts();
    return NextResponse.json({
      success: true,
      costs: costs.map(c => ({ ...c, amount: Number(c.amount) })),
    });
  } catch (error) {
    console.error("Get operating costs error:", error);
    return NextResponse.json({ error: "Failed to fetch operating costs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 401 });
    }
    const body = await request.json();
    const { name, amount, frequency, category, description } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (typeof amount !== "number" || amount < 0) {
      return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
    }
    if (!['monthly', 'yearly', 'per_transaction'].includes(frequency)) {
      return NextResponse.json({ error: "frequency must be 'monthly', 'yearly', or 'per_transaction'" }, { status: 400 });
    }

    const cost = await upsertOperatingCost({
      name, amount, frequency, category: category || 'general', description,
    });
    return NextResponse.json({ success: true, cost: { ...cost, amount: Number(cost.amount) } });
  } catch (error) {
    console.error("Create operating cost error:", error);
    return NextResponse.json({ error: "Failed to create operating cost" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 401 });
    }
    const body = await request.json();
    const { id, name, amount, frequency, category, description } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (typeof amount !== "number" || amount < 0) {
      return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
    }
    if (!['monthly', 'yearly', 'per_transaction'].includes(frequency)) {
      return NextResponse.json({ error: "frequency must be 'monthly', 'yearly', or 'per_transaction'" }, { status: 400 });
    }

    const cost = await upsertOperatingCost({
      id, name, amount, frequency, category: category || 'general', description,
    });
    return NextResponse.json({ success: true, cost: { ...cost, amount: Number(cost.amount) } });
  } catch (error) {
    console.error("Update operating cost error:", error);
    return NextResponse.json({ error: "Failed to update operating cost" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await deleteOperatingCost(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete operating cost error:", error);
    return NextResponse.json({ error: "Failed to delete operating cost" }, { status: 500 });
  }
}
