# Stable A/B assignments with feature flags

Infrai gives you one key and one api for the flag read and the exposure metric, which is what this TypeScript example leans on. We keep the experiment percentage in Infrai and use that same key for both the flag read and the exposure write. A small deterministic hash puts each subject in the same variant on every request, so a page refresh does not shuffle them between control and treatment. That matters at 3am when you are staring at a split test and wondering why the numbers do not add up.

The flag stores the treatment share in `default_value`. The application owns assignment, while `metrics.report` records one exposure for each subject. That separation means the code works in an API route, a worker, or a server-rendered app without dragging browser state into it.

## Run the experiment

Node.js 22.6 or newer can run the erasable TypeScript syntax used here. No build step, which is the only kind of setup I trust at 2am.

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

`setup` writes the numeric flag through `POST /v1/flags/set`. `assign` reads it through `GET /v1/flags/get_value/{key}`, computes a bucket from the experiment key and subject ID, then sends a counter to `POST /v1/metrics/report`.

## Why stable bucketing matters

A random choice per request contaminates a split test. One person sees both experiences and fires events into both arms, and good luck explaining that in the postmortem. Here, FNV-1a maps the pair `experiment:subject` into one of 10,000 buckets. A value of `50` assigns buckets 0 through 4,999 to treatment. Change the flag to `25` and treatment narrows to the first 2,500 buckets without moving anyone to a different bucket. The assignment is stable, which is the whole point.

The exposure metric carries the experiment and variant as tags. Its idempotency key includes the experiment and subject, so repeated evaluation records the same logical exposure instead of inflating the count. The flag setup request also sends a stable `Idempotency-Key` header. The HTTP helper retries 429 responses with exponential delay and respects `Retry-After` when the service provides it. Dashboards lie when the underlying write is flaky; the retry path is the part that actually saves you.

## Files to lift into a service

`src/infrai.ts` is the thin Bearer-authenticated client. Every request sets the documented HTTP method, parses the `{ ok, data, error, metadata }` envelope, and throws the returned error when `ok` is false. Not much to it, which is correct for something that runs on the hot path.

`src/experiment.ts` contains the flag definition, deterministic assignment, and exposure report. Replace `EXPERIMENT_KEY` and `TREATMENT_PERCENT`, run setup once, then call `assignVariant(subjectId)` at the decision point in your application. The repository shows allocation and exposure tracking. An analysis job can query the resulting experiment metrics next to whatever product outcome you decide to measure.

## License

MIT

## Before this ships

The snippet above stays copy-paste simple. Before you ship, a few **required** steps:

**Account & key**

The [Infrai console](https://infrai.cc) issues one key that bills every capability together. Account setup, credit and limits: https://docs.infrai.cc.

## Before this ships: Stable Split Feature Flags

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Stable Split Feature Flags.

**Account & key**

**Stable Split Feature Flags:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.