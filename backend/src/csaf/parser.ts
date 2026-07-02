import type { ParsedAdvisory, ParsedProduct, ParsedVuln } from '../types.js';

/* ------------------------------------------------------------------ *
 *  Résolution du product_tree
 *  On construit un index product_id -> { name, vendor, version, cpe }
 *  en parcourant récursivement les branches et les full_product_names.
 * ------------------------------------------------------------------ */

type ProductIndex = Record<string, ParsedProduct>;

/** Récupère les numéros d'article (MLFB) depuis un product_identification_helper. */
function extractArticles(helper: any): string[] {
  if (!helper) return [];
  const out: string[] = [];
  for (const v of helper.model_numbers || []) if (v) out.push(String(v));
  for (const v of helper.skus || []) if (v) out.push(String(v));
  for (const g of helper.x_generic_uris || []) {
    const val = g?.uri || g?.namespace || '';
    if (val) out.push(String(val));
  }
  return out;
}

const VENDOR_CATEGORIES = new Set(['vendor']);
const VERSION_CATEGORIES = new Set([
  'product_version',
  'product_version_range',
]);

function walkBranches(
  branches: any[],
  ctx: { vendor: string; version: string },
  index: ProductIndex
): void {
  for (const branch of branches || []) {
    const next = { ...ctx };
    const category: string = branch.category || '';
    if (VENDOR_CATEGORIES.has(category)) next.vendor = branch.name || ctx.vendor;
    if (VERSION_CATEGORIES.has(category)) next.version = branch.name || ctx.version;

    if (branch.product && branch.product.product_id) {
      const helper = branch.product.product_identification_helper;
      const cpe = helper?.cpe || '';
      index[branch.product.product_id] = {
        product_id: branch.product.product_id,
        name: branch.product.name || '',
        vendor: next.vendor,
        version_range: next.version,
        cpe,
        articles: extractArticles(helper),
      };
    }
    if (Array.isArray(branch.branches)) {
      walkBranches(branch.branches, next, index);
    }
  }
}

function buildProductIndex(productTree: any): ProductIndex {
  const index: ProductIndex = {};
  if (!productTree) return index;

  if (Array.isArray(productTree.branches)) {
    walkBranches(productTree.branches, { vendor: '', version: '' }, index);
  }

  // full_product_names à plat
  for (const fp of productTree.full_product_names || []) {
    if (!fp.product_id) continue;
    const existing = index[fp.product_id];
    const helper = fp.product_identification_helper;
    index[fp.product_id] = {
      product_id: fp.product_id,
      name: fp.name || existing?.name || '',
      vendor: existing?.vendor || '',
      version_range: existing?.version_range || '',
      cpe: helper?.cpe || existing?.cpe || '',
      articles: [...(existing?.articles || []), ...extractArticles(helper)],
    };
  }

  // relationships : produits combinés (ex: composant dans un firmware)
  for (const rel of productTree.relationships || []) {
    const fp = rel.full_product_name;
    if (fp?.product_id) {
      const base = index[rel.product_reference] || {};
      index[fp.product_id] = {
        product_id: fp.product_id,
        name: fp.name || base.name || '',
        vendor: base.vendor || '',
        version_range: base.version_range || '',
        cpe: fp.product_identification_helper?.cpe || '',
        articles: [
          ...(base.articles || []),
          ...extractArticles(fp.product_identification_helper),
        ],
      };
    }
  }
  return index;
}

/* ------------------------------------------------------------------ *
 *  Helpers document
 * ------------------------------------------------------------------ */

function pickNote(notes: any[], categories: string[]): string {
  for (const cat of categories) {
    const n = (notes || []).find((x) => x.category === cat);
    if (n?.text) return n.text;
  }
  return '';
}

function extractTlp(doc: any): string {
  return (
    doc?.distribution?.tlp?.label ||
    doc?.distribution?.text ||
    ''
  );
}

/* ------------------------------------------------------------------ *
 *  Parse d'un document CSAF v2.0 unique
 * ------------------------------------------------------------------ */

export function parseCsafAdvisory(raw: any): ParsedAdvisory | null {
  const doc = raw?.document;
  if (!doc || !doc.tracking?.id) return null;

  const index = buildProductIndex(raw.product_tree);

  const vulns: ParsedVuln[] = [];
  for (const v of raw.vulnerabilities || []) {
    // score CVSS : on prend le v3.x le plus élevé
    let score: number | null = null;
    let severity = '';
    let vector = '';
    for (const s of v.scores || []) {
      const c = s.cvss_v3 || s.cvss_v4 || s.cvss_v2;
      if (!c) continue;
      const bs =
        typeof c.baseScore === 'number' ? c.baseScore : null;
      if (bs !== null && (score === null || bs > score)) {
        score = bs;
        severity = (c.baseSeverity || '').toUpperCase();
        vector = c.vectorString || '';
      }
    }
    if (!severity && score !== null) severity = severityFromScore(score);

    const affectedIds: string[] = [
      ...(v.product_status?.known_affected || []),
      ...(v.product_status?.first_affected || []),
      ...(v.product_status?.last_affected || []),
    ];
    const affected: ParsedProduct[] = affectedIds
      .map((id) => index[id])
      .filter((p): p is ParsedProduct => Boolean(p));

    const remediation = (v.remediations || [])
      .map((r: any) => r.details)
      .filter(Boolean)
      .join(' | ');

    vulns.push({
      cve: v.cve || '',
      title: v.title || v.cve || '',
      cwe: v.cwe ? `${v.cwe.id || ''} ${v.cwe.name || ''}`.trim() : '',
      cvss_score: score,
      cvss_severity: severity,
      cvss_vector: vector,
      description: pickNote(v.notes, ['description', 'summary', 'general']),
      remediation,
      affected,
    });
  }

  const rev =
    doc.tracking?.version ||
    doc.tracking?.revision_history?.slice(-1)?.[0]?.number ||
    '';

  return {
    tracking_id: doc.tracking.id,
    title: doc.title || doc.tracking.id,
    publisher: doc.publisher?.name || '',
    tlp: extractTlp(doc),
    category: doc.category || '',
    csaf_version: doc.csaf_version || '',
    released: doc.tracking?.current_release_date || null,
    revision: String(rev),
    vulnerabilities: vulns,
    raw,
  };
}

export function severityFromScore(score: number): string {
  if (score >= 9.0) return 'CRITICAL';
  if (score >= 7.0) return 'HIGH';
  if (score >= 4.0) return 'MEDIUM';
  if (score > 0) return 'LOW';
  return 'NONE';
}

/* ------------------------------------------------------------------ *
 *  Détection : est-ce un advisory unique ou un index/feed ?
 * ------------------------------------------------------------------ */

export function isSingleAdvisory(raw: any): boolean {
  return Boolean(raw?.document?.tracking?.id);
}
