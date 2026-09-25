"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiError, RequestCategory, RequestSource, RequestStatus, RequestSummary, ServiceRequest } from "@/lib/types";

type InboxResponse = { requests: RequestSummary[] };
type DetailResponse = { request: ServiceRequest };
type MutationAction = "assign" | "start" | "resolve" | "reopen";
type StatusFilter = RequestStatus | "all";
type SourceFilter = RequestSource | "all";

class ApiFailure extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiFailure";
    this.status = status;
  }
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null) as (T & ApiError) | null;
  if (!response.ok) throw new ApiFailure(data?.error?.message ?? "Something went wrong. Please try again.", response.status);
  return data as T;
}

function formatDate(value: string, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", withTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" }).format(date);
}

function statusLabel(status: RequestStatus) {
  return ({ new: "New", triage: "Needs review", in_progress: "In progress", resolved: "Resolved" } as const)[status];
}

function categoryLabel(category: RequestCategory) {
  return ({ maintenance: "Maintenance", installation: "Installation", billing: "Billing", other: "Other" } as const)[category];
}

function sourceLabel(source: RequestSource) {
  return ({ web: "Web intake", partner: "Partner feed", seed: "Sample" } as const)[source];
}

function Brand() {
  return (
    <Link href="/" className="brand-lockup workspace-brand" aria-label="Commonline Service Desk — go to public intake">
      <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 3.75 28.25 16 16 28.25 3.75 16 16 3.75Z" fill="currentColor" /><path d="M16 9v14M9 16h14" stroke="#F7F6F0" strokeWidth="2.2" strokeLinecap="round" /></svg></span>
      <span><strong>COMMONLINE</strong><small>SERVICE DESK</small></span>
    </Link>
  );
}

function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`status-badge status-${status}`}><i aria-hidden="true" />{statusLabel(status)}</span>;
}

function LoadingRows() {
  return <div className="loading-rows" role="status" aria-label="Loading requests"><span /><span /><span /></div>;
}

export default function WorkspaceApp() {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailRevision, setDetailRevision] = useState(0);
  const [selected, setSelected] = useState<ServiceRequest | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<MutationAction | "replay" | "reset" | "enter" | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("Maya Chen");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [needsDemoAccess, setNeedsDemoAccess] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const loadInbox = useCallback(async (quiet = false) => {
    try {
      const data = await apiJson<InboxResponse>("/api/requests");
      const orderedRequests = [...data.requests].sort((left, right) => {
        if (left.source === "seed" && right.source !== "seed") return 1;
        if (left.source !== "seed" && right.source === "seed") return -1;
        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      });
      setRequests(orderedRequests);
      setNeedsDemoAccess(false);
      setError("");
      if (!quiet && orderedRequests.length) {
        setSelected(null);
        setDetailLoading(true);
      }
      setSelectedId((current) => current && orderedRequests.some((request) => request.id === current)
        ? current
        : orderedRequests[0]?.id ?? null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The request inbox could not be loaded.";
      if (cause instanceof ApiFailure && (cause.status === 401 || cause.status === 403)) setNeedsDemoAccess(true);
      setError(message);
    } finally {
      if (!quiet) setBootLoading(false);
    }
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    const timer = window.setTimeout(() => { void loadInbox(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadInbox]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void apiJson<DetailResponse>(`/api/requests/${encodeURIComponent(selectedId)}`)
      .then((data) => { if (active) { setSelected(data.request); setAssignee(data.request.assignee ?? "Maya Chen"); } })
      .catch((cause: unknown) => { if (active) setDetailError(cause instanceof Error ? cause.message : "Request details could not be loaded."); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId, detailRevision]);

  function chooseRequest(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    setSelected(null);
    setDetailError("");
    setDetailLoading(true);
  }

  const filteredRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesStatus = statusFilter === "all" || request.status === statusFilter;
      const matchesSource = sourceFilter === "all" || request.source === sourceFilter;
      const matchesQuery = !normalizedQuery || [request.reference, request.name, request.subject, request.email]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
      return matchesStatus && matchesSource && matchesQuery;
    });
  }, [requests, statusFilter, sourceFilter, query]);

  const openCount = requests.filter((request) => request.status !== "resolved").length;
  const newCount = requests.filter((request) => request.status === "new").length;
  const reviewCount = requests.filter((request) => request.duplicateOf !== null).length;

  async function enterDemoRole() {
    setBusyAction("enter");
    setError("");
    try {
      await apiJson<{ ok: true }>("/api/demo/enter", { method: "POST" });
      setNeedsDemoAccess(false);
      await loadInbox();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The demo workspace could not be opened.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runAction(action: MutationAction, assigneeValue?: string) {
    if (!selected) return;
    setBusyAction(action);
    setError("");
    setNotice("");
    try {
      const body: { action: MutationAction; assignee?: string; note?: string } = { action };
      if (action === "assign") body.assignee = assigneeValue ?? assignee;
      if (note.trim()) body.note = note.trim();
      const data = await apiJson<DetailResponse>(`/api/requests/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSelected(data.request);
      setNote("");
      setNotice(action === "assign" ? `Assigned to ${assigneeValue ?? assignee}.` : `Request ${action === "start" ? "moved into the work queue" : action === "resolve" ? "marked resolved" : "reopened"}.`);
      await loadInbox(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That change could not be saved.");
    } finally {
      setBusyAction(null);
    }
  }

  async function replayPartnerEvent() {
    setBusyAction("replay");
    setError("");
    setNotice("");
    try {
      const data = await apiJson<{ requestId: string; reference: string; replayed: boolean }>("/api/demo/replay", { method: "POST" });
      await loadInbox(true);
      chooseRequest(data.requestId);
      setNotice(data.replayed
        ? `Replay confirmed — ${data.reference} is the same partner request (no duplicate created).`
        : `Fictional partner request received — ${data.reference}. Replay it again to see idempotency.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The partner event could not be replayed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function resetWorkspace() {
    setBusyAction("reset");
    setError("");
    setNotice("");
    try {
      await apiJson<{ ok: true }>("/api/demo/reset", { method: "POST" });
      setConfirmReset(false);
      setStatusFilter("all");
      setSourceFilter("all");
      setQuery("");
      setNotice("Workspace reset to the original fictional examples.");
      setSelected(null);
      await loadInbox();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The workspace could not be reset.");
    } finally {
      setBusyAction(null);
    }
  }

  const statusAction: MutationAction | null = selected?.status === "resolved" ? "reopen" : selected?.status === "in_progress" ? "resolve" : selected?.status === "triage" ? "start" : null;
  const statusActionLabel = statusAction === "reopen" ? "Reopen request" : statusAction === "resolve" ? "Resolve request" : "Start work";
  const sortedEvents = selected ? [...selected.events].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) : [];
  const duplicateReference = selected?.duplicateOf ? requests.find((request) => request.id === selected.duplicateOf)?.reference : null;

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <div className="workspace-header-inner">
          <Brand />
          <div className="workspace-head-center"><span className="workspace-heading-kicker">WORKSPACE</span><span className="workspace-heading-name">Service intake</span></div>
          <div className="workspace-head-actions">
            <span className="role-chip"><span className="role-chip-dot" />Demo dispatcher</span>
            <Link className="workspace-back-link" href="/">Public intake <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </header>

      <div className="workspace-frame">
        <section className="workspace-intro">
          <div>
            <p className="eyebrow"><span className="eyebrow-rule" /> YOUR SYNTHETIC WORKSPACE</p>
            <h1>Good work starts <em>with a clear view.</em></h1>
            <p>Review requests, give them an owner, and keep the next step visible.</p>
            <a className="mobile-inbox-jump" href="#request-inbox">Go to the inbox <span aria-hidden="true">↓</span></a>
          </div>
          <div className="workspace-intro-actions">
            <button className="button button-outline" type="button" onClick={replayPartnerEvent} disabled={busyAction !== null}>
              <span aria-hidden="true">↻</span> {busyAction === "replay" ? "Replaying…" : "Replay partner event"}
            </button>
            {!confirmReset ? (
              <button className="text-button" type="button" onClick={() => setConfirmReset(true)} disabled={busyAction !== null}>Reset demo</button>
            ) : (
              <span className="reset-confirm"><span>Reset this workspace?</span><button type="button" onClick={resetWorkspace} disabled={busyAction !== null}>{busyAction === "reset" ? "Resetting…" : "Yes, reset"}</button><button type="button" onClick={() => setConfirmReset(false)} disabled={busyAction !== null}>Cancel</button></span>
            )}
          </div>
        </section>

        <div className="demo-banner" role="note">
          <span className="demo-banner-symbol" aria-hidden="true">✳</span>
          <span><strong>Demo-only dispatcher role.</strong> Use fictional names and requests only. No real customer system or messaging service is connected.</span>
          <span className="demo-banner-meta">SESSION WORKSPACE <i /> PRIVATE TO THIS SESSION</span>
        </div>

        {(error || notice) && <div className={`workspace-feedback ${error ? "workspace-feedback-error" : "workspace-feedback-success"}`} role={error ? "alert" : "status"}>
          <span>{error || notice}</span>{notice && <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">×</button>}
        </div>}

        <section className="metric-strip" aria-label="Inbox summary">
          <div className="metric-cell"><span className="metric-label">OPEN REQUESTS</span><strong>{bootLoading ? "—" : String(openCount).padStart(2, "0")}</strong><small>Across your workspace</small></div>
          <div className="metric-cell"><span className="metric-label">NEW REQUESTS</span><strong>{bootLoading ? "—" : String(newCount).padStart(2, "0")}</strong><small>Ready for a first look</small></div>
          <div className="metric-cell"><span className="metric-label">POSSIBLE DUPLICATES</span><strong>{bootLoading ? "—" : String(reviewCount).padStart(2, "0")}</strong><small>Flagged for human review</small></div>
          <div className="metric-aside"><span className="metric-aside-icon" aria-hidden="true">◷</span><span><strong>Small steps add up.</strong><small>Every update leaves a clear activity trail.</small></span></div>
        </section>

        <div className="workbench-grid">
          <aside className="inbox-panel" id="request-inbox" aria-label="Request inbox">
            <div className="inbox-panel-header">
              <div><p className="eyebrow eyebrow-muted">THE QUEUE</p><h2>Inbox <span>{requests.length}</span></h2></div>
              <span className="inbox-refresh-mark" title="Updates saved to your demo workspace" aria-label="Demo workspace">●</span>
            </div>
            <label className="search-field"><span className="search-icon" aria-hidden="true">⌕</span><span className="visually-hidden">Search requests</span><input type="search" placeholder="Search requests…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <div className="filter-row">
              <label><span className="visually-hidden">Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="all">All statuses</option><option value="new">New</option><option value="triage">Needs review</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></label>
              <label><span className="visually-hidden">Filter by source</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}><option value="all">All sources</option><option value="web">Web intake</option><option value="partner">Partner</option><option value="seed">Sample</option></select></label>
            </div>
            <div className="inbox-list-label"><span>REQUESTS</span><span>{filteredRequests.length} SHOWN</span></div>
            {needsDemoAccess ? (
              <div className="inbox-state inbox-access-state"><span className="empty-icon" aria-hidden="true">↗</span><strong>Open your demo workspace</strong><p>A demo-only dispatcher role lets you explore fictional requests and workflow actions.</p><button className="button button-primary button-full" type="button" onClick={enterDemoRole} disabled={busyAction !== null}>{busyAction === "enter" ? "Opening…" : "Enter demo workspace"}</button></div>
            ) : bootLoading ? <LoadingRows /> : error && requests.length === 0 ? (
              <div className="inbox-state"><strong>Inbox unavailable</strong><p>{error}</p><button className="text-button" type="button" onClick={() => void loadInbox()} disabled={bootLoading}>Try again</button></div>
            ) : filteredRequests.length === 0 ? (
              <div className="inbox-state"><span className="empty-icon" aria-hidden="true">⌕</span><strong>{requests.length ? "No matching requests" : "A fresh start"}</strong><p>{requests.length ? "Try another search or filter." : "Send a fictional intake request to see it appear here."}</p><Link href="/" className="inline-link">Go to public intake ↗</Link></div>
            ) : (
              <ul className="inbox-list">
                {filteredRequests.map((request) => (
                  <li key={request.id}><button type="button" className={`inbox-item ${selectedId === request.id ? "inbox-item-selected" : ""}`} onClick={() => chooseRequest(request.id)} aria-pressed={selectedId === request.id}>
                    <span className={`inbox-item-icon inbox-item-${request.category}`} aria-hidden="true">{request.category === "maintenance" ? "⌂" : request.category === "installation" ? "↗" : request.category === "billing" ? "$" : "✳"}</span>
                    <span className="inbox-item-main"><span className="inbox-item-title">{request.subject}</span><span className="inbox-item-name">{request.name} <i>·</i> {request.reference}</span><span className="inbox-item-meta">{sourceLabel(request.source)} <i>·</i> {formatDate(request.updatedAt)}</span></span>
                    <span className="inbox-item-status"><StatusBadge status={request.status} />{request.duplicateOf && <span className="duplicate-mini">Possible duplicate</span>}</span>
                  </button></li>
                ))}
              </ul>
            )}
            <div className="inbox-footnote"><span className="status-dot" /> Changes save to this session&apos;s synthetic workspace.</div>
          </aside>

          <section className="detail-panel" aria-label="Selected request details">
            {detailLoading ? <div className="detail-loading"><span className="detail-loader" /><strong>Opening request…</strong><span>Loading details and activity</span></div> : detailError ? (
              <div className="detail-empty"><span className="detail-empty-symbol" aria-hidden="true">!</span><h2>Details could not be loaded</h2><p>{detailError}</p><button className="button button-outline" type="button" onClick={() => { setDetailError(""); setDetailLoading(true); setDetailRevision((revision) => revision + 1); }} disabled={!selectedId}>Try again</button></div>
            ) : selected ? (
              <>
                <div className="detail-topline"><span>REQUEST <i>/</i> {selected.reference}</span><span className="detail-date">Received {formatDate(selected.createdAt, true)}</span></div>
                <div className="detail-title-row"><div><p className="eyebrow eyebrow-muted">{categoryLabel(selected.category)} <i>·</i> {sourceLabel(selected.source)}</p><h2>{selected.subject}</h2></div><StatusBadge status={selected.status} /></div>
                {selected.duplicateOf && <div className="duplicate-alert"><span className="duplicate-alert-icon" aria-hidden="true">↳</span><span><strong>Possible duplicate</strong><small>A related request was found. Review it before taking action; nothing was merged.</small></span>{duplicateReference && <button className="duplicate-ref" type="button" onClick={() => chooseRequest(selected.duplicateOf!)}>Review {duplicateReference} →</button>}</div>}

                <div className="request-summary-grid">
                  <div className="request-person"><span className="person-avatar" aria-hidden="true">{selected.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?"}</span><span><strong>{selected.name}</strong><small>{selected.email}</small></span></div>
                  <div className="request-assignee"><span className="summary-label">ASSIGNED TO</span><strong>{selected.assignee || "Not assigned"}</strong></div>
                  <div className="request-updated"><span className="summary-label">LAST UPDATED</span><strong>{formatDate(selected.updatedAt, true)}</strong></div>
                </div>

                <div className="request-description"><p className="summary-label">REQUEST DETAILS</p><p>{selected.description}</p></div>

                <div className="action-card">
                  <div className="action-card-heading"><span className="action-step-icon" aria-hidden="true">↗</span><span><strong>Keep the next step clear</strong><small>Updates are recorded in the activity trail below.</small></span></div>
                  <div className="assignment-row">
                    <label className="field compact-field"><span>Assign to</span><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="Maya Chen">Maya Chen</option><option value="Jordan Lee">Jordan Lee</option><option value="Avery Rivera">Avery Rivera</option></select></label>
                    <button className="button button-outline assignment-button" type="button" onClick={() => void runAction("assign")} disabled={busyAction !== null || assignee === selected.assignee || !["new", "triage"].includes(selected.status)}>{busyAction === "assign" ? "Saving…" : selected.assignee ? "Reassign" : "Assign"}</button>
                  </div>
                  <label className="field compact-field action-note-field"><span>Activity note <small>OPTIONAL</small></span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a short handoff note…" maxLength={300} /></label>
                  {statusAction && <button className={`button ${statusAction === "resolve" ? "button-success" : "button-primary"} status-action-button`} type="button" onClick={() => void runAction(statusAction)} disabled={busyAction !== null}>{busyAction === statusAction ? "Saving update…" : <>{statusActionLabel}<span aria-hidden="true">{statusAction === "resolve" ? " ✓" : " →"}</span></>}</button>}
                </div>

                <section className="activity-section" aria-labelledby="activity-heading">
                  <div className="activity-header"><div><p className="eyebrow eyebrow-muted">A CLEAR PAPER TRAIL</p><h3 id="activity-heading">Activity <span>{selected.events.length}</span></h3></div><span className="activity-lock" title="Activity is written by the workbench">◷</span></div>
                  {sortedEvents.length ? <ol className="activity-list">{sortedEvents.map((event) => (
                    <li className="activity-event" key={event.id}>
                      <span className={`activity-event-marker ${event.toStatus === "resolved" ? "activity-marker-resolved" : ""}`} aria-hidden="true">{event.toStatus === "resolved" ? "✓" : event.action === "created" ? "＋" : "·"}</span>
                      <span className="activity-event-copy"><strong>{eventLabel(event.action, event.fromStatus, event.toStatus)}</strong>{event.note && <span className="activity-note">“{event.note}”</span>}<small>{event.actor} <i>·</i> {formatDate(event.createdAt, true)}</small></span>
                    </li>
                  ))}</ol> : <p className="activity-empty">No activity has been recorded yet.</p>}
                </section>
              </>
            ) : (
              <div className="detail-empty"><span className="detail-empty-symbol" aria-hidden="true">↖</span><h2>Choose a request</h2><p>Select an item in your inbox to review its details, assign an owner, and see what has happened so far.</p></div>
            )}
          </section>
        </div>

        <footer className="workspace-footer"><span>COMMONLINE SERVICE DESK <i>·</i> PUBLIC PORTFOLIO DEMO</span><span>Fictional records. No real customer data or messages.</span></footer>
      </div>
    </main>
  );
}

function eventLabel(action: string, fromStatus: RequestStatus | null, toStatus: RequestStatus | null) {
  if (action === "created") return "Request received";
  if (action === "assigned" || action === "assign") return "Request assigned";
  if (action === "started" || action === "start" || (fromStatus !== "in_progress" && toStatus === "in_progress")) return "Work started";
  if (action === "resolved" || action === "resolve" || toStatus === "resolved") return "Request resolved";
  if (action === "reopened" || action === "reopen") return "Request reopened";
  if (action === "partner_replay") return "Partner event replayed";
  return action.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
