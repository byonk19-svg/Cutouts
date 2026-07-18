import {
  acceptAiProposalReview,
  applyAcceptedAiProposal,
  beginAiProposalReview,
  canAcceptAiProposal,
  rejectAiProposalReview,
  reviewAiProposalView,
  type AiProposalReviewView
} from "../src/aiLineworkReview.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

{
  const history = ["older-detail"];
  const manualFeatureLines = [{ id: "feature-eye" }];
  const paintWork = [{ id: "paint-coat", hex: "#112233" }];
  const protectedGeometry = { outerCutPath: "M0 0L1 1", finishedHeightIn: 36, tileCount: 4 };
  const applied = applyAcceptedAiProposal({
    currentDetailDataUrl: "accepted-before",
    proposalDetailDataUrl: "accepted-ai",
    history
  });

  assertEqual(applied.acceptedDetailDataUrl, "accepted-ai", "accept should replace only the editable detail raster");
  assertEqual(applied.history.length, history.length + 1, "accept should add exactly one undo entry");
  assertEqual(applied.history.at(-1), "accepted-before", "the one undo entry should restore the prior accepted detail raster");
  assertEqual(history.length, 1, "accept should not mutate the existing history array");
  assertEqual(manualFeatureLines[0].id, "feature-eye", "manual Feature Lines should remain outside the replaced detail raster");
  assertEqual(paintWork[0].hex, "#112233", "paint work should remain outside the replaced detail raster");
  assertEqual(protectedGeometry.outerCutPath, "M0 0L1 1", "protected geometry should remain outside the replaced detail raster");
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

const requiredViews: AiProposalReviewView[] = ["ai-lines-only", "original-overlay", "print-preview"];

{
  const review = beginAiProposalReview("pending-review");

  assertEqual(review.decision, "pending", "a valid proposal should begin pending explicit maker review");
  assert(review.reviewedViews.has("ai-lines-only"), "the initially visible AI-lines-only view should count as reviewed");
  assert(!canAcceptAiProposal(review), "acceptance should stay unavailable before all three views are reviewed");

  const withOverlay = reviewAiProposalView(review, "original-overlay");
  assert(!canAcceptAiProposal(withOverlay), "two reviewed views should not unlock acceptance");

  const complete = reviewAiProposalView(withOverlay, "print-preview");
  assert(canAcceptAiProposal(complete), "all required views should unlock explicit acceptance");
  assertEqual(complete.reviewedViews.size, requiredViews.length, "the review should record each required view once");

  const accepted = acceptAiProposalReview(complete);
  assertEqual(accepted.decision, "accepted", "explicit acceptance should complete the proposal decision");
  assert(!canAcceptAiProposal(accepted), "an accepted proposal must not be applicable twice");
}

{
  const reviewOnly = beginAiProposalReview("review-only");
  const visited = requiredViews.reduce(reviewAiProposalView, reviewOnly);

  assertEqual(visited.decision, "review-only", "invalid output should remain review-only");
  assert(!canAcceptAiProposal(visited), "review-only output must never expose acceptance");
  assertEqual(acceptAiProposalReview(visited), visited, "accepting review-only output should be a no-op");
}

{
  const pending = beginAiProposalReview("pending-review");
  const rejected = rejectAiProposalReview(pending);

  assertEqual(rejected.decision, "rejected", "rejection should be an explicit terminal decision");
  assert(!canAcceptAiProposal(rejected), "rejected output must not remain applicable");

  const later = beginAiProposalReview("pending-review");
  assertEqual(later.decision, "pending", "a later request should start a fresh independent review");
  assertEqual(later.reviewedViews.size, 1, "a later request should not inherit prior view confirmations");
}
