// Central "may we send this email?" gate. Every send path (initial outreach,
// follow-up) must call this before dispatching through Gmail. See CLAUDE.md
// "Email Safety Rules" — this function is the single place those rules are
// enforced so they can't drift between the Outreach and Follow-Up agents.

export type MinimalCampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED";
export type MinimalLeadStatus =
  | "PENDING"
  | "READY"
  | "QUEUED"
  | "SENT"
  | "FOLLOWUP_DUE"
  | "REPLIED"
  | "AUTO_REPLY"
  | "BOUNCED"
  | "UNSUBSCRIBED"
  | "PAUSED"
  | "INTERESTED"
  | "NOT_INTERESTED"
  | "NEEDS_HUMAN_REVIEW"
  | "COMPLETED";

export interface SendEligibilityInput {
  campaignStatus: MinimalCampaignStatus;
  campaignLeadApproved: boolean;
  leadStatus: MinimalLeadStatus;
  isSuppressed: boolean;
  sendingAccountActive: boolean;
  sendingAccountSentToday: number;
  sendingAccountDailyLimit: number;
  /** True if an EmailMessage row already exists for this exact send's idempotency key. */
  alreadyRecorded: boolean;
}

export interface SendEligibilityResult {
  allowed: boolean;
  reason?: string;
}

// Statuses that mean "do not contact this lead again automatically."
const BLOCKING_LEAD_STATUSES: MinimalLeadStatus[] = [
  "REPLIED",
  "BOUNCED",
  "UNSUBSCRIBED",
  "PAUSED",
  "INTERESTED",
  "NOT_INTERESTED",
  "NEEDS_HUMAN_REVIEW",
  "COMPLETED",
];

export function canSendEmail(input: SendEligibilityInput): SendEligibilityResult {
  if (input.alreadyRecorded) {
    return { allowed: false, reason: "Email already sent/queued (idempotency check)." };
  }
  if (input.isSuppressed) {
    return { allowed: false, reason: "Recipient is on the suppression list." };
  }
  if (input.campaignStatus !== "ACTIVE") {
    return { allowed: false, reason: `Campaign is not active (status: ${input.campaignStatus}).` };
  }
  if (!input.campaignLeadApproved) {
    return { allowed: false, reason: "Lead has not been approved for sending." };
  }
  if (BLOCKING_LEAD_STATUSES.includes(input.leadStatus)) {
    return { allowed: false, reason: `Lead status "${input.leadStatus}" blocks sending.` };
  }
  if (!input.sendingAccountActive) {
    return { allowed: false, reason: "Sending account is inactive." };
  }
  if (input.sendingAccountSentToday >= input.sendingAccountDailyLimit) {
    return { allowed: false, reason: "Sending account has reached its daily limit." };
  }
  return { allowed: true };
}

/**
 * Deterministic idempotency key for a given send, so retried cron/job runs
 * can never produce two EmailMessage rows (and thus two Gmail sends) for the
 * same logical email.
 */
export function buildIdempotencyKey(params: {
  campaignLeadId: string;
  type: "INITIAL" | "FOLLOW_UP";
  followUpNumber?: number;
}): string {
  if (params.type === "INITIAL") {
    return `${params.campaignLeadId}:INITIAL`;
  }
  return `${params.campaignLeadId}:FOLLOW_UP:${params.followUpNumber ?? 0}`;
}

export function randomDelayMs(minSec: number, maxSec: number): number {
  const min = Math.max(0, minSec);
  const max = Math.max(min, maxSec);
  return (min + Math.random() * (max - min)) * 1000;
}
