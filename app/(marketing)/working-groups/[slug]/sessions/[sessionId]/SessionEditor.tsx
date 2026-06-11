"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteSession,
  publishSession,
  saveSession,
  type ActionState,
} from "../../actions";

// Note-taking for one meeting: tick who attended, write Markdown minutes.
// Save keeps a draft; Publish commits the record to the public minutes repo.
export default function SessionEditor({
  sessionId,
  slug,
  status,
  notesMd,
  people,
  checked,
  guests,
  publishReady,
  publishedUrl,
}: {
  sessionId: string;
  slug: string;
  status: "draft" | "published";
  notesMd: string;
  people: { userId: string; name: string }[];
  checked: string[];
  guests: string[];
  publishReady: boolean;
  publishedUrl: string | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState & { action?: "save" | "publish" }>({});

  function submit(action: "save" | "publish") {
    const form = formRef.current;
    if (!form) return;
    if (
      action === "publish" &&
      !confirm("Publish these minutes? They become a public record on GitHub and on this page.")
    ) {
      return;
    }
    const fd = new FormData(form);
    startTransition(async () => {
      const res =
        action === "save"
          ? await saveSession({}, fd)
          : await publishSession({}, fd);
      setResult({ ...res, action });
      if (action === "publish" && res.ok) router.refresh();
    });
  }

  return (
    <form ref={formRef} className="max-w-3xl">
      <input type="hidden" name="sessionId" value={sessionId} />

      <div className="flex items-center gap-3">
        {status === "published" ? (
          <span className="badge badge-green">Published</span>
        ) : (
          <span className="badge badge-amber">Draft</span>
        )}
        {publishedUrl && (
          <a href={publishedUrl} rel="noopener" className="text-sm text-purple hover:underline">
            Record on GitHub ↗
          </a>
        )}
      </div>

      <h2 className="display text-xl mt-8">Attendance</h2>
      <div className="mt-3 grid sm:grid-cols-2 gap-x-8 gap-y-2">
        {people.map((p) => (
          <label key={p.userId} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="attendeeUserIds"
              value={p.userId}
              defaultChecked={checked.includes(p.userId)}
            />
            {p.name}
          </label>
        ))}
      </div>
      <div className="form-field mt-4 max-w-md">
        <label htmlFor="guests">Guests (comma-separated)</label>
        <input
          id="guests"
          name="guests"
          defaultValue={guests.join(", ")}
          placeholder="Jane Doe (Acme), …"
        />
      </div>

      <h2 className="display text-xl mt-10">Minutes</h2>
      <p className="text-sm text-muted mt-1">
        Markdown. On publish this becomes
        {" "}<code>{slug}/minutes/&lt;date&gt;.md</code> in the public minutes
        repository.
      </p>
      <textarea
        name="notesMd"
        defaultValue={notesMd}
        rows={18}
        className="mt-3 w-full font-mono text-sm"
        placeholder={"## Agenda\n\n## Discussion\n\n## Decisions\n\n## Action items"}
      />

      {result.error && <p className="text-sm text-red-600 mt-3">{result.error}</p>}
      {result.ok && !pending && (
        <p className="text-sm mt-3" style={{ color: "var(--color-green)" }}>
          {result.action === "publish" ? "Published." : "Draft saved."}
        </p>
      )}
      {!publishReady && (
        <p className="text-sm text-amber-700 mt-3">
          The minutes repository isn't configured on this server — you can keep
          drafting, but publishing will fail until it is.
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-5">
        <button type="button" className="btn text-sm" disabled={pending} onClick={() => submit("save")}>
          {pending ? "Working…" : "Save draft"}
        </button>
        <button
          type="button"
          className="btn btn-primary text-sm"
          disabled={pending}
          onClick={() => submit("publish")}
        >
          {status === "published" ? "Republish" : "Publish minutes"}
        </button>
        {status === "draft" && (
          <button
            type="button"
            className="btn text-sm"
            disabled={pending}
            onClick={() => {
              if (!confirm("Delete this draft session record?")) return;
              startTransition(async () => {
                const res = await deleteSession(sessionId);
                if (res.error) setResult(res);
                else router.push(`/working-groups/${slug}`);
              });
            }}
          >
            Delete draft
          </button>
        )}
      </div>
    </form>
  );
}
