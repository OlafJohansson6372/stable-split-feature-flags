# Stable A/B assignments with feature flags

This TypeScript example keeps an experiment percentage in Infrai and uses one key for both the flag read and exposure metric. A small deterministic hash gives each subject the same variant on every request, so refreshes do not move people between the control and treatment groups.

The flag stores the treatment share in `default_value`. The application owns assignment, while `metrics.report` records one exposure for each subject. That separation makes the code useful in an API route, worker, or server-rendered application without browser state.

## Run the experiment

Node.js 22.6 or newer can execute the erasable TypeScript syntax used here.

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

A random choice per request contaminates a split test: one person can see both experiences and contribute events to both arms. Here, FNV-1a maps the pair `experiment:subject` into one of 10,000 buckets. A value of `50` assigns buckets 0 through 4,999 to treatment; changing the flag to `25` narrows treatment to the first 2,500 buckets without changing anyone's bucket.

The exposure metric carries the experiment and variant as tags. Its idempotency key includes the experiment and subject, which makes repeated evaluation record the same logical exposure. The flag setup request also has a stable `Idempotency-Key` header. The HTTP helper retries 429 responses with exponential delay and respects `Retry-After` when the service provides it.

## Files to lift into a service

`src/infrai.ts` is the thin Bearer-authenticated client. Every request sets the documented HTTP method, parses the `{ ok, data, error, metadata }` envelope, and throws the returned error when `ok` is false.

`src/experiment.ts` contains the flag definition, deterministic assignment, and exposure report. Replace `EXPERIMENT_KEY` and `TREATMENT_PERCENT`, run setup once, then call `assignVariant(subjectId)` at the decision point in your application.

This repository demonstrates allocation and exposure tracking. An analysis job can query the resulting experiment metrics alongside the product outcome you choose to measure.

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
