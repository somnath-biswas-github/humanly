import { readFileSync } from "node:fs";
import { EVALUATION_CAPABILITIES, validateEvaluationContract } from "./evaluation-contracts.js";

// Validation only. Intentionally no provider, database or execution imports.
try {
  const [command, path, ...extra] = process.argv.slice(2);
  if (command === "capabilities" && !path) {
    console.log(JSON.stringify(EVALUATION_CAPABILITIES, null, 2));
  } else if (command === "validate" && path && extra.length === 0) {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    validateEvaluationContract(value);
    console.log(JSON.stringify({ valid: true, executable: false, message: "Contract-only extension; existing runner formats remain unchanged." }));
  } else {
    throw new Error("Usage: npx tsx src/contract-cli.ts capabilities | validate <contract.json>");
  }
} catch (error) {
  // Never echo arbitrary file content, credentials, or a raw JSON parse failure.
  console.error(error instanceof Error && (error.message.startsWith("Invalid evaluation contract:") || error.message.startsWith("Usage:"))
    ? error.message : "Unable to read or parse contract JSON.");
  process.exitCode = 2;
}
