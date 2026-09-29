import { describe, it, expect } from "vitest";
import { canSendEmail, buildIdempotencyKey, randomDelayMs } from "./safety";

const BASE = {
  campaignStatus: "ACTIVE" as const,
  campaignLeadApproved: true,
  leadStatus: "READY" as const,
  isSuppressed: false,
  sendingAccountActive: true,
  sendingAccountSentToday: 0,
  sendingAccountDailyLimit: 25,
  alreadyRecorded: false,
};

describe("canSendEmail", () => {
  it("allows a well-formed eligible send", () => {
    expect(canSendEmail(BASE).allowed).toBe(true);
  });

  // Test 1: Initial email is not sent twice.
  it("blocks sending when an EmailMessage already exists for this idempotency key", () => {
    const result = canSendEmail({ ...BASE, alreadyRecorded: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/already sent|idempotency/i);
  });

  // Test 2: Follow-up is not sent after a human reply.
  it.each(["REPLIED", "INTERESTED", "NOT_INTERESTED", "NEEDS_HUMAN_REVIEW", "COMPLETED"] as const)(
    "blocks sending when lead status is %s (a real reply happened)",
    (leadStatus) => {
      expect(canSendEmail({ ...BASE, leadStatus }).allowed).toBe(false);
    }
  );

  it("does NOT block sending purely because of an auto-reply status", () => {
    // AUTO_REPLY must not permanently stop the campaign (CLAUDE.md "Auto
    // Reply Handling") — it's not in the blocking list.
    expect(canSendEmail({ ...BASE, leadStatus: "AUTO_REPLY" }).allowed).toBe(true);
  });

  // Test 4: Bounce prevents future sending.
  it("blocks sending to a bounced lead", () => {
    expect(canSendEmail({ ...BASE, leadStatus: "BOUNCED" }).allowed).toBe(false);
  });

  // Test 5: Unsubscribe prevents future sending.
  it("blocks sending to an unsubscribed lead", () => {
    expect(canSendEmail({ ...BASE, leadStatus: "UNSUBSCRIBED" }).allowed).toBe(false);
  });

  it("blocks sending to a suppressed recipient regardless of lead status", () => {
    expect(canSendEmail({ ...BASE, isSuppressed: true }).allowed).toBe(false);
  });

  it("blocks sending when the campaign is not ACTIVE", () => {
    expect(canSendEmail({ ...BASE, campaignStatus: "PAUSED" }).allowed).toBe(false);
    expect(canSendEmail({ ...BASE, campaignStatus: "DRAFT" }).allowed).toBe(false);
  });

  it("blocks sending when the lead has not been approved", () => {
    expect(canSendEmail({ ...BASE, campaignLeadApproved: false }).allowed).toBe(false);
  });

  it("blocks sending from an inactive sending account", () => {
    expect(canSendEmail({ ...BASE, sendingAccountActive: false }).allowed).toBe(false);
  });

  // Test 8: Multiple sending accounts maintain separate limits.
  it("enforces the sending account's own daily limit independent of other accounts", () => {
    expect(canSendEmail({ ...BASE, sendingAccountSentToday: 25, sendingAccountDailyLimit: 25 }).allowed).toBe(false);
    expect(canSendEmail({ ...BASE, sendingAccountSentToday: 24, sendingAccountDailyLimit: 25 }).allowed).toBe(true);
    // A different account with its own limit is unaffected by the first account's count.
    expect(canSendEmail({ ...BASE, sendingAccountSentToday: 3, sendingAccountDailyLimit: 25 }).allowed).toBe(true);
  });
});

describe("buildIdempotencyKey", () => {
  // Test 6: Wrong cron retry does not duplicate messages.
  it("produces the same key for the same logical send across repeated calls", () => {
    const a = buildIdempotencyKey({ campaignLeadId: "cl_1", type: "INITIAL" });
    const b = buildIdempotencyKey({ campaignLeadId: "cl_1", type: "INITIAL" });
    expect(a).toBe(b);
  });

  it("produces distinct keys for different follow-up numbers on the same lead", () => {
    const fu1 = buildIdempotencyKey({ campaignLeadId: "cl_1", type: "FOLLOW_UP", followUpNumber: 1 });
    const fu2 = buildIdempotencyKey({ campaignLeadId: "cl_1", type: "FOLLOW_UP", followUpNumber: 2 });
    expect(fu1).not.toBe(fu2);
  });

  it("produces distinct keys for different leads", () => {
    const a = buildIdempotencyKey({ campaignLeadId: "cl_1", type: "INITIAL" });
    const b = buildIdempotencyKey({ campaignLeadId: "cl_2", type: "INITIAL" });
    expect(a).not.toBe(b);
  });
});

describe("randomDelayMs", () => {
  it("stays within the configured bounds", () => {
    for (let i = 0; i < 50; i++) {
      const ms = randomDelayMs(1, 5);
      expect(ms).toBeGreaterThanOrEqual(1000);
      expect(ms).toBeLessThanOrEqual(5000);
    }
  });

  it("clamps a max below min up to min", () => {
    expect(randomDelayMs(10, 2)).toBeGreaterThanOrEqual(10000);
  });
});
