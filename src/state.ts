import type { Rep, Pause } from "./annotate.js";

export type Point = { x: number; y: number };

export type AppState =
  | { stage: "upload" }
  | { stage: "endcapSelect";         file: File; startTime: number }
  | { stage: "endcapSelectZooming";  file: File; startTime: number; zoomCenter: Point }
  | { stage: "endcapPending";        file: File; startTime: number; startPt: Point }
  | { stage: "endcapPendingZooming"; file: File; startTime: number; startPt: Point; zoomCenter: Point }
  | { stage: "analyzing";            file: File; startTime: number; startPt: Point }
  | { stage: "results";              file: File; startTime: number; startPt: Point;
      positions: Point[]; reps: Rep[]; pauses: Pause[]; palette: string[] };

export type AppEvent =
  | { type: "fileSelected";    file: File }
  | { type: "openZoom";        zoomCenter: Point; videoTime: number }
  | { type: "zoomConfirmed";   startPt: Point }
  | { type: "endcapConfirmed" }
  | { type: "analysisComplete"; positions: Point[]; reps: Rep[]; pauses: Pause[]; palette: string[] }
  | { type: "back" };

export function transition(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case "fileSelected":
      return { stage: "endcapSelect", file: event.file, startTime: 0 };

    case "openZoom":
      if (state.stage === "endcapSelect")
        return { stage: "endcapSelectZooming",  file: state.file, startTime: event.videoTime, zoomCenter: event.zoomCenter };
      if (state.stage === "endcapPending")
        return { stage: "endcapPendingZooming", file: state.file, startTime: event.videoTime, startPt: state.startPt, zoomCenter: event.zoomCenter };
      return state;

    case "zoomConfirmed":
      if (state.stage === "endcapSelectZooming" || state.stage === "endcapPendingZooming")
        return { stage: "endcapPending", file: state.file, startTime: state.startTime, startPt: event.startPt };
      return state;

    case "endcapConfirmed":
      if (state.stage !== "endcapPending") return state;
      return { stage: "analyzing", file: state.file, startTime: state.startTime, startPt: state.startPt };

    case "analysisComplete":
      if (state.stage !== "analyzing") return state;
      return { stage: "results", file: state.file, startTime: state.startTime,
               startPt: state.startPt, positions: event.positions,
               reps: event.reps, pauses: event.pauses, palette: event.palette };

    case "back":
      switch (state.stage) {
        case "endcapSelect":         return { stage: "upload" };
        case "endcapSelectZooming":  return { stage: "endcapSelect",  file: state.file, startTime: state.startTime };
        case "endcapPending":        return { stage: "endcapSelect",  file: state.file, startTime: state.startTime };
        case "endcapPendingZooming": return { stage: "endcapPending", file: state.file, startTime: state.startTime, startPt: state.startPt };
        case "analyzing":            return { stage: "endcapSelect",  file: state.file, startTime: state.startTime };
        case "results":              return { stage: "endcapSelect",  file: state.file, startTime: state.startTime };
        default:                     return state;
      }
  }
}
