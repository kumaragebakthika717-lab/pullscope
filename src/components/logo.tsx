import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 font-display text-xl font-bold tracking-wide uppercase ${className}`}>
      <span className="grid size-7 place-items-center rounded-md bg-brand text-sm text-black">PS</span>
      <span>
        Pull<span className="text-brand">Scope</span>
      </span>
    </Link>
  );
}
