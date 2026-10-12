import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/actions/auth";

export function AppHeader({ email, children }: { email?: string | null; children?: React.ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-panel px-4">
      <Logo />
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      {email && (
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">
            {email}
          </Link>
          <form action={signOut}>
            <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out">
              <LogOut />
            </Button>
          </form>
        </div>
      )}
    </header>
  );
}
