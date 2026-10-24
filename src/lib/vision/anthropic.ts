// Anthropic vision provider — kept for later (the project is on Gemini for now).
// Implemented per design.md §5, which was grounded in the current Anthropic docs
// for Claude Haiku 5.5: structured outputs via output_config.format json_schema,
// output_config.effort "low", no temperature/top_p/top_k, no prefill, refusal/
// max_tokens → unreadable, token logging. Wired into the selector but inactive
// unless VISION_PROVIDER=anthropic. Not exercised by tests in this slice.
//
// NOTE: the @anthropic-ai/sdk package is intentionally NOT a dependency yet
// (we're on Gemini). This module is loaded lazily by the selector only when
// VISION_PROVIDER=anthropic, so importing the SDK is deferred to that path.
// When you switch back to Anthropic: `npm install @anthropic-ai/sdk` and
// re-read the current docs before relying on these parameter names.
import { SYSTEM_PROMPT } from "./prompt";
import { LABEL_READ_JSON_SCHEMA, labelReadSchema, type LabelRead } from "./schema";
import { UnreadableError, type VisionProvider } from "./provider";

const DEFAULT_MODEL = "claude-haiku-5-5";

// Minimal shape of the SDK client we use, so this file type-checks without the
// package installed. Replaced by the real SDK types once @anthropic-ai/sdk is
// added back.
interface AnthropicClient {
  messages: {
    create(request: unknown): Promise<unknown>;
  };
}

export class AnthropicVisionProvider implements VisionProvider {
  readonly name = "anthropic" as const;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string = process.env.VISION_MODEL ?? DEFAULT_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async readLabel(imageJpegBase64: string): Promise<LabelRead> {
    // Lazy, bundler-opaque import so @anthropic-ai/sdk is only required at
    // runtime when this provider actually runs. The indirection via Function
    // keeps the bundler (Turbopack) from statically resolving the specifier,
    // so the project builds without the SDK installed while we're on Gemini.
    const dynamicImport = new Function("s", "return import(s)") as (
      s: string,
    ) => Promise<{ default: new (opts: { apiKey: string }) => AnthropicClient }>;
    const mod = await dynamicImport("@anthropic-ai/sdk");
    const Anthropic = mod.default;
    const client = new Anthropic({ apiKey: this.apiKey });

    const res = await client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: imageJpegBase64 },
            },
            { type: "text", text: "Read this one item. Return only the JSON object." },
          ],
        },
      ],
      // Structured outputs + lowest effort (design.md §5). No temperature/top_p/
      // top_k and no prefill, which Haiku 5.5 rejects.
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: LABEL_READ_JSON_SCHEMA },
      },
    } as never);

    const response = res as {
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
      content?: Array<{ type: string; text?: string }>;
    };

    console.info(
      `[vision] anthropic model=${this.model} input_tokens=${response.usage?.input_tokens ?? "?"} output_tokens=${response.usage?.output_tokens ?? "?"}`,
    );

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      throw new UnreadableError(`anthropic stop_reason=${response.stop_reason}`);
    }

    const text = response.content?.find((b) => b.type === "text")?.text;
    if (!text) throw new UnreadableError("anthropic returned no text");

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new UnreadableError("anthropic returned non-JSON");
    }

    const parsed = labelReadSchema.safeParse(json);
    if (!parsed.success) {
      throw new UnreadableError("anthropic output failed schema validation");
    }
    return parsed.data;
  }
}
