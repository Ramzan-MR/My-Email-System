// Header/metadata-based auto-reply & bounce detection. Runs BEFORE AI
// classification (cheaper, more reliable for the common cases) — see
// CLAUDE.md "Auto Reply Handling": "Use both: 1. email headers/metadata
// 2. AI classification when necessary."

export interface EmailHeaders {
  [key: string]: string | undefined;
}

const AUTO_REPLY_SUBJECT_PATTERNS = [
  /out of office/i,
  /out-of-office/i,
  /auto[- ]?reply/i,
  /automatic reply/i,
  /vacation (responder|reply)/i,
  /away from (the )?office/i,
  /on leave/i,
  /currently unavailable/i,
];

const BOUNCE_SUBJECT_PATTERNS = [
  /delivery (status notification|failure)/i,
  /undeliverable/i,
  /undelivered mail/i,
  /mail delivery failed/i,
  /returned mail/i,
  /failure notice/i,
  /mailbox (unavailable|full|not found)/i,
];

function normalizeHeaders(headers: EmailHeaders): EmailHeaders {
  const out: EmailHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

export function isHeaderAutoReply(headers: EmailHeaders): boolean {
  const h = normalizeHeaders(headers);

  const autoSubmitted = h["auto-submitted"]?.toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;

  if (h["x-autoreply"] || h["x-autorespond"]) return true;

  const precedence = h["precedence"]?.toLowerCase();
  if (precedence === "auto_reply" || precedence === "bulk" || precedence === "junk") {
    return true;
  }

  if (h["x-vacation-message"] || h["x-vacationmail"]) return true;

  const subject = h["subject"] ?? "";
  return AUTO_REPLY_SUBJECT_PATTERNS.some((re) => re.test(subject));
}

export function isHeaderBounce(headers: EmailHeaders): boolean {
  const h = normalizeHeaders(headers);

  const contentType = h["content-type"]?.toLowerCase() ?? "";
  if (contentType.includes("report-type=delivery-status")) return true;

  const from = h["from"]?.toLowerCase() ?? "";
  if (from.includes("mailer-daemon") || from.includes("postmaster")) return true;

  const subject = h["subject"] ?? "";
  return BOUNCE_SUBJECT_PATTERNS.some((re) => re.test(subject));
}

/**
 * Attempts to pull a "back on <date>" style return date out of an
 * out-of-office body. Best-effort only; AI classification can also supply
 * one when this misses.
 */
export function extractReturnDate(bodyText: string): Date | null {
  const patterns = [
    /back (?:in the office |at work )?on ([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?,? \d{4})/i,
    /return(?:ing)? on ([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?,? \d{4})/i,
    /until ([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?,? \d{4})/i,
  ];
  for (const re of patterns) {
    const match = bodyText.match(re);
    if (match) {
      const parsed = new Date(match[1].replace(/(st|nd|rd|th)/, ""));
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}
