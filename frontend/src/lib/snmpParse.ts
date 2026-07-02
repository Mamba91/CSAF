const KNOWN_VENDORS = [
  'siemens', 'schneider electric', 'schneider', 'rockwell', 'allen-bradley',
  'abb', 'phoenix contact', 'wago', 'moxa', 'beckhoff', 'mitsubishi electric',
  'omron', 'honeywell', 'cisco', 'hirschmann', 'belden', 'weidmuller',
];

// Numéro d'article type MLFB Siemens (ex: "6ES7 512-1SM03-0AB0"). Le préfixe à 4 caractères (6ES7, 6AV2…) est
// séparé du reste soit par un espace, soit par une virgule, soit collé directement, selon le device/firmware.
const ARTICLE_PREFIXED_RE = /\b(\d[A-Z]{2}\d)[\s,]*(\d{2,5}-[0-9A-Z]{2,6}-[0-9A-Z]{3,6})\b/;
// Repli générique pour les formats sans préfixe reconnu (trois blocs alphanumériques séparés par des tirets).
const ARTICLE_GENERIC_RE = /\b\d[0-9A-Z]{2,7}-[0-9A-Z]{2,6}-[0-9A-Z]{3,6}\b/;
const FW_LABELED_RE = /\bFW:?\s*([Vv]?\d+(?:\.\d+){0,4})/;
const VERSION_RE = /\b[Vv]\d+(?:\.\d+){1,4}\b/g;

export interface ParsedSysDescr {
  productFamily: string;
  model: string;
  articleNumber: string;
  firmwareVersion: string;
}

/** Extrait gamme produit, modèle, n° d'article et firmware depuis un sysDescr SNMP (formats Siemens/OT classiques : "Fabricant, Gamme, Modèle, MLFB, HW:.., FW:.."). */
export function parseSysDescr(sysDescr: string): ParsedSysDescr {
  const result: ParsedSysDescr = { productFamily: '', model: '', articleNumber: '', firmwareVersion: '' };
  if (!sysDescr) return result;

  // On retire la sous-chaîne du n° d'article de la description avant de découper par virgule, pour éviter que
  // ses fragments (ex: "6ES7" et "515-2FN03-0AB0" séparés par une virgule) ne pollue gamme/modèle ci-dessous.
  let cleaned = sysDescr;
  const prefixed = sysDescr.match(ARTICLE_PREFIXED_RE);
  if (prefixed) {
    result.articleNumber = `${prefixed[1]} ${prefixed[2]}`;
    cleaned = cleaned.replace(prefixed[0], '');
  } else {
    const generic = sysDescr.match(ARTICLE_GENERIC_RE);
    if (generic) {
      result.articleNumber = generic[0];
      cleaned = cleaned.replace(generic[0], '');
    }
  }

  const fwLabeled = sysDescr.match(FW_LABELED_RE);
  if (fwLabeled) {
    result.firmwareVersion = /^v/i.test(fwLabeled[1]) ? fwLabeled[1] : `V${fwLabeled[1]}`;
  } else {
    const versions = sysDescr.match(VERSION_RE);
    if (versions?.length) result.firmwareVersion = versions[versions.length - 1];
  }

  const textParts = cleaned
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !/^HW:?/i.test(p) && !/^FW:?/i.test(p));

  const startIdx = textParts.length && KNOWN_VENDORS.includes(textParts[0].toLowerCase()) ? 1 : 0;
  if (textParts.length > 1) {
    if (textParts[startIdx]) result.productFamily = textParts[startIdx];
    if (textParts[startIdx + 1]) result.model = textParts[startIdx + 1];
  }

  return result;
}
