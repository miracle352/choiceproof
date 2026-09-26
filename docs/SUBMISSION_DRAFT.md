# Submission copy — drafts only

Nothing below has been posted or submitted.

## X post draft

Built Choiceproof for the OpenServ Open Track: a public workbench that stress-tests bounded AI decisions with controlled changes, exact diffs, human labels, saved regression cases, and honest held-out evaluation. Powered by SERV Reasoning v2. [DEMO URL] #OpenServ

## Submission form draft

**Name:** Choiceproof

**Tagline:** Test the choice. Keep the proof.

**What it does:** Define a bounded decision, run it through live SERV Reasoning, challenge the evidence, inspect exact diffs and actual responses, then convert reviewed findings into regression cases. Candidate revisions are evaluated against labeled and held-out cases with every regression and label migration visible.

**Why it matters:** Most AI decision demos show one prompt and answer. Choiceproof makes decision boundaries inspectable and repeatable without inventing confidence, traces, or safety claims.

**OpenServ usage:** The server uses the documented SERV Reasoning v2 chat-completions endpoint and forced function tools for bounded choices, challenge proposals, and revision candidates. Credentials stay server-side; identity fields appear only when actually returned.

**Privacy:** Workspaces are anonymous and private by default. Publication is explicit, sanitized, and time-limited. Human review is required before a changed answer becomes a verified failure.

**Demo URL:** [ADD VERIFIED PRODUCTION URL]

**Future work (not implemented):** GitHub CI checks, private team workspaces, and recurring regression runs.
