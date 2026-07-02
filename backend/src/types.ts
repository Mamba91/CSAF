// Types partagés backend

export interface ParsedProduct {
  product_id: string;
  name: string;
  vendor: string;
  version_range: string;
  cpe: string;
  articles: string[];
}

export interface ParsedVuln {
  cve: string;
  title: string;
  cwe: string;
  cvss_score: number | null;
  cvss_severity: string;
  cvss_vector: string;
  description: string;
  remediation: string;
  affected: ParsedProduct[]; // produits known_affected
}

export interface ParsedAdvisory {
  tracking_id: string;
  title: string;
  publisher: string;
  tlp: string;
  category: string;
  csaf_version: string;
  released: string | null;
  revision: string;
  vulnerabilities: ParsedVuln[];
  raw: unknown;
}

export interface FeedEntry {
  title: string;
  url: string;
}
