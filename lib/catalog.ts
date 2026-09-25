import type { ChecklistItem, City, CityId, Feeling, HazardId, Person, SignCategory, SignCode, Site, SymptomCode, TierId } from './types';

export const CITIES: City[] = [
  { id: 'coimbra', name: 'Coimbra', country: 'Portugal', cc: 'PT', tz: 'Europe/Lisbon', lang: 'pt', coordinator: 'sofia', volunteers: ['tiago', 'marta'], health: 'OAH Environmental Surveillance System', lat: 40.2033, lon: -8.4103 },
  { id: 'ghent', name: 'Ghent', country: 'Belgium', cc: 'BE', tz: 'Europe/Brussels', lang: 'nl', coordinator: 'pieter', volunteers: ['sara'], health: 'Stad Gent Health Service', lat: 51.0543, lon: 3.7174 },
  { id: 'oslo', name: 'Oslo', country: 'Norway', cc: 'NO', tz: 'Europe/Oslo', lang: 'nb', coordinator: 'kari', volunteers: ['ingrid'], health: 'Oslo kommune Helseetaten', lat: 59.9139, lon: 10.7522 },
  { id: 'toulouse', name: 'Toulouse', country: 'France', cc: 'FR', tz: 'Europe/Paris', lang: 'fr', coordinator: 'elise', volunteers: ['jean'], health: 'ARS Occitanie Health Hub', lat: 43.6047, lon: 1.4442 },
  { id: 'benevento', name: 'Benevento', country: 'Italy', cc: 'IT', tz: 'Europe/Rome', lang: 'it', coordinator: 'giulia', volunteers: ['luca'], health: 'ASL Benevento Veterinary Service', lat: 41.1298, lon: 14.7826 },
];
export const CITY = Object.fromEntries(CITIES.map((c) => [c.id, c])) as Record<CityId, City>;

const S = (id: string, stream: string, reach: string, cityId: CityId, lat: number, lon: number, shade: number, channel: number, sealing: number, baselineFlow: number, flowFactor: number, dx: number, dy: number, followers: number): Site =>
  ({ id, stream, reach, cityId, lat, lon, habitat: { shadeCover: shade, channelModification: channel, soilSealing: sealing }, baselineFlow, flowFactor, map: { dx, dy }, followers });

export const SITES: Site[] = [
  S('COI-01', 'Rio Mondego', 'Parque Verde · shaded left bank', 'coimbra', 40.2012, -8.4231, 0.72, 0.35, 0.4, 1.8, 1.08, -18, 10, 212),
  S('COI-03', 'Rio Mondego', 'Sector 4 · side channel below the weir', 'coimbra', 40.2056, -8.4195, 0.12, 0.8, 0.67, 1.1, 1, 16, -8, 124),
  S('COI-05', 'Ribeira de Coselhas', 'Urban culvert outfall', 'coimbra', 40.2176, -8.4188, 0.5, 0.5, 0.45, 0.24, 1.04, -4, -24, 58),
  S('COI-07', 'Ribeira de Eiras', 'Allotment gardens reach', 'coimbra', 40.2398, -8.4252, 0.6, 0.45, 0.55, 0.31, 1.02, 20, 18, 41),
  S('GNT-02', 'Rietgracht', 'Muide park edge', 'ghent', 51.0662, 3.7309, 0.3, 0.5, 0.45, 0.6, 1, -16, 10, 77),
  S('GNT-07', 'Lieve', 'Canal reach below the overflow', 'ghent', 51.0588, 3.7162, 0.2, 0.7, 0.85, 0.9, 1, 16, -8, 188),
  S('OSL-03', 'Akerselva', 'Nydalen waterfall pools', 'oslo', 59.9493, 10.765, 0.55, 0.6, 0.5, 2.4, 1, -16, 8, 96),
  S('OSL-06', 'Alna', 'Reopened reach at Kværner', 'oslo', 59.9061, 10.782, 0.3, 0.7, 0.65, 0.8, 1, 16, -6, 64),
  S('TSL-04', 'Hers-Mort', 'Footbridge below the ring road', 'toulouse', 43.629, 1.478, 0.15, 0.8, 0.75, 0.7, 1, 16, -8, 101),
  S('TSL-09', 'Touch', 'Wooded confluence', 'toulouse', 43.5932, 1.3718, 0.55, 0.4, 0.35, 1.2, 1.05, -16, 10, 49),
  S('BNV-02', 'Sabato', 'Ponte Leproso footpath', 'benevento', 41.1318, 14.7662, 0.4, 0.5, 0.45, 1.6, 1, -16, -6, 53),
  S('BNV-05', 'Calore', 'Riverside park steps', 'benevento', 41.1255, 14.7905, 0.5, 0.45, 0.3, 3.1, 1, 16, 10, 38),
];
export const SITE = Object.fromEntries(SITES.map((s) => [s.id, s])) as Record<string, Site>;

const P = (id: string, name: string, short: string, role: Person['role'], cityId: CityId, title: string, email: string): Person => ({ id, name, short, role, cityId, title, email });
export const PEOPLE: Record<string, Person> = {
  sofia: P('sofia', 'Sofia Silva', 'Sofia', 'coordinator', 'coimbra', 'Site coordinator · Coimbra', 'sofia.silva@cm-coimbra.demo'),
  pieter: P('pieter', 'Pieter Claes', 'Pieter', 'coordinator', 'ghent', 'Site coordinator · Ghent', 'pieter.claes@stad.gent.demo'),
  elise: P('elise', 'Élise Martin', 'Élise', 'coordinator', 'toulouse', 'Site coordinator · Toulouse', 'elise.martin@toulouse.demo'),
  kari: P('kari', 'Kari Nilsen', 'Kari', 'coordinator', 'oslo', 'Site coordinator · Oslo', 'kari.nilsen@oslo.demo'),
  giulia: P('giulia', 'Giulia Russo', 'Giulia', 'coordinator', 'benevento', 'Site coordinator · Benevento', 'giulia.russo@benevento.demo'),
  tiago: P('tiago', 'Tiago Almeida', 'Tiago', 'citizen_scientist', 'coimbra', 'Citizen scientist · MSc, Coimbra', 'tiago.almeida@uc.demo'),
  marta: P('marta', 'Marta Costa', 'Marta', 'citizen_scientist', 'coimbra', 'OAH app contributor · Coimbra', 'marta.costa@oah.demo'),
  sara: P('sara', 'Sara Vermeulen', 'Sara', 'citizen_scientist', 'ghent', 'Civic volunteer · Ghent', 'sara.vermeulen@ugent.demo'),
  jean: P('jean', 'Jean Morel', 'Jean', 'citizen_scientist', 'toulouse', 'Certified field sampler · Toulouse', 'jean.morel@oah.demo'),
  ingrid: P('ingrid', 'Ingrid Holm', 'Ingrid', 'citizen_scientist', 'oslo', 'Stream steward · Oslo', 'ingrid.holm@oslo.demo'),
  luca: P('luca', 'Luca Ferri', 'Luca', 'citizen_scientist', 'benevento', 'River volunteer · Benevento', 'luca.ferri@unisannio.demo'),
  marc: P('marc', 'Marc Durand', 'Marc', 'health_liaison', 'toulouse', 'Public-health liaison · Toulouse', 'marc.durand@ars.demo'),
  lima: P('lima', 'Dr Helena Lima', 'Dr Lima', 'researcher', 'coimbra', 'Freshwater ecologist · OAH consortium', 'helena.lima@oah.demo'),
};

export const HAZARDS: Record<HazardId, { id: HazardId; name: string; long: string; pt: string; rule: string; evidence: string; precedent: string }> = {
  H1: { id: 'H1', name: 'Heat & low-flow mats', long: 'Heat and low-flow benthic cyanobacteria mats', pt: 'Calor e caudal baixo', rule: 'RULE-01', evidence: 'Documented in European rivers and ponds; plausibility at small urban streams to be verified', precedent: 'Tarn 2002–05 (AEM 2007) · Loue 2003 (Toxicon 2005) · Loire, Aug 2017' },
  H2: { id: 'H2', name: 'Wet-weather sewage', long: 'Wet-weather sewer overflow and run-off pathogens', pt: 'Chuva forte e esgoto', rule: 'RULE-02', evidence: 'Established pathway; thresholds illustrative', precedent: 'EEA bathing water 2024 · OAH urban biofilm pathogens' },
};
export const HZ: HazardId[] = ['H1', 'H2'];

type SignDef = { cat: SignCategory; en: string; pt: string; tag: string; tagPt: string; w: number; hz: HazardId[] };
export const SIGNS: Record<SignCode, SignDef> = {
  dark_mats: { cat: 'water', en: 'Dark mats on stones or riverbed', pt: 'Tapetes escuros nas pedras ou no leito', tag: 'dark mats', tagPt: 'tapetes escuros', w: 0.2, hz: ['H1'] },
  floating_scum: { cat: 'water', en: 'Floating mats or green scum', pt: 'Tapetes flutuantes ou espuma verde', tag: 'floating mats', tagPt: 'tapetes flutuantes', w: 0.25, hz: ['H1'] },
  blue_green: { cat: 'water', en: 'Blue-green colour in the water', pt: 'Cor verde-azulada na água', tag: 'blue-green water', tagPt: 'água verde-azulada', w: 0.18, hz: ['H1'] },
  grey_milky: { cat: 'water', en: 'Grey or milky water', pt: 'Água cinzenta ou leitosa', tag: 'grey water', tagPt: 'água cinzenta', w: 0.18, hz: ['H2'] },
  sewage_odour: { cat: 'water', en: 'Sewage smell', pt: 'Cheiro a esgoto', tag: 'a sewage smell', tagPt: 'cheiro a esgoto', w: 0.22, hz: ['H2'] },
  foam: { cat: 'water', en: 'Persistent foam', pt: 'Espuma persistente', tag: 'foam', tagPt: 'espuma', w: 0.12, hz: ['H2'] },
  sanitary_litter: { cat: 'water', en: 'Sanitary litter (wipes, pads)', pt: 'Lixo sanitário (toalhitas, pensos)', tag: 'sanitary litter', tagPt: 'lixo sanitário', w: 0.22, hz: ['H2'] },
  oily_sheen: { cat: 'water', en: 'Oily sheen on the surface', pt: 'Película oleosa à superfície', tag: 'an oily sheen', tagPt: 'película oleosa', w: 0.1, hz: ['H2'] },
  low_stagnant: { cat: 'water', en: 'Very low or stagnant water', pt: 'Água muito baixa ou parada', tag: 'very low water', tagPt: 'água muito baixa', w: 0.1, hz: ['H1'] },
  dead_fish_1: { cat: 'wildlife', en: 'One dead fish', pt: 'Um peixe morto', tag: 'dead fish', tagPt: 'peixes mortos', w: 0.12, hz: ['H1', 'H2'] },
  dead_fish_2_10: { cat: 'wildlife', en: '2–10 dead fish', pt: '2 a 10 peixes mortos', tag: 'dead fish', tagPt: 'peixes mortos', w: 0.25, hz: ['H1', 'H2'] },
  dead_fish_gt10: { cat: 'wildlife', en: 'More than 10 dead fish', pt: 'Mais de 10 peixes mortos', tag: 'dead fish', tagPt: 'peixes mortos', w: 0.4, hz: ['H1', 'H2'] },
  bird_sick: { cat: 'wildlife', en: 'Dead or sick waterbird', pt: 'Ave aquática morta ou doente', tag: 'a sick waterbird', tagPt: 'uma ave aquática doente', w: 0.22, hz: ['H1', 'H2'] },
  dead_amphibians: { cat: 'wildlife', en: 'Dead frogs or toads', pt: 'Rãs ou sapos mortos', tag: 'dead frogs', tagPt: 'rãs mortas', w: 0.2, hz: ['H1', 'H2'] },
  invertebrate_dieoff: { cat: 'wildlife', en: 'Mass die-off of insects or snails', pt: 'Morte em massa de insetos ou caracóis', tag: 'dead insects', tagPt: 'insetos mortos', w: 0.18, hz: ['H1', 'H2'] },
  dog_unwell: { cat: 'animal', en: 'My dog seemed unwell after touching the water', pt: 'O meu cão ficou indisposto após contacto com a água', tag: 'an unwell dog', tagPt: 'um cão indisposto', w: 0.25, hz: ['H1', 'H2'] },
};
export const SIGN_ORDER: Record<SignCategory, SignCode[]> = {
  water: ['dark_mats', 'floating_scum', 'blue_green', 'grey_milky', 'sewage_odour', 'foam', 'sanitary_litter', 'oily_sheen', 'low_stagnant'],
  wildlife: ['dead_fish_1', 'dead_fish_2_10', 'dead_fish_gt10', 'bird_sick', 'dead_amphibians', 'invertebrate_dieoff'],
  animal: ['dog_unwell'],
  people: [],
};
export const CATEGORY: Record<SignCategory, { en: string; pt: string }> = {
  water: { en: 'Water signs', pt: 'Sinais na água' },
  wildlife: { en: 'Wildlife', pt: 'Vida selvagem' },
  animal: { en: 'Companion animal', pt: 'Animal de companhia' },
  people: { en: 'People', pt: 'Pessoas' },
};
export const SYMPTOMS: Record<SymptomCode, { en: string; pt: string }> = {
  drooling: { en: 'Drooling', pt: 'Salivação excessiva' },
  tremors: { en: 'Unsteady walking or tremors', pt: 'Andar instável ou tremores' },
  vomiting: { en: 'Vomiting or diarrhoea', pt: 'Vómitos ou diarreia' },
  lethargy: { en: 'Unusually tired', pt: 'Invulgarmente cansado' },
  breathing: { en: 'Laboured breathing', pt: 'Respiração difícil' },
};
export const FEELINGS: Record<Feeling, { en: string; pt: string; emoji: string }> = {
  joy: { en: 'Joy', pt: 'Alegria', emoji: '😊' },
  serenity: { en: 'Serenity', pt: 'Serenidade', emoji: '😌' },
  anger: { en: 'Anger', pt: 'Raiva', emoji: '😠' },
  fear: { en: 'Fear', pt: 'Medo', emoji: '😟' },
};
export const CHECKLIST: Record<HazardId, ChecklistItem[]> = {
  H1: [
    { sign: 'dark_mats', label: 'Dark or gelatinous mats on stones', labelPt: 'Tapetes escuros ou gelatinosos nas pedras' },
    { sign: 'floating_scum', label: 'Floating mats or scum at the edge', labelPt: 'Tapetes flutuantes ou espuma na margem' },
    { sign: 'dead_fish_2_10', label: 'Dead fish in the shallows', labelPt: 'Peixes mortos nas zonas pouco fundas' },
    { sign: 'low_stagnant', label: 'Very low or stagnant water', labelPt: 'Água muito baixa ou parada' },
  ],
  H2: [
    { sign: 'sewage_odour', label: 'Sewage smell near the outfall', labelPt: 'Cheiro a esgoto junto à descarga' },
    { sign: 'grey_milky', label: 'Grey or milky water', labelPt: 'Água cinzenta ou leitosa' },
    { sign: 'sanitary_litter', label: 'Sanitary litter on the banks', labelPt: 'Lixo sanitário nas margens' },
    { sign: 'dead_fish_2_10', label: 'Dead fish in the shallows', labelPt: 'Peixes mortos nas zonas pouco fundas' },
  ],
};

export const TIERS: Record<TierId, { label: string; pt: string; cls: string; dot: string; hex: string; soft: string }> = {
  quiet: { label: 'Quiet', pt: 'Calmo', cls: 'bg-[#ECE7DE] text-[#555B57] ring-[#D9D2C5]', dot: 'bg-[#9BA09A]', hex: '#9BA09A', soft: '#ECE7DE' },
  watch: { label: 'Watch', pt: 'Vigilância', cls: 'bg-[#FBEFD2] text-[#8F520A] ring-[#EED79E]', dot: 'bg-[#D99A2B]', hex: '#D99A2B', soft: '#FBEFD2' },
  signal: { label: 'Signal', pt: 'Sinal', cls: 'bg-[#FBE2D0] text-[#A83E16] ring-[#F1C3A2]', dot: 'bg-[#E0672E]', hex: '#E0672E', soft: '#FBE2D0' },
  advisory: { label: 'Advisory', pt: 'Aviso', cls: 'bg-[#F7DCE0] text-[#A11C3A] ring-[#EDB7C0]', dot: 'bg-[#C8344F]', hex: '#C8344F', soft: '#F7DCE0' },
  resolved: { label: 'Resolved', pt: 'Resolvido', cls: 'bg-[#D6EEE7] text-[#0F6A60] ring-[#A9DACB]', dot: 'bg-[#1F9483]', hex: '#1F9483', soft: '#D6EEE7' },
};
export const TIER_ORDER: TierId[] = ['advisory', 'signal', 'watch', 'resolved', 'quiet'];
