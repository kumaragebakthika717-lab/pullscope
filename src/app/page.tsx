import Link from "next/link";
import { ArrowRight, Clock, Keyboard, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ReportCardView } from "@/components/report-card-view";
import { DEMO_CARD } from "@/lib/demo-card";
import { RATING_COLORS } from "@/lib/constants";

const FEATURES = [
  {
    icon: Clock,
    title: "Frame-accurate evidence",
    body: "Every rating is pinned to an exact timestamp. Click any note to jump the video to that frame.",
  },
  {
    icon: Keyboard,
    title: "Keyboard-first scoring",
    body: "Press A, hit 1 / 2 / 3, type a note, Enter. Frame-step with , and . — built for analysts who scrub.",
  },
  {
    icon: Share2,
    title: "Shareable report cards",
    body: "Generate a public scorecard and a PNG for socials, comparing both pullers across your whole rubric.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-4 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/login?mode=signup">Sign up free</Link>
          </Button>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-4 pt-16 pb-12 text-center sm:pt-24">
          <p className="text-xs font-semibold tracking-[0.25em] text-brand uppercase">Arm-wrestling match analysis</p>
          <h1 className="mt-4 font-display text-5xl leading-[0.95] font-extrabold uppercase sm:text-7xl">
            Score the pull. <span className="text-brand">Prove it</span> on the tape.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Paste a YouTube link or upload a match. Score both pullers on your technique rubric with timestamped{" "}
            <Dot color={RATING_COLORS.green} /> good, <Dot color={RATING_COLORS.red} /> bad and{" "}
            <Dot color={RATING_COLORS.black} /> neutral calls. Export a report card.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/login?mode=signup">
                Start analyzing <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#example">See an example</a>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Free: 3 active matches. No card required.</p>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-3 sm:px-8">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border bg-panel p-5">
              <Icon className="size-5 text-brand" />
              <h2 className="mt-3 font-display text-xl font-bold uppercase">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>

        <section id="example" className="scroll-mt-8 border-t bg-panel/40 px-4 py-16 sm:px-8">
          <div className="mx-auto mb-8 max-w-6xl">
            <p className="text-xs font-semibold tracking-[0.25em] text-brand uppercase">Example report card</p>
            <h2 className="mt-2 font-display text-3xl font-bold uppercase sm:text-4xl">
              Every verdict, backed by a timestamp
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Expand any attribute to see the evidence. Every new account starts with this match pre-loaded.
            </p>
          </div>
          <ReportCardView card={DEMO_CARD} preview />
        </section>

        <section className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h2 className="font-display text-4xl font-extrabold uppercase">Stop analyzing in spreadsheets</h2>
          <p className="mt-3 text-muted-foreground">
            Ships with the 16-attribute &ldquo;great technique&rdquo; framework. Rename, reorder or add your own.
          </p>
          <Button size="lg" className="mt-6" asChild>
            <Link href="/login?mode=signup">
              Score your first match <ArrowRight />
            </Link>
          </Button>
        </section>
      </main>

      <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">
        PullScope · Built for arm-wrestling analysts, coaches and fans.
      </footer>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block size-2.5 rounded-full align-middle ring-1 ring-white/20" style={{ background: color }} />;
}
