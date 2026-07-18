export type AiProposalReviewView = "ai-lines-only" | "original-overlay" | "print-preview";
export type AiProposalReviewDecision = "pending" | "review-only" | "accepted" | "rejected";

export type AiProposalReview = {
  decision: AiProposalReviewDecision;
  reviewedViews: ReadonlySet<AiProposalReviewView>;
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

export function beginAiProposalReview(status: "pending-review" | "review-only"): AiProposalReview {
  return {
    decision: status === "pending-review" ? "pending" : "review-only",
    reviewedViews: new Set<AiProposalReviewView>(["ai-lines-only"])
  };
}

export function reviewAiProposalView(
  review: AiProposalReview,
  view: AiProposalReviewView
): AiProposalReview {
  if (review.reviewedViews.has(view)) return review;
  return { ...review, reviewedViews: new Set([...review.reviewedViews, view]) };
}

export function canAcceptAiProposal(review: AiProposalReview): boolean {
  return review.decision === "pending"
    && REQUIRED_REVIEW_VIEWS.every((view) => review.reviewedViews.has(view));
}

export function acceptAiProposalReview(review: AiProposalReview): AiProposalReview {
  return canAcceptAiProposal(review) ? { ...review, decision: "accepted" } : review;
}

export function rejectAiProposalReview(review: AiProposalReview): AiProposalReview {
  return review.decision === "pending" ? { ...review, decision: "rejected" } : review;
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
