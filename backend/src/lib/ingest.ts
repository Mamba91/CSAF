import { query } from '../db.js';
import type { ParsedAdvisory } from '../types.js';

/** Insère/มet à jour un advisory et ses vulnérabilités. Renvoie l'id. */
export async function ingestAdvisory(
  adv: ParsedAdvisory,
  sourceId: number | null
): Promise<number> {
  const rows = await query<{ id: number }>(
    `INSERT INTO advisories
        (source_id, tracking_id, title, publisher, tlp, category,
         csaf_version, released, revision, raw)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (tracking_id) DO UPDATE SET
        title=EXCLUDED.title, publisher=EXCLUDED.publisher,
        tlp=EXCLUDED.tlp, category=EXCLUDED.category,
        csaf_version=EXCLUDED.csaf_version, released=EXCLUDED.released,
        revision=EXCLUDED.revision, raw=EXCLUDED.raw,
        source_id=COALESCE(EXCLUDED.source_id, advisories.source_id)
     RETURNING id`,
    [
      sourceId,
      adv.tracking_id,
      adv.title,
      adv.publisher,
      adv.tlp,
      adv.category,
      adv.csaf_version,
      adv.released,
      adv.revision,
      adv.raw,
    ]
  );
  const advisoryId = rows[0].id;

  // On régénère les vulns/produits pour cet advisory (idempotence)
  await query(`DELETE FROM vulnerabilities WHERE advisory_id=$1`, [advisoryId]);

  for (const v of adv.vulnerabilities) {
    const vr = await query<{ id: number }>(
      `INSERT INTO vulnerabilities
         (advisory_id, cve, title, cwe, cvss_score, cvss_severity,
          cvss_vector, description, remediation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        advisoryId,
        v.cve,
        v.title,
        v.cwe,
        v.cvss_score,
        v.cvss_severity,
        v.cvss_vector,
        v.description,
        v.remediation,
      ]
    );
    const vulnId = vr[0].id;

    for (const p of v.affected) {
      await query(
        `INSERT INTO affected_products
           (vulnerability_id, advisory_id, product_id, product_name,
            vendor, version_range, cpe, article_numbers, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'known_affected')`,
        [
          vulnId,
          advisoryId,
          p.product_id,
          p.name,
          p.vendor,
          p.version_range,
          p.cpe,
          (p.articles || []).join(' '),
        ]
      );
    }
  }

  return advisoryId;
}
