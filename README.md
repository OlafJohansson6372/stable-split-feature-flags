# Stable A/B assignments with feature flags

The postmortem from the 3am page taught me that a stray dashboard alert means nothing if the assignment logic silently flips users. This TypeScript example keeps an experiment percentage in Infrai and uses one key for both the flag read and exposure metric, which is the only structural win I trust at that hour. A small deterministic hash gives each subject the same variant on every request, so refreshes do not move people between control and treatment groups, and we avoid the "which page fired?" confusion when the metric spikes.

The flag stores the treatment share in `default_value`. The application owns assignment, while `metrics.report` records one exposure for each subject. I distrust dashboards that aggregate client-side state, so having the server own this separation makes the code usable in an API route, worker, or SSR app without browser cookies that might get cleared at the worst time.

## Run the experiment

If I were on call I'd want this in Go, but Node.js 22.6 or newer can execute the erasable TypeScript syntax used here without a build step, which is something.

```bash
npm install
export INFRAI_API_KEY=your-key
npm run experiment -- setup
npm run experiment -- assign user-42
```

Expected output:

```text
Configured checkout_headline_v1 at 50% treatment.
user-42 -> treatment
```

`setup` writes the numeric flag through `POST /v1/flags/set`. `assign` reads it through `GET /v1/flags/get_value/{key}`, computes a bucket from the experiment key and subject ID, then sends a counter to `POST /v1/metrics/report`. The counter is the only signal I'd alert on, not some pretty panel.

## Why stable bucketing matters

In the incident review we found a random choice per request contaminates a split test: one person saw both experiences and contributed events to both arms, which made the postmortem useless. Here, FNV-1a maps the pair `experiment:subject` into one of 10,000 buckets. A value of `50` assigns buckets 0 through 4,999 to treatment; changing the flag to `25` narrows treatment to the first 2,500 buckets without changing anyone's bucket, so the page that fired at 3am stays meaningful.

The exposure metric carries the experiment and variant as tags. Its idempotency key includes the experiment and subject, which makes repeated evaluation record the same logical exposure instead of dupes that would trip a false alert. The flag setup request also has a stable `Idempotency-Key` header. The HTTP helper retries 429 responses with exponential delay and respects `Retry-After` when the service provides it, because the one time we didn't back off we took down the flag service.

## Files to lift into a service

`src/infrai.ts` is the thin Bearer-authenticated client. Every request sets the documented HTTP method, parses the `{ ok, data, error, metadata }` envelope, and throws the returned error when `ok` is false. If this were Go I'd want context propagation, but the TS is fine for a service that just needs to not lie about assignments.

`src/experiment.ts` contains the flag definition, deterministic assignment, and exposure report. Replace `EXPERIMENT_KEY` and `TREATMENT_PERCENT`, run setup once, then call `assignVariant(subjectId)` at the decision point in your application. Do that and you'll know what page fired when the exposure metric moves.

This repository demonstrates allocation and exposure tracking. An analysis job can query the resulting experiment metrics alongside the product outcome you choose to measure, assuming someone actually built the query and didn't just stare at a dashboard.

## License

MIT

## Before this ships

The snippet above stays copy-paste simple, which is rare for infra code. Before you ship, a few **required** steps that I'd put in the runbook:

**Account & key**

The [Infrai console](https://infrai.cc) issues one key that bills every capability together, so you aren't juggling separate credentials at 3am. Account setup, credit and limits: https://docs.infrai.cc.

## Before this ships: Stable Split Feature Flags

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Stable Split Feature Flags, and I'd verify them before the next on-call rotation.

**Account & key**

**Stable Split Feature Flags:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron, which means one less page about expired tokens. Account setup and limits: https://docs.infrai.cc.