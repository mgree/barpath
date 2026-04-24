import type { Rep, Pause } from "./annotate.js";

export type Point = { x: number; y: number };

export type AppState =
  | { stage: "upload" }
  | { stage: "endcapSelect"; file: File; startTime: number }
  | { stage: "analyzing"; file: File; startTime: number; startPt: Point }
  | { stage: "results"; file: File; startTime: number; startPt: Point;
      positions: Point[]; reps: Rep[]; pauses: Pause[]; palette: string[] };

export type AppEvent =
  | { type: "fileSelected"; file: File }
  | { type: "endcapConfirmed"; startPt: Point; startTime: number }
  | { type: "analysisComplete"; positions: Point[]; reps: Rep[]; pauses: Pause[]; palette: string[] }
  | { type: "back" };

export function transition(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case "fileSelected":
      return { stage: "endcapSelect", file: event.file, startTime: 0 };

    case "endcapConfirmed":
      if (state.stage !== "endcapSelect") return state;
      return { stage: "analyzing", file: state.file, startTime: event.startTime, startPt: event.startPt };

    case "analysisComplete":
      if (state.stage !== "analyzing") return state;
      return { stage: "results", file: state.file, startTime: state.startTime,
               startPt: state.startPt, positions: event.positions,
               reps: event.reps, pauses: event.pauses, palette: event.palette };

    case "back":
      switch (state.stage) {
        case "endcapSelect": return { stage: "upload" };
        case "analyzing":    return { stage: "endcapSelect", file: state.file, startTime: state.startTime };
        case "results":      return { stage: "endcapSelect", file: state.file, startTime: state.startTime };
        default:             return state;
      }
  }
}
