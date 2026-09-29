import type { Lead } from "@prisma/client";

// Renders {{first_name}} {{last_name}} {{company}} {{website}} {{job_title}}
// {{custom_line}} against a lead. customLine is supplied separately since
// it's AI-generated per send, not stored on the Lead record itself.
export function renderTemplate(
  template: string,
  lead: Pick<Lead, "firstName" | "lastName" | "company" | "website" | "jobTitle">,
  customLine = ""
): string {
  return template
    .replace(/\{\{\s*first_name\s*\}\}/gi, lead.firstName ?? "")
    .replace(/\{\{\s*last_name\s*\}\}/gi, lead.lastName ?? "")
    .replace(/\{\{\s*company\s*\}\}/gi, lead.company ?? "")
    .replace(/\{\{\s*website\s*\}\}/gi, lead.website ?? "")
    .replace(/\{\{\s*job_title\s*\}\}/gi, lead.jobTitle ?? "")
    .replace(/\{\{\s*custom_line\s*\}\}/gi, customLine);
}
