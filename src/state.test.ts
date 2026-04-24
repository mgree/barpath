import { describe, test, expect } from "vitest";
import { transition, AppState } from "./state.js";

const file = new File([""], "test.mp4", { type: "video/mp4" });
const startPt = { x: 100, y: 200 };

const upload: AppState       = { stage: "upload" };
const endcapSelect: AppState = { stage: "endcapSelect", file, startTime: 5.0 };
const analyzing: AppState    = { stage: "analyzing", file, startTime: 5.0, startPt };
const results: AppState      = { stage: "results", file, startTime: 5.0, startPt,
                                  positions: [], reps: [], pauses: [], palette: [] };

describe("forward transitions", () => {
  test("fileSelected → endcapSelect", () => {
    const s = transition(upload, { type: "fileSelected", file });
    expect(s.stage).toBe("endcapSelect");
  });

  test("endcapConfirmed → analyzing", () => {
    const s = transition(endcapSelect, { type: "endcapConfirmed", startPt, startTime: 5.0 });
    expect(s.stage).toBe("analyzing");
    if (s.stage === "analyzing") {
      expect(s.startPt).toEqual(startPt);
      expect(s.startTime).toBe(5.0);
    }
  });

  test("analysisComplete → results", () => {
    const s = transition(analyzing, { type: "analysisComplete", positions: [], reps: [], pauses: [], palette: ["red"] });
    expect(s.stage).toBe("results");
    if (s.stage === "results") expect(s.palette).toEqual(["red"]);
  });
});

describe("back transitions", () => {
  test("back from endcapSelect → upload", () => {
    expect(transition(endcapSelect, { type: "back" }).stage).toBe("upload");
  });

  test("back from analyzing → endcapSelect", () => {
    expect(transition(analyzing, { type: "back" }).stage).toBe("endcapSelect");
  });

  test("back from results → endcapSelect", () => {
    expect(transition(results, { type: "back" }).stage).toBe("endcapSelect");
  });

  test("back from upload is a no-op", () => {
    expect(transition(upload, { type: "back" })).toEqual(upload);
  });
});

describe("invalid transitions are no-ops", () => {
  test("endcapConfirmed in upload state", () => {
    expect(transition(upload, { type: "endcapConfirmed", startPt, startTime: 1 })).toEqual(upload);
  });

  test("analysisComplete in endcapSelect state", () => {
    expect(transition(endcapSelect, { type: "analysisComplete", positions: [], reps: [], pauses: [], palette: [] }))
      .toEqual(endcapSelect);
  });
});
