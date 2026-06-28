// openai.ts — Shared OpenAI helpers for Convex backend actions (offer + message generation). These are plain
// functions (not Convex functions), callable from any action. Requires OPENAI_API_KEY on the deployment.
export const MODEL_BEST = "gpt-5"; // strongest (slower) — offers + first-draft messages
export const MODEL_FAST = "gpt-4o-mini"; // fast/cheap — message revisions

// openAIChat: chat-completions call with a strict JSON schema. Params: prompt, schema, model. Generic <T> is
// the parsed return type. Used by the offer/message generators.
export async function openAIChat<T>(prompt: string, schema: object, model: string): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set on the Convex deployment. Run: npx convex env set OPENAI_API_KEY sk-...");
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert GTM growth strategist and copywriter for developer tools. Reply ONLY with JSON matching the schema.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: "result", strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content) as T;
}

// JSON-schema helpers (strict objects, all fields required).
export const STR = { type: "string" };

// strict: a strict object schema (all properties required, no extras). Params: fields = property->schema map.
export function strict(fields: Record<string, object>): object {
  return { type: "object", additionalProperties: false, required: Object.keys(fields), properties: fields };
}

// arrayOf: an array schema wrapping an item schema. Params: item = the item's schema.
export function arrayOf(item: object): object {
  return { type: "array", items: item };
}
