// Supabase Edge Function: estimates what's in a meal photo.
//
// The app uploads the photo to the private meal-photos bucket, then calls this
// with { path } and the user's login token. The function downloads the photo
// as that user (storage policies still apply), asks Claude to list the foods
// with portions, calories and macros, and returns the estimate. Nothing is
// saved here: the user checks and corrects the estimate in the app first.
// The Anthropic API key lives only here, as the ANTHROPIC_API_KEY secret.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const MODEL = "claude-opus-5-5";

const SYSTEM_PROMPT = `You estimate the food in a meal photo for a nutrition log in Personal O.S, a training and nutrition coach app for athletes.

List each distinct food or drink you can see, with a portion in plain words a person would recognise (e.g. "1 cup cooked rice", "2 eggs", "6 oz chicken breast") and your best estimate of calories, protein, carbs and fat in grams for that portion.

Rules:
- Estimate from what's visible: plate size, utensils and packaging help with portions. Use standard nutrition values (USDA-style) for the food, not guesses.
- If something is hidden or ambiguous (oil, sauce, dressing, what's inside a wrap), include your best estimate and mention it in the note so the user can correct it.
- If the user added a hint, trust it over what you see (e.g. a brand, a portion, what's in it).
- If the photo isn't food, return no items and say so in the note.
- Title: a short name for the meal, under 6 words.
- Note: one short sentence, under 25 words: what you're least sure about. Plain text, no emoji.
- Confidence: "high" when foods and portions are clear, "medium" for typical home-cooked plates, "low" when much is hidden or unclear.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          portion: { type: "string" },
          calories: { type: "integer" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
        },
        required: ["name", "portion", "calories", "protein_g", "carbs_g", "fat_g"],
        additionalProperties: false,
      },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    note: { type: "string" },
  },
  required: ["title", "items", "confidence", "note"],
  additionalProperties: false,
};

// Image types Claude reads.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY secret is not set for Edge Functions");
    return json({ error: "Coach isn't set up yet: the ANTHROPIC_API_KEY secret is missing in Supabase" }, 500);
  }
  const anthropic = new Anthropic({ apiKey });

  // The user's own login token: the photo download below runs as them.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Not signed in" }, 401);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!)["default"],
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !userData.user) return json({ error: "Not signed in" }, 401);

  const { path, hint } = await req.json().catch(() => ({}));
  if (typeof path !== "string" || !path.startsWith(`${userData.user.id}/`)) {
    return json({ error: "Send { path } of a photo you uploaded" }, 400);
  }

  const { data: photo, error: downloadError } = await supabase.storage.from("meal-photos").download(path);
  if (downloadError || !photo) return json({ error: "Couldn't find that photo" }, 404);
  const mediaType = (photo.type || "image/jpeg") as ImageType;
  if (!IMAGE_TYPES.includes(mediaType)) {
    return json({ error: "That photo format isn't supported. Try a JPEG or PNG." }, 400);
  }
  if (photo.size > 5 * 1024 * 1024) return json({ error: "That photo is too big. Try a smaller one." }, 400);
  const data = encodeBase64(new Uint8Array(await photo.arrayBuffer()));

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // If a safety classifier declines, retry server-side on Anthropic's recommended model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            {
              type: "text",
              text:
                typeof hint === "string" && hint.trim()
                  ? `Hint from the user: ${hint.trim().slice(0, 300)}`
                  : "Estimate this meal.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return json({ error: "The coach couldn't read this photo" }, 502);
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    return json(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error("Meal estimate was not valid JSON");
      return json({ error: "The estimate came back garbled, try again" }, 502);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic rejected the API key");
      return json({ error: "Coach is misconfigured (API key)" }, 500);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: "Coach is busy, try again in a minute" }, 503);
    }
    if (error instanceof Anthropic.APIError && /credit balance/i.test(error.message)) {
      console.error("Anthropic account is out of credit");
      return json(
        { error: "Your coach is out of Anthropic API credit. Add credit in the Anthropic Console (Plans & Billing)." },
        502,
      );
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${error.status}: ${error.message}`);
      return json({ error: "Coach is unavailable right now" }, 502);
    }
    console.error(`Unexpected error: ${error instanceof Error ? error.message : error}`);
    return json({ error: "Something went wrong reading your meal, try again" }, 500);
  }
});
