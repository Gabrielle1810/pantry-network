// Vision module public surface + provider selector (R6.3, R6.4, R6.14).
// Selects the provider from VISION_PROVIDER (default "gemini" for now). If the
// selected real provider has no API key, falls back to the mock and logs a
// startup warning so the app always runs end to end.
import { GeminiVisionProvider } from "./gemini";
import { AnthropicVisionProvider } from "./anthropic";
import { MockVisionProvider } from "./mock";
import type { ProviderName, VisionProvider } from "./provider";

export type { VisionProvider, ProviderName } from "./provider";
export { UnreadableError, isNetworkError } from "./provider";
export { labelReadSchema, type LabelRead, LABEL_READ_JSON_SCHEMA } from "./schema";
export { SYSTEM_PROMPT } from "./prompt";
export { MockVisionProvider, MOCK_FIXTURES } from "./mock";

const DEFAULT_PROVIDER: ProviderName = "gemini";

/**
 * Build the configured vision provider. Reads VISION_PROVIDER and the matching
 * API key. Falls back to the mock (with a warning) when a real provider is
 * selected but its key is missing (R6.4, R6.14). Built per request so env
 * changes take effect without a restart in dev.
 */
export function getVisionProvider(): VisionProvider {
  const selected = (process.env.VISION_PROVIDER ?? DEFAULT_PROVIDER) as ProviderName;

  if (selected === "mock") {
    return new MockVisionProvider();
  }

  if (selected === "gemini") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn(
        "[vision] VISION_PROVIDER=gemini but GEMINI_API_KEY is not set; falling back to the mock provider.",
      );
      return new MockVisionProvider();
    }
    return new GeminiVisionProvider(key);
  }

  if (selected === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      console.warn(
        "[vision] VISION_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set; falling back to the mock provider.",
      );
      return new MockVisionProvider();
    }
    return new AnthropicVisionProvider(key);
  }

  console.warn(
    `[vision] Unknown VISION_PROVIDER="${selected}"; falling back to the mock provider.`,
  );
  return new MockVisionProvider();
}
