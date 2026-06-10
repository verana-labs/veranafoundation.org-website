"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { COUNTRIES, flagEmoji } from "@/app/lib/countries";

/**
 * Searchable country picker. Renders a text box that filters the ISO 3166-1
 * list as you type; selecting an entry stores its 2-letter code in a hidden
 * input named `name` (so the form submits the code, not the display label).
 */
export default function CountrySelect({
  name,
  required,
  defaultValue,
  placeholder = "Search countries…",
}: {
  name: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
}) {
  const initial = defaultValue
    ? COUNTRIES.find((c) => c.code === defaultValue.toUpperCase())
    : undefined;

  const [code, setCode] = useState(initial?.code ?? "");
  const [query, setQuery] = useState(
    initial ? `${initial.name}` : "",
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q,
    );
  }, [query]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function select(c: { code: string; name: string }) {
    setCode(c.code);
    setQuery(c.name);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && matches[active]) {
        e.preventDefault();
        select(matches[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const flag = flagEmoji(code);

  return (
    <div ref={rootRef} className="relative">
      {/* Submitted value: the 2-letter code. */}
      <input type="hidden" name={name} value={code} required={required} />
      <div className="relative">
        {flag && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base">
            {flag}
          </span>
        )}
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setCode(""); // typing invalidates the prior selection
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="field w-full"
          // Inline style: .form-field input's padding outranks a pl-* utility,
          // which left the flag sitting on top of the text.
          style={flag ? { paddingLeft: "2.25rem" } : undefined}
        />
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded border border-rule bg-elevated py-1 text-sm shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-muted">No match</li>
          ) : (
            matches.map((c, i) => (
              <li key={c.code} role="option" aria-selected={c.code === code}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => select(c)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                    i === active ? "bg-rule/40" : ""
                  } ${c.code === code ? "font-medium" : ""}`}
                >
                  <span>{flagEmoji(c.code)}</span>
                  <span className="flex-1">{c.name}</span>
                  <span className="text-muted">{c.code}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
