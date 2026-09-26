# Two-minute judge script

**0:00–0:15** — “Choiceproof tests whether a bounded AI decision stays defensible when input changes. It keeps exact evidence, not invented confidence or traces.”

**0:15–0:35** — Edit the synthetic input and select **Test a decision**. Point to LIVE, answer, model, latency, and provider only if returned.

**0:35–1:00** — Run a controlled challenge. Show both answers and the exact diff. “An answer change is a finding for review, not automatically failure.”

**1:00–1:20** — Set expected answer and “same meaning,” then save. Saving uses the frozen stored run pair even after later edits.

**1:20–1:50** — Edit the candidate and rerun the first 12 cases. Show labeled/held-out groups, regressions, and NEEDS RELABELING. Held-out cases never enter the repair prompt.

**1:50–2:00** — “Private by default. Publishing is explicit, sanitized, and 30-day. Passing cases are evidence, not universal safety.”
