/**
 * Author byline: avatar (if a validated image URL is provided) + "By {author}".
 * When `social` is set, the avatar and name link to the author's social profile
 * and open in a new tab.
 */
export function AuthorByline({
  author,
  avatar,
  social,
  size = 40,
}: {
  author: string;
  avatar: string | null;
  social: string | null;
  size?: number;
}) {
  const avatarImg = avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatar}
      alt={author}
      width={size}
      height={size}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  ) : null;

  const name = <span className="text-sm text-muted font-mono">By {author}</span>;

  if (social) {
    return (
      <a
        href={social}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 group w-fit"
      >
        {avatarImg}
        <span className="text-sm text-muted font-mono group-hover:text-ink group-hover:underline">
          By {author}
        </span>
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {avatarImg}
      {name}
    </div>
  );
}
