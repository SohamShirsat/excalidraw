// Reusable element factories for hand-built Excalidraw diagrams (mind maps,
// timelines, journey maps, kanban boards, wireframes, org charts, flowcharts,
// architecture diagrams, mixed explainer illustrations). Not used for the
// mermaid-driven path (sequence/ER/class/state) — those go through the app's
// own paste-to-diagram feature in the browser instead, see the
// excalidraw-diagram skill for why.
//
// House style is baked in as defaults, derived from:
//  - Excalidraw-native sketch aesthetic conventions (stroke weight, roughness,
//    font family per role, corner rounding by node role)
//  - A fixed 8-color semantic palette (never invent ad hoc colors)
//  - Spacing minimums to avoid clutter
//  - A 4-level typography ladder for hierarchy without breaking sketch feel

export const PALETTE = {
  system: { bg: "#a5d8ff", stroke: "#1971c2" }, // automatic / system action
  agent: { bg: "#ffec99", stroke: "#e8590c" }, // manual / human action
  state: { bg: "#b2f2bb", stroke: "#2b8a3e" }, // success / progressing state
  negative: { bg: "#ffc9c9", stroke: "#c92a2a" }, // terminal / negative state
  integ: { bg: "#d0bfff", stroke: "#7048e8" }, // external system / integration
  task: { bg: "#ffd8a8", stroke: "#e8590c" }, // task / follow-up / emphasis
  detail: { bg: "#e9ecef", stroke: "#495057" }, // reference / detail / neutral
  plain: { bg: "transparent", stroke: "#1e1e1e" }, // no semantic meaning
};
export const MUTED_TEXT = "#868e96";

// fontFamily ids Excalidraw understands.
export const FONT = { HAND: 1, FORMAL: 2, CODE: 3 };

// 4-level hierarchy ladder. Use HAND font for all of these by default; switch
// a given call to FONT.FORMAL only for a genuinely "formal/presented" title,
// and FONT.CODE only for literal code/config text — never for size variation.
export const TYPE_SCALE = { title: 28, section: 20, label: 16, annotation: 13 };

export const SPACING = {
  siblingGap: 24, // minimum gap between sibling nodes at the same rank
  sectionGap: 70, // minimum gap between distinct sections/rows of a diagram
  boxPadding: 10, // inner padding between a box edge and its bound text
};

const LINE_H = 1.25;
let idCounter = 1;
const nextId = () => `d-${idCounter++}-${Math.random().toString(36).slice(2, 7)}`;
const seed = () => Math.floor(Math.random() * 2 ** 31);

export function autoSize(text, fontSize) {
  const lines = text.split("\n");
  const maxLine = Math.max(...lines.map((l) => l.length));
  return {
    lines: lines.length,
    width: Math.ceil(maxLine * fontSize * 0.6),
    height: Math.ceil(lines.length * fontSize * LINE_H),
  };
}

// role: one of PALETTE keys, or pass bg/stroke directly to override.
// shape: "rectangle" | "diamond" | "ellipse".
// rounded: true for process/friendly nodes, false for system/technical nodes
// (pick one convention per diagram and hold it).
export function box({
  x,
  y,
  w,
  h,
  text,
  fontSize = TYPE_SCALE.label,
  role = "plain",
  bg,
  stroke,
  shape = "rectangle",
  rounded = true,
  fontFamily = FONT.HAND,
  textColor,
  align = "center",
  fill = "solid",
  strokeWidth = 2,
  strokeStyle = "solid",
  roughness = 1,
  elements,
}) {
  const palette = PALETTE[role] ?? {};
  const resolvedBg = bg ?? palette.bg ?? PALETTE.plain.bg;
  const resolvedStroke = stroke ?? palette.stroke ?? PALETTE.plain.stroke;
  const now = Date.now();
  const rectId = nextId();
  const textId = nextId();

  elements.push({
    id: rectId,
    type: shape,
    x,
    y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: resolvedStroke,
    backgroundColor: resolvedBg,
    fillStyle: fill,
    strokeWidth,
    strokeStyle,
    roughness,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: shape === "rectangle" && rounded ? { type: 3 } : null,
    seed: seed(),
    version: 1,
    versionNonce: seed(),
    isDeleted: false,
    boundElements: [{ id: textId, type: "text" }],
    updated: now,
    link: null,
    locked: false,
  });

  elements.push({
    id: textId,
    type: "text",
    x: x + SPACING.boxPadding,
    y: y + SPACING.boxPadding,
    width: w - SPACING.boxPadding * 2,
    height: h - SPACING.boxPadding * 2,
    angle: 0,
    strokeColor: textColor ?? resolvedStroke,
    backgroundColor: "transparent",
    fillStyle: fill,
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: seed(),
    version: 1,
    versionNonce: seed(),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
    text,
    fontSize,
    fontFamily,
    textAlign: align,
    verticalAlign: "middle",
    baseline: fontSize,
    containerId: rectId,
    originalText: text,
    lineHeight: LINE_H,
  });

  return { id: rectId, x, y, w, h };
}

export function diamond(opts) {
  return box({ ...opts, shape: "diamond" });
}

export function ellipse(opts) {
  return box({ ...opts, shape: "ellipse" });
}

// Free-floating text, no container — use for titles, section headers, and
// annotations. Don't wrap a title in a rectangle; size/color carry hierarchy.
export function freeText({
  x,
  y,
  text,
  fontSize = TYPE_SCALE.label,
  color = "#1e1e1e",
  fontFamily = FONT.HAND,
  align = "left",
  elements,
}) {
  const id = nextId();
  const m = autoSize(text, fontSize);
  elements.push({
    id,
    type: "text",
    x,
    y,
    width: m.width,
    height: m.height,
    angle: 0,
    strokeColor: color,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: seed(),
    version: 1,
    versionNonce: seed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    text,
    fontSize,
    fontFamily,
    textAlign: align,
    verticalAlign: "top",
    baseline: fontSize,
    containerId: null,
    originalText: text,
    lineHeight: LINE_H,
  });
  return { id, x, y, w: m.width, h: m.height };
}

// solid = primary/definite flow or strong relationship.
// dashed = optional, conditional, async, or a weaker/reference relationship.
// Label decision-branch arrows (e.g. "Yes"/"No") — always, not optionally.
export function arrow({
  x1,
  y1,
  x2,
  y2,
  color = "#1e1e1e",
  dashed = false,
  startId = null,
  endId = null,
  label = null,
  labelColor,
  strokeWidth = 2,
  waypoints = null, // optional [{x,y}, ...] midpoints for routing around nodes
  elements,
}) {
  const id = nextId();
  const pts = waypoints
    ? [[0, 0], ...waypoints.map((p) => [p.x - x1, p.y - y1]), [x2 - x1, y2 - y1]]
    : [
        [0, 0],
        [x2 - x1, y2 - y1],
      ];

  elements.push({
    id,
    type: "arrow",
    x: x1,
    y: y1,
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
    angle: 0,
    strokeColor: color,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth,
    strokeStyle: dashed ? "dashed" : "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 2 },
    seed: seed(),
    version: 1,
    versionNonce: seed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    points: pts,
    lastCommittedPoint: null,
    startBinding: startId ? { elementId: startId, focus: 0, gap: 6 } : null,
    endBinding: endId ? { elementId: endId, focus: 0, gap: 6 } : null,
    startArrowhead: null,
    endArrowhead: "arrow",
  });

  if (label) {
    freeText({
      x: (x1 + x2) / 2 + 10,
      y: (y1 + y2) / 2 - 10,
      text: label,
      fontSize: TYPE_SCALE.annotation,
      color: labelColor ?? color,
      elements,
    });
  }

  return id;
}

// Preferred way to connect two nodes — takes the {x,y} points returned by
// centerTop/Bottom/Left/Right directly, so you can't mix up x1/y1 vs x/y.
//   connect(centerBottom(a), centerTop(b), { startId: a.id, endId: b.id, elements })
export function connect(from, to, opts = {}) {
  return arrow({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, ...opts });
}

export function centerTop(n) {
  return { x: n.x + n.w / 2, y: n.y };
}
export function centerBottom(n) {
  return { x: n.x + n.w / 2, y: n.y + n.h };
}
export function centerLeft(n) {
  return { x: n.x, y: n.y + n.h / 2 };
}
export function centerRight(n) {
  return { x: n.x + n.w, y: n.y + n.h / 2 };
}

export function buildScene(elements) {
  return {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements,
    appState: {
      gridSize: 20,
      gridStep: 5,
      gridModeEnabled: false,
      viewBackgroundColor: "#ffffff",
    },
    files: {},
  };
}
