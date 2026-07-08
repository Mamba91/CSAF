# CSAF Vulnerability Manager


Outil de gestion de vulnérabilités pour parcs industriels / OT, basé sur les
fichiers **CSAF** (Common Security Advisory Framework, OASIS v2.0). L'outil
récupère et **parse automatiquement** les advisories CSAF des constructeurs,
puis **corrèle** vos équipements (fabricant + firmware) avec les produits
affectés pour faire remonter les vulnérabilités qui concernent réellement vos
projets.

## Architecture

```
┌─────────────┐      /api      ┌──────────────┐     SQL     ┌────────────┐
│  Frontend   │ ─────────────> │   Backend    │ ──────────> │ PostgreSQL │
│ React+Vite  │                │ Hono + TS    │             │            │
│ TypeScript  │ <───────────── │  parser CSAF │ <────────── │  schéma +  │
└─────────────┘     JSON       │  + matching  │             │  vues      │
                               └──────────────┘             └────────────┘
```

- **PostgreSQL** : projets, devices, sources, advisories, vulnérabilités,
  produits affectés, et table `matches` (corrélations).
- **Backend Hono + TypeScript** : API REST, parser CSAF v2.0 robuste
  (résolution du `product_tree`, extraction CVE/CVSS/CWE), résolution des feeds
  ROLIE / agrégateurs / provider-metadata, et moteur de corrélation.
- **Frontend React + Vite + TypeScript + Tailwind** : dashboard à onglets.

## Démarrage rapide (Docker)

```bash
docker compose up --build
```

- Frontend : http://localhost:8080
- API : http://localhost:4000/api/health
- PostgreSQL : localhost:5432 (csaf / csaf)

Le schéma est appliqué automatiquement au démarrage.

## Installation sur un serveur Linux du réseau local

Pour héberger l'outil en continu sur un serveur Linux (Docker + Compose plugin
installés) accessible depuis les postes du réseau local :

```bash
# 1) Copier le projet sur le serveur (ex: via git clone, scp, rsync...)
git clone <url-du-repo> csaf && cd csaf
# ou : rsync -av --exclude node_modules --exclude .git ./ user@serveur:/opt/csaf/

# 2) Configurer les secrets (mot de passe DB, JWT, admin) avant tout démarrage
cp .env.example .env
nano .env   # changez au minimum JWT_SECRET et ADMIN_PASSWORD

# 3) Démarrer en tâche de fond, avec redémarrage auto (restart: unless-stopped)
docker compose up -d --build

# 4) Suivre les logs si besoin
docker compose logs -f
```

- Accès depuis les autres postes du réseau : `http://<ip-du-serveur>:8080`
  (remplacez `<ip-du-serveur>` par l'IP LAN du serveur, ex: `192.168.1.10`,
  visible via `ip addr` sur le serveur).
- Ouvrez les ports nécessaires dans le pare-feu du serveur si celui-ci est actif,
  ex. avec `ufw` :
  ```bash
  sudo ufw allow 8080/tcp   # interface web
  sudo ufw allow 4000/tcp   # API (nécessaire pour l'agent de découverte réseau)
  ```
- PostgreSQL n'est publié que sur `127.0.0.1` (voir `docker-compose.yml`) : il
  n'est donc **pas** accessible depuis le réseau local, seul le backend y accède
  en interne. Le port frontend/backend est personnalisable via `FRONTEND_PORT`
  / `BACKEND_PORT` dans `.env` en cas de conflit avec un autre service.
- Connectez-vous avec `admin` et le mot de passe défini dans `ADMIN_PASSWORD`
  (uniquement pris en compte au tout premier démarrage, quand la base est
  vide) — changez-le depuis l'application si vous avez gardé la valeur par
  défaut.
- Pour mettre à jour après un changement de code : `git pull` puis
  `docker compose up -d --build`.
- L'agent de découverte réseau (dossier `agent/`, voir
  [agent/README.md](agent/README.md)) reste un outil **à part**, à lancer sur
  un poste technicien branché sur le segment réseau à scanner — il n'est pas
  conteneurisé et pointe vers `http://<ip-du-serveur>:4000/api`.

## Démarrage manuel (sans Docker)

Prérequis : Node.js 20+, PostgreSQL 14+.

```bash
# 1) Base de données
createdb csaf
psql csaf -c "CREATE ROLE csaf LOGIN PASSWORD 'csaf' SUPERUSER;"
# (le backend applique db/init.sql tout seul au démarrage)

# 2) Backend
cd backend
cp .env.example .env          # ajustez DATABASE_URL si besoin
npm install
npm run dev                   # http://localhost:4000

# 3) Frontend (autre terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxy /api -> :4000)
```

## Les onglets

| Onglet | Rôle |
|--------|------|
| **Tableau de bord** | Compteurs globaux, répartition par sévérité, projets les plus exposés, advisories récents. |
| **Projets** | Liste des projets (numéro, nom, nb de devices, vulnérabilités). Détail d'un projet : devices (fabricant, gamme, firmware) + vulnérabilités corrélées. |
| **Vulnérabilités** | Vue globale filtrable (sévérité, recherche) avec détail CVE, vecteur CVSS, remédiation, produits affectés. |
| **Sources** | Voir / ajouter des sources CSAF : par URL (feed ROLIE, provider-metadata, advisory unique) ou en collant un JSON CSAF. Re-synchronisation. |
| **Recherche** | Explorer les feeds CSAF par constructeur (Siemens, CISA, Red Hat, Cisco, …) ou par URL, sélectionner des advisories et les importer. |

## Le moteur de corrélation

C'est la valeur ajoutée de l'outil. À chaque ajout/modification de device ou
import d'advisory, le backend recalcule les correspondances :

0. **N° d'article / MLFB (prioritaire)** : si le device a un numéro d'article
   (ex. `6ES7 512-1SM03-0AB0`), il est recherché — normalisé sans espaces ni
   tirets — dans les n° d'article du CSAF (`model_numbers`, `skus`,
   `x_generic_uris`), dans le CPE et dans le nom du produit affecté. Un MLFB
   identifié donne une correspondance quasi certaine (confiance 0,95–1,00).
   Quand un device est identifié par son MLFB, les rapprochements flous faibles
   sont écartés au profit de cette identification.
1. **Fabricant** : correspondance (inclusion bidirectionnelle, insensible à la casse).
2. **Nom de produit** : similarité de Jaccard sur les tokens (device vs produit affecté).
3. **Firmware** : la version du device est comparée à la plage affectée
   (`< V4.2`, `>= 1.0`, version exacte…). Un firmware clairement hors plage
   écarte la correspondance ; un firmware dans la plage augmente la confiance.

Pour le rapprochement flou (sans MLFB), score = `0.4 × fabricant + 0.6 × nom`
(+0.2 si firmware dans la plage), avec un seuil anti-bruit. Chaque correspondance
affiche sa **raison** (ex. `MLFB 6ES7 512-1SM03-0AB0 ✓` ou
`nom 66%, fabricant ✓, firmware 3.2.3.5.6 ∈ 3.2.3.5.6`).

## Exemple de source CSAF

Feed ROLIE ICS/OT de la CISA (utilisé pour les tests) :

```
https://raw.githubusercontent.com/cisagov/CSAF/develop/csaf_files/OT/white/cisa-csaf-ot-feed-tlp-white.json
```

Ce feed référence plusieurs milliers d'advisories ; l'import par feed est
plafonné par lot (60 par défaut, configurable dans `backend/src/routes/sources.ts`)
pour rester rapide. Pour un test ciblé, importez un advisory unique, ex. :

```
https://raw.githubusercontent.com/cisagov/CSAF/develop/csaf_files/OT/white/2026/icsa-26-162-03.json
```

## Import de devices (PRONETA / CSV)

Dans le détail d'un projet, onglet **Devices**, le bouton **« Importer (PRONETA / CSV) »**
permet de charger un inventaire en masse :

- Glissez un fichier **CSV** (ou un XML lisible) ; le séparateur (`;`, `,`, tab) et
  les colonnes sont détectés automatiquement (noms FR / EN / Siemens).
- Une étape de **mapping** associe les colonnes du fichier aux champs device
  (Nom, Fabricant, Gamme/MLFB, Firmware…), avec un **aperçu** avant import.
- Chaque device importé est immédiatement passé au moteur de corrélation.

> **Important — fichier PRONETA chiffré.** Le fichier de projet PRONETA (extension
> `.xml`, en-tête `MSMAMARPCRYPT` / `AES/CBC`) est **chiffré** et n'est pas lisible
> directement : son contenu ne peut pas être importé tel quel. Ouvrez le projet
> dans PRONETA, affichez l'**analyse réseau** (table des appareils) et utilisez la
> fonction d'**export** pour produire un CSV, puis importez ce CSV. L'outil détecte
> le format chiffré et l'indique explicitement.
>
> Astuce de matching : si l'export comporte une colonne *Type* (modèle, ex.
> « SIMATIC S7-1200 ») en plus du *Name* (nom de station PROFINET), mappez plutôt
> *Type* vers « Nom / modèle » ou « Gamme » — la corrélation avec les advisories
> CSAF sera plus précise.

## Endpoint d'import

```
POST /api/projects/:id/devices/bulk
  body: { devices: [ { name, vendor, product_family, firmware_version, cpe, notes } ] }
```



- `projects` 1—N `devices`
- `sources` 1—N `advisories` 1—N `vulnerabilities` 1—N `affected_products`
- `matches` relie `devices` ⟷ `affected_products` / `vulnerabilities`
- vue `v_project_risk` : agrégats de risque par projet (pour le dashboard)

## Rapport de vulnérabilités par projet

Depuis le détail d'un projet, le bouton **« Générer un rapport »** ouvre un
rapport HTML autonome dans un nouvel onglet : **synthèse** (compteurs + sévérité),
**inventaire des équipements**, et **détail de chaque vulnérabilité corrélée**
(CVE, score/vecteur CVSS, CWE, équipement concerné, produit affecté, advisory
source, remédiation). Bouton **« Imprimer / Enregistrer en PDF »** intégré.

```
GET /api/projects/:id/report        # rapport HTML imprimable (PDF via Ctrl+P)
```

## API (principaux endpoints)

```
GET    /api/health
GET    /api/dashboard

GET    /api/projects                 POST /api/projects
GET    /api/projects/:id             PUT/DELETE /api/projects/:id
POST   /api/projects/:id/devices     PUT/DELETE /api/projects/:id/devices/:deviceId
GET    /api/projects/:id/matches

GET    /api/sources
POST   /api/sources/fetch            (ajout par URL)
POST   /api/sources/upload           (coller un JSON CSAF)
POST   /api/sources/:id/sync         DELETE /api/sources/:id

GET    /api/search/vendors
GET    /api/search/browse?vendor=siemens | ?url=...
POST   /api/search/import            (importer une sélection)
GET    /api/search/local?q=...

GET    /api/vulnerabilities?severity=&q=
GET    /api/vulnerabilities/:id
```

## Remarques sur les feeds constructeurs

Les constructeurs publient généralement un `provider-metadata.json` (norme
CSAF) pointant vers des feeds ROLIE. L'outil sait suivre cette chaîne. Les
appels réseau se font **côté serveur** (pas de blocage CORS). Certains domaines
peuvent nécessiter un accès réseau sortant depuis le backend.
test