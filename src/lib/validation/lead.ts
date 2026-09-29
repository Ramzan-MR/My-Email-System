import { z } from "zod";

export const leadInputSchema = z.object({
  firstName: z.string().trim().max(120).optional().or(z.literal("")),
  lastName: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email address."),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  website: z.string().trim().max(300).optional().or(z.literal("")),
  jobTitle: z.string().trim().max(150).optional().or(z.literal("")),
  linkedinUrl: z.string().trim().max(300).optional().or(z.literal("")),
  phone: z.string().trim().max(60).optional().or(z.literal("")),
  customPersonalization: z.string().trim().max(2000).optional().or(z.literal("")),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});

export type LeadInput = z.infer<typeof leadInputSchema>;
