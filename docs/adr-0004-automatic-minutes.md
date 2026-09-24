# ADR-0004 — Working Groups: automatic transcription, AI-drafted minutes & lead approval

- **Status:** Proposed
- **Date:** 2026-09-24
- **Deciders:** Fabrice (Verana / 2060)
- **Depends on / amends:** builds on the schedule, Google Calendar sync and sessions/minutes model of [ADR-0003](./adr-0003-working-groups.md). Amends its "one scope" rule for the delegated service account (§ Provisioning below). Uses the existing SMTP transport (`app/lib/email.ts`), the cron pattern (`app/api/cron/*` + k8s CronJob) and the `AdminAction` audit pattern.

## Context

ADR-0003 gave every working group a recurring Google Meet meeting and a manual minutes flow: a participant opens a session, ticks attendees, types Markdown, and a lead publishes it to the public minutes repository. In practice minutes are the first thing to slip: nobody is assigned to take notes, so meetings leave no record.

Google Meet can transcribe meetings natively (speaker-attributed text with timestamps), and the Meet REST API exposes both the switch that turns transcription on for a meeting space and the resulting transcript. That is enough to draft minutes automatically and let a lead approve them, without recording any audio or video and without any new vendor for speech-to-text.

Requirements agreed for this iteration:

- **Transcription only.** No video or audio recording, and nothing is published outside the Foundation's own channels (site + minutes repository).
- **A lead approves before anything becomes public.** The AI draft is a proposal; the published minutes are the lead's.
- **Transcripts are internal by default.** Publishing a transcript alongside the minutes is a per-meeting opt-in.
- **English by default**, unless a group sets its own language.
- Keep the ADR-0003 conventions: the database is canonical, external calls are best-effort with stored errors and retry, the public site never depends on Google or Anthropic being up.

## Decision

### 1. Google Meet transcription is the transcript source

- After every successful Calendar sync (`syncScheduleToGoogle`), the app **patches the Meet space** of the group's meeting (`PATCH https://meet.googleapis.com/v2/spaces/{meetingCode}`, `config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration = ON`) as the `meetings@` role account, which owns the space because it organizes the Calendar event. The meeting code is parsed from the stored `meetLink`. This works for Calendar-created meetings and is idempotent.
- The Workspace admin console default ("meetings are transcribed by default" for the `meetings@` organizational unit) is set as a **safety net only**: it does not apply to recurring events created before enablement and a host can override it, so the API call remains the guarantee.
- **No recording config is ever set** (`recordingConfig` untouched). If a host records manually, the pipeline ignores the recording.
- Success/failure is stored on `WgSchedule` next to the existing Calendar sync state (`meetConfiguredAt`, `meetConfigError`); the lead console's existing **Retry sync** covers both.
- A per-group **`autoMinutes`** flag (default `on`, editable by leads and admins) gates the whole feature; turning it off removes the auto-transcription config from the space.

### 2. The pipeline: a cron-driven step machine, DB first

A new **`WgTranscript`** row tracks each transcribed meeting through a small state machine. One new cron route, **`/api/cron/wg-transcripts`** (k8s CronJob every 15 minutes, `CRON_SECRET` guard, `concurrencyPolicy: Forbid`), advances each row **one idempotent step per tick**; rows are locked (`lockedAt`) while a step runs.

| Step | Status after | What happens |
|---|---|---|
| Discover | `awaiting_transcript` | For every group with `autoMinutes = on` and a meeting code: `conferenceRecords.list` filtered by `space.meeting_code` and `end_time` since the last scan. One row per conference record. A **draft `WgSession`** is created (or reused) for the matching scheduled occurrence: the conference start is snapped to the nearest occurrence of the RRULE within ±60 min, else truncated to the minute. |
| Fetch | `transcribed` | `conferenceRecords.transcripts` until `state = FILE_GENERATED`, then **all** `transcripts.entries` (participant, text, `startTime`, `languageCode`) are persisted as JSON. Google deletes entries **30 days after the meeting**; the database copy is the durable one. A conference with no transcript after 24 h is marked `failed` (e.g. nobody joined, or transcription was switched off by the host). |
| Summarize | `summarized` | One Claude call drafts the minutes (§3). |
| Notify | `awaiting_approval` | Every lead is emailed (existing `emailLayout`): the draft inline and a **Review** button to the session page (sign-in required, like every CTA today). One reminder after 3 days (`remindedAt`). The lead console shows a pending-review badge. |
| Approve / discard | `approved` / `discarded` | Lead action on the site (§4). |

Failures store `lastError` and `attempts`; a step is retried on the next tick with backoff and gives up after 5 attempts (`failed`, ops alert via `ALERT_WEBHOOK_URL`, "Retry" in the lead console). The public site reads only `WgSession`, as before.

### 3. AI drafting with Claude

- **Model:** `claude-opus-5` via the official `@anthropic-ai/sdk`, adaptive thinking, streaming (transcripts of a one-hour meeting run to ~15k tokens; a meeting costs cents). The static prompt prefix (instructions + group description) is cached; the transcript comes last.
- **Inputs:** group name and description, the group's participant display names (so speaker names can be matched to participants), the last published minutes of the group (continuity of action items), the transcript entries rendered as `HH:MM:SS Name: text`, and the group's language (`language`, default `en`).
- **Output** (structured): minutes Markdown in the site's existing shape — `## Agenda`, `## Discussion`, `## Decisions`, `## Action items` — plus a list of attendee names and a list of open questions the model could not resolve (shown to the lead, not published).
- The prompt lives in the repo (`app/lib/minutes-ai.ts`) and is versioned with the code; the model id used is stored on the row (`summaryModel`).
- A draft is **never published without a lead's action**; a Claude outage simply leaves the row in `transcribed` for retry.

### 4. Review, approval, publication

The existing session editor (`/working-groups/<slug>/sessions/<id>`) gains a **review mode** for leads when a `WgTranscript` is attached:

- Editable minutes prefilled with the AI draft; attendee checklist prefilled from matched participants (unmatched speaker names become guests); a collapsible transcript viewer; the model's open questions.
- **Publish transcript** checkbox, **off by default**.
- **Approve & publish** — one server action: save the session (`recordedById` = the approving lead, `source = ai_draft`), publish through the existing `publishMinutes` path with two extra front-matter keys (`drafted_by: claude-opus-5`, `approved_by: <lead>`), and, only if opted in, commit the transcript beside the minutes as `<slug>/transcripts/YYYY-MM-DD.md`. Audit `wg.transcript.approve`.
- **Regenerate** re-runs the Summarize step (audit `wg.transcript.regenerate`). **Discard** keeps the transcript internal and marks the session as not for publication (audit `wg.transcript.discard`).
- The **manual path is unchanged**: participants can still open a session and type minutes; if a manual draft exists for the occurrence, the AI draft is attached to it instead of creating a second session.

### 5. Visibility & retention

- Transcripts are visible on the site to the group's **leads and active participants** (signed in, `canAccessWg` re-checked), never on public pages, and in the minutes repository only when opted in per meeting.
- Approved transcripts are retained with the session; discarded or failed ones are deleted by the cron 90 days after the meeting.
- Transcript text and speaker names are sent to Anthropic's API to draft the minutes, under Anthropic's commercial API terms. The join consent text, the Calendar event description and the privacy page state that meetings are transcribed and summarized by an AI assistant, that a lead reviews before publication, and that transcripts stay internal unless a lead publishes them.

## Provisioning (one-time, manual)

1. **Workspace edition:** confirm the `meetings@` role account's license supports Meet transcription (and, for the console default, Business Plus / Enterprise).
2. **Domain-wide delegation:** extend the existing service account's authorized scopes to `calendar.events`, `meetings.space.settings` (configure the space) and `meetings.space.readonly` (read conference records and transcripts). No Drive scope is needed: the pipeline never downloads files. This supersedes the single-scope statement of ADR-0003; the blast radius stays bounded to the `meetings@` account's own meetings.
3. **Google Cloud:** enable the **Google Meet REST API** in the project that hosts the service account.
4. **Admin console (optional safety net):** Meet → automatic meeting artifacts → transcription on, for the organizational unit containing `meetings@`.
5. **Anthropic:** an API key for the Foundation, stored as `ANTHROPIC_API_KEY` (touch `.env.example`, `docker-publish.yml`, `k8s/statefulset.yaml`).
6. **k8s:** `k8s/cronjob-wg-transcripts.yaml` (every 15 minutes, `activeDeadlineSeconds: 600`).

## Data model summary (additions)

```text
WorkingGroup  { + autoMinutes Boolean @default(true), + language String @default("en") }
WgSchedule    { + meetingCode?, meetConfiguredAt?, meetConfigError? }
WgSession     { recordedById becomes optional; + source: manual | ai_draft (default manual) }
WgTranscript  {
  wgId, sessionId (unique), conferenceRecord (unique), meetingCode,
  startedAt, endedAt, language?,
  entries Json, entryCount,                   # persisted transcript (Google deletes after 30 days)
  summaryMd?, summaryModel?, summarizedAt?, openQuestions Json?,
  status: awaiting_transcript | transcribed | summarized | awaiting_approval | approved | discarded | failed,
  publishTranscript Boolean @default(false),
  lastError?, attempts, lockedAt?, approvalRequestedAt?, remindedAt?
}
```

New audit actions: `wg.meet.configure`, `wg.transcript.approve`, `wg.transcript.regenerate`, `wg.transcript.discard`.

## Rollout phases

| Phase | Scope | Size |
|---|---|---|
| 0 | Provisioning above; ADR accepted; README + `.env.example` updated | XS |
| 1 | `autoMinutes` + `language` flags; meeting code on `WgSchedule`; Meet space patch after Calendar sync with stored error + retry; consent/notice texts | S |
| 2 | `WgTranscript` + `WgSession` changes; cron step machine (discover, fetch, summarize, notify); Claude client + prompt; lead emails + reminder; ops alert on failure | M |
| 3 | Session editor review mode; approve / regenerate / discard actions; front-matter extension; optional transcript commit; transcript viewer for leads/participants; pending-review badge | M |
| 4 (optional) | Workspace Events push (Pub/Sub) instead of polling; Markdown rendering of published minutes; mocked-`fetch` tests for the Meet and Claude clients | S–M |

## Security & privacy

- All lead actions are checked server-side per request (`requireManager`); transcript reads require lead or active-participant status **and** a passing `canAccessWg`.
- The service-account key gains two Meet scopes but still impersonates a single role account; it cannot read other users' meetings, Drive or mail. Rotate the key when the scopes change.
- No audio or video is ever recorded or stored by this design; the only artifact is text, and Google's own artifact retention is not relied upon.
- The Anthropic API key is a server secret (env → k8s Secret); transcripts are sent over the API only, never used in the browser.
- Every mutation is audited via `AdminAction`, as in ADR-0003.

## Consequences

**Positive**

- Every meeting gets minutes within minutes of ending, drafted in the group's own format, with a human lead accountable for what is published.
- Zero speech-to-text plumbing: Google produces the transcript; the app only reads text. No files, no storage growth beyond text rows.
- The public record stays exactly what ADR-0003 defined (GitHub-committed minutes rendered from the DB); the AI step is invisible to readers beyond a front-matter note.

**Negative / risks**

- Two more delegated scopes on a powerful credential (bounded to one role account, key rotated on change).
- Transcription quality depends on Meet's ASR and the host's Meet language; a host can still turn transcription off mid-meeting. Failures surface in the lead console rather than silently.
- Transcript entries vanish from Google after 30 days: a cron outage longer than that loses the transcript for those meetings (the ops alert on cron failure exists for this reason).
- Approval fatigue if leads ignore the emails: the reminder is sent once; a group with no lead action simply accumulates drafts, which are visible in the lead console.
