"use client";

import { useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/**
 * A date and a 24-hour time, valued like <input type="datetime-local">
 * ("YYYY-MM-DDTHH:mm"). The native datetime-local picker follows the
 * browser's locale and shows AM/PM on English systems; no attribute forces a
 * 24-hour clock, so the time is two selects instead. Minutes step by 5 (an
 * existing off-step minute is kept as an option).
 *
 * With `name` it submits through a hidden input (uncontrolled forms); with
 * `value`/`onChange` it is controlled.
 */
export default function DateTime24Input({
  id,
  name,
  defaultValue = "",
  value,
  onChange,
  required,
  className,
}: {
  id?: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  className?: string;
}) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [date = "", time = ""] = current.split("T");
  const [hour = "", minute = ""] = time.split(":");
  const minutes = minute && !MINUTES.includes(minute) ? [...MINUTES, minute].sort() : MINUTES;

  function update(next: { date?: string; hour?: string; minute?: string }) {
    const d = next.date ?? date;
    const h = next.hour ?? (hour || "09");
    const m = next.minute ?? (minute || "00");
    const v = d ? `${d}T${h}:${m}` : "";
    if (value === undefined) setInner(v);
    onChange?.(v);
  }

  return (
    <span className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <input
        id={id}
        type="date"
        required={required}
        value={date}
        onChange={(e) => update({ date: e.target.value })}
        style={{ width: "auto" }}
      />
      <select
        aria-label="Hour (24-hour clock)"
        value={hour}
        onChange={(e) => update({ hour: e.target.value })}
        disabled={!date}
        style={{ width: "auto" }}
      >
        {!hour && <option value="">--</option>}
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span aria-hidden>:</span>
      <select
        aria-label="Minute"
        value={minute}
        onChange={(e) => update({ minute: e.target.value })}
        disabled={!date}
        style={{ width: "auto" }}
      >
        {!minute && <option value="">--</option>}
        {minutes.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      {name && <input type="hidden" name={name} value={current} />}
    </span>
  );
}
