// Gemini vision provider (R6.2). Server-only: imports the @google/genai SDK and
// reads GEMINI_API_KEY. Verified against the official docs (ai.google.dev,
// 2026-10 "Generate content" guide):
//   - SDK: @google/genai, new GoogleGenAI({ apiKey }), ai.models.generateContent
//   - image input: inline { inlineData: { mimeType, data: base64 } }, text after
//   - structured JSON: config.responseMimeType "application/json" +
//     config.responseJsonSchema (JSON Schema); result text at response.text
//   - system prompt: config.systemInstruction
//   - model gemini-3.8-flash is multimodal and accepts image input
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT } from "./prompt";
import { LABEL_READ_JSON_SCHEMA, labelReadSchema, type LabelRead } from "./schema";
import { UnreadableError, type VisionProvider } from "./provider";

const DEFAULT_MODEL = "gemini-3.8-flash";

export class GeminiVisionProvider implements VisionProvider {
  readonly name = "gemini" as const;
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string = process.env.VISION_MODEL ?? DEFAULT_MODEL) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async readLabel(imageJpegBase64: string): Promise<LabelRead> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          inlineData: { mimeType: "image/jpeg", data: imageJpegBase64 },
        },
        { text: "Read this one item. Return only the JSON object." },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: LABEL_READ_JSON_SCHEMA,
      },
    });

    // Log token usage to the server console (R5.11).
    const usage = response.usageMetadata;
    console.info(
      `[vision] gemini model=${this.model} input_tokens=${usage?.promptTokenCount ?? "?"} output_tokens=${usage?.candidatesTokenCount ?? "?"}`,
    );

    // A blocked/refused/truncated response has no usable text → unreadable
    // (R6.10). The SDK surfaces finishReason on the first candidate.
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== "STOP") {
      throw new UnreadableError(`gemini finish_reason=${finishReason}`);
    }

    const text = response.text;
    if (!text) throw new UnreadableError("gemini returned no text");

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new UnreadableError("gemini returned non-JSON");
    }

    const parsed = labelReadSchema.safeParse(json);
    if (!parsed.success) {
      throw new UnreadableError("gemini output failed schema validation");
    }
    return parsed.data;
  }
}
