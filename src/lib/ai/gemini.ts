import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  AIProvider,
  ClassifyReplyInput,
  ClassifyReplyResult,
  GenerateFollowUpInput,
  GenerateFollowUpResult,
  GeneratePersonalizationInput,
  ReplyClassificationLabel,
  SummarizeReplyInput,
} from "./provider";
import { REPLY_CLASSIFICATION_LABELS } from "./provider";

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

function getModel() {
  const client = getClient();
  if (!client) return null;
  return client.getGenerativeModel({ model: "gemini-1.5-flash" });
}

/** Strips markdown code fences Gemini sometimes wraps JSON in. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

export class GeminiProvider implements AIProvider {
  async classifyReply(input: ClassifyReplyInput): Promise<ClassifyReplyResult> {
    const model = getModel();
    if (!model) {
      // No API key configured — fail safe to human review rather than
      // guessing, so a reply is never silently mis-routed.
      return {
        classification: "NEEDS_HUMAN_REVIEW",
        isAutoReply: false,
        autoReplyReturnDate: null,
        confidence: 0,
      };
    }

    const prompt = `You are classifying an email reply received in response to a cold outreach email.
Return ONLY a JSON object, no prose, matching this shape:
{"classification": one of ${JSON.stringify(REPLY_CLASSIFICATION_LABELS)}, "isAutoReply": boolean, "autoReplyReturnDate": string|null (ISO 8601 date if the message states a return date, else null), "confidence": number between 0 and 1}

Rules:
- Out-of-office / vacation responder / automatic reply / away-from-office / mailbox-unavailable messages => classification "AUTO_REPLY", isAutoReply true.
- Delivery failure / bounce notifications => classification "BOUNCE".
- A request to stop emailing / remove from list => "UNSUBSCRIBE".
- Genuine interest, wanting to learn more, or a meeting request => "INTERESTED", "MEETING_REQUEST", or "POSITIVE_REPLY" as appropriate.
- If truly ambiguous, use "NEEDS_HUMAN_REVIEW".

From: ${input.fromEmail}
Subject: ${input.subject}
Body:
"""
${input.bodyText.slice(0, 6000)}
"""`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = JSON.parse(extractJson(text));
      const classification: ReplyClassificationLabel =
        REPLY_CLASSIFICATION_LABELS.includes(parsed.classification)
          ? parsed.classification
          : "NEEDS_HUMAN_REVIEW";
      return {
        classification,
        isAutoReply: Boolean(parsed.isAutoReply),
        autoReplyReturnDate: parsed.autoReplyReturnDate ?? null,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      };
    } catch (err) {
      console.error("[gemini] classifyReply failed, falling back to human review", err);
      return {
        classification: "NEEDS_HUMAN_REVIEW",
        isAutoReply: false,
        autoReplyReturnDate: null,
        confidence: 0,
      };
    }
  }

  async summarizeReply(input: SummarizeReplyInput): Promise<string> {
    const model = getModel();
    if (!model) return input.bodyText.slice(0, 200);

    try {
      const result = await model.generateContent(
        `Summarize this email reply in one concise sentence for a sales rep skimming a list. No preamble.\n\n"""${input.bodyText.slice(0, 6000)}"""`
      );
      return result.response.text().trim();
    } catch (err) {
      console.error("[gemini] summarizeReply failed", err);
      return input.bodyText.slice(0, 200);
    }
  }

  async generatePersonalization(input: GeneratePersonalizationInput): Promise<string> {
    const model = getModel();
    const { lead } = input;
    if (!model) return "";

    try {
      const result = await model.generateContent(
        `Write ONE short, natural personalized opening line (max 20 words, no greeting, no sign-off) for a cold outreach email to:
Name: ${[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "unknown"}
Company: ${lead.company ?? "unknown"}
Title: ${lead.jobTitle ?? "unknown"}
Website: ${lead.website ?? "unknown"}
${input.instructions ? `Extra instructions: ${input.instructions}` : ""}
Return only the sentence, no quotes.`
      );
      return result.response.text().trim();
    } catch (err) {
      console.error("[gemini] generatePersonalization failed", err);
      return "";
    }
  }

  async generateFollowUp(input: GenerateFollowUpInput): Promise<GenerateFollowUpResult> {
    const model = getModel();
    const fallbackSubject = `Re: ${input.previousSubject}`;
    const fallbackBody = `Hi ${input.lead.firstName ?? "there"},\n\nJust wanted to bump this to the top of your inbox in case you missed it. Happy to answer any questions.\n\nBest,`;

    if (!model) {
      return { subject: fallbackSubject, body: fallbackBody };
    }

    const history = input.threadHistory
      .map((m) => `From: ${m.from}\n${m.body}`)
      .join("\n---\n");

    try {
      const result = await model.generateContent(
        `Draft follow-up #${input.followUpNumber} in an existing cold outreach email thread. Keep it short (under 80 words), friendly, and reference the prior email without repeating it verbatim. No subject line changes needed (the thread keeps the original subject). ${input.instructions ? `Extra instructions: ${input.instructions}` : ""}

Lead: ${input.lead.firstName ?? "there"} at ${input.lead.company ?? "their company"}

Thread so far:
${history}

Return ONLY a JSON object: {"subject": string, "body": string}`
      );
      const text = result.response.text();
      const parsed = JSON.parse(extractJson(text));
      return {
        subject: parsed.subject || fallbackSubject,
        body: parsed.body || fallbackBody,
      };
    } catch (err) {
      console.error("[gemini] generateFollowUp failed", err);
      return { subject: fallbackSubject, body: fallbackBody };
    }
  }
}
