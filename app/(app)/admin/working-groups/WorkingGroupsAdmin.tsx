"use client";

import { useActionState } from "react";
import { createWg, updateWg, deleteWg, type WgState } from "./actions";

type Wg = {
  id: string;
  name: string;
  description: string | null;
  requiredClass: "any" | "associate";
  link: string;
  showOnHome: boolean;
};

const checkbox = "flex items-center gap-2 text-sm";

const input = "rounded border border-rule bg-surface px-3 py-2 text-sm w-full";

function ClassSelect({ value }: { value?: "any" | "associate" }) {
  return (
    <select name="requiredClass" defaultValue={value ?? "any"} className={input}>
      <option value="any">Any active membership</option>
      <option value="associate">Active Associate only</option>
    </select>
  );
}

export default function WorkingGroupsAdmin({ groups }: { groups: Wg[] }) {
  const [state, createAction, pending] = useActionState<WgState, FormData>(
    createWg,
    {},
  );

  return (
    <div className="grid gap-8">
      <section>
        <h2 className="display text-xl">Add a working group</h2>
        <form action={createAction} className="grid gap-2 max-w-xl mt-2">
          <input name="name" required placeholder="Name" className={input} />
          <input name="description" placeholder="Description (optional)" className={input} />
          <input name="link" type="url" required placeholder="https://… (external space)" className={input} />
          <ClassSelect />
          <label className={checkbox}>
            <input type="checkbox" name="showOnHome" /> Show on home page
          </label>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state.ok && <p className="text-sm text-green-600">Created.</p>}
          <button type="submit" className="btn btn-primary w-fit" disabled={pending}>
            {pending ? "Adding…" : "Add"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="display text-xl">Working groups</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-muted mt-2">None yet.</p>
        ) : (
          <ul className="mt-2 grid gap-3">
            {groups.map((wg) => (
              <li key={wg.id} className="card grid gap-2">
                <form action={updateWg} className="grid gap-2 max-w-xl">
                  <input type="hidden" name="id" value={wg.id} />
                  <input name="name" required defaultValue={wg.name} className={input} />
                  <input name="description" defaultValue={wg.description ?? ""} placeholder="Description (optional)" className={input} />
                  <input name="link" type="url" required defaultValue={wg.link} className={input} />
                  <ClassSelect value={wg.requiredClass} />
                  <label className={checkbox}>
                    <input
                      type="checkbox"
                      name="showOnHome"
                      defaultChecked={wg.showOnHome}
                    />{" "}
                    Show on home page
                  </label>
                  <button type="submit" className="btn text-xs w-fit">Save</button>
                </form>
                <form action={deleteWg}>
                  <input type="hidden" name="id" value={wg.id} />
                  <button type="submit" className="btn text-xs w-fit">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
