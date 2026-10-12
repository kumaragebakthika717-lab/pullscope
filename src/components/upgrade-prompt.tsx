import { Lock } from "lucide-react";
import { FREE_MATCH_LIMIT } from "@/lib/constants";

export function UpgradePrompt() {
  return (
    <div className="space-y-3 rounded-lg border border-brand/40 bg-brand/10 p-4 text-sm">
      <div className="flex items-center gap-2 font-semibold text-brand">
        <Lock className="size-4" /> Free plan limit reached
      </div>
      <p className="text-muted-foreground">
        Free accounts can keep {FREE_MATCH_LIMIT} active matches. Archive or delete a match to start a new one, or
        upgrade to <span className="font-semibold text-foreground">Pro ($9/mo)</span> for unlimited matches and
        unwatermarked exports.
      </p>
      <p className="text-xs text-muted-foreground">Pro upgrades are coming soon.</p>
    </div>
  );
}
