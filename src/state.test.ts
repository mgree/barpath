import { describe, test, expect } from "vitest";
import { transition, AppState } from "./state.js";

const file = new File([""], "test.mp4", { type: "video/mp4" });
const startPt   = { x: 100, y: 200 };
const zoomCenter = { x: 300, y: 400 };

const upload: AppState               = { stage: "upload" };
const endcapSelect: AppState         = { stage: "endcapSelect",         file, startTime: 5.0 };
const endcapSelectZooming: AppState  = { stage: "endcapSelectZooming",  file, startTime: 5.0, zoomCenter };
const endcapPending: AppState        = { stage: "endcapPending",        file, startTime: 5.0, startPt };
const endcapPendingZooming: AppState = { stage: "endcapPendingZooming", file, startTime: 5.0, startPt, zoomCenter };
const analyzing: AppState            = { stage: "analyzing",            file, startTime: 5.0, startPt };
const results: AppState              = { stage: "results",              file, startTime: 5.0, startPt,
                                         positions: [], reps: [], pauses: [], palette: [] };

describe("forward transitions", () => {
  test("fileSelected → endcapSelect", () => {
    const s = transition(upload, { type: "fileSelected", file });
    expect(s.stage).toBe("endcapSelect");
  });

  test("openZoom from endcapSelect → endcapSelectZooming", () => {
    const s = transition(endcapSelect, { type: "openZoom", zoomCenter, videoTime: 5.0 });
    expect(s.stage).toBe("endcapSelectZooming");
    if (s.stage === "endcapSelectZooming") {
      expect(s.zoomCenter).toEqual(zoomCenter);
      expect(s.startTime).toBe(5.0);
    }
  });

  test("openZoom from endcapPending → endcapPendingZooming (preserves startPt)", () => {
    const s = transition(endcapPending, { type: "openZoom", zoomCenter, videoTime: 6.0 });
    expect(s.stage).toBe("endcapPendingZooming");
    if (s.stage === "endcapPendingZooming") {
      expect(s.startPt).toEqual(startPt);
      expect(s.zoomCenter).toEqual(zoomCenter);
      expect(s.startTime).toBe(6.0);
    }
  });

  test("zoomConfirmed from endcapSelectZooming → endcapPending", () => {
    const s = transition(endcapSelectZooming, { type: "zoomConfirmed", startPt });
    expect(s.stage).toBe("endcapPending");
    if (s.stage === "endcapPending") {
      expect(s.startPt).toEqual(startPt);
      expect(s.startTime).toBe(5.0);
    }
  });

  test("zoomConfirmed from endcapPendingZooming → endcapPending (new point)", () => {
    const newPt = { x: 50, y: 75 };
    const s = transition(endcapPendingZooming, { type: "zoomConfirmed", startPt: newPt });
    expect(s.stage).toBe("endcapPending");
    if (s.stage === "endcapPending") expect(s.startPt).toEqual(newPt);
  });

  test("endcapConfirmed → analyzing", () => {
    const s = transition(endcapPending, { type: "endcapConfirmed" });
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

  test("back from endcapSelectZooming → endcapSelect (closes zoom, keeps frame)", () => {
    const s = transition(endcapSelectZooming, { type: "back" });
    expect(s.stage).toBe("endcapSelect");
    if (s.stage === "endcapSelect") expect(s.startTime).toBe(5.0);
  });

  test("back from endcapPending → endcapSelect (clears point)", () => {
    expect(transition(endcapPending, { type: "back" }).stage).toBe("endcapSelect");
  });

  test("back from endcapPendingZooming → endcapPending (closes zoom, keeps point)", () => {
    const s = transition(endcapPendingZooming, { type: "back" });
    expect(s.stage).toBe("endcapPending");
    if (s.stage === "endcapPending") expect(s.startPt).toEqual(startPt);
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
  test("openZoom in upload state", () => {
    expect(transition(upload, { type: "openZoom", zoomCenter, videoTime: 1 })).toEqual(upload);
  });

  test("zoomConfirmed in endcapSelect (not yet zooming)", () => {
    expect(transition(endcapSelect, { type: "zoomConfirmed", startPt })).toEqual(endcapSelect);
  });

  test("endcapConfirmed without prior zoomConfirmed", () => {
    expect(transition(endcapSelect, { type: "endcapConfirmed" })).toEqual(endcapSelect);
  });

  test("analysisComplete in endcapSelect state", () => {
    expect(transition(endcapSelect, { type: "analysisComplete", positions: [], reps: [], pauses: [], palette: [] }))
      .toEqual(endcapSelect);
  });
});
