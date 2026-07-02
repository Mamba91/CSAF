import { runScan } from './scan.js';
import { login, uploadScan } from './upload.js';

interface Args {
  range: string;
  apiUrl: string;
  username: string;
  password: string;
  label: string;
  community: string;
  concurrency: number;
  timeout: number;
}

function parseArgs(argv: string[]): Args {
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      opts[key] = value;
    }
  }

  const required = ['range', 'api-url', 'username', 'password'];
  const missing = required.filter((k) => !opts[k]);
  if (missing.length) {
    console.error(`Arguments manquants: ${missing.map((m) => `--${m}`).join(', ')}\n`);
    console.error('Usage:');
    console.error('  npm run dev -- --range 192.168.1.0/24 --api-url http://localhost:4000/api --username admin --password *** [--label "Site A"] [--community public] [--concurrency 20] [--timeout 1500]');
    console.error('\nAstuce : lancez plutôt `npm run serve` pour piloter les scans depuis l\'onglet "Découverte réseau" de l\'application.');
    process.exit(1);
  }

  return {
    range: opts.range,
    apiUrl: opts['api-url'],
    username: opts.username,
    password: opts.password,
    label: opts.label || `Scan ${new Date().toISOString()}`,
    community: opts.community || 'public',
    concurrency: Number(opts.concurrency) || 20,
    timeout: Number(opts.timeout) || 1500,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`[agent] scan de ${args.range} (communauté SNMP: ${args.community})...`);
  const found = await runScan(args, ({ scanned, total }) => {
    if (scanned % 50 === 0) console.log(`[agent] ${scanned}/${total} hôtes testés...`);
  });

  console.log(`[agent] scan terminé: ${found.length} hôte(s) ont répondu au SNMP`);
  if (!found.length) {
    console.log('[agent] aucun équipement détecté, rien à envoyer.');
    return;
  }

  console.log('[agent] connexion au serveur...');
  const token = await login(args.apiUrl, args.username, args.password);

  console.log('[agent] envoi des résultats...');
  const scan = await uploadScan(args.apiUrl, token, args.range, args.label, found);
  console.log(`[agent] scan #${scan.id} envoyé avec succès (${found.length} équipement(s)). Consultez l'onglet "Découverte réseau" dans l'application.`);
}

main().catch((err) => {
  console.error('[agent] erreur:', err?.message || err);
  process.exit(1);
});
