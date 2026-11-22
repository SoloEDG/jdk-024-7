import type { BaitId, SpotId, FacilityKind } from "./types";
import type { RepairPlan } from "../features/aquarium/lib/solver";
export type Command =
  | { type: "spot"; id: SpotId }
  | { type: "bait"; id: BaitId }
  | { type: "power"; value: number }
  | { type: "drag"; value: number }
  | { type: "charge-start" }
  | { type: "cast" }
  | { type: "strike" }
  | { type: "reel"; held: boolean }
  | { type: "tick"; dt: number }
  | { type: "next" }
  | { type: "release"; id: string }
  | { type: "claim"; id: string }
  | { type: "resupply" }
  | { type: "tank-add-fish"; id: string }
  | { type: "tank-remove-fish"; id: string }
  | { type: "tank-add-facility"; kind: FacilityKind }
  | { type: "tank-remove-facility"; id: string }
  | { type: "tank-pin-fish"; id: string }
  | { type: "tank-pin-facility"; id: string }
  | { type: "tank-apply-plan"; plan: RepairPlan }
  | { type: "tank-dismiss-report" };
