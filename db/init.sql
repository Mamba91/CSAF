-- =====================================================================
--  CSAF Vulnerability Manager — schema PostgreSQL
--  Modèle : Projets -> Devices  |  Sources -> Advisories -> Vulnérabilités
--           Matching : Devices <-> Produits affectés
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;          -- recherche fuzzy
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- Projets (inventaires clients / installations)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id           SERIAL PRIMARY KEY,
    name         TEXT        NOT NULL,
    description  TEXT        DEFAULT '',
    owner        TEXT        DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Devices appartenant à un projet (équipement industriel / OT)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
    id               SERIAL PRIMARY KEY,
    project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name             TEXT    NOT NULL,           -- ex: "SIMATIC S7-1200"
    vendor           TEXT    NOT NULL DEFAULT '',-- fabricant, ex: "Siemens"
    product_family   TEXT    DEFAULT '',         -- gamme produit
    firmware_version TEXT    DEFAULT '',         -- version firmware installée
    article_number   TEXT    DEFAULT '',          -- n° d'article / MLFB (ex: 6ES7 512-1SM03-0AB0)
    cpe              TEXT    DEFAULT '',          -- CPE optionnel
    notes            TEXT    DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_devices_project ON devices(project_id);
CREATE INDEX IF NOT EXISTS idx_devices_vendor  ON devices USING gin (vendor gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Sources CSAF (fichier importé, URL de feed, ou provider d'un vendeur)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
    id            SERIAL PRIMARY KEY,
    name          TEXT    NOT NULL,
    url           TEXT    DEFAULT '',
    source_type   TEXT    NOT NULL DEFAULT 'file'   -- 'file' | 'feed' | 'vendor'
                  CHECK (source_type IN ('file','feed','vendor')),
    vendor        TEXT    DEFAULT '',
    last_synced   TIMESTAMPTZ,
    last_status   TEXT    DEFAULT '',
    advisory_count INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Advisories CSAF (un document = un SSA / ICSA ...)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS advisories (
    id            SERIAL PRIMARY KEY,
    source_id     INTEGER REFERENCES sources(id) ON DELETE SET NULL,
    tracking_id   TEXT    NOT NULL,              -- document.tracking.id (SSA-XXXXXX)
    title         TEXT    NOT NULL DEFAULT '',
    publisher     TEXT    DEFAULT '',
    tlp           TEXT    DEFAULT '',
    category      TEXT    DEFAULT '',
    csaf_version  TEXT    DEFAULT '',
    released      TIMESTAMPTZ,
    revision      TEXT    DEFAULT '',
    raw           JSONB   NOT NULL,              -- document CSAF complet
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tracking_id)
);
CREATE INDEX IF NOT EXISTS idx_advisories_released ON advisories(released DESC);

-- ---------------------------------------------------------------------
-- Vulnérabilités extraites d'un advisory (un CVE par ligne)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vulnerabilities (
    id            SERIAL PRIMARY KEY,
    advisory_id   INTEGER NOT NULL REFERENCES advisories(id) ON DELETE CASCADE,
    cve           TEXT    DEFAULT '',
    title         TEXT    DEFAULT '',
    cwe           TEXT    DEFAULT '',
    cvss_score    NUMERIC(3,1),
    cvss_severity TEXT    DEFAULT '',            -- NONE/LOW/MEDIUM/HIGH/CRITICAL
    cvss_vector   TEXT    DEFAULT '',
    description   TEXT    DEFAULT '',
    remediation   TEXT    DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vuln_advisory ON vulnerabilities(advisory_id);
CREATE INDEX IF NOT EXISTS idx_vuln_cve      ON vulnerabilities(cve);
CREATE INDEX IF NOT EXISTS idx_vuln_severity ON vulnerabilities(cvss_severity);

-- ---------------------------------------------------------------------
-- Produits affectés (extraits du product_tree + product_status)
-- C'est la table clé pour le matching avec les devices.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affected_products (
    id              SERIAL PRIMARY KEY,
    vulnerability_id INTEGER NOT NULL REFERENCES vulnerabilities(id) ON DELETE CASCADE,
    advisory_id     INTEGER NOT NULL REFERENCES advisories(id) ON DELETE CASCADE,
    product_id      TEXT    DEFAULT '',          -- product_tree id
    product_name    TEXT    NOT NULL DEFAULT '', -- full_product_name.name
    vendor          TEXT    DEFAULT '',
    version_range   TEXT    DEFAULT '',          -- ex "< V4.2"
    cpe             TEXT    DEFAULT '',
    article_numbers TEXT    DEFAULT '',          -- n° d'article extraits du CSAF (model_numbers/skus…)
    status          TEXT    DEFAULT '',          -- known_affected / fixed / ...
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affected_vuln   ON affected_products(vulnerability_id);
CREATE INDEX IF NOT EXISTS idx_affected_name   ON affected_products USING gin (product_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_affected_vendor ON affected_products USING gin (vendor gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Correspondances Device <-> Produit affecté (résultat du moteur de matching)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
    id                  SERIAL PRIMARY KEY,
    device_id           INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    affected_product_id INTEGER NOT NULL REFERENCES affected_products(id) ON DELETE CASCADE,
    vulnerability_id    INTEGER NOT NULL REFERENCES vulnerabilities(id) ON DELETE CASCADE,
    confidence          NUMERIC(3,2) NOT NULL DEFAULT 0,  -- 0..1
    reason              TEXT    DEFAULT '',
    acknowledged        BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (device_id, affected_product_id, vulnerability_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_device ON matches(device_id);

-- ---------------------------------------------------------------------
-- Statut de traitement d'une vulnérabilité au sein d'un projet.
-- Indexé par "vuln_key" (CVE si présente, sinon tracking_id::titre) afin de
-- SURVIVRE au recalcul des matches et aux ré-imports d'advisory.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vuln_status (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    vuln_key    TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'open'   -- open|in_progress|resolved|accepted|false_positive
                CHECK (status IN ('open','in_progress','resolved','accepted','false_positive')),
    note        TEXT    DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, vuln_key)
);
CREATE INDEX IF NOT EXISTS idx_vuln_status_project ON vuln_status(project_id);

-- ---------------------------------------------------------------------
-- Vue de synthèse pour le dashboard
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_project_risk AS
SELECT p.id          AS project_id,
       p.name        AS project_name,
       COUNT(DISTINCT d.id)                                  AS device_count,
       COUNT(DISTINCT m.vulnerability_id)                    AS vuln_count,
       COUNT(DISTINCT m.vulnerability_id) FILTER
            (WHERE v.cvss_severity = 'CRITICAL')             AS critical_count,
       COUNT(DISTINCT m.vulnerability_id) FILTER
            (WHERE v.cvss_severity = 'HIGH')                 AS high_count
FROM projects p
LEFT JOIN devices d          ON d.project_id = p.id
LEFT JOIN matches m          ON m.device_id = d.id
LEFT JOIN vulnerabilities v  ON v.id = m.vulnerability_id
GROUP BY p.id, p.name;

-- ---------------------------------------------------------------------
-- Migrations idempotentes (mise à niveau de bases existantes)
-- ---------------------------------------------------------------------
ALTER TABLE devices           ADD COLUMN IF NOT EXISTS article_number  TEXT DEFAULT '';
ALTER TABLE affected_products ADD COLUMN IF NOT EXISTS article_numbers TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_devices_article  ON devices USING gin (article_number gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Utilisateurs (gestion de comptes)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    is_admin      BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login    TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- Journal d'audit (suivi de toutes les actions utilisateurs)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username    TEXT DEFAULT '',
    action      TEXT NOT NULL,
    resource    TEXT DEFAULT '',
    resource_id TEXT DEFAULT '',
    details     JSONB DEFAULT '{}',
    ip          TEXT DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ---------------------------------------------------------------------
-- Traçabilité : qui a traité une vulnérabilité (nécessite la table users)
-- ---------------------------------------------------------------------
ALTER TABLE vuln_status ADD COLUMN IF NOT EXISTS resolved_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE vuln_status ADD COLUMN IF NOT EXISTS resolved_by    TEXT DEFAULT '';
ALTER TABLE vuln_status ADD COLUMN IF NOT EXISTS resolved_at    TIMESTAMPTZ;
