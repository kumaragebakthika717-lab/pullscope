import Link from "next/link";

export default function CardNotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div className="space-y-3">
        <h1 className="font-display text-4xl font-bold uppercase">Report card not found</h1>
        <p className="text-muted-foreground">The link may be wrong, or the match was deleted.</p>
        <Link href="/" className="text-brand hover:underline">
          Go to PullScope
        </Link>
      </div>
    </main>
  );
}
