import { query } from '../db.js';

/* ------------------------------------------------------------------ *
 *  Normalisation + comparaison de versions firmware
 * ------------------------------------------------------------------ */

function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalise un n° d'article / MLFB : majuscules, sans espaces ni séparateurs. */
function normMlfb(s: string): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function tokens(s: string): string[] {
  return norm(s).split(' ').filter((t) => t.length > 1);
}

/** Score de similarité de noms (Jaccard sur tokens). */
function nameSimilarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / new Set([...ta, ...tb]).size;
}

function vendorMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/** Extrait un tuple numérique d'une chaîne de version, ex "V4.2.1" -> [4,2,1]. */
function versionTuple(s: string): number[] | null {
  const m = (s || '').match(/(\d+)(?:[._](\d+))?(?:[._](\d+))?/);
  if (!m) return null;
  return [Number(m[1]) || 0, Number(m[2]) || 0, Number(m[3]) || 0];
}

function cmpTuple(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  }
  return 0;
}

/**
 * Le firmware du device est-il compatible avec la plage affectée ?
 * Renvoie true (affecté), false (non affecté) ou null (indéterminé).
 */
function versionAffected(
  fw: string,
  range: string
): boolean | null {
  const dv = versionTuple(fw);
  if (!dv) return null;
  const r = norm(range);
  const rv = versionTuple(range);
  if (!rv) return null;

  if (r.includes('<=')) return cmpTuple(dv, rv) <= 0;
  if (r.includes('<')) return cmpTuple(dv, rv) < 0;
  if (r.includes('>=')) return cmpTuple(dv, rv) >= 0;
  if (r.includes('>')) return cmpTuple(dv, rv) > 0;
  // égalité stricte si la plage est une version unique
  return cmpTuple(dv, rv) === 0;
}

/* ------------------------------------------------------------------ *
 *  Recalcul des correspondances pour un device.
 *  On compare aux produits affectés candidats (même fabricant approx.).
 * ------------------------------------------------------------------ */

export interface DeviceRow {
  id: number;
  name: string;
  vendor: string;
  product_family: string;
  firmware_version: string;
  article_number: string;
}

export async function matchDevice(device: DeviceRow): Promise<number> {
  const candidates = await query<{
    id: number;
    vulnerability_id: number;
    product_name: string;
    vendor: string;
    version_range: string;
    cpe: string;
    article_numbers: string;
  }>(
    `SELECT id, vulnerability_id, product_name, vendor, version_range,
            cpe, article_numbers
       FROM affected_products`
  );

  await query(`DELETE FROM matches WHERE device_id=$1`, [device.id]);

  const deviceLabel = `${device.name} ${device.product_family}`.trim();
  const devMlfb = normMlfb(device.article_number);
  // si le device a un MLFB exploitable, on n'accepte le rapprochement flou
  // que s'il est solide (le MLFB reste le signal de référence)
  const fuzzyThreshold = devMlfb.length >= 6 ? 0.7 : 0.45;
  let inserted = 0;

  for (const c of candidates) {
    const vaff = versionAffected(device.firmware_version, c.version_range);

    // 1) Correspondance par n° d'article (MLFB) — signal le plus fort.
    //    On cherche le MLFB du device dans les n° d'article, le CPE et le nom
    //    du produit affecté (tout normalisé sans séparateurs).
    let mlfbHit = false;
    if (devMlfb.length >= 6) {
      const haystack = normMlfb(
        `${c.article_numbers} ${c.cpe} ${c.product_name}`
      );
      mlfbHit = haystack.includes(devMlfb);
    }

    if (mlfbHit) {
      // produit identifié de façon certaine ; on respecte une exclusion
      // ferme uniquement si le firmware est clairement hors plage.
      if (vaff === false) continue;
      let confidence = 0.95;
      let reason = `MLFB ${device.article_number} ✓`;
      if (vaff === true) {
        confidence = 1;
        reason += `, firmware ${device.firmware_version} ∈ ${c.version_range}`;
      } else if (device.firmware_version) {
        reason += ', version à vérifier';
      }
      await query(
        `INSERT INTO matches
           (device_id, affected_product_id, vulnerability_id, confidence, reason)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (device_id, affected_product_id, vulnerability_id)
         DO UPDATE SET confidence=EXCLUDED.confidence, reason=EXCLUDED.reason`,
        [device.id, c.id, c.vulnerability_id, confidence.toFixed(2), reason]
      );
      inserted++;
      continue;
    }

    // 2) Sinon : rapprochement fabricant + nom + plage de firmware.
    const vScore = vendorMatch(device.vendor, c.vendor) ? 1 : 0;
    const nScore = nameSimilarity(deviceLabel, c.product_name);
    const baseScore = c.vendor ? 0.4 * vScore + 0.6 * nScore : nScore;
    if (vaff === false) continue; // firmware hors plage -> on ignore

    let confidence = baseScore;
    let reason = `nom ${(nScore * 100) | 0}%`;
    if (vScore) reason += ', fabricant ✓';
    if (vaff === true) {
      confidence = Math.min(1, confidence + 0.2);
      reason += `, firmware ${device.firmware_version} ∈ ${c.version_range}`;
    } else if (vaff === null && device.firmware_version) {
      reason += ', version indéterminée';
    }

    // Seuil appliqué après bonus firmware : on écarte les rapprochements
    // « même fabricant » trop faibles (nom non concluant, firmware inconnu).
    if (confidence < fuzzyThreshold) continue;

    await query(
      `INSERT INTO matches
         (device_id, affected_product_id, vulnerability_id, confidence, reason)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (device_id, affected_product_id, vulnerability_id)
       DO UPDATE SET confidence=EXCLUDED.confidence, reason=EXCLUDED.reason`,
      [device.id, c.id, c.vulnerability_id, confidence.toFixed(2), reason]
    );
    inserted++;
  }
  return inserted;
}

/** Recalcule le matching pour tous les devices (après un import). */
export async function rematchAll(): Promise<number> {
  const devices = await query<DeviceRow>(
    `SELECT id, name, vendor, product_family, firmware_version, article_number FROM devices`
  );
  let total = 0;
  for (const d of devices) total += await matchDevice(d);
  return total;
}
