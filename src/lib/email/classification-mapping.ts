import type { ReplyClassificationLabel } from "@/lib/ai/provider";

// Maps an AI/header reply classification to the CampaignLead status it
// should drive. Shared by the manual review route (/api/replies/[id]) and
// the automated classifyReplies() job so both apply the exact same rule —
// see CLAUDE.md "IMPORTANT: Never send another follow-up when a real reply
// has been received."
export const LEAD_STATUS_FOR_CLASSIFICATION: Record<ReplyClassificationLabel, string> = {
  INTERESTED: "INTERESTED",
  POSITIVE_REPLY: "REPLIED",
  MEETING_REQUEST: "INTERESTED",
  NEEDS_MORE_INFO: "REPLIED",
  NEUTRAL: "REPLIED",
  NOT_INTERESTED: "NOT_INTERESTED",
  UNSUBSCRIBE: "UNSUBSCRIBED",
  AUTO_REPLY: "AUTO_REPLY",
  BOUNCE: "BOUNCED",
  WRONG_PERSON: "NEEDS_HUMAN_REVIEW",
  REFERRAL: "NEEDS_HUMAN_REVIEW",
  OTHER: "REPLIED",
  NEEDS_HUMAN_REVIEW: "NEEDS_HUMAN_REVIEW",
};

/** Classifications that must never be silently overridden by a later auto-reply/no-reply cycle. */
export const TERMINAL_CLASSIFICATIONS: ReplyClassificationLabel[] = [
  "UNSUBSCRIBE",
  "BOUNCE",
  "NOT_INTERESTED",
];

/** Only AUTO_REPLY leaves future follow-ups scheduled; every other classification cancels them. */
export function shouldCancelFollowUps(classification: ReplyClassificationLabel): boolean {
  return classification !== "AUTO_REPLY";
}
