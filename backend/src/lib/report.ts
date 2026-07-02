import { query } from '../db.js';
import { deriveProjectStatus } from './projectStatus.js';

export interface Finding {
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
  tlp: string;
  released: string | null;
  device_id: number;
  device_name: string;
  device_vendor: string;
  device_article: string;
  firmware_version: string;
  confidence: number;
  reason: string;
}

export interface TreatedVuln {
  vuln_key: string;
  cve: string;
  title: string;
  cvss_severity: string;
  cvss_score: number | null;
  status: string;
  note: string;
  resolved_by: string | null;
  resolved_at: string | null;
  updated_at: string;
}

export interface ReportData {
  project: { id: number; name: string; description: string; owner: string; created_at: string };
  project_status: string;
  devices: { id: number; name: string; vendor: string; product_family: string; firmware_version: string; article_number: string }[];
  findings: Finding[];
  treated_vulns: TreatedVuln[];
  generated_at: string;
}

const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

const VULN_KEY = `COALESCE(NULLIF(v.cve,''), a.tracking_id || '::' || v.title)`;

export async function buildReport(projectId: number): Promise<ReportData | null> {
  const [project] = await query<any>(`SELECT * FROM projects WHERE id=$1`, [projectId]);
  if (!project) return null;

  const devices = await query<any>(
    `SELECT id, name, vendor, product_family, firmware_version, article_number
       FROM devices WHERE project_id=$1 ORDER BY name`,
    [projectId]
  );

  const findings = await query<Finding>(
    `SELECT v.id AS vuln_id, v.cve, v.title, v.cwe, v.cvss_score, v.cvss_severity,
            v.cvss_vector, v.description, v.remediation,
            ap.product_name, ap.version_range,
            a.tracking_id, a.title AS advisory_title, a.publisher, a.tlp, a.released,
            d.id AS device_id, d.name AS device_name, d.vendor AS device_vendor,
            d.article_number AS device_article, d.firmware_version, m.confidence, m.reason
       FROM matches m
       JOIN devices d ON d.id = m.device_id
       JOIN vulnerabilities v ON v.id = m.vulnerability_id
       JOIN affected_products ap ON ap.id = m.affected_product_id
       JOIN advisories a ON a.id = v.advisory_id
      WHERE d.project_id = $1
      ORDER BY (CASE v.cvss_severity
                  WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1
                  WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END),
               v.cvss_score DESC NULLS LAST, v.cve`,
    [projectId]
  );

  // Statut du projet + liste des vulnérabilités déjà traitées (résolues, acceptées ou faux positifs)
  const statusRows = await query<any>(
    `SELECT DISTINCT ON (${VULN_KEY})
            ${VULN_KEY} AS vuln_key, v.cve, v.title, v.cvss_severity, v.cvss_score,
            COALESCE(vs.status,'open') AS status, vs.note, vs.resolved_by, vs.resolved_at, vs.updated_at
       FROM matches m
       JOIN devices d ON d.id = m.device_id
       JOIN vulnerabilities v ON v.id = m.vulnerability_id
       JOIN advisories a ON a.id = v.advisory_id
       LEFT JOIN vuln_status vs ON vs.project_id = d.project_id AND vs.vuln_key = ${VULN_KEY}
      WHERE d.project_id = $1
      ORDER BY ${VULN_KEY}`,
    [projectId]
  );

  const total = statusRows.length;
  const treated = statusRows.filter((r) => ['resolved', 'accepted', 'false_positive'].includes(r.status)).length;
  const inProgress = statusRows.filter((r) => r.status === 'in_progress').length;
  const project_status = deriveProjectStatus(total, treated, inProgress);
  const treated_vulns = statusRows
    .filter((r) => ['resolved', 'accepted', 'false_positive'].includes(r.status))
    .map((r) => ({
      vuln_key: r.vuln_key, cve: r.cve, title: r.title, cvss_severity: r.cvss_severity, cvss_score: r.cvss_score,
      status: r.status, note: r.note || '', resolved_by: r.resolved_by || null, resolved_at: r.resolved_at || null,
      updated_at: r.updated_at,
    }));

  return { project, project_status, devices, findings, treated_vulns, generated_at: new Date().toISOString() };
}

export function summarize(data: ReportData) {
  const byVuln = new Map<number, Finding>();
  const sevCount: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 };
  const affectedDevices = new Set<number>();
  let maxScore = 0;

  for (const f of data.findings) {
    if (!byVuln.has(f.vuln_id)) {
      byVuln.set(f.vuln_id, f);
      const sev = SEV_ORDER.includes(f.cvss_severity) ? f.cvss_severity : 'NONE';
      sevCount[sev]++;
    }
    affectedDevices.add(f.device_id);
    if (f.cvss_score && Number(f.cvss_score) > maxScore) maxScore = Number(f.cvss_score);
  }

  return {
    distinctVulns: byVuln.size,
    totalFindings: data.findings.length,
    sevCount,
    affectedDeviceCount: affectedDevices.size,
    deviceCount: data.devices.length,
    maxScore,
  };
}

/* ------------------------------------------------------------------ *
 *  Dictionnaires i18n pour le rapport
 * ------------------------------------------------------------------ */

const REPORT_I18N = {
  fr: {
    title: 'Rapport de vulnérabilités',
    print_btn: 'Imprimer / Enregistrer en PDF',
    project_label: 'Projet #',
    owner_label: 'Responsable :',
    generated_label: 'Généré le',
    project_status_label: 'Statut du projet :',
    pstatus_sain: 'Sain',
    pstatus_a_traiter: 'À traiter',
    pstatus_en_cours: 'En cours',
    pstatus_traite: 'Traité',
    status_open: 'À traiter',
    status_in_progress: 'En cours',
    status_resolved: 'Traité',
    status_accepted: 'Risque accepté',
    status_false_positive: 'Faux positif',
    section_summary: 'Synthèse',
    section_coverage: 'Couverture du parc',
    section_vulns: 'Détail des vulnérabilités',
    section_treated: 'Vulnérabilités traitées',
    col_title: 'Titre',
    col_status: 'Statut',
    col_resolved_by: 'Traité par',
    col_resolved_at: 'Traité le',
    no_treated: 'Aucune vulnérabilité traitée pour ce projet.',
    card_vulns: 'Vulnérabilités',
    card_critical: 'Critiques',
    card_high: 'Élevées',
    card_devices: 'Devices touchés',
    col_device: 'Device',
    col_vendor: 'Fabricant',
    col_family: 'Gamme / type',
    col_article: 'N° article',
    col_firmware: 'Firmware',
    col_findings: 'Constats',
    no_device: 'Aucun device.',
    no_vuln: 'Aucun constat à détailler.',
    no_correl: 'Aucune vulnérabilité corrélée sur ce projet.',
    field_cwe: 'CWE',
    field_vector: 'Vecteur',
    field_advisory: 'Advisory',
    field_desc: 'Description',
    field_remediation: 'Remédiation',
    no_cve: 'Sans CVE',
    affected_label: (n: number) => `Équipements concernés (${n})`,
    col_fw: 'Firmware',
    col_product: 'Produit affecté',
    col_conf: 'Conf.',
    footer: `Rapport généré automatiquement par CSAF Vulnerability Manager à partir d'advisories CSAF.
    Les corrélations device ↔ produit affecté sont établies par rapprochement (fabricant, nom de produit,
    plage de firmware) et assorties d'un indice de confiance ; elles doivent être validées par un analyste
    avant toute décision. Sources : advisories référencés ci-dessus.`,
  },
  en: {
    title: 'Vulnerability Report',
    print_btn: 'Print / Save as PDF',
    project_label: 'Project #',
    owner_label: 'Owner:',
    generated_label: 'Generated on',
    project_status_label: 'Project status:',
    pstatus_sain: 'Healthy',
    pstatus_a_traiter: 'To treat',
    pstatus_en_cours: 'In progress',
    pstatus_traite: 'Resolved',
    status_open: 'To treat',
    status_in_progress: 'In progress',
    status_resolved: 'Resolved',
    status_accepted: 'Risk accepted',
    status_false_positive: 'False positive',
    section_summary: 'Summary',
    section_coverage: 'Asset coverage',
    section_vulns: 'Vulnerability details',
    section_treated: 'Treated vulnerabilities',
    col_title: 'Title',
    col_status: 'Status',
    col_resolved_by: 'Treated by',
    col_resolved_at: 'Treated on',
    no_treated: 'No treated vulnerability for this project.',
    card_vulns: 'Vulnerabilities',
    card_critical: 'Critical',
    card_high: 'High',
    card_devices: 'Affected devices',
    col_device: 'Device',
    col_vendor: 'Vendor',
    col_family: 'Product family',
    col_article: 'Article No.',
    col_firmware: 'Firmware',
    col_findings: 'Findings',
    no_device: 'No devices.',
    no_vuln: 'No findings to detail.',
    no_correl: 'No correlated vulnerabilities on this project.',
    field_cwe: 'CWE',
    field_vector: 'Vector',
    field_advisory: 'Advisory',
    field_desc: 'Description',
    field_remediation: 'Remediation',
    no_cve: 'No CVE',
    affected_label: (n: number) => `Affected devices (${n})`,
    col_fw: 'Firmware',
    col_product: 'Affected product',
    col_conf: 'Conf.',
    footer: `Report automatically generated by CSAF Vulnerability Manager from CSAF advisories.
    Device ↔ affected-product correlations are computed by fuzzy matching (vendor, product name, firmware range)
    and include a confidence score; they must be validated by an analyst before any decision.
    Sources: advisories referenced above.`,
  },
};

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtDate = (d?: string | null, locale = 'fr-FR') => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return String(d); }
};

const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#b91c1c', HIGH: '#c2410c', MEDIUM: '#a16207', LOW: '#0369a1', NONE: '#475569',
};

function sevBadge(sev: string, score: number | null): string {
  const s = (sev || 'NONE').toUpperCase();
  const color = SEV_COLOR[s] || SEV_COLOR.NONE;
  const sc = score != null ? ` ${Number(score).toFixed(1)}` : '';
  return `<span class="sev" style="background:${color}">${esc(s)}${esc(sc)}</span>`;
}

export function renderReportHtml(data: ReportData, lang: 'fr' | 'en' = 'fr'): string {
  const i = REPORT_I18N[lang] || REPORT_I18N.fr;
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const s = summarize(data);

  const groups = new Map<number, { head: Finding; devices: Finding[] }>();
  for (const f of data.findings) {
    if (!groups.has(f.vuln_id)) groups.set(f.vuln_id, { head: f, devices: [] });
    groups.get(f.vuln_id)!.devices.push(f);
  }

  const sevBars = SEV_ORDER.filter((sev) => s.sevCount[sev] > 0)
    .map((sev) => {
      const n = s.sevCount[sev];
      const pct = s.distinctVulns ? Math.round((n / s.distinctVulns) * 100) : 0;
      return `<div class="bar-row">
        <span class="bar-label">${sev}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${SEV_COLOR[sev]}"></span></span>
        <span class="bar-num">${n}</span>
      </div>`;
    }).join('');

  const findingsByDevice = new Map<number, number>();
  for (const f of data.findings) findingsByDevice.set(f.device_id, (findingsByDevice.get(f.device_id) || 0) + 1);

  const deviceRows = data.devices.map((d) => `<tr>
    <td>${esc(d.name)}</td>
    <td>${esc(d.vendor) || '—'}</td>
    <td>${esc(d.product_family) || '—'}</td>
    <td class="mono">${esc(d.article_number) || '—'}</td>
    <td class="mono">${esc(d.firmware_version) || '—'}</td>
    <td class="num">${findingsByDevice.get(d.id) || 0}</td>
  </tr>`).join('');

  const treatedRows = data.treated_vulns.map((t) => `<tr>
    <td>${esc(t.cve || i.no_cve)}</td>
    <td>${esc(t.title)}</td>
    <td>${(i as any)['status_' + t.status] || esc(t.status)}</td>
    <td>${esc(t.resolved_by) || '—'}</td>
    <td>${fmtDate(t.resolved_at, locale)}</td>
  </tr>`).join('');

  const vulnSections = [...groups.values()].map(({ head, devices }) => {
    const devList = devices.map((d) => `<tr>
      <td>${esc(d.device_name)}</td>
      <td class="mono">${esc(d.firmware_version) || '—'}</td>
      <td>${esc(d.product_name)}${d.version_range ? ` <span class="mono dim">(${esc(d.version_range)})</span>` : ''}</td>
      <td class="num">${Math.round(Number(d.confidence) * 100)}%</td>
    </tr>`).join('');

    return `<div class="vuln">
      <div class="vuln-head">
        <div>
          <span class="cve">${esc(head.cve || i.no_cve)}</span>
          ${sevBadge(head.cvss_severity, head.cvss_score)}
        </div>
        <div class="adv mono">${esc(head.tracking_id)}</div>
      </div>
      <div class="vuln-title">${esc(head.title)}</div>
      <table class="meta">
        ${head.cwe ? `<tr><th>${i.field_cwe}</th><td>${esc(head.cwe)}</td></tr>` : ''}
        ${head.cvss_vector ? `<tr><th>${i.field_vector}</th><td class="mono">${esc(head.cvss_vector)}</td></tr>` : ''}
        <tr><th>${i.field_advisory}</th><td>${esc(head.advisory_title)} — ${esc(head.publisher)}${head.tlp ? ` (TLP:${esc(head.tlp)})` : ''}, ${fmtDate(head.released, locale)}</td></tr>
        ${head.description ? `<tr><th>${i.field_desc}</th><td>${esc(head.description)}</td></tr>` : ''}
        ${head.remediation ? `<tr><th>${i.field_remediation}</th><td>${esc(head.remediation)}</td></tr>` : ''}
      </table>
      <div class="dev-affected">${i.affected_label(devices.length)}</div>
      <table class="devices">
        <thead><tr><th>${i.col_device}</th><th>${i.col_fw}</th><th>${i.col_product}</th><th class="num">${i.col_conf}</th></tr></thead>
        <tbody>${devList}</tbody>
      </table>
    </div>`;
  }).join('');

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8">
<title>${i.title} — ${esc(data.project.name)}</title>
<style>
  :root { --ink:#1e293b; --dim:#64748b; --line:#e2e8f0; --accent:#0f4c81; }
  * { box-sizing:border-box; }
  body { font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:var(--ink);
         margin:0; padding:0; background:#f1f5f9; font-size:13px; line-height:1.5; }
  .page { max-width:900px; margin:0 auto; background:#fff; padding:48px 56px; }
  .toolbar { max-width:900px; margin:16px auto 0; text-align:right; }
  .toolbar button { background:var(--accent); color:#fff; border:0; padding:8px 16px; border-radius:6px;
                    font-size:13px; cursor:pointer; }
  h1 { font-size:24px; margin:0 0 4px; }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:.04em; color:var(--accent);
       border-bottom:2px solid var(--line); padding-bottom:6px; margin:34px 0 14px; }
  .sub { color:var(--dim); }
  .mono { font-family:ui-monospace,Menlo,Consolas,monospace; }
  .dim { color:var(--dim); }
  .head-grid { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; }
  .meta-box { text-align:right; color:var(--dim); font-size:12px; }
  .cards { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:8px 0 4px; }
  .card { border:1px solid var(--line); border-radius:8px; padding:14px 16px; }
  .card .n { font-size:26px; font-weight:700; }
  .card .l { color:var(--dim); font-size:11px; text-transform:uppercase; letter-spacing:.03em; }
  .bar-row { display:flex; align-items:center; gap:10px; margin:5px 0; }
  .bar-label { width:80px; font-size:12px; color:var(--dim); }
  .bar-track { flex:1; height:10px; background:#f1f5f9; border-radius:6px; overflow:hidden; }
  .bar-fill { display:block; height:100%; }
  .bar-num { width:28px; text-align:right; font-variant-numeric:tabular-nums; }
  table { width:100%; border-collapse:collapse; }
  .devices, .coverage { font-size:12px; }
  .coverage th, .coverage td, .devices th, .devices td { border:1px solid var(--line); padding:6px 9px; text-align:left; }
  .coverage th, .devices th { background:#f8fafc; font-size:11px; text-transform:uppercase; letter-spacing:.03em; color:var(--dim); }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .sev { color:#fff; font-size:11px; font-weight:700; padding:2px 8px; border-radius:4px; margin-left:8px; }
  .vuln { border:1px solid var(--line); border-radius:8px; padding:16px 18px; margin:14px 0; page-break-inside:avoid; }
  .vuln-head { display:flex; justify-content:space-between; align-items:center; }
  .cve { font-weight:700; font-size:15px; }
  .adv { color:var(--dim); font-size:12px; }
  .vuln-title { margin:6px 0 10px; }
  table.meta th { text-align:left; vertical-align:top; width:110px; color:var(--dim); font-weight:600;
                  padding:3px 8px 3px 0; font-size:12px; }
  table.meta td { padding:3px 0; font-size:12px; }
  .dev-affected { margin:12px 0 6px; font-size:12px; font-weight:600; color:var(--accent); }
  footer { margin-top:36px; padding-top:14px; border-top:1px solid var(--line); color:var(--dim); font-size:11px; }
  @media print {
    body { background:#fff; }
    .toolbar { display:none; }
    .page { max-width:none; padding:0 12mm; }
    h2 { page-break-after:avoid; }
  }
</style></head>
<body>
<div class="toolbar"><button onclick="window.print()">${i.print_btn}</button></div>
<div class="page">
  <div class="head-grid">
    <div>
      <h1>${i.title}</h1>
      <div class="sub">${esc(data.project.name)}${data.project.description ? ` — ${esc(data.project.description)}` : ''}</div>
    </div>
    <div class="meta-box">
      ${i.project_label}${data.project.id}<br>
      ${data.project.owner ? `${i.owner_label} ${esc(data.project.owner)}<br>` : ''}
      ${i.project_status_label} ${(i as any)['pstatus_' + data.project_status] || esc(data.project_status)}<br>
      ${i.generated_label} ${fmtDate(data.generated_at, locale)}
    </div>
  </div>

  <h2>${i.section_summary}</h2>
  <div class="cards">
    <div class="card"><div class="n">${s.distinctVulns}</div><div class="l">${i.card_vulns}</div></div>
    <div class="card"><div class="n" style="color:${SEV_COLOR.CRITICAL}">${s.sevCount.CRITICAL}</div><div class="l">${i.card_critical}</div></div>
    <div class="card"><div class="n" style="color:${SEV_COLOR.HIGH}">${s.sevCount.HIGH}</div><div class="l">${i.card_high}</div></div>
    <div class="card"><div class="n">${s.affectedDeviceCount}/${s.deviceCount}</div><div class="l">${i.card_devices}</div></div>
  </div>
  ${s.distinctVulns ? `<div style="margin-top:14px">${sevBars}</div>` : `<p class="dim">${i.no_correl}</p>`}

  <h2>${i.section_coverage}</h2>
  <table class="coverage">
    <thead><tr>
      <th>${i.col_device}</th><th>${i.col_vendor}</th><th>${i.col_family}</th>
      <th>${i.col_article}</th><th>${i.col_firmware}</th><th class="num">${i.col_findings}</th>
    </tr></thead>
    <tbody>${deviceRows || `<tr><td colspan="6" class="dim">${i.no_device}</td></tr>`}</tbody>
  </table>

  <h2>${i.section_treated}</h2>
  <table class="coverage">
    <thead><tr>
      <th>CVE</th><th>${i.col_title}</th><th>${i.col_status}</th><th>${i.col_resolved_by}</th><th>${i.col_resolved_at}</th>
    </tr></thead>
    <tbody>${treatedRows || `<tr><td colspan="5" class="dim">${i.no_treated}</td></tr>`}</tbody>
  </table>

  <h2>${i.section_vulns}</h2>
  ${vulnSections || `<p class="dim">${i.no_vuln}</p>`}

  <footer>${i.footer}</footer>
</div>
</body></html>`;
}

/* ------------------------------------------------------------------ *
 *  Rendu CSV (un constat par ligne)
 * ------------------------------------------------------------------ */

export function renderReportCsv(data: ReportData, lang: 'fr' | 'en' = 'fr'): string {
  const i = REPORT_I18N[lang] || REPORT_I18N.fr;
  const cell = (v: unknown) => {
    const str = String(v ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };
  const header = lang === 'fr'
    ? ['CVE', 'Severite', 'CVSS', 'CWE', 'Device', 'Fabricant', 'N_article_MLFB', 'Firmware',
       'Produit_affecte', 'Plage_version', 'Advisory', 'Publisher', 'Date', 'Confiance', 'Remediation']
    : ['CVE', 'Severity', 'CVSS', 'CWE', 'Device', 'Vendor', 'Article_MLFB', 'Firmware',
       'Affected_product', 'Version_range', 'Advisory', 'Publisher', 'Date', 'Confidence', 'Remediation'];
  const treatedHeader = lang === 'fr'
    ? ['CVE', 'Titre', 'Statut', 'Traite_par', 'Traite_le']
    : ['CVE', 'Title', 'Status', 'Treated_by', 'Treated_on'];

  const lines = [
    [lang === 'fr' ? 'Statut_projet' : 'Project_status', (i as any)['pstatus_' + data.project_status] || data.project_status].map(cell).join(';'),
    '',
    header.map(cell).join(';'),
  ];
  for (const f of data.findings) {
    lines.push([
      f.cve, f.cvss_severity, f.cvss_score ?? '', f.cwe,
      f.device_name, f.device_vendor, f.device_article, f.firmware_version,
      f.product_name, f.version_range, f.tracking_id, f.publisher,
      f.released ? new Date(f.released).toISOString().slice(0, 10) : '',
      Math.round(Number(f.confidence) * 100) + '%', f.remediation,
    ].map(cell).join(';'));
  }

  lines.push('', (lang === 'fr' ? 'Vulnerabilites traitees' : 'Treated vulnerabilities'));
  lines.push(treatedHeader.map(cell).join(';'));
  for (const t of data.treated_vulns) {
    lines.push([
      t.cve, t.title, (i as any)['status_' + t.status] || t.status,
      t.resolved_by || '', t.resolved_at ? new Date(t.resolved_at).toISOString().slice(0, 10) : '',
    ].map(cell).join(';'));
  }

  return '﻿' + lines.join('\r\n');
}
