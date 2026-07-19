export type AiProposalReviewView = "ai-lines-only" | "original-overlay" | "print-preview";
export type AiProposalReviewDecision = "pending" | "review-only" | "accepted" | "rejected";

export type AiProposalReviewedViews = {
  readonly size: number;
  has: (view: AiProposalReviewView) => boolean;
};

export type AiProposalReview = {
  readonly decision: AiProposalReviewDecision;
  readonly reviewedViewsMask: number;
  readonly reviewedViews: AiProposalReviewedViews;
};

export type AiProposalApplyState = {
  currentDetailDataUrl: string;
  proposalDetailDataUrl: string;
  history: readonly string[];
};

const REQUIRED_REVIEW_VIEWS: readonly AiProposalReviewView[] = [
  "ai-lines-only",
  "original-overlay",
  "print-preview"
];

const AI_LINES_ONLY_MASK = 1 << 0;
const ORIGINAL_OVERLAY_MASK = 1 << 1;
const PRINT_PREVIEW_MASK = 1 << 2;
const ALL_REVIEWED_VIEWS_MASK = AI_LINES_ONLY_MASK | ORIGINAL_OVERLAY_MASK | PRINT_PREVIEW_MASK;

export function beginAiProposalReview(status: "pending-review" | "review-only"): AiProposalReview {
  return createAiProposalReview(status === "pending-review" ? "pending" : "review-only", AI_LINES_ONLY_MASK);
}

export function reviewAiProposalView(
  review: AiProposalReview,
  view: AiProposalReviewView
): AiProposalReview {
  const nextMask = review.reviewedViewsMask | reviewedViewMask(view);
  return nextMask === review.reviewedViewsMask ? review : createAiProposalReview(review.decision, nextMask);
}

export function canAcceptAiProposal(review: AiProposalReview): boolean {
  return review.decision === "pending" && review.reviewedViewsMask === ALL_REVIEWED_VIEWS_MASK;
}

export function acceptAiProposalReview(review: AiProposalReview): AiProposalReview {
  return canAcceptAiProposal(review) ? createAiProposalReview("accepted", review.reviewedViewsMask) : review;
}

export function rejectAiProposalReview(review: AiProposalReview): AiProposalReview {
  return review.decision === "pending" ? createAiProposalReview("rejected", review.reviewedViewsMask) : review;
}

export function applyAcceptedAiProposal({
  currentDetailDataUrl,
  proposalDetailDataUrl,
  history
}: AiProposalApplyState) {
  return {
    acceptedDetailDataUrl: proposalDetailDataUrl,
    history: [...history.slice(-19), currentDetailDataUrl]
  };
}

function createAiProposalReview(
  decision: AiProposalReviewDecision,
  reviewedViewsMask: number
): AiProposalReview {
  return Object.freeze({
    decision,
    reviewedViewsMask,
    reviewedViews: createReviewedViews(reviewedViewsMask)
  });
}

function createReviewedViews(mask: number): AiProposalReviewedViews {
  return Object.freeze({
    size: REQUIRED_REVIEW_VIEWS.filter((view) => (mask & reviewedViewMask(view)) !== 0).length,
    has: (view: AiProposalReviewView) => (mask & reviewedViewMask(view)) !== 0
  });
}

function reviewedViewMask(view: AiProposalReviewView) {
  if (view === "ai-lines-only") return AI_LINES_ONLY_MASK;
  if (view === "original-overlay") return ORIGINAL_OVERLAY_MASK;
  return PRINT_PREVIEW_MASK;
}
