import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  speakerNames,
  transcriptLines,
  type TranscriptEntry,
} from "@/app/lib/transcript-format";

/**
 * AI-drafted minutes (ADR-0004 §3): one Claude call turns a Meet transcript
 * into minutes in the site's shape (Agenda / Discussion / Decisions / Action
 * items) plus the open questions a lead should check before publishing. The
 * draft is a proposal: nothing is published without a lead's action.
 *
 * The prompt is versioned with the code; the model id used is stored on the
 * transcript row.
 */

export const DEFAULT_MINUTES_MODEL = "claude-opus-5";

export function minutesAiModel(): string {
  return process.env.MINUTES_AI_MODEL?.trim() || DEFAULT_MINUTES_MODEL;
}

export function minutesAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Static instructions — kept identical across calls so the prefix caches. */
export const SYSTEM_PROMPT = `You draft the minutes of a Verana Foundation working-group meeting from its automatic transcript. The minutes are reviewed and edited by a group lead before publication; your draft must make that review fast and safe.

Write the minutes in Markdown with exactly these four sections and no other heading, introduction or conclusion:

## Agenda
The topics actually covered, as a short list in the order they came up.

## Discussion
For each topic, the substance of what was said: positions, arguments, options considered, questions left open. Neutral tone, past tense. Attribute positions to people by name when the transcript makes it clear who spoke; otherwise describe the discussion without attribution.

## Decisions
Only what was explicitly decided or agreed by the group. If nothing was decided, write "No decisions were taken."

## Action items
One checkbox line per item: "- [ ] Task (Owner, due date if one was given)". If there are none, write "No action items."

Rules:
- Use only what is in the transcript. Never invent names, decisions, dates or figures.
- Automatic transcripts contain recognition errors. Correct obvious ones from context; when a name, product or term is unclear, keep the transcript's spelling and raise it as an open question.
- Use people's names as they appear in the attendee list when they match a speaker.
- Leave out greetings, small talk, audio or connection trouble and anything that is not about the group's work.
- Keep the whole draft under about 700 words unless the meeting was unusually dense.

Open questions are things the lead should verify before publishing: unclear decisions, ambiguous owners, unrecognised names or terms, and remarks that may have been meant as confidential. Return an empty list when there is nothing to flag.`;

export type DraftInput = {
  wgName: string;
  wgDescription: string | null;
  language: string; // BCP 47 code of the minutes, e.g. "en"
  attendees: string[]; // display names ticked by the lead
  previousMinutes: string | null; // last published minutes of the group
  startedAt: Date;
  entries: TranscriptEntry[];
};

const PREVIOUS_MINUTES_MAX_CHARS = 6000;

/** "fr" → "French"; unknown codes fall back to the code itself. */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function buildUserPrompt(input: DraftInput): string {
  const speakers = speakerNames(input.entries);
  const previous = input.previousMinutes?.trim()
    ? input.previousMinutes.trim().slice(0, PREVIOUS_MINUTES_MAX_CHARS)
    : null;
  return [
    `Working group: ${input.wgName}`,
    input.wgDescription ? `About the group: ${input.wgDescription}` : null,
    `Write the minutes in ${languageName(input.language)}.`,
    `Meeting date: ${input.startedAt.toISOString().slice(0, 10)}`,
    "",
    "Attendees recorded by the lead:",
    ...(input.attendees.length ? input.attendees.map((a) => `- ${a}`) : ["- (none recorded yet)"]),
    "",
    "Speakers as named by Google Meet:",
    ...speakers.map((s) => `- ${s}`),
    ...(previous
      ? [
          "",
          "Previous published minutes of this group (for continuity of topics and action items; do not copy them):",
          "<previous_minutes>",
          previous,
          "</previous_minutes>",
        ]
      : []),
    "",
    "Transcript (times are elapsed since the meeting started):",
    "<transcript>",
    ...transcriptLines(input.entries, input.startedAt),
    "</transcript>",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

const DraftSchema = z.object({
  minutes_markdown: z.string(),
  open_questions: z.array(z.string()),
});

export type DraftResult = {
  minutesMd: string;
  openQuestions: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/** One Claude call; throws on refusal, truncation or an unusable response. */
export async function draftMinutes(input: DraftInput): Promise<DraftResult> {
  if (!minutesAiConfigured()) {
    throw new Error("Minutes AI is not configured (ANTHROPIC_API_KEY).");
  }
  const model = minutesAiModel();
  const client = new Anthropic();
  const message = await client.messages.parse({
    model,
    max_tokens: 8000,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: buildUserPrompt(input) }],
    output_config: { format: zodOutputFormat(DraftSchema) },
  });

  if (message.stop_reason === "refusal") {
    const why = message.stop_details?.explanation ?? "no explanation given";
    throw new Error(`The AI assistant declined to draft these minutes (${why}).`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("The AI draft was cut short (max_tokens); try regenerating.");
  }
  const parsed = message.parsed_output;
  if (!parsed) throw new Error("The AI assistant returned no usable draft.");

  return {
    minutesMd: parsed.minutes_markdown.trim(),
    openQuestions: parsed.open_questions.map((q) => q.trim()).filter(Boolean),
    model: message.model || model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
