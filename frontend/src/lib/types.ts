export interface Project {
  id: number;
  name: string;
  description: string;
  owner: string;
  created_at: string;
  device_count: number;
  vuln_count: number;
  critical_count: number;
  high_count: number;
  treated_count: number;
  project_status: string; // sain | a_traiter | en_cours | traite
}

export interface Device {
  id: number;
  project_id: number;
  name: string;
  vendor: string;
  product_family: string;
  firmware_version: string;
  article_number: string;
  cpe: string;
  notes: string;
}

export interface ProjectDetail extends Project {
  devices: Device[];
}

export interface ProjectMember {
  userId: number;
  username: string;
  email: string;
  isAdmin: boolean;
  addedAt: string;
}

export interface NetworkScan {
  id: number;
  label: string;
  ip_range: string;
  created_by: number | null;
  created_by_username: string | null;
  device_count: number;
  created_at: string;
}

export interface DiscoveredDevice {
  id: number;
  scan_id: number;
  ip_address: string;
  mac_address: string;
  hostname: string;
  sys_descr: string;
  sys_object_id: string;
  vendor_guess: string;
  status: 'new' | 'imported' | 'ignored';
  imported_device_id: number | null;
  discovered_at: string;
  scan_label: string;
  scan_ip_range: string;
  scan_created_at: string;
}

export interface Source {
  id: number;
  name: string;
  url: string;
  source_type: 'file' | 'feed' | 'vendor';
  vendor: string;
  last_synced: string | null;
  last_status: string;
  advisory_count: number;
  created_at: string;
}

export interface Advisory {
  id: number;
  tracking_id: string;
  title: string;
  publisher: string;
  released: string | null;
  vuln_count?: number;
}

export interface Vulnerability {
  id: number;
  cve: string;
  title: string;
  cvss_score: number | null;
  cvss_severity: string;
  cwe: string;
  description: string;
  remediation: string;
  tracking_id: string;
  advisory_title: string;
  publisher: string;
  released: string | null;
  affected_count: number;
  match_count: number;
  article_numbers: string | null;
}

export interface Match {
  match_id: number;
  confidence: number;
  reason: string;
  device_id: number;
  device_name: string;
  firmware_version: string;
  article_number: string;
  vuln_id: number;
  cve: string;
  title: string;
  cwe: string;
  cvss_score: number | null;
  cvss_severity: string;
  cvss_vector: string;
  description: string;
  remediation: string;
  product_name: string;
  version_range: string;
  tracking_id: string;
  advisory_title: string;
  publisher: string;
  released: string | null;
  vuln_key: string;
  status: string;
  status_note: string;
  resolved_by: string | null;
  resolved_at: string | null;
}

export interface Vendor {
  key: string;
  name: string;
  kind: string;
  url: string;
  note?: string;
}

export interface FeedEntry {
  title: string;
  url: string;
}

export interface DashboardData {
  counts: Record<string, string>;
  bySeverity: { severity: string; count: string }[];
  topProjects: {
    project_id: number;
    project_name: string;
    device_count: string;
    vuln_count: string;
    critical_count: string;
    high_count: string;
  }[];
  recentAdvisories: Advisory[];
}
