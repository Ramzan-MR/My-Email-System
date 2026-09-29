import { describe, it, expect } from "vitest";
import { LEAD_STATUS_FOR_CLASSIFICATION, shouldCancelFollowUps, TERMINAL_CLASSIFICATIONS } from "./classification-mapping";
import { REPLY_CLASSIFICATION_LABELS } from "@/lib/ai/provider";

describe("classification mapping", () => {
  it("has a lead status mapped for every possible classification", () => {
    for (const label of REPLY_CLASSIFICATION_LABELS) {
      expect(LEAD_STATUS_FOR_CLASSIFICATION[label]).toBeTruthy();
    }
  });

  // Test 2 (agent-level): only AUTO_REPLY leaves follow-ups scheduled.
  it("cancels follow-ups for every classification except AUTO_REPLY", () => {
    for (const label of REPLY_CLASSIFICATION_LABELS) {
      expect(shouldCancelFollowUps(label)).toBe(label !== "AUTO_REPLY");
    }
  });

  it("treats bounce and unsubscribe as terminal", () => {
    expect(TERMINAL_CLASSIFICATIONS).toContain("BOUNCE");
    expect(TERMINAL_CLASSIFICATIONS).toContain("UNSUBSCRIBE");
    expect(TERMINAL_CLASSIFICATIONS).toContain("NOT_INTERESTED");
  });
});
