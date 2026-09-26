/**
 * Canonical base for Watchdog's FHIR artefacts: identifier systems, CodeSystems, tags. Set NEXT_PUBLIC_FHIR_CANONICAL
 * to the deployed app's /fhir URL (e.g. https://watchdog.vercel.app/fhir); this app serves the CodeSystems there, so
 * every URI resolves. The fallback is only for local development and is flagged by the HL7 validator.
 */
export const FHIR_BASE = (process.env.NEXT_PUBLIC_FHIR_CANONICAL || 'http://example.org/fhir/watchdog').replace(/\/+$/, '');
export const FHIR_BASE_IS_EXAMPLE = /example\.(org|com|net)/.test(FHIR_BASE);
