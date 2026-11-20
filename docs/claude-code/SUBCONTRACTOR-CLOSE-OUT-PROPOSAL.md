# Subcontractor close-out: proposal (20 Nov 2026)

You asked: "There's no subcontractor close-out … lets look at this as well please". This is how I'd build it. Nothing is built yet: four decisions for you are at the end.

## What it would look like
On each subcontractor's company page (Main Contractor › Subcontractors › the company), a new **Close-Out** tile with a checklist. Most items tick themselves.

| Check | Where it comes from |
|---|---|
| Schedule of Works complete | the tasks given to them (already used for their O&M) |
| O&M submitted | their Handover tile (built today) |
| RAMS approved, and signed by their operatives | RAMS approval (built today) |
| No open permits | Permits To Work |
| Their snags closed | snags given to them (needs snags assignable to a company, as tasks are) |
| Final account agreed | Finance: their last application certified as final |
| Retention | Finance: what's held, and when it's due back |

When everything is ticked (or a PM ticks "Close out anyway" and says why), there are two signatures:
1. Our PM: "Works complete and accepted".
2. Their admin: "Works handed over".

That makes a **Close-Out Certificate** PDF. It is filed with the job's Handover and in the OneDrive folder.

After close-out, their operatives no longer see the job, and their company folder becomes read-only.

## The Finance link it needs
At the moment, Finance's subcontract (the order, applications, payments and retention) isn't linked to the subcontractor company on the job in Projects.
- **Proposal:** on the Finance subcontract, a "Company on the job" drop-down (the job's subcontractor companies). A new column, so it's additive.
- That gives Close-Out the final account and the retention.
- It also gives Finance the company's insurance status from the Company Library.

## Retention for subcontractors
They're held a percentage on each application (`retention_pct`). **Proposal:**
- **Half released** at our practical completion.
- **Half released** at the end of their defects period.
- Finance gets reminders on both dates, the same as the client's retention release.

## Decisions for you
1. **Who signs the close-out?** I suggest our PM and their admin.
2. **Retention release dates:** use the job's practical completion and defects period (the same as the client's), or let each subcontract have its own?
3. **After close-out, should their operatives lose access to the job?** I suggest yes, apart from their admin seeing their own folder read-only for 12 months.
4. **Snags:** should snags be assignable to a subcontractor company (like Schedule of Works tasks), so "their snags closed" can be checked?
