import { prisma } from "@/lib/db";

/**
 * Wraps a background job with JobExecution bookkeeping. Duplicate sends are
 * prevented at the EmailMessage.idempotencyKey level (see lib/email/safety.ts),
 * not by locking here — a job is always safe to run again mid-flight.
 */
export async function runJob<T>(jobName: string, fn: () => Promise<T>): Promise<T> {
  const execution = await prisma.jobExecution.create({
    data: { jobName, status: "RUNNING" },
  });

  try {
    const result = await fn();
    await prisma.jobExecution.update({
      where: { id: execution.id },
      data: { status: "SUCCESS", finishedAt: new Date() },
    });
    return result;
  } catch (err) {
    await prisma.jobExecution.update({
      where: { id: execution.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
