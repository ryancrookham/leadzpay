import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAutoPaySettings, updateAutoPaySettings } from "@/lib/db";

const VALID_SCHEDULES = ["instant", "weekly", "biweekly", "monthly"] as const;

function calculateNextAutoPayDate(schedule: string): Date {
  const now = new Date();
  const next = new Date(now);

  switch (schedule) {
    case "instant":
      // Set to right now so the cron fires on its very next run
      return now;
    case "weekly":
      next.setDate(now.getDate() + 7);
      break;
    case "biweekly":
      next.setDate(now.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(now.getMonth() + 1);
      break;
    default:
      next.setDate(now.getDate() + 14);
  }

  // Set to 10am UTC (matches cron schedule)
  next.setUTCHours(10, 0, 0, 0);
  return next;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can access auto-pay settings" }, { status: 403 });
    }

    const settings = await getAutoPaySettings(session.user.id);

    return NextResponse.json({
      success: true,
      settings: {
        autoPayEnabled: settings.auto_pay_enabled,
        autoPaySchedule: settings.auto_pay_schedule,
        reviewWindowDays: settings.review_window_days,
        nextAutoPayDate: settings.next_auto_pay_date,
      },
    });
  } catch (error: any) {
    console.error("[auto-pay-settings] GET error:", error?.message);
    return NextResponse.json({ error: error?.message || "Failed to load settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can update auto-pay settings" }, { status: 403 });
    }

    const body = await request.json();
    const { autoPayEnabled, autoPaySchedule, reviewWindowDays } = body;

    if (typeof autoPayEnabled !== "boolean") {
      return NextResponse.json({ error: "autoPayEnabled must be a boolean" }, { status: 400 });
    }

    if (autoPayEnabled) {
      if (!VALID_SCHEDULES.includes(autoPaySchedule)) {
        return NextResponse.json({ error: `autoPaySchedule must be one of: ${VALID_SCHEDULES.join(", ")}` }, { status: 400 });
      }

      if (typeof reviewWindowDays !== "number" || reviewWindowDays < 0 || reviewWindowDays > 14) {
        return NextResponse.json({ error: "reviewWindowDays must be between 0 and 14" }, { status: 400 });
      }
    }

    const nextDate = autoPayEnabled ? calculateNextAutoPayDate(autoPaySchedule) : null;

    await updateAutoPaySettings(session.user.id, {
      auto_pay_enabled: autoPayEnabled,
      auto_pay_schedule: autoPayEnabled ? autoPaySchedule : "biweekly",
      review_window_days: autoPayEnabled ? reviewWindowDays : 3,
      next_auto_pay_date: nextDate,
    });

    return NextResponse.json({
      success: true,
      settings: {
        autoPayEnabled,
        autoPaySchedule: autoPayEnabled ? autoPaySchedule : "biweekly",
        reviewWindowDays: autoPayEnabled ? reviewWindowDays : 3,
        nextAutoPayDate: nextDate?.toISOString() || null,
      },
    });
  } catch (error: any) {
    console.error("[auto-pay-settings] PUT error:", error?.message);
    return NextResponse.json({ error: error?.message || "Failed to update settings" }, { status: 500 });
  }
}
