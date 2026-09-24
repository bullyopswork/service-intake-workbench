"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import DemoEntryButton from "@/components/demo-entry-button";

type IntakeResult = { reference: string; duplicateOf: string | null };

export default function IntakeForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<IntakeResult | null>(null);

  useEffect(() => {
    if (!result) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    document.getElementById("intake")?.scrollIntoView({ behavior });
  }, [result]);

  function fillSample(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    const sample = {
      name: "Alex Example",
      email: "alex@example.com",
      category: "maintenance",
      subject: "Fictional door closer",
      description: "The fictional lobby door closes too quickly in this demonstration.",
    };
    for (const [name, value] of Object.entries(sample)) {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
        field.value = value;
      }
    }
    setError("");
    setResult(null);
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = {
      name: String(fields.get("name") ?? "").trim(),
      email: String(fields.get("email") ?? "").trim(),
      category: String(fields.get("category") ?? "").trim(),
      subject: String(fields.get("subject") ?? "").trim(),
      description: String(fields.get("description") ?? "").trim(),
    };

    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message ?? "We could not save that request. Check the details and try again.");
      setResult({ reference: data.reference, duplicateOf: data.duplicateOf ?? null });
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not save that request. Check the details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="intake-form" onSubmit={submitRequest}>
      {result ? (
        <>
          <div className="form-feedback form-feedback-success" role="status" aria-live="polite">
            <span className="feedback-check" aria-hidden="true">✓</span>
            <div><strong>Request received · {result.reference}</strong><span>{result.duplicateOf ? "A possible duplicate was flagged for staff review; your request remains separate." : "Your fictional request is now in the demo intake queue."}</span></div>
          </div>
          <div className="result-next"><span>Next: review it in the staff inbox.</span><DemoEntryButton className="button button-outline button-small" label="Open staff workspace" /></div>
          <button className="result-again" type="button" onClick={() => setResult(null)}>Send another fictional request ↗</button>
        </>
      ) : (
        <>
          <div className="sample-prompt"><span>Just looking around?</span><button type="button" onClick={fillSample}>Fill with a fictional example <span aria-hidden="true">↗</span></button></div>
          {error && <div className="form-feedback form-feedback-error" role="alert">{error}</div>}
          <div className="form-grid form-grid-two">
            <label className="field"><span>Fictional name <i>*</i></span><input name="name" autoComplete="off" placeholder="e.g. Alex Example" required maxLength={70} minLength={2} /></label>
            <label className="field"><span>Demo email address <i>*</i></span><input name="email" type="email" autoComplete="off" placeholder="alex@example.test" pattern="^[^@]+@(?:([a-zA-Z0-9-]+\.)*(?:test|example|invalid)|example\.com)$" aria-describedby="email-help" required maxLength={160} /><small className="field-hint" id="email-help">Use a demo address ending in .test, .example, .invalid, or example.com.</small></label>
          </div>
          <div className="form-grid form-grid-two">
            <label className="field"><span>What can we help with? <i>*</i></span>
              <select name="category" defaultValue="" required>
                <option value="" disabled>Select a category</option>
                <option value="maintenance">Maintenance</option>
                <option value="installation">Installation</option>
                <option value="billing">Billing question</option>
                <option value="other">Something else</option>
              </select>
            </label>
            <label className="field"><span>Short subject <i>*</i></span><input name="subject" placeholder="e.g. A tap that needs attention" required minLength={5} maxLength={100} /></label>
          </div>
          <label className="field"><span>A few more details <i>*</i></span><textarea name="description" rows={4} placeholder="Share the useful context. Please keep it fictional—no personal or sensitive details." required minLength={20} maxLength={1000} /></label>
          <div className="form-submit-row">
            <p><span aria-hidden="true">✳</span> Demo only. Use invented contact details—never enter real personal information. No messages are sent.</p>
            <button className="button button-primary form-submit" type="submit" disabled={busy}>
              {busy ? <><span className="button-spinner" aria-hidden="true" /> Saving…</> : <>Submit request <span aria-hidden="true">↗</span></>}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
