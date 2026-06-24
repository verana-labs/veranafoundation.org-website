import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

/**
 * Renders blog Markdown (GitHub-flavored) into the site's `.prose-body` styling.
 * Supports headings, lists, tables, code, blockquotes, links, images, and raw
 * HTML such as <video> (via rehype-raw). External links open safely.
 */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ href, children, ...props }) => {
            const external = !!href && /^https?:\/\//i.test(href);
            return (
              <a
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                {...props}
              >
                {children}
              </a>
            );
          },
          // eslint-disable-next-line @next/next/no-img-element
          img: ({ src, alt }) => (
            <img
              src={typeof src === "string" ? src : ""}
              alt={alt ?? ""}
              loading="lazy"
              style={{ maxWidth: "100%", height: "auto", borderRadius: "8px" }}
            />
          ),
          video: ({ children, ...props }) => (
            <video
              controls
              style={{ maxWidth: "100%", height: "auto", borderRadius: "8px" }}
              {...props}
            >
              {children}
            </video>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
