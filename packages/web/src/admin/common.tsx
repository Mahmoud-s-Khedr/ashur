import React, { useEffect, useState } from 'react';
import { ar as t } from '../../../shared/src/ar';
import { identity } from '../ws';
import { parseImport } from '../import';
import type { Bulk } from '../lib/types';

export const stageName = (n: number) => [t.blitz, t.gambler, t.climb][n - 1];

export function Modal({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section
        className={`modal panel ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="section-heading">
          <h2>{title}</h2>
          <button className="ghost" aria-label={t.cancel} onClick={close}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function Importer({ kind, bulk }: { kind: 'teams' | 'questions'; bulk: Bulk }) {
  const [message, setMessage] = useState('');
  return (
    <div className="import-label">
      <span>{t.import}</span>
      <label className="file-btn">
        {t.chooseFile}
        <input
          type="file"
          accept=".json,.csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const rows = parseImport(await f.text(), kind);
              const ok = await bulk(`${kind}.save`, { [kind]: rows });
              setMessage(ok ? t.saved : t.error);
            } catch (error) {
              setMessage(String(error));
            }
            e.target.value = '';
          }}
        />
      </label>
      <small role="status">{message || t.importHelp}</small>
    </div>
  );
}

export async function download(url: string, name: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${identity('admin').token}` },
  });
  if (!response.ok) throw new Error((await response.json()).error);
  const blob = await response.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function Section({
  title,
  badge,
  actions,
  children,
  className = '',
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="section-heading">
        <h2>{title}</h2>
        {badge !== undefined && <span className="badge">{badge}</span>}
        {actions && <div className="heading-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Crypto-random Fisher–Yates shuffle (draws must not rely on Math.random). */
export function shuffle<T>(list: T[]) {
  const a = [...list];
  const buf = new Uint32Array(a.length);
  crypto.getRandomValues(buf);
  for (let i = a.length - 1; i > 0; i--) {
    const j = buf[i] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Resize a chosen image to a 256px PNG data URL so logos stay small. */
export async function imageToLogo(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const scale = Math.min(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale,
    h = bitmap.height * scale;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL('image/png');
}

/** Arabic-labelled file picker (the native control follows the browser's language). */
export function FilePick({
  accept,
  onFile,
  label,
}: {
  accept: string;
  onFile: (f: File) => void;
  label: string;
}) {
  return (
    <label className="file-btn">
      {label}
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}
