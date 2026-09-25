'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/** Syntax-highlighted JSON. Input is escaped before highlighting. */
export function JsonView({ value, className }: { value: unknown; className?: string }) {
  const html = useMemo(() => {
    const json = JSON.stringify(value, null, 2) ?? 'undefined';
    return json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (m) => {
        const cls = m.startsWith('"') ? (m.trimEnd().endsWith(':') ? 'text-plum-2 font-bold' : 'text-river') : /^(true|false|null)$/.test(m) ? 'text-[#A11C3A]' : 'text-[#8F520A]';
        return `<span class="${cls}">${m}</span>`;
      });
  }, [value]);
  return <pre className={cn('mono overflow-auto rounded-2xl border border-line bg-sand/40 p-4 text-[11.5px] leading-relaxed text-ink', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
