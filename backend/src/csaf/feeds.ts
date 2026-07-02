import type { FeedEntry } from '../types.js';

/* ------------------------------------------------------------------ *
 *  Registre des constructeurs exposant des feeds CSAF publics.
 *  L'onglet "Recherche" interroge ces sources côté serveur (pas de CORS).
 *  Beaucoup de vendeurs publient un provider-metadata.json (norme CSAF)
 *  pointant vers des feeds ROLIE.
 * ------------------------------------------------------------------ */

export interface VendorEntry {
  key: string;
  name: string;
  kind: 'rolie' | 'provider' | 'aggregator';
  url: string;
  note?: string;
}

export const VENDOR_REGISTRY: VendorEntry[] = [
  {
    key: 'cisa-ot',
    name: 'CISA — ICS/OT (TLP:WHITE)',
    kind: 'rolie',
    url: 'https://raw.githubusercontent.com/cisagov/CSAF/develop/csaf_files/OT/white/cisa-csaf-ot-feed-tlp-white.json',
    note: 'Feed ROLIE des advisories ICS/OT republiés par CISA',
  },
  {
    key: 'siemens',
    name: 'Siemens ProductCERT',
    kind: 'provider',
    url: 'https://cert-portal.siemens.com/productcert/csaf/provider-metadata.json',
    note: 'Provider metadata officiel Siemens',
  },
  {
    key: 'redhat',
    name: 'Red Hat',
    kind: 'provider',
    url: 'https://access.redhat.com/security/data/csaf/v2/provider-metadata.json',
  },
  {
    key: 'cisco',
    name: 'Cisco',
    kind: 'provider',
    url: 'https://sec.cloudapps.cisco.com/security/center/csaf/provider-metadata.json',
  },
  {
    key: 'nozomi',
    name: 'Nozomi Networks',
    kind: 'provider',
    url: 'https://security.nozominetworks.com/.well-known/csaf/provider-metadata.json',
  },
  {
    key: 'sick',
    name: 'SICK AG',
    kind: 'provider',
    url: 'https://sick.com/.well-known/csaf/provider-metadata.json',
  },
];

/* ------------------------------------------------------------------ *
 *  Résolution d'un JSON en liste d'URL d'advisories.
 *  Gère : ROLIE feed, agrégateur CSAF, provider-metadata, tableau brut.
 * ------------------------------------------------------------------ */

export function resolveFeedEntries(json: any): FeedEntry[] {
  const out: FeedEntry[] = [];

  // 1) ROLIE feed : { feed: { entry: [ { link:[{rel,href}], title } ] } }
  const entries = json?.feed?.entry || json?.entry;
  if (Array.isArray(entries)) {
    for (const e of entries) {
      const links = Array.isArray(e.link) ? e.link : [];
      const self =
        links.find((l: any) => l.rel === 'self') || links[0] || {};
      const href =
        self.href || (typeof e.link === 'string' ? e.link : '');
      if (href) {
        out.push({
          title: typeof e.title === 'string' ? e.title : e.title?.['#text'] || href,
          url: href,
        });
      }
    }
    if (out.length) return out;
  }

  // 2) provider-metadata.json -> distributions[].rolie.feeds[].url
  const dists = json?.distributions;
  if (Array.isArray(dists)) {
    for (const d of dists) {
      for (const f of d?.rolie?.feeds || []) {
        if (f.url) out.push({ title: `Feed ${f.tlp_label || ''}`.trim(), url: f.url });
      }
      if (d?.directory_url) {
        out.push({ title: 'Directory', url: d.directory_url });
      }
    }
    if (out.length) return out;
  }

  // 3) agrégateur CSAF -> csaf_publishers/providers[].metadata.url
  const pubs = [
    ...(json?.csaf_publishers || []),
    ...(json?.csaf_trusted_providers || []),
  ];
  for (const p of pubs) {
    const url = p?.metadata?.url;
    if (url) out.push({ title: p?.metadata?.publisher?.name || url, url });
  }

  return out;
}
