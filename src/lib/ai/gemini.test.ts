import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GeminiProvider } from "./gemini";

describe("GeminiProvider without an API key configured", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  });

  // Test 10: Failed AI classification does not lose the reply — the caller
  // always gets a usable result to persist (routed to human review) instead
  // of a thrown error that would leave the Reply row stuck unprocessed.
  it("classifyReply fails safe to NEEDS_HUMAN_REVIEW instead of throwing", async () => {
    const provider = new GeminiProvider();
    const result = await provider.classifyReply({
      subject: "Re: hello",
      bodyText: "Not sure what this is about.",
      fromEmail: "someone@example.com",
    });
    expect(result.classification).toBe("NEEDS_HUMAN_REVIEW");
    expect(result.confidence).toBe(0);
  });

  it("generateFollowUp falls back to a safe bump message instead of throwing", async () => {
    const provider = new GeminiProvider();
    const result = await provider.generateFollowUp({
      lead: { firstName: "Jane", company: "Acme" },
      previousSubject: "Quick question",
      previousBody: "...",
      threadHistory: [],
      followUpNumber: 1,
    });
    expect(result.subject).toContain("Quick question");
    expect(result.body.length).toBeGreaterThan(0);
  });
});
