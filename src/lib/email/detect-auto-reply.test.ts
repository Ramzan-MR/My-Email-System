import { describe, it, expect } from "vitest";
import { isHeaderAutoReply, isHeaderBounce, extractReturnDate } from "./detect-auto-reply";

describe("isHeaderAutoReply", () => {
  // Test 3: Auto reply is classified separately.
  it("detects Auto-Submitted header", () => {
    expect(isHeaderAutoReply({ "Auto-Submitted": "auto-replied", Subject: "Re: hi" })).toBe(true);
  });

  it("ignores Auto-Submitted: no", () => {
    expect(isHeaderAutoReply({ "Auto-Submitted": "no", Subject: "Re: hi" })).toBe(false);
  });

  it("detects common out-of-office subjects", () => {
    expect(isHeaderAutoReply({ Subject: "Out of Office: Re: Quick question" })).toBe(true);
    expect(isHeaderAutoReply({ Subject: "Automatic reply: Re: Quick question" })).toBe(true);
    expect(isHeaderAutoReply({ Subject: "Vacation responder" })).toBe(true);
  });

  it("does not flag a normal human reply", () => {
    expect(isHeaderAutoReply({ Subject: "Re: Quick question", From: "jane@company.com" })).toBe(false);
  });

  it("is case-insensitive on header names", () => {
    expect(isHeaderAutoReply({ "auto-submitted": "auto-generated", subject: "Re: hi" })).toBe(true);
  });
});

describe("isHeaderBounce", () => {
  it("detects mailer-daemon sender", () => {
    expect(isHeaderBounce({ From: "Mail Delivery Subsystem <mailer-daemon@google.com>", Subject: "Undeliverable" })).toBe(
      true
    );
  });

  it("detects delivery-status content type", () => {
    expect(
      isHeaderBounce({ "Content-Type": "multipart/report; report-type=delivery-status", Subject: "Failure" })
    ).toBe(true);
  });

  it("does not flag a normal reply", () => {
    expect(isHeaderBounce({ From: "jane@company.com", Subject: "Re: Quick question" })).toBe(false);
  });
});

describe("extractReturnDate", () => {
  it("extracts a return date from common out-of-office phrasing", () => {
    const date = extractReturnDate("I am out of office and will be back on January 5, 2027.");
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2027);
  });

  it("returns null when no date is present", () => {
    expect(extractReturnDate("I'm out of office indefinitely.")).toBeNull();
  });
});
