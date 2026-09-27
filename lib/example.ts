import type { DecisionRequest } from "@/lib/contracts";

export const REFUND_EXAMPLE: DecisionRequest = {
  question: "Should this refund request be approved, escalated, or declined?",
  answers: ["Approve", "Escalate", "Decline"],
  input:
    "Order #1842 arrived 12 days late. The package is unopened. The refund request was submitted 4 days after arrival. Policy allows returns within 30 days.",
};

export const REFUND_CHALLENGE =
  "Order #1842 arrived 12 days late. The package is unopened. The refund request was submitted 45 days after arrival. Policy allows returns within 30 days.";

export const REFUND_SAMPLE_ANSWERS = {
  original: "Approve",
  challenged: "Escalate",
} as const;
