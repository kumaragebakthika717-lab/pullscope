import type { Metadata } from "next";
import { Swords } from "lucide-react";
import { MatchCard } from "@/components/match-card";
import { NewMatchDialog } from "@/components/new-match-dialog";
import { requireUser } from "@/lib/supabase/server";
import { FREE_MATCH_LIMIT } from "@/lib/constants";
import type { Match } from "@/lib/types";

export const metadata: Metadata = { title: "Matches" };

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const [{ data: matches }, { data: profile }] = await Promise.all([
    supabase.from("matches").select("*, annotations(count)").eq("user_id", user!.id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("plan").eq("id", user!.id).single(),
  ]);

  const rows = (matches ?? []) as (Match & { annotations: { count: number }[] })[];
  const active = rows.filter((m) => m.status === "active").length;
  const isFree = (profile?.plan ?? "free") === "free";
  const atLimit = isFree && active >= FREE_MATCH_LIMIT;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Your matches</h1>
          <p className="text-sm text-muted-foreground">
            {isFree ? (
              <>
                <span className={atLimit ? "font-semibold text-brand" : ""}>
                  {active}/{FREE_MATCH_LIMIT}
                </span>{" "}
                active matches on the Free plan
              </>
            ) : (
              `${active} active matches`
            )}
          </p>
        </div>
        <NewMatchDialog atLimit={atLimit} />
      </div>

      {rows.length === 0 ? (
        <div className="grid place-items-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <Swords className="size-10 text-muted-foreground" />
          <div>
            <p className="font-semibold">No matches yet</p>
            <p className="text-sm text-muted-foreground">Paste a YouTube link or upload a match to start scoring.</p>
          </div>
          <NewMatchDialog atLimit={atLimit} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((m) => (
            <MatchCard key={m.id} match={m} annotationCount={m.annotations?.[0]?.count ?? 0} />
          ))}
        </div>
      )}
    </div>
  );
}
