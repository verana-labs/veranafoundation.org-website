"use client";

import { useActionState, useState, useTransition } from "react";
import type { Person } from "@/app/components/PersonAvatars";
import PersonAvatars from "@/app/components/PersonAvatars";
import {
  addLead,
  cancelMeeting,
  deleteSchedule,
  inviteParticipant,
  removeLead,
  removeParticipant,
  resendInvite,
  restoreMeeting,
  retrySync,
  revokeInvite,
  saveSchedule,
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
};

export type OccurrenceView = {
  startIso: string;
  label: string;
  cancelled: boolean;
};

export type InviteView = {
  id: string;
  email: string;
  role: "lead" | "participant";
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
  schedule,
  occurrences,
  leads,
  participants,
  invites,
}: {
  wgId: string;
  calendarReady: boolean;
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
            Google Calendar isn't configured on this server — schedules save,
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
              Cancel a single date (e.g. nobody can attend) — it's removed from
              everyone's calendar; restoring puts it back.
            </p>
            <input
              type="text"
              className="mt-3 text-sm w-full max-w-sm"
              placeholder="Optional cancellation note"
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
            />
            <ul className="mt-2 space-y-2">
              {occurrences.map((o) => (
                <li key={o.startIso} className="flex items-center justify-between gap-3 text-sm">
                  <span className={o.cancelled ? "line-through text-muted" : ""}>
                    {o.label}
                  </span>
                  <button
                    type="button"
                    className="btn text-sm"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        o.cancelled
                          ? restoreMeeting(wgId, o.startIso)
                          : cancelMeeting(wgId, o.startIso, cancelNote || undefined),
                      )
                    }
                  >
                    {o.cancelled ? "Restore" : "Cancel"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
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
          No account with that email yet? They're invited to join the
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
