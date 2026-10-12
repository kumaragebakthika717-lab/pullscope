import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  if (!user) redirect("/login");
  return (
    <div className="flex h-screen flex-col">
      <AppHeader email={user.email} />
      <div className="flex min-h-0 flex-1">
        <AppSidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
