import { ar, phaseNames as phaseNamesAr, ackLabels as ackLabelsAr } from '../../../shared/src/ar';
import { en, phaseNamesEn, ackLabelsEn } from '../../../shared/src/en';

export type Lang = 'ar' | 'en';

function chosen(): Lang {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'ar') {
      localStorage.setItem('ashour-lang', q);
      return q;
    }
    return localStorage.getItem('ashour-lang') === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

/** Language is fixed per page load; switching reloads (devices never switch mid-round). */
export const lang: Lang = chosen();
export const dir = lang === 'en' ? 'ltr' : 'rtl';
/** Direction-aware "go" arrow for primary buttons. */
export const arrow = dir === 'rtl' ? '←' : '→';
export const t: typeof ar = lang === 'en' ? (en as typeof ar) : ar;
export const phaseNames = lang === 'en' ? phaseNamesEn : phaseNamesAr;
export const ackLabels = lang === 'en' ? ackLabelsEn : ackLabelsAr;

export function switchLang(next: Lang) {
  try {
    localStorage.setItem('ashour-lang', next);
  } catch {
    /* ignore */
  }
  const url = new URL(location.href);
  url.searchParams.set('lang', next);
  location.href = url.toString();
}
