import type { AIProvider } from "./provider";
import { GeminiProvider } from "./gemini";

let cached: AIProvider | null = null;

/**
 * Factory for the configured AIProvider. Switch providers by setting
 * AI_PROVIDER in the environment — no caller needs to change.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;

  const providerName = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();

  switch (providerName) {
    case "gemini":
      cached = new GeminiProvider();
      break;
    default:
      console.warn(
        `[ai] Unknown AI_PROVIDER "${providerName}", falling back to Gemini.`
      );
      cached = new GeminiProvider();
  }

  return cached;
}

export type * from "./provider";
