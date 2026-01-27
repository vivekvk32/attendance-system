"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.push("/classes");
      }
    });
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus(null);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setStatus(error.message);
      } else {
        router.push("/classes");
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setStatus(error.message);
      } else {
        setStatus("Check your inbox to confirm your email.");
      }
    }
  }

  return (
    <div className="min-h-screen app-gradient flex items-center justify-center px-6">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>{mode === "login" ? "Welcome back" : "Create your account"}</CardTitle>
          <p className="text-sm text-slate-500">
            Use your teacher email to {mode === "login" ? "sign in" : "sign up"}.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input
              type="email"
              placeholder="you@school.edu"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button type="submit" className="w-full">
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
            {status ? <p className="text-sm text-slate-600">{status}</p> : null}
          </form>
          <div className="mt-6 text-center text-sm text-slate-500">
            {mode === "login" ? (
              <button className="font-semibold text-brand-600" onClick={() => setMode("signup")}>
                New here? Create an account
              </button>
            ) : (
              <button className="font-semibold text-brand-600" onClick={() => setMode("login")}>
                Already have an account? Sign in
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
