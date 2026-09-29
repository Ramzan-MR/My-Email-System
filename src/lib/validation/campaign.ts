import { z } from "zod";

export const followUpTemplateSchema = z.object({
  order: z.number().int().min(1).max(3),
  delayDays: z.number().int().min(1).max(60),
  instructions: z.string().trim().max(2000),
});

export type FollowUpTemplate = z.infer<typeof followUpTemplateSchema>;

export const campaignInputSchema = z.object({
  name: z.string().trim().min(1, "Campaign name is required.").max(200),
  subjectTemplate: z.string().trim().min(1, "Subject is required.").max(300),
  bodyTemplate: z.string().trim().min(1, "Email body is required.").max(10000),
  followUpTemplates: z.array(followUpTemplateSchema).max(3).default([]),
  aiPersonalizationEnabled: z.boolean().default(true),
  autoFollowUpEnabled: z.boolean().default(false),
  dailyLimit: z.number().int().min(1).max(500).default(25),
  delayMinBetweenSendsSec: z.number().int().min(0).max(3600).default(60),
  delayMaxBetweenSendsSec: z.number().int().min(0).max(7200).default(300),
  sendingAccountIds: z.array(z.string()).default([]),
});

export type CampaignInput = z.infer<typeof campaignInputSchema>;

export const PERSONALIZATION_VARIABLES = [
  "{{first_name}}",
  "{{last_name}}",
  "{{company}}",
  "{{website}}",
  "{{job_title}}",
  "{{custom_line}}",
];
