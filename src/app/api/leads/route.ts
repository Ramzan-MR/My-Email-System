import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { leadInputSchema } from "@/lib/validation/lead";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  const leads = await prisma.lead.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ leads });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = leadInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.lead.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return NextResponse.json({ error: "A lead with this email already exists." }, { status: 409 });
  }

  const lead = await prisma.lead.create({
    data: {
      ...parsed.data,
      source: "manual",
    },
  });

  await prisma.auditLog.create({
    data: { action: "lead.created", entityType: "Lead", entityId: lead.id, leadId: lead.id },
  });

  return NextResponse.json({ lead }, { status: 201 });
}
