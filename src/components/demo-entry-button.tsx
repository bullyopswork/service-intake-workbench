"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DemoEntryButtonProps = {
  className?: string;
  label?: string;
};

export default function DemoEntryButton({ className = "", label = "Open demo workspace" }: DemoEntryButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function enterDemo() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/demo/enter", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message ?? "The demo workspace could not be opened. Please try again.");
      router.push("/workspace");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The demo workspace could not be opened. Please try again.");
      setBusy(false);
    }
  }

  return (
    <span className="demo-entry-wrap">
      <button className={className} type="button" onClick={enterDemo} disabled={busy}>
        {busy ? "Opening workspace…" : label}<span aria-hidden="true"> ↗</span>
      </button>
      {error && <span className="entry-error" role="alert">{error}</span>}
    </span>
  );
}
