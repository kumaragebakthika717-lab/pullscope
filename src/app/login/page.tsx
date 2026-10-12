import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
