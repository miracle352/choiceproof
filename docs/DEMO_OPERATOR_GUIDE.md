# Demo operator guide

Use synthetic text only. Confirm SERV configuration, workspace configuration, workspace health, and last-run status separately.

1. Edit one detail and select **Test a decision**.
2. Confirm **LIVE**, answer, actual model, latency, provider only if returned, and actual JSON.
3. Select **Run a controlled challenge**. If no answer changes, try another proposal; never claim one did.
4. Read both frozen inputs, the exact diff, and the two provider results. Explain that change is a review finding, not automatically an error.
5. If available, show Jev’s experiment-only relevance and review-priority choices. If it says UNAVAILABLE, continue—the SERV comparison is independent.
6. Confirm the suggested expected answer, mark whether the edit intended to preserve or change the decision, then save.
7. Edit/request a candidate and rerun the first 12 cases. Show regressions and relabeling.

If SERV fails, use its displayed category. If PostgreSQL fails, show the available one-off path and explain persistence. Use `/api/health` to distinguish missing configuration from a connection or schema failure. Before presenting: check phone/desktop, Tab and Shift+Tab, visible focus, reduced motion, muted video, console, provider quota, database access, and a fresh anonymous session.
