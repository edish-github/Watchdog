/** Maps any domain id to its console route. */
export function hrefFor(id: string): string | null {
  if (id.startsWith('SIG-')) return `/app/signals/${id}`;
  if (id.startsWith('W-')) return `/app/watches/${id}`;
  if (id.startsWith('OB-')) return `/app/observations/${id}`;
  if (id.startsWith('LR-')) return `/app/verification/${id}`;
  if (id.startsWith('ADV-')) return `/app/advisories/${id}`;
  if (id.startsWith('FHIR-')) return `/app/fhir/${id}`;
  if (/^[A-Z]{3}-\d{2}$/.test(id)) return `/app/sites/${id}`;
  return null;
}
