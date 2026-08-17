import {
  INITIAL_REINFORCEMENT_WIDTH_IN,
  MAX_REINFORCEMENT_WIDTH_IN,
  MIN_REINFORCEMENT_WIDTH_IN,
  REINFORCEMENT_NOT_SAFETY_COPY,
  parseThinSilhouetteProposalResponse,
  topologyChangeSummary
} from "../src/thinSilhouette.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

const validProposal = {
  minimumWidthIn: 0.5,
  outerCutPath: "M 10 10 L 390 10 L 200 990 Z",
  outerLinePngDataUrl: "data:image/png;base64,reinforced",
  previewWidthPx: 400,
  previewHeightPx: 1000,
  topologyChanges: {
    componentsBefore: 2,
    componentsAfter: 1,
    holesBefore: 0,
    holesAfter: 0,
    componentsJoined: true,
    enclosedRegionsChanged: false,
    gapMergeWarning: true
  },
  diagnostic: {
    detected: true,
    minimumWidthIn: 0.4,
    p10WidthIn: 0.46,
    thinFraction: 0.5,
    longestThinRunIn: 1.3,
    componentCount: 1
  },
  excludedSmallComponentCount: 3
};

assertEqual(MIN_REINFORCEMENT_WIDTH_IN, 0.25, "review range should start at the tested lower bound");
assertEqual(INITIAL_REINFORCEMENT_WIDTH_IN, 0.5, "review should open at the governed starting value");
assertEqual(MAX_REINFORCEMENT_WIDTH_IN, 0.75, "review range should end at the tested upper bound");
assert(REINFORCEMENT_NOT_SAFETY_COPY.includes("not a universal safety recommendation"), "copy should disclaim a woodworking safety threshold");

{
  const parsed = parseThinSilhouetteProposalResponse(validProposal);
  assertEqual(parsed.minimumWidthIn, 0.5, "valid proposal should retain finished-inch width");
  assertEqual(parsed.topologyChanges.componentsJoined, true, "valid proposal should retain topology evidence");
  assertEqual(parsed.excludedSmallComponentCount, 3, "valid proposal should retain excluded detail count");
}

for (const [name, value] of [
  ["empty path", { ...validProposal, outerCutPath: "" }],
  ["non-PNG preview", { ...validProposal, outerLinePngDataUrl: "https://example.test/line.png" }],
  ["width below range", { ...validProposal, minimumWidthIn: 0.2 }],
  ["non-finite dimensions", { ...validProposal, previewHeightPx: Number.NaN }],
  ["negative topology", {
    ...validProposal,
    topologyChanges: { ...validProposal.topologyChanges, componentsAfter: -1 }
  }]
] as const) {
  let threw = false;
  try {
    parseThinSilhouetteProposalResponse(value);
  } catch {
    threw = true;
  }
  assert(threw, `${name} should be rejected at the client boundary`);
}

{
  const joined = topologyChangeSummary(validProposal.topologyChanges);
  assert(joined.includes("joined"), "component joins should be named explicitly");
  assert(joined.includes("gaps"), "gap risk should be named explicitly");

  const unchanged = topologyChangeSummary({
    ...validProposal.topologyChanges,
    componentsBefore: 1,
    componentsAfter: 1,
    componentsJoined: false,
    gapMergeWarning: false
  });
  assertEqual(unchanged, "No topology change was detected.", "unchanged proposal should say so plainly");
}
