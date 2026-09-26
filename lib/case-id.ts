import { createHash } from "node:crypto";

export function stableCaseId(input: {
  nodeId: string;
  originalRunId: string;
  challengedRunId: string;
}) {
  return `case_${createHash("sha256")
    .update(`${input.nodeId}:${input.originalRunId}:${input.challengedRunId}`)
    .digest("hex")
    .slice(0, 32)}`;
}
