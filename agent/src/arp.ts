import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const IP_RE = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/;
const MAC_RE = /([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i;

/** Lit la table ARP locale (arp -a sous Windows, ip neigh sous Linux/macOS) et retourne une map IP -> MAC. */
export async function readArpTable(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const isWindows = process.platform === 'win32';
    const { stdout } = isWindows
      ? await execFileAsync('arp', ['-a'])
      : await execFileAsync('ip', ['neigh']);

    for (const line of stdout.split(/\r?\n/)) {
      const ipMatch = line.match(IP_RE);
      const macMatch = line.match(MAC_RE);
      if (ipMatch && macMatch) {
        const mac = macMatch[0].replace(/-/g, ':').toLowerCase();
        if (mac !== 'ff:ff:ff:ff:ff:ff' && mac !== '00:00:00:00:00:00') {
          map.set(ipMatch[1], mac);
        }
      }
    }
  } catch {
    // table ARP indisponible (droits, commande absente...) — on continue sans enrichissement MAC
  }
  return map;
}
