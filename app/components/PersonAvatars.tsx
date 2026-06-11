// Overlapping avatar row (the GitHub-contributor look from the home page) for
// WG leads and participants: photo when the provider gave one, initials chip
// otherwise. Pure presentational; data shape matches lib/working-groups WgPerson.

export type Person = { userId: string; name: string; image: string | null };

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

export default function PersonAvatars({
  people,
  size = 28,
  max = 8,
}: {
  people: Person[];
  size?: number;
  max?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((p, i) => (
        <span
          key={p.userId}
          title={p.name}
          className="rounded-full overflow-hidden ring-2 ring-surface inline-block"
          style={{ width: size, height: size, marginLeft: i === 0 ? 0 : -size / 4 }}
        >
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
          ) : (
            <span
              className="grid w-full h-full place-items-center bg-purple text-white font-semibold"
              style={{ fontSize: size * 0.38 }}
            >
              {initialsOf(p.name)}
            </span>
          )}
        </span>
      ))}
      {extra > 0 && (
        <span className="ml-1.5 text-xs text-muted">+{extra}</span>
      )}
    </span>
  );
}
