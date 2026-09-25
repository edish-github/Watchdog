'use client';

import Link from 'next/link';
import { ArrowUpRight, Check, Fingerprint, Sparkles, X } from 'lucide-react';
import { useWD } from '@/lib/store';
import { L, useT } from '@/lib/i18n';
import { ForgetDevice } from '@/components/observe/forget-device';

const DOES = [
  ['Forecast 72-hour Watch windows from weather, river flow and each site’s habitat.', 'Prevemos janelas de Vigilância a 72 horas a partir do tempo, do caudal e do habitat de cada local.'],
  ['Ask the people already at the stream to look and report in 30 seconds.', 'Pedimos a quem já está na ribeira que observe e relate em 30 segundos.'],
  ['Let a coordinator review every signal and approve every public word.', 'Um coordenador revê cada sinal e aprova cada palavra pública.'],
  ['Send approved events to health services in the HL7 FHIR standard.', 'Enviamos os eventos aprovados aos serviços de saúde no padrão HL7 FHIR.'],
  ['Link each season’s risk to restoration, such as planting shade along the banks.', 'Ligamos o risco de cada época ao restauro, como plantar sombra nas margens.'],
] as const;
const DONT = [
  ['Detect toxins or measure water quality — we flag when a professional should look.', 'Detetar toxinas ou medir a qualidade da água — sinalizamos quando um profissional deve verificar.'],
  ['Diagnose people or animals. Animal reports are owner observations.', 'Diagnosticar pessoas ou animais. Os relatos de animais são observações dos donos.'],
  ['Collect human illness data.', 'Recolher dados de doença humana.'],
  ['Publish any warning without a person approving it.', 'Publicar qualquer aviso sem aprovação de uma pessoa.'],
  ['Call a stream “safe”. We say what to avoid, and for how long.', 'Dizer que uma ribeira é “segura”. Dizemos o que evitar e durante quanto tempo.'],
] as const;
const DATA = [
  [['Device ID (random)', 'ID do dispositivo (aleatório)'], ['Count independent reporters', 'Contar relatos independentes'], ['Until you delete it', 'Até o apagar']],
  [['Report place and time', 'Local e hora do relato'], ['Place a sighting at a site', 'Associar o relato a um local'], ['24 months, then aggregated', '24 meses, depois agregado']],
  [['Signs and animal report', 'Sinais e relato do animal'], ['Scoring and health hand-off', 'Pontuação e envio à saúde'], ['24 months', '24 meses']],
  [['Photo, metadata stripped', 'Foto, sem metadados'], ['Coordinator review', 'Revisão pelo coordenador'], ['90 days', '90 dias']],
] as const;
const ATTRIB = [
  ['Weather — Open-Meteo (CC BY 4.0)', 'https://open-meteo.com/'],
  ['River discharge — GloFAS, Copernicus EMS', 'https://www.globalfloods.eu/'],
  ['OneAquaHealth project', 'https://www.oneaquahealth.eu/about/'],
  ['OneAquaHealth FHIR Implementation Guide', 'https://build.fhir.org/ig/hl7-eu/oah/'],
] as const;

export default function About() {
  const device = useWD((s) => s.device);
  const session = useWD((s) => s.session);
  const { t, locale } = useT();
  const heads = locale === 'pt' ? ['Dado', 'Para quê', 'Guardado'] : ['Data', 'Why', 'Kept'];
  return (
    <div className="space-y-6">
      <header className="animate-rise">
        <h1 className="display text-[2.3rem] leading-[1.02]">{t('aboutTitle')}</h1>
        <p className="mt-2 text-ink-2">{t('aboutLead')}</p>
      </header>

      <section className="card p-4">
        <h2 className="eyebrow !text-ink-2">{t('doesTitle')}</h2>
        <ul className="mt-3 space-y-2.5">{DOES.map((x) => <li key={x[0]} className="flex gap-3 text-sm text-ink"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#D6EEE7] text-[#0F6A60]"><Check className="h-3 w-3" strokeWidth={3} /></span>{L(x, locale)}</li>)}</ul>
      </section>

      <section className="card p-4">
        <h2 className="eyebrow !text-ink-2">{t('doesntTitle')}</h2>
        <ul className="mt-3 space-y-2.5">{DONT.map((x) => <li key={x[0]} className="flex gap-3 text-sm text-ink"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#F7DCE0] text-[#A11C3A]"><X className="h-3 w-3" strokeWidth={3} /></span>{L(x, locale)}</li>)}</ul>
      </section>

      <section className="card overflow-hidden">
        <div className="p-4"><h2 className="eyebrow !text-ink-2">{t('dataTitle')}</h2><p className="mt-2 text-sm text-ink-2">{t('dataLead')}</p></div>
        <table className="tbl">
          <thead><tr>{heads.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{DATA.map((r) => <tr key={r[0][0]}>{r.map((c, i) => <td key={i} className={i === 0 ? 'font-bold text-ink' : 'text-ink-2'}>{L(c, locale)}</td>)}</tr>)}</tbody>
        </table>
      </section>

      <section className="card p-4">
        <h2 className="eyebrow !text-ink-2">{t('deviceTitle')}</h2>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sand px-3 py-1 text-xs text-ink-2"><Fingerprint className="h-3.5 w-3.5" />{t('deviceId')}: <b className="mono text-ink">{device.id}</b> ({t('private')})</p>
        {(device.name || device.pet) && <p className="mt-2 text-sm text-ink-2">{[device.name, device.pet && `🐕 ${device.pet}`].filter(Boolean).join(' · ')}</p>}
        <ForgetDevice className="mt-4" />
      </section>

      <section className="rounded-3xl bg-plum-soft/60 p-4">
        <h2 className="flex items-center gap-2 font-bold text-plum-2"><Sparkles className="h-4 w-4" />{t('aiTitle')}</h2>
        <p className="mt-1.5 text-sm text-ink">{t('aiBody')}</p>
      </section>

      <section className="card p-4">
        <h2 className="eyebrow !text-ink-2">{t('attribTitle')}</h2>
        <ul className="mt-3 space-y-2">{ATTRIB.map(([label, href]) => <li key={href}><a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-bold text-plum hover:underline">{label}<ArrowUpRight className="h-3.5 w-3.5" /></a></li>)}</ul>
        <p className="mt-3 text-xs text-ink-3">{t('synthetic')} · Apache-2.0</p>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/" className="btn btn-outline">{t('backLanding')}</Link>
        <Link href={session ? '/app/overview' : '/login'} className="btn btn-soft">{t('openConsole')}</Link>
      </div>
    </div>
  );
}
