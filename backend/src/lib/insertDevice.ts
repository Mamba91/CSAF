import { query } from '../db.js';
import { matchDevice } from './match.js';

export interface DeviceInput {
  name: string;
  vendor?: string;
  product_family?: string;
  firmware_version?: string;
  article_number?: string;
  cpe?: string;
  notes?: string;
}

/** Insère un device dans un projet puis recalcule son matching. Retourne la ligne insérée, ou null si nom vide. */
export async function insertDevice(projectId: number, raw: DeviceInput) {
  const name = (raw?.name || '').toString().trim();
  if (!name) return null;
  const [device] = await query<any>(
    `INSERT INTO devices (project_id, name, vendor, product_family, firmware_version, article_number, cpe, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [projectId, name, (raw.vendor || '').toString().trim(), (raw.product_family || '').toString().trim(),
     (raw.firmware_version || '').toString().trim(), (raw.article_number || '').toString().trim(),
     (raw.cpe || '').toString().trim(), (raw.notes || '').toString().trim()]
  );
  await matchDevice(device);
  return device;
}
