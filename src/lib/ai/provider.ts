// AIProvider abstraction. Every place in the app that needs an AI capability
// (reply classification, summarization, personalization, follow-up drafting)
// should depend on this interface, not on a specific vendor SDK. This keeps
// the app free to switch AI_PROVIDER (see lib/ai/index.ts) without touching
// callers.

export type ReplyClassificationLabel =
  | "INTERESTED"
  | "POSITIVE_REPLY"
  | "MEETING_REQUEST"
  | "NEEDS_MORE_INFO"
  | "NEUTRAL"
  | "NOT_INTERESTED"
  | "UNSUBSCRIBE"
  | "AUTO_REPLY"
  | "BOUNCE"
  | "WRONG_PERSON"
  | "REFERRAL"
  | "OTHER"
  | "NEEDS_HUMAN_REVIEW";

export interface ClassifyReplyInput {
  subject: string;
  bodyText: string;
  fromEmail: string;
  /** Prior thread context, most recent last. */
  threadHistory?: { from: string; body: string }[];
}

export interface ClassifyReplyResult {
  classification: ReplyClassificationLabel;
  isAutoReply: boolean;
  /** ISO date if an out-of-office message states a return date. */
  autoReplyReturnDate?: string | null;
  confidence: number;
}

export interface SummarizeReplyInput {
  bodyText: string;
}

export interface GeneratePersonalizationInput {
  lead: {
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    website?: string | null;
    jobTitle?: string | null;
  };
  /** Instruction describing what the personalized line should accomplish. */
  instructions?: string;
}

export interface GenerateFollowUpInput {
  lead: {
    firstName?: string | null;
    company?: string | null;
  };
  previousSubject: string;
  previousBody: string;
  /** Full thread so far, oldest first. */
  threadHistory: { from: string; body: string }[];
  followUpNumber: number;
  instructions?: string;
}

export interface GenerateFollowUpResult {
  subject: string;
  body: string;
}

export interface AIProvider {
  classifyReply(input: ClassifyReplyInput): Promise<ClassifyReplyResult>;
  summarizeReply(input: SummarizeReplyInput): Promise<string>;
  generatePersonalization(input: GeneratePersonalizationInput): Promise<string>;
  generateFollowUp(input: GenerateFollowUpInput): Promise<GenerateFollowUpResult>;
}

export const REPLY_CLASSIFICATION_LABELS: ReplyClassificationLabel[] = [
  "INTERESTED",
  "POSITIVE_REPLY",
  "MEETING_REQUEST",
  "NEEDS_MORE_INFO",
  "NEUTRAL",
  "NOT_INTERESTED",
  "UNSUBSCRIBE",
  "AUTO_REPLY",
  "BOUNCE",
  "WRONG_PERSON",
  "REFERRAL",
  "OTHER",
  "NEEDS_HUMAN_REVIEW",
];
