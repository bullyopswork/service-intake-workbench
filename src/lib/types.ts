export const REQUEST_STATUSES = ["new", "triage", "in_progress", "resolved"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type RequestSource = "web" | "partner" | "seed";
export type RequestCategory = "maintenance" | "installation" | "billing" | "other";

export interface RequestSummary {
  id: string;
  reference: string;
  name: string;
  email: string;
  category: RequestCategory;
  subject: string;
  description: string;
  status: RequestStatus;
  source: RequestSource;
  assignee: string | null;
  duplicateOf: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequestEvent {
  id: string;
  action: string;
  actor: string;
  note: string | null;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus | null;
  createdAt: string;
}

export interface ServiceRequest extends RequestSummary {
  events: RequestEvent[];
}

export interface ApiError {
  error: { code: string; message: string };
}
