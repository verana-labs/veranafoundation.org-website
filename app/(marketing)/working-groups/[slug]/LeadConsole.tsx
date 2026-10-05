"use client";

import { useActionState, useState, useTransition } from "react";
import type { Person } from "@/app/components/PersonAvatars";
import PersonAvatars from "@/app/components/PersonAvatars";
import LocalTime from "@/app/components/LocalTime";
import { MINUTES_LANGUAGES } from "@/app/lib/languages";
import {
  addLead,
  cancelMeeting,
  deleteSchedule,
  inviteParticipant,
  moveMeeting,
  removeLead,
  removeParticipant,
  resendInvite,
  restoreMeeting,
  retrySync,
  revokeInvite,
  saveSchedule,
  updateWgSettings,
  type ActionState,
} from "./actions";

export type ScheduleView = {
  startsAt: string; // ISO
  timezone: string;
  durationMin: number;
  rrule: string;
  syncedAt: string | null;
  syncError: string | null;
  meetLink: string | null;
  // ADR-0004: Meet space + auto-transcription + co-host state
  meetingCode: string | null;
  meetSpaceName: string | null;
  meetAutoTranscribe: boolean | null;
  meetConfiguredAt: string | null;
  meetConfigError: string | null;
  meetMembersSyncedAt: string | null;
  meetMembersError: string | null;
};

export type OccurrenceView = {
  startIso: string; // when the meeting happens (the new time for a moved one)
  originalStartIso: string; // the series slot — the key for cancel / move / restore
  cancelled: boolean;
  movedToIso: string | null; // on the vacated slot of a moved meeting
  movedFromIso: string | null; // on the new slot of a moved meeting
  note: string | null;
};

export type InviteView = {
  id: string;
  email: string;
  role: "lead" | "participant";
};

export type SettingsView = {
  autoMinutes: boolean;
  language: string;
};

/** datetime-local value of an ISO instant, in the schedule's timezone. */
function toLocalInput(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}

function frequencyOf(rrule: string): "weekly" | "biweekly" | "monthly" {
  if (rrule.includes("FREQ=MONTHLY")) return "monthly";
  return rrule.includes("INTERVAL=2") ? "biweekly" : "weekly";
}

export default function LeadConsole({
  wgId,
  calendarReady,
  aiReady,
  settings,
  schedule,
  occurrences,
  leads,
  participants,
  invites,
}: {
  wgId: string;
  calendarReady: boolean;
  aiReady: boolean;
  settings: SettingsView;
  schedule: ScheduleView | null;
  occurrences: OccurrenceView[];
  leads: Person[];
  participants: Person[];
  invites: InviteView[];
}) {
  const [saveState, saveAction, saving] = useActionState<ActionState, FormData>(
    saveSchedule,
    {},
  );
  const [settingsState, settingsAction, savingSettings] = useActionState<
    ActionState,
    FormData
  >(updateWgSettings, {});
  const [addState, addAction, adding] = useActionState<ActionState, FormData>(
    addLead,
    {},
  );
  const [inviteState, inviteAction, inviting] = useActionState<
    ActionState,
    FormData
  >(inviteParticipant, {});
  const [pending, startTransition] = useTransition();
  const [opError, setOpError] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState("");
  // Which series slot is being moved, and the picked wall time (schedule tz).
  const [moving, setMoving] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");

  const timezones: string[] =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : ["UTC", "Europe/Paris", "Europe/Tallinn", "America/Bogota"];
  const defaultTz =
    schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  function run(fn: () => Promise<ActionState>) {
    startTransition(async () => {
      const res = await fn();
      setOpError(res.error ?? null);
    });
  }

  return (
    <div className="mt-6 grid gap-12 lg:grid-cols-2">
      {/* Schedule */}
      <div>
        <h3 className="display text-lg">Meeting schedule</h3>
        {!calendarReady && (
          <p className="text-sm text-amber-700 mt-2">
            Google Calendar isn&apos;t configured on this server — schedules save,
            but no invitations go out until it is.
          </p>
        )}
        {schedule?.syncError && (
          <div className="mt-2 text-sm">
            <p className="text-red-600">Calendar sync failed: {schedule.syncError}</p>
            <button
              type="button"
              className="btn text-sm mt-2"
              disabled={pending}
              onClick={() => run(() => retrySync(wgId))}
            >
              Retry sync
            </button>
          </div>
        )}
        {schedule?.syncedAt && !schedule.syncError && (
          <p className="text-sm text-muted mt-2">
            In sync with Google Calendar — participants are invited automatically.
          </p>
        )}

        <form action={saveAction} className="space-y-1 mt-4 max-w-md">
          <input type="hidden" name="wgId" value={wgId} />
          <div className="form-field">
            <label htmlFor="wg-firstAt">First (or reference) meeting</label>
            <input
              id="wg-firstAt"
              name="firstAt"
              type="datetime-local"
              required
              defaultValue={
                schedule ? toLocalInput(schedule.startsAt, schedule.timezone) : ""
              }
            />
          </div>
          <div className="form-field">
            <label htmlFor="wg-tz">Timezone</label>
            <select id="wg-tz" name="timezone" defaultValue={defaultTz}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-5">
            <div className="form-field">
              <label htmlFor="wg-freq">Repeats</label>
              <select
                id="wg-freq"
                name="frequency"
                defaultValue={schedule ? frequencyOf(schedule.rrule) : "weekly"}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly (same nth weekday)</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="wg-dur">Duration (minutes)</label>
              <input
                id="wg-dur"
                name="durationMin"
                type="number"
                min={15}
                max={480}
                defaultValue={schedule?.durationMin ?? 60}
              />
            </div>
          </div>
          {saveState.error && (
            <p className="text-sm text-red-600">{saveState.error}</p>
          )}
          {saveState.ok && !saving && (
            <p className="text-sm" style={{ color: "var(--color-green)" }}>
              Schedule saved and synced — invitations are on their way.
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn btn-primary text-sm" disabled={saving}>
              {saving ? "Saving…" : schedule ? "Update schedule" : "Create schedule"}
            </button>
            {schedule && (
              <button
                type="button"
                className="btn text-sm"
                disabled={pending}
                onClick={() => {
                  if (confirm("Remove the schedule? The recurring meeting is cancelled for all participants.")) {
                    run(() => deleteSchedule(wgId));
                  }
                }}
              >
                Remove schedule
              </button>
            )}
          </div>
        </form>

        {schedule && occurrences.length > 0 && (
          <div className="mt-8">
            <h4 className="font-medium">Upcoming meetings</h4>
            <p className="text-sm text-muted mt-1">
              Cancel a single date (nobody can attend) or move it to another
              date and time (holidays, clashes): everyone&apos;s calendar follows,
              and restoring puts the meeting back on its regular slot. Times are
              shown in your own timezone; a new time is entered in the
              schedule&apos;s timezone ({schedule.timezone}). Changing the
              recurring schedule above clears all cancellations and moves.
            </p>
            <input
              type="text"
              className="mt-3 text-sm w-full max-w-sm"
              placeholder="Optional note (e.g. public holiday)"
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
            />
            <ul className="mt-2 space-y-2">
              {occurrences.map((o) => {
                const struck = o.cancelled || !!o.movedToIso;
                const key = `${o.startIso}:${o.originalStartIso}`;
                return (
                  <li key={key} className="text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className={struck ? "line-through text-muted" : ""}>
                        <LocalTime iso={o.startIso} format="long" />
                        {o.cancelled && (
                          <span className="no-underline text-muted"> — cancelled{o.note ? ` (${o.note})` : ""}</span>
                        )}
                        {o.movedToIso && (
                          <span className="no-underline text-muted">
                            {" "}— moved to <LocalTime iso={o.movedToIso} format="long" />
                            {o.note ? ` (${o.note})` : ""}
                          </span>
                        )}
                        {o.movedFromIso && (
                          <span className="badge badge-amber ml-2 no-underline">
                            moved from <LocalTime iso={o.movedFromIso} format="date" />
                          </span>
                        )}
                      </span>
                      <span className="flex gap-2">
                        {struck ? (
                          <button
                            type="button"
                            className="btn text-sm"
                            disabled={pending}
                            onClick={() => run(() => restoreMeeting(wgId, o.originalStartIso))}
                          >
                            Restore
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn text-sm"
                              disabled={pending}
                              onClick={() => {
                                if (moving === key) {
                                  setMoving(null);
                                } else {
                                  setMoving(key);
                                  setMoveTo(toLocalInput(o.startIso, schedule.timezone));
                                }
                              }}
                            >
                              {moving === key ? "Keep time" : "Move"}
                            </button>
                            <button
                              type="button"
                              className="btn text-sm"
                              disabled={pending}
                              onClick={() =>
                                run(() => cancelMeeting(wgId, o.originalStartIso, cancelNote || undefined))
                              }
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                    {moving === key && !struck && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          type="datetime-local"
                          className="text-sm"
                          value={moveTo}
                          onChange={(e) => setMoveTo(e.target.value)}
                        />
                        <span className="text-xs text-muted">{schedule.timezone}</span>
                        <button
                          type="button"
                          className="btn btn-primary text-sm"
                          disabled={pending || !moveTo}
                          onClick={() =>
                            run(async () => {
                              const res = await moveMeeting(
                                wgId, o.originalStartIso, moveTo, cancelNote || undefined,
                              );
                              if (res.ok) setMoving(null);
                              return res;
                            })
                          }
                        >
                          Move meeting
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Automatic minutes (ADR-0004) */}
        <h3 className="display text-lg mt-10">Automatic minutes</h3>
        <p className="text-sm text-muted mt-1">
          Google Meet transcribes each meeting; an AI assistant drafts the minutes
          from the transcript and emails the leads, who review and publish them from
          the session page. Nothing is published without a lead&apos;s approval, and
          transcripts stay internal unless a lead opts in per meeting.
        </p>
        <form action={settingsAction} className="space-y-1 mt-3 max-w-md">
          <input type="hidden" name="wgId" value={wgId} />
          <label className="flex items-center gap-2 text-sm py-2">
            <input type="checkbox" name="autoMinutes" defaultChecked={settings.autoMinutes} />
            Transcribe meetings and draft the minutes automatically
          </label>
          <div className="form-field">
            <label htmlFor="wg-lang">Language of the drafted minutes</label>
            <select id="wg-lang" name="language" defaultValue={settings.language}>
              {MINUTES_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
          {settingsState.error && (
            <p className="text-sm text-red-600">{settingsState.error}</p>
          )}
          {settingsState.ok && !savingSettings && (
            <p className="text-sm" style={{ color: "var(--color-green)" }}>
              {settingsState.message ?? "Saved."}
            </p>
          )}
          <button type="submit" className="btn text-sm" disabled={savingSettings}>
            {savingSettings ? "Saving…" : "Save settings"}
          </button>
        </form>
        <ul className="text-sm text-muted mt-3 space-y-1">
          <li>
            Meet room:{" "}
            {!schedule ? (
              "no schedule yet."
            ) : schedule.meetSpaceName ? (
              <>
                owned by the site; the leads (and Foundation admins) are its
                co-hosts, which is what starts the transcription when they join.
                {schedule.meetMembersError ? (
                  <span className="text-red-600">
                    {" "}Co-host sync problem: {schedule.meetMembersError}
                  </span>
                ) : schedule.meetMembersSyncedAt ? (
                  <>
                    {" "}Co-hosts synced <LocalTime iso={schedule.meetMembersSyncedAt} />.
                  </>
                ) : (
                  " Co-hosts are synced within minutes."
                )}
              </>
            ) : (
              "created by Google Calendar; the site takes it over within minutes (participants receive the new link through the usual calendar update)."
            )}
          </li>
          <li>
            Meet transcription:{" "}
            {!schedule ? (
              "no schedule yet."
            ) : !schedule.meetingCode ? (
              "waiting for the Meet link (Calendar sync)."
            ) : schedule.meetConfigError ? (
              <span className="text-red-600">
                failed — {schedule.meetConfigError}{" "}
                <button
                  type="button"
                  className="text-purple hover:underline"
                  disabled={pending}
                  onClick={() => run(() => retrySync(wgId))}
                >
                  Retry
                </button>
              </span>
            ) : !settings.autoMinutes ? (
              "off (automatic minutes are disabled for this group)."
            ) : (
              <>
                opens 20 minutes before each scheduled meeting and closes 30 minutes
                after its end; calls outside those windows are not transcribed.
                {schedule.meetAutoTranscribe !== null && (
                  <>
                    {" "}Currently {schedule.meetAutoTranscribe ? "on" : "off"}
                    {schedule.meetConfiguredAt && (
                      <>
                        {" "}(since <LocalTime iso={schedule.meetConfiguredAt} />)
                      </>
                    )}
                    .
                  </>
                )}
              </>
            )}
          </li>
          <li>
            AI drafting:{" "}
            {aiReady
              ? "ready."
              : "not configured on this server — transcripts are still collected; minutes are written by hand."}
          </li>
        </ul>
      </div>

      {/* People */}
      <div>
        <h3 className="display text-lg">Leads</h3>
        <ul className="mt-3 space-y-2">
          {leads.map((l) => (
            <li key={l.userId} className="flex items-center gap-2 text-sm">
              <PersonAvatars people={[l]} size={24} />
              <span className="flex-1">{l.name}</span>
              <button
                type="button"
                className="btn text-sm"
                disabled={pending}
                onClick={() => run(() => removeLead(wgId, l.userId))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form action={addAction} className="mt-3 flex items-center gap-2 max-w-sm">
          <input type="hidden" name="wgId" value={wgId} />
          <input
            name="email"
            type="email"
            required
            placeholder="Add a lead by email"
            className="text-sm flex-1 min-w-0"
          />
          <button type="submit" className="btn text-sm" disabled={adding}>
            {adding ? "Adding…" : "Add"}
          </button>
        </form>
        <p className="text-xs text-muted mt-2">
          No account with that email yet? They&apos;re invited to join the
          Foundation and become a lead once their membership is active.
        </p>
        {addState.error && <p className="text-sm text-red-600 mt-2">{addState.error}</p>}
        {addState.ok && addState.message && !adding && (
          <p className="text-sm mt-2" style={{ color: "var(--color-green)" }}>
            {addState.message}
          </p>
        )}

        <h3 className="display text-lg mt-10">Participants</h3>
        {participants.length === 0 ? (
          <p className="text-sm text-muted mt-2">Nobody has joined yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {participants.map((p) => (
              <li key={p.userId} className="flex items-center gap-2 text-sm">
                <PersonAvatars people={[p]} size={24} />
                <span className="flex-1">{p.name}</span>
                <button
                  type="button"
                  className="btn text-sm"
                  disabled={pending}
                  onClick={() => run(() => removeParticipant(wgId, p.userId))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <form action={inviteAction} className="mt-3 flex items-center gap-2 max-w-sm">
          <input type="hidden" name="wgId" value={wgId} />
          <input
            name="email"
            type="email"
            required
            placeholder="Invite a participant by email"
            className="text-sm flex-1 min-w-0"
          />
          <button type="submit" className="btn text-sm" disabled={inviting}>
            {inviting ? "Inviting…" : "Invite"}
          </button>
        </form>
        <p className="text-xs text-muted mt-2">
          Members join directly; anyone else is invited to join the Foundation
          as a Contributor or Associate and enters the group once their
          membership is active.
        </p>
        {inviteState.error && (
          <p className="text-sm text-red-600 mt-2">{inviteState.error}</p>
        )}
        {inviteState.ok && inviteState.message && !inviting && (
          <p className="text-sm mt-2" style={{ color: "var(--color-green)" }}>
            {inviteState.message}
          </p>
        )}

        {invites.length > 0 && (
          <>
            <h3 className="display text-lg mt-10">Pending invitations</h3>
            <p className="text-sm text-muted mt-1">
              Invited by email; they join the group automatically once their
              Foundation membership is active.
            </p>
            <ul className="mt-3 space-y-2">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate">{i.email}</span>
                  <span className={`badge ${i.role === "lead" ? "badge-purple" : ""}`}>
                    {i.role}
                  </span>
                  <button
                    type="button"
                    className="btn text-sm"
                    disabled={pending}
                    onClick={() => run(() => resendInvite(wgId, i.id))}
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    className="btn text-sm"
                    disabled={pending}
                    onClick={() => run(() => revokeInvite(wgId, i.id))}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {opError && <p className="text-sm text-red-600 mt-4">{opError}</p>}
      </div>
    </div>
  );
}
