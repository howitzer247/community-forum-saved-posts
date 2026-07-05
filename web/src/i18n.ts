/**
 * INTERNATIONALIZATION
 * --------------------
 * All user-facing strings live here, in a catalog with two locales (en, es).
 * Nothing in the UI hard-codes English text — components call t(key) or the
 * plural helper. Swapping locale swaps every string.
 *
 * Pluralization uses Intl.PluralRules (the platform's own CLDR data) rather than
 * a naive `n === 1 ? 'save' : 'saves'`, so it stays correct for locales with more
 * than two plural forms. The catalog provides one/other variants per locale.
 */

export type Locale = 'en' | 'es';

type Catalog = {
  feed: string;
  saved: string;
  save: string;
  unsave: string;
  emptySaved: string;
  emptyFeed: string;
  loading: string;
  error: string;
  by: string;
  // plural forms for the saves count
  savesOne: string;
  savesOther: string;
};

const catalogs: Record<Locale, Catalog> = {
  en: {
    feed: 'Feed',
    saved: 'Saved',
    save: 'Save',
    unsave: 'Saved', // toggle label when already saved
    emptySaved: 'Nothing saved yet. Bookmark a post to find it here later.',
    emptyFeed: 'No posts in this course yet.',
    loading: 'Loading…',
    error: 'Something went wrong. Try again.',
    by: 'by',
    savesOne: '{n} save',
    savesOther: '{n} saves',
  },
  es: {
    feed: 'Publicaciones',
    saved: 'Guardados',
    save: 'Guardar',
    unsave: 'Guardado',
    emptySaved: 'Aún no has guardado nada. Marca una publicación para encontrarla aquí.',
    emptyFeed: 'Aún no hay publicaciones en este curso.',
    loading: 'Cargando…',
    error: 'Algo salió mal. Inténtalo de nuevo.',
    by: 'por',
    savesOne: '{n} guardado',
    savesOther: '{n} guardados',
  },
};

export function makeT(locale: Locale) {
  const cat = catalogs[locale];
  const pr = new Intl.PluralRules(locale);

  function t(key: keyof Catalog): string {
    return cat[key];
  }

  /** Correct plural for the saves count in the active locale. */
  function savesLabel(n: number): string {
    const form = pr.select(n); // 'one' | 'other' | ...
    const template = form === 'one' ? cat.savesOne : cat.savesOther;
    return template.replace('{n}', String(n));
  }

  return { t, savesLabel, locale };
}

export type Translator = ReturnType<typeof makeT>;
