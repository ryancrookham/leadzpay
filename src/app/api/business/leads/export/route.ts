import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { executeSql as sql } from "@/lib/db";
import ExcelJS from "exceljs";

/**
 * GET /api/business/leads/export?since=YYYY-MM-DD&until=YYYY-MM-DD
 *
 * Streams an Options-tracker-shaped .xlsx of the business's leads.
 *
 * Column set matches Options's monthly Excel tracker so their staff can
 * either import directly OR paste rows into their existing workbook.
 * Columns WOML KNOWS get filled; agency-only columns (DWN PMT, PAY TYPE,
 * DATE SOLD, SOLD BY, DWP, CO, TDS, TD COMPLETE, QUALIFY, UPLOADED, etc.)
 * are left blank so agency staff can complete them at sale-time.
 *
 * Each row = one submitted lead (regardless of pipeline stage).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if ((session.user as { role?: string }).role !== "buyer") {
    return NextResponse.json({ error: "Only businesses can export their leads" }, { status: 403 });
  }
  const buyerId = session.user.id;

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since"); // YYYY-MM-DD, inclusive
  const until = searchParams.get("until"); // YYYY-MM-DD, inclusive

  // Pull leads + provider details + criteria field data + scanned data
  // Filter by date range if provided.
  const rows = await sql`
    SELECT
      l.id                            AS lead_id,
      l.submitted_at,
      l.criteria_fields_data,
      l.scanned_data,
      l.status                        AS lead_status,
      l.payout_amount,
      l.notes                         AS lead_notes,
      provider.display_name           AS provider_display_name,
      provider.business_name          AS provider_business_name,
      provider.location               AS provider_location
    FROM leads l
    LEFT JOIN users provider ON provider.id = l.provider_id
    WHERE l.buyer_id = ${buyerId}
      ${since ? sql`AND l.submitted_at >= ${since}::date` : sql``}
      ${until ? sql`AND l.submitted_at < (${until}::date + INTERVAL '1 day')` : sql``}
    ORDER BY l.submitted_at ASC
  `;

  // Build the workbook — one sheet per month for parity with Options's habit
  const wb = new ExcelJS.Workbook();
  wb.creator = "WOML Lead Tracker";
  wb.created = new Date();

  // Group leads by month
  const byMonth = new Map<string, typeof rows>();
  for (const r of rows) {
    const dt = new Date(r.submitted_at);
    const key = `${dt.toLocaleString("en-US", { month: "long" })} ${dt.getFullYear()}`;
    if (!byMonth.has(key)) byMonth.set(key, [] as typeof rows);
    byMonth.get(key)!.push(r);
  }

  // If no leads at all, still create an empty January-of-current-year sheet
  if (byMonth.size === 0) {
    const currentYear = new Date().getFullYear();
    byMonth.set(`January ${currentYear}`, [] as typeof rows);
  }

  for (const [monthLabel, monthRows] of byMonth) {
    const ws = wb.addWorksheet(monthLabel);

    // Header row — mirrors Options's tracker structure
    ws.columns = [
      { header: "DATE",                 key: "date",                   width: 12 },
      { header: "Insured/Prospect",     key: "insuredProspect",        width: 26 },
      { header: "Dealership-Salesman",  key: "dealershipSalesman",     width: 22 },
      { header: "QTD BY",               key: "qtdBy",                  width: 10 },   // blank — agency-filled
      { header: "DATE SOLD",            key: "dateSold",               width: 12 },   // blank
      { header: "SOLD BY",              key: "soldBy",                 width: 10 },   // blank
      { header: "UNITS",                key: "units",                  width: 6 },    // blank
      { header: "P/U",                  key: "pu",                     width: 8 },    // blank
      { header: "TDS",                  key: "tds",                    width: 8 },    // blank
      { header: "80",                   key: "eighty",                 width: 6 },    // blank
      { header: "DWN PMT",              key: "dwnPmt",                 width: 10 },   // blank
      { header: "PAY TYPE",             key: "payType",                width: 8 },    // blank
      { header: "DEP",                  key: "dep",                    width: 6 },    // blank
      { header: "DWP",                  key: "dwp",                    width: 10 },   // blank
      { header: "CO",                   key: "co",                     width: 6 },    // blank
      { header: "NOTES",                key: "notes",                  width: 40 },
      { header: "TD COMPLETE",          key: "tdComplete",             width: 12 },   // blank
      { header: "QUALIFY",              key: "qualify",                width: 10 },   // blank
      { header: "UPLOADED",             key: "uploaded",               width: 10 },   // blank
      // --- WOML-added columns (extra context Options's sheet doesn't have) ---
      { header: "DOB",                  key: "dob",                    width: 12 },
      { header: "ADDRESS",              key: "address",                width: 36 },
      { header: "DL #",                 key: "dlNumber",               width: 18 },
      { header: "DL STATE",             key: "dlState",                width: 8 },
      { header: "VIN",                  key: "vin",                    width: 20 },
      { header: "CUSTOMER PHONE",       key: "customerPhone",          width: 16 },
      { header: "CUSTOMER EMAIL",       key: "customerEmail",          width: 26 },
      { header: "LEAD SOURCE",          key: "leadSource",             width: 20 },
      { header: "MARITAL",              key: "marital",                width: 12 },
      { header: "COVERAGE",             key: "coverage",               width: 14 },
      { header: "INCIDENTS (5yr)",      key: "incidents",              width: 12 },
      { header: "WOML LEAD ID",         key: "womlLeadId",             width: 40 },
    ];

    // Style header row
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    ws.getRow(1).height = 24;
    ws.views = [{ state: "frozen", ySplit: 1 }];

    // Body rows
    for (const r of monthRows) {
      const fields = (r.criteria_fields_data as Record<string, string> | null) || {};
      const scanned = (r.scanned_data as {
        dl?: {
          firstName?: string; middleName?: string; lastName?: string;
          dateOfBirth?: string; street?: string; city?: string; state?: string; zip?: string;
          licenseNumber?: string;
        };
        vin?: { vin?: string };
      } | null) || {};

      const dl = scanned.dl || {};
      const fullName = [dl.firstName, dl.middleName, dl.lastName].filter(Boolean).join(" ") || fields["Name"] || fields["Full Name"] || fields["Customer Name"] || "";
      const address = [dl.street, dl.city, dl.state, dl.zip].filter(Boolean).join(", ");

      ws.addRow({
        date: new Date(r.submitted_at),
        insuredProspect: fullName,
        dealershipSalesman: r.provider_business_name || r.provider_display_name || "",
        qtdBy: "", dateSold: "", soldBy: "", units: "", pu: "", tds: "", eighty: "",
        dwnPmt: "", payType: "", dep: "", dwp: "", co: "",
        notes: r.lead_notes || "",
        tdComplete: "", qualify: "", uploaded: "",
        // WOML extras:
        dob: dl.dateOfBirth || "",
        address,
        dlNumber: dl.licenseNumber || "",
        dlState: dl.state || "",
        vin: scanned.vin?.vin || fields["VIN"] || "",
        customerPhone: fields["Phone"] || fields["Customer Phone"] || "",
        customerEmail: fields["Email"] || fields["Customer Email"] || "",
        leadSource: r.provider_location || "",
        marital: fields["Marital Status"] || fields["Marital"] || "",
        coverage: fields["Coverage Type"] || fields["Coverage"] || "",
        incidents: fields["Any accidents in last 5 years?"] || fields["Incidents (5yr)"] || fields["Incidents"] || "",
        womlLeadId: r.lead_id,
      });
    }

    // Format DATE column
    ws.getColumn("date").numFmt = "m/d/yyyy";
  }

  // Stream buffer
  const buffer = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="WOML_Leads_Export_${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
