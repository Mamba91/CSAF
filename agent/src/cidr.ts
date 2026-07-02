const MAX_HOSTS = 65536;

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`adresse IP invalide: ${ip}`);
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function intToIp(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/** Expanse une plage CIDR (ex: "192.168.1.0/24") en liste d'IP hôtes (exclut réseau/broadcast pour les masques < /31). */
export function expandCidr(range: string): string[] {
  const trimmed = range.trim();
  if (!trimmed.includes('/')) {
    // IP unique
    ipToInt(trimmed);
    return [trimmed];
  }
  const [base, prefixStr] = trimmed.split('/');
  const prefix = Number(prefixStr);
  if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`préfixe CIDR invalide: ${prefixStr}`);
  }
  const baseInt = ipToInt(base);
  const hostBits = 32 - prefix;
  const size = hostBits >= 32 ? 0xFFFFFFFF : (1 << hostBits) >>> 0;
  if (size > MAX_HOSTS) {
    throw new Error(`plage trop large (${size} adresses) — limite ${MAX_HOSTS}, utilisez un masque plus précis`);
  }
  const network = (baseInt & (~0 << hostBits)) >>> 0;

  if (prefix >= 31) {
    // /31 et /32 : pas de réseau/broadcast à exclure
    const ips: string[] = [];
    for (let i = 0; i < Math.max(1, size); i++) ips.push(intToIp((network + i) >>> 0));
    return ips;
  }

  const ips: string[] = [];
  for (let i = 1; i < size - 1; i++) ips.push(intToIp((network + i) >>> 0));
  return ips;
}
