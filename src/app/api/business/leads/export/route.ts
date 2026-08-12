import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { executeSql as sql } from "@/lib/db";
import ExcelJS from "exceljs";

/**
 * GET /api/business/leads/export
 *
 * Streams an Options-tracker-shaped .xlsx of the business's leads.
 *
 * Column set matches Options's monthly tracker so their staff can paste
 * rows into their existing workbook. Columns WOML KNOWS get filled;
 * agency-only columns (DWN PMT, PAY TYPE, DATE SOLD, SOLD BY, DWP, CO,
 * TDS, TD COMPLETE, QUALIFY, UPLOADED, etc.) are left blank so agency
 * staff can complete them at sale-time.
 *
 * Each row = one submitted lead (regardless of pipeline stage).
 */
export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if ((session.user as { role?: string }).role !== "buyer") {
    return NextResponse.json({ error: "Only businesses can export their leads" }, { status: 403 });
  }
  const buyerId = session.user.id;

  const rows = await sql`
    SELECT
      l.id                     AS lead_id,
      l.submitted_at,
      l.criteria_fields_data,
      l.scanned_data,
      l.status                 AS lead_status,
      l.pipeline_status,
      l.pipeline_notes,
      l.sold_at,
      l.contacted_at,
      l.quoted_at,
      l.assigned_to,
      l.payout_amount,
      l.vehicle_year,
      l.vehicle_make,
      l.vehicle_model,
      provider.display_name    AS provider_display_name,
      provider.business_name   AS provider_business_name,
      provider.location        AS provider_location
    FROM leads l
    LEFT JOIN users provider ON provider.id = l.provider_id
    WHERE l.buyer_id = ${buyerId}
    ORDER BY l.submitted_at ASC
  `;

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

  // Always create at least one sheet so the file isn't empty
  if (byMonth.size === 0) {
    const now = new Date();
    const label = `${now.toLocaleString("en-US", { month: "long" })} ${now.getFullYear()}`;
    byMonth.set(label, [] as typeof rows);
  }

  for (const [monthLabel, monthRows] of byMonth) {
    const ws = wb.addWorksheet(monthLabel);

    // Header row — mirrors Options's tracker structure
    ws.columns = [
      { header: "DATE",                 key: "date",                width: 12 },
      { header: "Insured/Prospect",     key: "insuredProspect",     width: 26 },
      { header: "Dealership",           key: "dealership",          width: 22 },
      { header: "Salesman (Provider)",  key: "salesman",            width: 22 },
      { header: "QTD BY",               key: "qtdBy",               width: 10 },
      { header: "DATE SOLD",            key: "dateSold",            width: 12 },
      { header: "SOLD BY",              key: "soldBy",              width: 10 },
      { header: "UNITS",                key: "units",               width: 6 },
      { header: "P/U",                  key: "pu",                  width: 8 },
      { header: "TDS",                  key: "tds",                 width: 8 },
      { header: "80",                   key: "eighty",              width: 6 },
      { header: "DWN PMT",              key: "dwnPmt",              width: 10 },
      { header: "PAY TYPE",             key: "payType",             width: 8 },
      { header: "DEP",                  key: "dep",                 width: 6 },
      { header: "DWP",                  key: "dwp",                 width: 10 },
      { header: "CO",                   key: "co",                  width: 6 },
      { header: "NOTES",                key: "notes",               width: 40 },
      { header: "TD COMPLETE",          key: "tdComplete",          width: 12 },
      { header: "QUALIFY",              key: "qualify",             width: 10 },
      { header: "UPLOADED",             key: "uploaded",            width: 10 },
      // --- WOML extras (context Options's sheet doesn't have) ---
      { header: "DOB",                  key: "dob",                 width: 12 },
      { header: "ADDRESS",              key: "address",             width: 36 },
      { header: "DL #",                 key: "dlNumber",            width: 18 },
      { header: "DL STATE",             key: "dlState",             width: 8 },
      { header: "VIN",                  key: "vin",                 width: 20 },
      { header: "VEHICLE",              key: "vehicle",             width: 24 },
      { header: "CUSTOMER PHONE",       key: "customerPhone",       width: 16 },
      { header: "CUSTOMER EMAIL",       key: "customerEmail",       width: 26 },
      { header: "LEAD SOURCE",          key: "leadSource",          width: 20 },
      { header: "MARITAL",              key: "marital",             width: 12 },
      { header: "COVERAGE",             key: "coverage",            width: 14 },
      { header: "INCIDENTS (5yr)",      key: "incidents",           width: 14 },
      { header: "PIPELINE STAGE",       key: "pipelineStage",       width: 12 },
      { header: "WOML LEAD ID",         key: "womlLeadId",          width: 40 },
    ];

    // Style header row
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    ws.getRow(1).height = 24;
    ws.views = [{ state: "frozen", ySplit: 1 }];

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

      // Prospect / customer name: PER-LEAD. Scanned DL wins; else criteria-typed name.
      const fullName = [dl.firstName, dl.middleName, dl.lastName].filter(Boolean).join(" ")
        || fields["Prospect"] || fields["Prospect Name"]
        || fields["Customer Name"] || fields["Customer"]
        || fields["Full Name"] || fields["Name"] || "";

      // Dealership + Salesman: captured ONCE at provider signup via invite link.
      // provider.business_name = the dealership/tag-shop the salesman represents.
      // provider.display_name  = the salesman's actual name.
      // Each lead inherits both because 1 WOML provider account = 1 salesman.
      const dealership = r.provider_business_name || "";
      const salesman = r.provider_display_name || "";

      const address = [dl.street, dl.city, dl.state, dl.zip].filter(Boolean).join(", ");
      const vehicle = [r.vehicle_year, r.vehicle_make, r.vehicle_model].filter(Boolean).join(" ");

      // Any notes field the business may have collected
      const noteChunks: string[] = [];
      if (r.pipeline_notes) noteChunks.push(String(r.pipeline_notes));
      if (fields["Notes"]) noteChunks.push(String(fields["Notes"]));

      ws.addRow({
        date: new Date(r.submitted_at),
        insuredProspect: fullName,
        dealership,
        salesman,
        qtdBy: "", dateSold: r.sold_at ? new Date(r.sold_at) : "", soldBy: r.assigned_to || "",
        units: "", pu: "", tds: "", eighty: "",
        dwnPmt: "", payType: "", dep: "", dwp: "", co: "",
        notes: noteChunks.join(" | "),
        tdComplete: "", qualify: "", uploaded: "",
        dob: dl.dateOfBirth || "",
        address,
        dlNumber: dl.licenseNumber || "",
        dlState: dl.state || "",
        vin: scanned.vin?.vin || fields["VIN"] || "",
        vehicle,
        customerPhone: fields["Phone"] || fields["Customer Phone"] || "",
        customerEmail: fields["Email"] || fields["Customer Email"] || "",
        leadSource: r.provider_location || "",
        marital: fields["Marital Status"] || fields["Marital"] || "",
        coverage: fields["Coverage Type"] || fields["Coverage"] || "",
        incidents: fields["Any accidents in last 5 years?"] || fields["Incidents (5yr)"] || fields["Incidents"] || "",
        pipelineStage: r.pipeline_status || "new",
        womlLeadId: r.lead_id,
      });
    }

    // Format DATE columns
    ws.getColumn("date").numFmt = "m/d/yyyy";
    ws.getColumn("dateSold").numFmt = "m/d/yyyy";
  }

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
