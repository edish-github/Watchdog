export type Lang = 'en' | 'pt' | 'nl' | 'fr' | 'it' | 'nb';
export type HazardId = 'H1' | 'H2';
export type TierId = 'quiet' | 'watch' | 'signal' | 'advisory' | 'resolved';
export type CityId = 'coimbra' | 'ghent' | 'oslo' | 'toulouse' | 'benevento';
export type SignCategory = 'wildlife' | 'water' | 'animal' | 'people';
export type SignCode =
  | 'dark_mats' | 'floating_scum' | 'blue_green' | 'grey_milky' | 'sewage_odour' | 'foam'
  | 'sanitary_litter' | 'oily_sheen' | 'low_stagnant' | 'dead_fish_1' | 'dead_fish_2_10'
  | 'dead_fish_gt10' | 'bird_sick' | 'dead_amphibians' | 'invertebrate_dieoff' | 'dog_unwell';
export type SymptomCode = 'drooling' | 'tremors' | 'vomiting' | 'lethargy' | 'breathing';
export type Feeling = 'joy' | 'serenity' | 'anger' | 'fear';
export type Role = 'walker' | 'citizen_scientist';
export type PersonRole = 'coordinator' | 'citizen_scientist' | 'health_liaison' | 'researcher';

export interface Habitat { shadeCover: number; channelModification: number; soilSealing: number }
export interface Site {
  id: string; stream: string; reach: string; cityId: CityId; lat: number; lon: number;
  habitat: Habitat; baselineFlow: number; flowFactor: number; map: { dx: number; dy: number }; followers: number;
}
export interface City {
  id: CityId; name: string; country: string; cc: string; tz: string; lang: Lang;
  coordinator: string; volunteers: string[]; health: string; lat: number; lon: number;
}
export interface Person { id: string; name: string; short: string; role: PersonRole; cityId?: CityId; title: string; email: string }

export interface DayWeather { date: string; tmax: number; rain: number; rain14: number; rain72: number; flowRatio: number; discharge: number }
export interface WatchBreakdown {
  hazard: HazardId; date: string; weather: DayWeather; trigger: number; parts: Record<string, number>;
  vulnerability: number; vulnParts: Record<string, number>; score: number;
}
export interface SeriesPoint { t: string; h: number; score: number; lo: number; hi: number }

export interface EvidenceItem {
  obsId: string; deviceId: string; label: string; role: Role; verified: boolean; weight: number;
  categories: SignCategory[]; signs: SignCode[]; acute: boolean;
}
export interface EvidenceBreakdown { items: EvidenceItem[]; base: number; synergy: number; value: number; categories: SignCategory[]; reporters: number }
export interface ScoreSnapshot {
  at: string; ruleVersion: string; ruleSha: string; watch: WatchBreakdown; watchActive: boolean;
  evidence: EvidenceBreakdown; score: number; gate: boolean; rule: { met: boolean; reason: string };
}

export interface Watch { id: string; siteId: string; hazard: HazardId; openedAt: string; closedAt?: string; peak: number; peakDate: string }
export interface Photo { dataUrl: string; name: string; width: number; height: number; bytes: number }
export interface AnimalReport { species: 'dog'; name?: string; symptoms: SymptomCode[]; onset: 'lt2h' | 'gt2h' }
export type ObsStatus = 'pending' | 'fused' | 'discarded' | 'context' | 'archived';
export interface ObservationInput {
  siteId: string; deviceId: string; displayName?: string; role: Role; verified?: boolean; lookId?: string;
  signs: SignCode[]; animal?: AnimalReport; feeling?: Feeling; note?: string; photo?: Photo; source: 'pwa' | 'mission';
}
export interface Observation extends ObservationInput { id: string; createdAt: string; status: ObsStatus; signalId?: string; statusNote?: string }

export type SignalStatus = 'open' | 'look_requested' | 'advisory' | 'dismissed' | 'closed';
export interface Decision { at: string; actor: string; kind: 'dismiss' | 'request_look' | 'draft' | 'approve' | 'escalate' | 'withdraw' | 'close'; note?: string }
export interface Signal {
  id: string; siteId: string; hazard: HazardId; openedAt: string; openReason: string; status: SignalStatus;
  observationIds: string[]; snapshot: ScoreSnapshot;
  history: { at: string; score: number; evidence: number; watch: number; n: number }[];
  decisions: Decision[]; advisoryId?: string; escalatedAt?: string; closedAt?: string;
}

export interface ChecklistItem { sign: SignCode; label: string; labelPt: string }
export type LookResult = 'signs_present' | 'no_signs' | 'no_access';
export interface LookRequest {
  id: string; siteId: string; hazard: HazardId; signalId?: string; advisoryId?: string; purpose: 'verify' | 'resolve';
  assignee: string; createdBy: string; createdAt: string; dueAt: string; note?: string; checklist: ChecklistItem[];
  status: 'queued' | 'accepted' | 'completed' | 'expired'; acceptedAt?: string;
  response?: { at: string; result: LookResult; observed: SignCode[]; notes?: string; photo?: Photo; counted?: boolean };
}

export type AdvisoryStatus = 'draft' | 'live' | 'expired' | 'withdrawn' | 'resolved';
export interface Advisory {
  id: string; siteId: string; hazard: HazardId; signalId?: string; langs: Lang[]; text: Partial<Record<Lang, string>>;
  draft?: { by: string; at: string; text: Partial<Record<Lang, string>> }; edited: boolean; status: AdvisoryStatus;
  createdAt: string; createdBy: string; publishedAt?: string; approvedBy?: string; validUntil: string; ruleVersion: string;
  auditHash?: string; clearChecks: { lookId: string; by: string; at: string }[]; closedAt?: string; closeReason?: string;
}

export interface FhirResource { resourceType: string; [key: string]: unknown }
export interface FhirEntry { fullUrl: string; resource: FhirResource; request: { method: 'POST'; url: string } }
export interface FhirBundle { resourceType: 'Bundle'; id: string; type: 'transaction'; timestamp: string; meta?: Record<string, unknown>; entry: FhirEntry[] }
export interface Validation { errors: string[]; warnings: string[]; notes: string[]; checked: number }
export interface BundleRecord {
  id: string; siteId: string; signalId?: string; advisoryId?: string; target: string; endpoint: string;
  createdAt: string; createdBy: string; status: 'queued' | 'sending' | 'sent' | 'failed'; bundle: FhirBundle;
  validation: Validation; hash: string; resourceCount: number; sentAt?: string; http?: number; receipt?: string; error?: string;
}

export interface AuditEvent { id: string; at: string; actor: string; action: string; target: string; detail?: string; kind: 'system' | 'human' | 'report' }
export interface Notice { id: string; at: string; kind: 'watch' | 'signal' | 'look' | 'advisory' | 'fhir' | 'report'; title: string; body: string; href: string; read: boolean }

export interface Domain {
  start: string; now: string; preset: string; autopilot: boolean; cursor: number; lastCycle: string | null; lastCreated?: string;
  seq: { obs: number; sig: number; look: number; adv: number; fhir: number; evt: number; ntc: number };
  watches: Watch[]; observations: Observation[]; signals: Signal[]; looks: LookRequest[];
  advisories: Advisory[]; bundles: BundleRecord[]; audit: AuditEvent[]; notices: Notice[];
}
