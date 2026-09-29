import { describe, it, expect } from "vitest";
import { renderTemplate } from "./template";

describe("renderTemplate", () => {
  const lead = {
    firstName: "Jane",
    lastName: "Doe",
    company: "Acme Co",
    website: "acme.com",
    jobTitle: "VP Sales",
  };

  it("substitutes all supported variables", () => {
    const out = renderTemplate(
      "Hi {{first_name}} {{last_name}} at {{company}} ({{website}}), {{job_title}}: {{custom_line}}",
      lead,
      "loved your recent launch"
    );
    expect(out).toBe("Hi Jane Doe at Acme Co (acme.com), VP Sales: loved your recent launch");
  });

  it("is case-insensitive and tolerant of internal whitespace", () => {
    const out = renderTemplate("Hi {{ First_Name }}", lead);
    expect(out).toBe("Hi Jane");
  });

  it("substitutes missing fields with an empty string rather than leaving the placeholder", () => {
    const out = renderTemplate("{{first_name}} {{custom_line}}", { firstName: null, lastName: null, company: null, website: null, jobTitle: null });
    expect(out).toBe(" ");
  });
});
