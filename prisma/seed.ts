import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const hash = process.env.ADMIN_PASSWORD_HASH;

  if (!email || !hash) {
    console.log(
      "ADMIN_EMAIL / ADMIN_PASSWORD_HASH not set — skipping admin user seed. " +
        "Login will still work via env-based credentials (see lib/auth.ts)."
    );
    return;
  }

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash },
    create: { email, passwordHash: hash, name: "Owner" },
  });

  console.log(`Seeded admin user: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
