import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/db";
import { leadInputSchema } from "@/lib/validation/lead";

// Accepts CSV text with a header row. Recognized columns (case-insensitive,
// flexible naming): firstName/first_name/first name, lastName, email
// (required), company, website, jobTitle/title, linkedinUrl/linkedin,
// phone, customPersonalization/custom, notes.
// Upserts by email so re-importing the same sheet updates rather than
// duplicates rows.

const HEADER_ALIASES: Record<string, string> = {
  firstname: "firstName",
  "first name": "firstName",
  first_name: "firstName",
  lastname: "lastName",
  "last name": "lastName",
  last_name: "lastName",
  email: "email",
  "email address": "email",
  company: "company",
  companyname: "company",
  website: "website",
  jobtitle: "jobTitle",
  "job title": "jobTitle",
  title: "jobTitle",
  linkedinurl: "linkedinUrl",
  linkedin: "linkedinUrl",
  "linkedin url": "linkedinUrl",
  phone: "phone",
  custompersonalization: "customPersonalization",
  custom: "customPersonalization",
  notes: "notes",
};

function normalizeRow(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = HEADER_ALIASES[key.trim().toLowerCase()];
    if (normalizedKey && value != null && String(value).trim() !== "") {
      out[normalizedKey] = String(value).trim();
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  let csvText: string;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    csvText = await file.text();
  } else {
    const body = await req.json().catch(() => null);
    if (!body?.csv || typeof body.csv !== "string") {
      return NextResponse.json({ error: "No CSV content provided." }, { status: 400 });
    }
    csvText = body.csv;
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    return NextResponse.json({ error: "Could not parse CSV.", details: parsed.errors.slice(0, 5) }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const normalized = normalizeRow(parsed.data[i]);
    const validation = leadInputSchema.safeParse(normalized);
    if (!validation.success) {
      skipped++;
      errors.push({ row: i + 2, message: validation.error.issues[0]?.message ?? "Invalid row." });
      continue;
    }

    const existing = await prisma.lead.findUnique({ where: { email: validation.data.email } });
    if (existing) {
      await prisma.lead.update({ where: { id: existing.id }, data: validation.data });
      updated++;
    } else {
      await prisma.lead.create({ data: { ...validation.data, source: "csv" } });
      created++;
    }
  }

  await prisma.auditLog.create({
    data: {
      action: "lead.import",
      metadata: JSON.stringify({ created, updated, skipped }),
    },
  });

  return NextResponse.json({ created, updated, skipped, errors: errors.slice(0, 20) });
}
