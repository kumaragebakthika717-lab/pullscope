"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Film, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteMatch, setMatchStatus } from "@/app/actions/matches";
import { youtubeThumbnail } from "@/lib/youtube";
import { formatShort } from "@/lib/timecode";
import type { Match } from "@/lib/types";
import { useState } from "react";

export function MatchCard({ match, annotationCount }: { match: Match; annotationCount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const archived = match.status === "archived";

  function toggleArchive() {
    start(async () => {
      const res = await setMatchStatus(match.id, archived ? "active" : "archived");
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  function remove() {
    start(async () => {
      const res = await deleteMatch(match.id);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Match deleted");
        router.refresh();
      }
    });
  }

  return (
    <div className={`group relative overflow-hidden rounded-xl border bg-card transition-colors hover:border-brand/50 ${archived ? "opacity-60" : ""} ${pending ? "pointer-events-none opacity-50" : ""}`}>
      <Link href={`/match/${match.id}`} className="block">
        <div className="relative aspect-video bg-black">
          {match.youtube_id ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={youtubeThumbnail(match.youtube_id)} alt="" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-muted-foreground">
              <Film className="size-10" />
            </div>
          )}
          {match.duration_sec ? (
            <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 font-mono text-xs">
              {formatShort(match.duration_sec)}
            </span>
          ) : null}
        </div>
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-1 font-semibold">{match.title}</h3>
          <p className="line-clamp-1 text-sm text-muted-foreground">
            {match.left_puller} <span className="text-brand">vs</span> {match.right_puller}
          </p>
          <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
            {match.event_name && <span className="line-clamp-1">{match.event_name}</span>}
            <span className="ml-auto">{annotationCount} notes</span>
            <Badge variant={archived ? "secondary" : "outline"}>{archived ? "Archived" : "Active"}</Badge>
          </div>
        </div>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant="secondary"
            className="absolute top-2 right-2 bg-black/70 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label="Match options"
          >
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={toggleArchive}>
            {archived ? <ArchiveRestore /> : <Archive />}
            {archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this match?</AlertDialogTitle>
            <AlertDialogDescription>
              All annotations, screenshots, uploaded video and its public report card will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
