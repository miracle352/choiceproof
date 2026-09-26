# Deployment

1. Import the private repository into Vercel.
2. Provision Neon PostgreSQL and set `DATABASE_URL`.
3. Set `SERV_API_KEY`; optionally pin `SERV_MODEL`; set a random `RATE_LIMIT_SALT`.
4. Optional: set server-only `OPENJEV_API_KEY` and `OPENJEV_MODEL=openjev`. Without it, comparison remains available and the Jev panel says UNAVAILABLE.
5. Deploy. Idempotent `cp_*` tables are created on first access; `db/001_initial.sql` supports controlled provisioning.
6. Open `/api/health`. Treat `database.status: available` as the database/schema probe—not merely evidence that `DATABASE_URL` exists.
7. Run the operator smoke test in a fresh browser workspace.

Never use `NEXT_PUBLIC_*` for secrets. A READY deployment proves the build deployed, not that SERV, its model, or PostgreSQL works end to end. Use least-privilege database credentials and monitor quotas. Share links expire, but an owner-facing revocation UI is not yet implemented.
