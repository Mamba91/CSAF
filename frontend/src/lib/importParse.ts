// Analyse de fichiers d'inventaire (export PRONETA / CSV / XML lisible)
// et mapping vers le modèle Device.

export type Row = Record<string, string>;
export interface ParsedTable {
  columns: string[];
  rows: Row[];
}

export const TARGET_FIELDS = [
  { key: 'name', label: 'Nom / modèle', required: true },
  { key: 'vendor', label: 'Fabricant' },
  { key: 'product_family', label: 'Gamme / type' },
  { key: 'article_number', label: "N° d'article / MLFB" },
  { key: 'firmware_version', label: 'Firmware' },
  { key: 'cpe', label: 'CPE' },
  { key: 'notes', label: 'Notes (IP / MAC…)' },
] as const;

export type TargetKey = (typeof TARGET_FIELDS)[number]['key'];

/** Erreur explicite si le fichier est un projet PRONETA chiffré. */
export class EncryptedPronetaError extends Error {
  constructor() {
    super(
      "Ce fichier est une sauvegarde PRONETA chiffrée (AES/CBC), pas un export lisible. " +
        "Dans PRONETA, affichez l'analyse réseau puis exportez la table en CSV, et importez ce CSV ici."
    );
    this.name = 'EncryptedPronetaError';
  }
}

function looksEncrypted(text: string): boolean {
  return text.slice(0, 64).includes('MSMAMARPCRYPT');
}

/* ----------------------------- CSV ----------------------------- */

function detectDelimiter(sample: string): string {
  const line = sample.split(/\r?\n/).find((l) => l.trim().length) || '';
  const counts: Record<string, number> = {
    ';': (line.match(/;/g) || []).length,
    ',': (line.match(/,/g) || []).length,
    '\t': (line.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
}

function cleanCell(v: string): string {
  // retire les octets de contrôle (ex: \x00 dans les n° de série PRONETA)
  return (v ?? '').replace(/[\u0000-\u001f]+/g, '').trim();
}

function parseCsv(text: string): ParsedTable {
  // Directive Excel "sep=," en première ligne : fixe le délimiteur et on la saute
  let body = text;
  let forcedDelim = '';
  const firstNl = text.indexOf('\n');
  const firstLine = (firstNl >= 0 ? text.slice(0, firstNl) : text).replace(/^\uFEFF/, '').trim();
  if (/^sep=/i.test(firstLine)) {
    forcedDelim = firstLine.slice(4) || ',';
    body = firstNl >= 0 ? text.slice(firstNl + 1) : '';
  }
  const delim = forcedDelim || detectDelimiter(body);

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === '"') {
        if (body[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      record.push(field); field = '';
    } else if (ch === '\n') {
      record.push(field); records.push(record); field = ''; record = [];
    } else if (ch === '\r') {
      // ignore
    } else field += ch;
  }
  if (field.length || record.length) { record.push(field); records.push(record); }

  // Lignes non vides (au moins une cellule renseignée)
  const nonEmpty = records.filter((r) => r.some((c) => cleanCell(c).length));
  if (!nonEmpty.length) return { columns: [], rows: [] };

  // En-tête = première ligne ayant au moins 2 cellules renseignées
  // (saute les lignes-titres type "Online Topology" de PRONETA)
  let headerIdx = nonEmpty.findIndex((r) => r.filter((c) => cleanCell(c).length).length >= 2);
  if (headerIdx < 0) headerIdx = 0;

  // En-têtes nettoyés + dédoublonnage des noms répétés (#, Name, IP Address…)
  const seen: Record<string, number> = {};
  const headers = nonEmpty[headerIdx].map((h, i) => {
    let name = cleanCell(h) || `col_${i + 1}`;
    if (seen[name] != null) { seen[name]++; name = `${name} (${seen[name]})`; }
    else seen[name] = 1;
    return name;
  });

  const rows = nonEmpty.slice(headerIdx + 1).map((r) => {
    const o: Row = {};
    headers.forEach((h, i) => (o[h] = cleanCell(r[i] ?? '')));
    return o;
  });
  return { columns: headers, rows };
}

/* ----------------------------- XML ----------------------------- */

function parseXml(text: string): ParsedTable {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML invalide');

  // On cherche l'élément répété le plus fréquent (= ligne device)
  const tally: Record<string, Element[]> = {};
  doc.querySelectorAll('*').forEach((el) => {
    (tally[el.tagName] ||= []).push(el);
  });
  let best: Element[] = [];
  for (const els of Object.values(tally)) {
    if (els.length > best.length && els.length > 1) best = els;
  }
  if (!best.length) throw new Error('Aucune liste répétée détectée dans le XML');

  const columns = new Set<string>();
  const rows: Row[] = best.map((el) => {
    const o: Row = {};
    for (const attr of Array.from(el.attributes)) {
      o[attr.name] = attr.value; columns.add(attr.name);
    }
    for (const child of Array.from(el.children)) {
      if (!child.children.length) {
        o[child.tagName] = child.textContent?.trim() || '';
        columns.add(child.tagName);
      }
    }
    return o;
  });
  return { columns: [...columns], rows };
}

/* --------------------------- Dispatch --------------------------- */

export function parseInventory(filename: string, text: string): ParsedTable {
  if (looksEncrypted(text)) throw new EncryptedPronetaError();
  const trimmed = text.trimStart();
  const isXml = trimmed.startsWith('<?xml') || trimmed.startsWith('<');
  const table = isXml && !filename.toLowerCase().endsWith('.csv') ? parseXml(text) : parseCsv(text);
  if (!table.columns.length) throw new Error('Fichier vide ou illisible');
  return table;
}

/* --------------------- Auto-mapping colonnes -------------------- */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// indices par champ : correspondances exactes (prioritaires) puis partielles
const EXACT: Record<TargetKey, string[]> = {
  name: ['name', 'nom', 'station name', 'device name', 'dns name', 'station'],
  vendor: ['vendor name', 'vendor', 'manufacturer', 'fabricant', 'hersteller', 'constructeur'],
  product_family: ['device type', 'type', 'product', 'model', 'modele', 'gamme'],
  article_number: ['order number', 'article number', 'mlfb', 'order no', 'article', 'bestellnummer', 'reference', 'ref'],
  firmware_version: ['firmware version', 'firmware', 'fw version', 'sw version', 'software version', 'version'],
  cpe: ['cpe'],
  notes: ['comment', 'ip address', 'mac address'],
};
const PARTIAL: Record<TargetKey, string[]> = {
  name: ['name', 'nom', 'station'],
  vendor: ['vendor', 'fabricant', 'manufacturer', 'hersteller'],
  product_family: ['device type', 'product', 'model', 'gamme', 'family'],
  article_number: ['order', 'article', 'mlfb', 'bestell', 'reference'],
  firmware_version: ['firmware', 'sw version', 'software'],
  cpe: ['cpe'],
  notes: ['ip', 'mac', 'comment', 'subnet'],
};
// pour éviter les faux positifs (ex: "Vendor ID" capté par "vendor")
const EXCLUDE: Partial<Record<TargetKey, string[]>> = {
  vendor: ['id'],
  firmware_version: ['hardware'],
};

function findCol(columns: string[], used: Set<string>, candidates: string[], exact: boolean, exclude: string[] = []) {
  for (const col of columns) {
    if (used.has(col)) continue;
    const n = norm(col);
    if (exclude.some((e) => n.includes(e))) continue;
    if (exact ? candidates.includes(n) : candidates.some((c) => n.includes(c))) return col;
  }
  return '';
}

export function autoMap(columns: string[]): Record<TargetKey, string> {
  const map = {} as Record<TargetKey, string>;
  const used = new Set<string>();
  const keys = TARGET_FIELDS.map((f) => f.key);

  // Préréglage PRONETA : signature de l'export "Online Topology"
  const has = (name: string) => columns.find((c) => norm(c) === name) || '';
  const isProneta = has('device type') && (has('vendor name') || has('vendor')) &&
    (has('order number') || has('firmware version'));
  if (isProneta) {
    const preset: Record<TargetKey, string> = {
      name: has('name'),
      vendor: has('vendor name') || has('vendor'),
      product_family: has('device type'),
      article_number: has('order number'),
      firmware_version: has('firmware version'),
      cpe: '',
      notes: has('comment'),
    };
    return preset;
  }

  // Générique : passe exacte globale, puis passe partielle
  for (const key of keys) {
    const pick = findCol(columns, used, EXACT[key], true, EXCLUDE[key] || []);
    if (pick) { map[key] = pick; used.add(pick); }
  }
  for (const key of keys) {
    if (map[key]) continue;
    const pick = findCol(columns, used, PARTIAL[key], false, EXCLUDE[key] || []);
    map[key] = pick;
    if (pick) used.add(pick);
  }
  return map;
}

/** Applique le mapping pour produire les devices à importer. */
export function toDevices(table: ParsedTable, mapping: Record<TargetKey, string>) {
  return table.rows
    .map((r) => {
      const dev: Record<string, string> = {};
      for (const field of TARGET_FIELDS) {
        const src = mapping[field.key];
        dev[field.key] = src ? (r[src] || '').trim() : '';
      }
      return dev;
    })
    .filter((d) => d.name);
}
