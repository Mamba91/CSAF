const KEYWORDS = [
  'Siemens', 'Schneider Electric', 'Schneider', 'Rockwell', 'Allen-Bradley',
  'ABB', 'Phoenix Contact', 'WAGO', 'Moxa', 'Beckhoff', 'Mitsubishi Electric',
  'Omron', 'Honeywell', 'Cisco', 'Hirschmann', 'Belden', 'Weidmuller',
];

// Quelques préfixes OUI (3 premiers octets de la MAC) connus dans le monde OT/industriel.
const OUI_VENDORS: Record<string, string> = {
  '00:0e:8c': 'Siemens',
  '00:1b:1b': 'Siemens',
  '28:63:36': 'Siemens',
  '00:80:f4': 'Schneider Electric',
  '00:0c:29': 'VMware',
  '00:1d:9c': 'Rockwell Automation',
  '00:00:bc': 'Rockwell Automation',
  '00:0f:d1': 'Beckhoff',
  '00:50:c2': 'IEEE Registration',
  '00:1e:c9': 'ABB',
  '00:a0:45': 'Phoenix Contact',
  '00:60:e0': 'WAGO',
  '00:90:e8': 'Moxa',
};

/** Devine le fabricant à partir du sysDescr SNMP (mots-clés connus) puis, à défaut, du préfixe OUI de la MAC. */
export function guessVendor(sysDescr: string, macAddress: string): string {
  const descr = sysDescr || '';
  for (const kw of KEYWORDS) {
    if (descr.toLowerCase().includes(kw.toLowerCase())) return kw;
  }
  if (macAddress) {
    const oui = macAddress.toLowerCase().slice(0, 8);
    if (OUI_VENDORS[oui]) return OUI_VENDORS[oui];
  }
  return '';
}
