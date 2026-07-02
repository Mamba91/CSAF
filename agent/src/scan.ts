import { expandCidr } from './cidr.js';
import { runPool } from './pool.js';
import { readArpTable } from './arp.js';
import { snmpProbe } from './snmp.js';
import { guessVendor } from './vendors.js';
import type { DiscoveredDeviceUpload } from './upload.js';

export interface ScanOptions {
  range: string;
  community: string;
  concurrency: number;
  timeout: number;
}

export interface ScanProgress {
  total: number;
  scanned: number;
  found: number;
}

/** Lance un scan SNMP sur la plage donnée. Appelle `onProgress` à chaque hôte testé. Si `shouldCancel` devient
 *  vrai, arrête de lancer de nouvelles requêtes et retourne les résultats déjà obtenus. Réutilisé par le CLI
 *  et le serveur HTTP local. */
export async function runScan(
  opts: ScanOptions,
  onProgress?: (p: ScanProgress) => void,
  shouldCancel?: () => boolean
): Promise<DiscoveredDeviceUpload[]> {
  const hosts = expandCidr(opts.range);
  const arpTable = await readArpTable();

  let scanned = 0;
  const found: DiscoveredDeviceUpload[] = [];

  await runPool(hosts, opts.concurrency, async (ip) => {
    const result = await snmpProbe(ip, opts.community, opts.timeout);
    scanned++;
    if (result) {
      const mac = arpTable.get(ip) || '';
      found.push({
        ip_address: result.ip_address,
        mac_address: mac,
        hostname: result.hostname,
        sys_descr: result.sys_descr,
        sys_object_id: result.sys_object_id,
        vendor_guess: guessVendor(result.sys_descr, mac),
      });
    }
    onProgress?.({ total: hosts.length, scanned, found: found.length });
  }, shouldCancel);

  return found;
}
