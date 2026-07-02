import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://csaf:csaf@localhost:5432/csaf',
  max: 10,
});

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function bootstrap(): Promise<void> {
  const schemaPath = resolve(__dirname, '../../db/init.sql');
  let sql: string;
  try {
    sql = await readFile(schemaPath, 'utf8');
  } catch {
    sql = await readFile(resolve(process.cwd(), 'db/init.sql'), 'utf8');
  }
  await pool.query(sql);
  console.log('[db] schema appliqué');

  // Créer le compte admin par défaut si aucun utilisateur n'existe
  const [{ count }] = await query<any>('SELECT COUNT(*) AS count FROM users');
  if (Number(count) === 0) {
    const { hashPassword } = await import('./lib/auth.js');
    const hash = await hashPassword(process.env.ADMIN_PASSWORD || 'admin123');
    await query(
      `INSERT INTO users(username, email, password_hash, is_admin)
       VALUES('admin', 'admin@local', $1, true)`,
      [hash]
    );
    console.log('[db] Compte admin créé — login: admin / mdp: admin123 (à changer immédiatement)');
  }
}
