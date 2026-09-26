#!/usr/bin/env bash
# Validates fhir/examples/*.json with the official HL7 FHIR Validator (R4). Needs Java 11+; downloads the jar once.
set -euo pipefail
JAR=.cache/validator_cli.jar
command -v java >/dev/null 2>&1 || { echo "✗ Java 11+ is required for the HL7 FHIR Validator (CI installs Temurin 17)."; exit 1; }
mkdir -p .cache
[ -s "$JAR" ] || curl -fsSL -o "$JAR" https://github.com/hapifhir/org.hl7.fhir.core/releases/latest/download/validator_cli.jar
npx tsx scripts/fhir-examples.ts
java -jar "$JAR" fhir/examples/*.json -version 4.0.1 -display-issues-are-warnings -output fhir/validation.json > fhir/validation.log 2>&1 || true
node -e '
const fs = require("fs");
if (!fs.existsSync("fhir/validation.json")) { console.error(fs.readFileSync("fhir/validation.log", "utf8").slice(-3000)); process.exit(1); }
const o = JSON.parse(fs.readFileSync("fhir/validation.json", "utf8"));
const oos = o.resourceType === "Bundle" ? (o.entry || []).map((e) => e.resource) : [o];
const all = oos.flatMap((x) => (x.issue || []).map((i) => ({ ...i, file: (x.extension || []).find((e) => /file/.test(e.url))?.valueString })));
const count = (s) => all.filter((i) => i.severity === s).length;
const errors = all.filter((i) => i.severity === "error" || i.severity === "fatal");
console.log(`HL7 FHIR Validator (R4): ${oos.length} bundle(s) · ${errors.length} errors · ${count("warning")} warnings · ${count("information")} info`);
for (const e of errors.slice(0, 25)) console.log(`  ✗ ${e.file ?? ""} ${(e.expression || e.location || []).join(", ")} — ${e.diagnostics || e.details?.text || ""}`);
process.exit(errors.length ? 1 : 0);
'
