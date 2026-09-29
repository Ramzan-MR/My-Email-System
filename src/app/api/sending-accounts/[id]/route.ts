import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const updateSchema = z.object({
  isActive: z.boolean().optional(),
  dailyLimit: z.number().int().min(1).max(500).optional(),
  displayName: z.string().trim().max(150).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const account = await prisma.sendingAccount.update({
    where: { id: params.id },
    data: parsed.data,
    select: {
      id: true,
      email: true,
      provider: true,
      displayName: true,
      dailyLimit: true,
      isActive: true,
      lastSyncAt: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: { action: "sending_account.updated", entityType: "SendingAccount", entityId: account.id },
  });

  return NextResponse.json({ account });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.sendingAccount.delete({ where: { id: params.id } });
  await prisma.auditLog.create({
    data: { action: "sending_account.disconnected", entityType: "SendingAccount", entityId: params.id },
  });
  return NextResponse.json({ ok: true });
}
