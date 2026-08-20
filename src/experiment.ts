import { infrai } from "./infrai.ts";

const EXPERIMENT_KEY = "checkout_headline_v2";
const TREATMENT_PERCENT = 50;

type Variant = "control" | "treatment";

function bucket(subjectId: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(`${EXPERIMENT_KEY}:${subjectId}`)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 10_000;
}

function asPercentage(value: unknown): number {
  if (typeof value !== "number" || value < 0 || value > 100) {
    throw new Error("Experiment percentage must be a number from 0 through 100.");
  }
  return value;
}

export async function configureExperiment(): Promise<void> {
  await infrai.flags.set(
    {
      key: EXPERIMENT_KEY,
      type: "number",
      default_value: TREATMENT_PERCENT,
      enabled: true,
      description: "Checkout headline experiment treatment percentage.",
    },
    `configure:${EXPERIMENT_KEY}:${TREATMENT_PERCENT}`,
  );
}

export async function assignVariant(subjectId: string): Promise<Variant> {
  const flag = await infrai.flags.get_value(EXPERIMENT_KEY);
  const percentage = asPercentage(flag.value);
  const variant: Variant = bucket(subjectId) < percentage * 100 ? "treatment": "control";

  await infrai.metrics.report({
    name: "experiment.exposure",
    value: 1,
    type: "counter",
    tags: { experiment: EXPERIMENT_KEY, variant },
    idempotency_key: `exposure:${EXPERIMENT_KEY}:${subjectId}`,
  });

  return variant;
}

async function main(): Promise<void> {
  const [command, subjectId] = process.argv.slice(2);

  if (command === "setup") {
    await configureExperiment();
    console.log(`Configured ${EXPERIMENT_KEY} at ${TREATMENT_PERCENT}% treatment.`);
    return;
  }

  if (command === "assign" && subjectId) {
    const variant = await assignVariant(subjectId);
    console.log(`${subjectId} -> ${variant}`);
    return;
  }

  console.log("Usage: npm run experiment -- setup | assign <subject-id>");
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message: String(error));
    process.exitCode = 1;
  });
}
