import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Workspace } from "@/components/workspace/workspace";
import { ExportCardButton } from "@/components/workspace/export-card-button";
import { requireUser } from "@/lib/supabase/server";
import { getMatch } from "@/app/actions/matches";
import { getMyRubric } from "@/app/actions/rubric";
import { listAnnotations } from "@/app/actions/annotations";
import { listRoundBoundaries } from "@/app/actions/rounds";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const match = await getMatch((await params).id);
  return { title: match?.title ?? "Match" };
}

export default async function MatchPage({ params }: Params) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) redirect(`/login?next=/match/${id}`);

  const match = await getMatch(id);
  if (!match) notFound();

  const [{ attributes }, annotations, rounds, card, video] = await Promise.all([
    getMyRubric(),
    listAnnotations(id),
    listRoundBoundaries(id),
    supabase.from("report_cards").select("slug").eq("match_id", id).maybeSingle(),
    match.video_path ? supabase.storage.from("videos").createSignedUrl(match.video_path, 60 * 60 * 6) : Promise.resolve(null),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader email={user.email}>
        <div className="flex min-w-0 flex-1 items-center gap-2 border-l pl-4 text-sm">
          <span className="truncate font-semibold">{match.title}</span>
          {match.event_name && <span className="hidden truncate text-muted-foreground lg:inline">· {match.event_name}</span>}
          <span className="hidden truncate text-muted-foreground xl:inline">
            · {match.left_puller} <span className="text-brand">vs</span> {match.right_puller}
          </span>
        </div>
        <ExportCardButton matchId={match.id} initialSlug={card.data?.slug ?? null} />
      </AppHeader>
      <Workspace
        match={match}
        userId={user.id}
        attributes={attributes}
        initialAnnotations={annotations}
        initialRounds={rounds}
        videoUrl={video?.data?.signedUrl ?? null}
      />
    </div>
  );
}
