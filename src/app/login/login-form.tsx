"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signInWithGoogle, signUp } from "@/app/actions/auth";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") ? "Sign-in link was invalid or expired. Please try again." : null,
  );
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [googlePending, setGooglePending] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    startTransition(async () => {
      if (mode === "signin") {
        const res = await signIn({ email, password });
        if (!res.ok) return setError(res.error);
        router.replace(next);
        router.refresh();
      } else {
        const res = await signUp({ email, password, next });
        if (!res.ok) return setError(res.error);
        if (res.data.needsConfirmation) {
          setInfo("Check your inbox to confirm your email, then sign in.");
        } else {
          router.replace(next);
          router.refresh();
        }
      }
    });
  }

  async function google() {
    setGooglePending(true);
    const res = await signInWithGoogle(next);
    if (!res.ok) {
      setGooglePending(false);
      toast.error(res.error);
      return;
    }
    window.location.href = res.data.url;
  }

  return (
    <div className="space-y-5 rounded-xl border bg-card p-6">
      <div className="space-y-1 text-center">
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mode === "signin" ? "Sign in to keep scoring matches." : "Free: 3 active matches, full rubric."}
        </p>
      </div>

      <Button variant="outline" className="h-10 w-full" onClick={google} disabled={googlePending}>
        {googlePending ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10"
          />
        </div>
        {error && <p className="text-sm text-bad" role="alert">{error}</p>}
        {info && <p className="text-sm text-good">{info}</p>}
        <Button type="submit" className="h-10 w-full font-semibold" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {mode === "signin" ? "Sign in" : "Sign up"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "signin" ? "No account yet? " : "Already have an account? "}
        <button
          type="button"
          className="font-medium text-brand hover:underline"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
        >
          {mode === "signin" ? "Sign up" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
