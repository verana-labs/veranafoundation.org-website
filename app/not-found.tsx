import Link from "next/link";

export default function NotFound() {
  return (
    <section>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center">
        <p className="tag mb-4">404</p>
        <h1 className="display text-4xl sm:text-5xl">Page not found</h1>
        <div className="accent-line mt-6 mx-auto" />
        <p className="mt-8 text-muted max-w-md mx-auto">
          That page isn&rsquo;t here. It may have moved, or the link may be
          broken.
        </p>
        <div className="mt-8 flex flex-wrap gap-4 justify-center">
          <Link href="/" className="btn btn-primary">
            Back home
          </Link>
          <Link href="/contribute" className="btn btn-secondary">
            Contribute
          </Link>
        </div>
      </div>
    </section>
  );
}
