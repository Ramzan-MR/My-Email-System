import { google } from "googleapis";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";

// Gmail API wrapper used by the Outreach/Reply agents. Kept isolated here so
// the rest of the app never touches googleapis directly.

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI must be set to connect a Gmail sending account."
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function buildGoogleAuthUrl(state: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/** Returns an authenticated Gmail client for a stored SendingAccount, refreshing the access token if needed. */
export async function getGmailClientForAccount(sendingAccountId: string) {
  const account = await prisma.sendingAccount.findUniqueOrThrow({
    where: { id: sendingAccountId },
  });

  if (!account.refreshTokenEnc) {
    throw new Error(`Sending account ${account.email} has no refresh token on file — reconnect it.`);
  }

  const client = getOAuthClient();
  client.setCredentials({
    refresh_token: decryptToken(account.refreshTokenEnc),
    access_token: account.accessTokenEnc ? decryptToken(account.accessTokenEnc) : undefined,
  });

  client.on("tokens", async (tokens) => {
    const data: { accessTokenEnc?: string; tokenExpiresAt?: Date } = {};
    if (tokens.access_token) data.accessTokenEnc = encryptToken(tokens.access_token);
    if (tokens.expiry_date) data.tokenExpiresAt = new Date(tokens.expiry_date);
    if (Object.keys(data).length > 0) {
      await prisma.sendingAccount.update({ where: { id: sendingAccountId }, data }).catch((err) => {
        console.error("[gmail] failed to persist refreshed token", err);
      });
    }
  });

  return google.gmail({ version: "v1", auth: client });
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRawMessage(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const headers = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
  ];
  if (params.inReplyTo) headers.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) headers.push(`References: ${params.references}`);

  const message = `${headers.join("\r\n")}\r\n\r\n${params.body}`;
  return base64UrlEncode(message);
}

export interface SendGmailMessageParams {
  sendingAccountId: string;
  to: string;
  subject: string;
  body: string;
  /** Set to continue an existing thread (follow-ups). */
  threadId?: string;
  inReplyToMessageId?: string;
  referencesHeader?: string;
}

export interface SendGmailMessageResult {
  gmailMessageId: string;
  gmailThreadId: string;
}

export async function sendGmailMessage(
  params: SendGmailMessageParams
): Promise<SendGmailMessageResult> {
  const gmail = await getGmailClientForAccount(params.sendingAccountId);
  const account = await prisma.sendingAccount.findUniqueOrThrow({
    where: { id: params.sendingAccountId },
  });

  const raw = buildRawMessage({
    from: account.email,
    to: params.to,
    subject: params.subject,
    body: params.body,
    inReplyTo: params.inReplyToMessageId,
    references: params.referencesHeader,
  });

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: params.threadId,
    },
  });

  if (!res.data.id || !res.data.threadId) {
    throw new Error("Gmail send did not return a message/thread id.");
  }

  return { gmailMessageId: res.data.id, gmailThreadId: res.data.threadId };
}

export async function listRecentMessages(sendingAccountId: string, query: string, maxResults = 25) {
  const gmail = await getGmailClientForAccount(sendingAccountId);
  const res = await gmail.users.messages.list({ userId: "me", q: query, maxResults });
  return res.data.messages ?? [];
}

export async function getMessage(sendingAccountId: string, messageId: string) {
  const gmail = await getGmailClientForAccount(sendingAccountId);
  const res = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  return res.data;
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

interface GmailPayloadLike {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPayloadLike[] | null;
}

function extractPlainTextBody(payload: GmailPayloadLike | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return base64UrlDecode(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainTextBody(part);
      if (text) return text;
    }
  }
  // Fall back to the first available body if no text/plain part exists.
  if (payload.body?.data) return base64UrlDecode(payload.body.data);
  return "";
}

export interface ParsedGmailMessage {
  headers: Record<string, string>;
  subject: string;
  from: string;
  bodyText: string;
  snippet: string;
  receivedAt: Date;
}

export function parseGmailMessage(message: {
  payload?: GmailPayloadLike | null;
  snippet?: string | null;
  internalDate?: string | null;
}): ParsedGmailMessage {
  const rawHeaders = (message.payload as { headers?: { name?: string | null; value?: string | null }[] } | undefined)
    ?.headers ?? [];
  const headers: Record<string, string> = {};
  for (const h of rawHeaders) {
    if (h.name && h.value != null) headers[h.name] = h.value;
  }

  return {
    headers,
    subject: headers["Subject"] ?? "",
    from: headers["From"] ?? "",
    bodyText: extractPlainTextBody(message.payload ?? undefined),
    snippet: message.snippet ?? "",
    receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date(),
  };
}

export function extractEmailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return (match ? match[1] : fromHeader).trim().toLowerCase();
}
