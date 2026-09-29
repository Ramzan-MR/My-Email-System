import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { leadInputSchema } from "@/lib/validation/lead";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = leadInputSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const lead = await prisma.lead.update({
    where: { id: params.id },
    data: parsed.data,
  });

  await prisma.auditLog.create({
    data: { action: "lead.updated", entityType: "Lead", entityId: lead.id, leadId: lead.id },
  });

  return NextResponse.json({ lead });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.lead.delete({ where: { id: params.id } });

  await prisma.auditLog.create({
    data: { action: "lead.deleted", entityType: "Lead", entityId: params.id },
  });

  return NextResponse.json({ ok: true });
}
