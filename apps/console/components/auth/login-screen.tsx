"use client";

import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-provider";

export function LoginScreen() {
  const { login } = useAuth();
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const tokenInput = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setFailed(false);
    try {
      await login(token);
    } catch {
      setFailed(true);
      tokenInput.current?.focus();
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-xs space-y-5">
        <div className="flex items-center gap-2.5">
          <span className="size-2 shrink-0 rounded-full bg-primary" />
          <div className="leading-tight">
            <h1 className="text-sm font-semibold tracking-wide text-foreground">The Network</h1>
            <div className="text-xs text-muted-foreground">Home observability</div>
          </div>
        </div>

        <Card>
          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">Access token</span>
              <Input
                ref={tokenInput}
                type="password"
                name="access-token"
                value={token}
                autoFocus
                autoComplete="current-password"
                aria-invalid={failed || undefined}
                aria-describedby={failed ? "access-token-error" : undefined}
                className="w-full"
                onChange={(event) => {
                  setToken(event.target.value);
                  setFailed(false);
                }}
              />
            </label>
            {failed && (
              <p id="access-token-error" className="text-xs text-destructive">
                Invalid token
              </p>
            )}
            <Button type="submit" variant="primary" disabled={pending} className="w-full">
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
