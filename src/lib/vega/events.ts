import type { WebResult } from "@/lib/ai/search";
import type { ActionKind, ActionPayload } from "@/lib/vega/tools";

export type VegaActionView = {
  id: string;
  kind: ActionKind;
  payload: ActionPayload;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  result?: string | null;
};

export type VegaSource = Pick<WebResult, "title" | "url">;

export type VegaMood = "neutral" | "happy" | "angry" | "sad" | "surprised" | "doubt";

export type VegaEvent =
  | { t: "text"; v: string }
  | { t: "mood"; v: VegaMood }
  | { t: "status"; v: string }
  | { t: "sources"; v: VegaSource[] }
  | { t: "action"; v: VegaActionView }
  | { t: "credits"; v: number }
  | { t: "error"; v: string };
