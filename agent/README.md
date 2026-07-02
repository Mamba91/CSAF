# Agent de découverte réseau (SNMP)

Outil séparé du serveur, à lancer sur un poste **physiquement connecté au
segment réseau à scanner** (ex: un PC technicien branché sur le même
switch/VLAN que les automates). Il scanne une plage d'adresses IP en SNMP,
récupère les informations de base des équipements qui répondent (nom,
description système, MAC via la table ARP locale), puis envoie les résultats
au serveur CSAF Vulnerability Manager pour relecture dans l'onglet
**Découverte réseau**.

Le navigateur ne peut pas faire de SNMP lui-même : c'est pour cela que cette
découverte passe par cet agent local, à la différence de l'import CSV qui
reste disponible directement dans l'application.

Deux modes d'utilisation :

- **Mode serveur** (recommandé) : l'agent tourne en tâche de fond et expose
  une petite API locale que l'onglet "Découverte réseau" pilote directement
  (choix de la plage, de la communauté SNMP, suivi de la progression) —
  aucune ligne de commande à retaper à chaque scan.
- **Mode ligne de commande** : un scan ponctuel, paramètres passés en
  arguments, utile pour un usage scripté/planifié.

## Prérequis

- Node.js 20 ou supérieur installé sur le poste qui effectue le scan.
- Ce poste doit avoir un accès réseau (L2/L3) aux équipements ciblés, et ces
  équipements doivent avoir un agent SNMP actif (souvent désactivé par
  défaut — à vérifier dans la configuration de chaque automate/switch).
- Un compte utilisateur valide sur le serveur CSAF Vulnerability Manager.

## Installation

```bash
cd agent
npm install
```

## Mode serveur (piloté depuis l'interface web)

Un navigateur ne peut pas démarrer un programme sur votre machine (limitation
de sécurité de tous les navigateurs) : il faut donc démarrer l'agent une
première fois manuellement, puis tout le reste (lancer un scan, l'arrêter,
arrêter l'agent) se pilote depuis l'onglet **Découverte réseau**.

Sous Windows, le plus simple est de double-cliquer sur `start-agent.cmd`
(dans ce dossier) — il installe les dépendances si besoin et démarre le
serveur. Sinon, en ligne de commande :

```bash
npm run serve
```

Par défaut, un serveur local démarre sur `http://localhost:5175` et reste en
tâche de fond. Ouvrez ensuite l'onglet **Découverte réseau** de
l'application : dans le bloc « Lancer un scan depuis cette page »,
renseignez si besoin l'adresse de l'agent (pré-remplie avec
`http://localhost:5175`) et l'URL de l'API du serveur, puis la plage IP et
la communauté SNMP à utiliser, et cliquez sur **Lancer le scan**. La
progression s'affiche directement dans la page ; aucun mot de passe n'est
ressaisi, la session déjà ouverte dans le navigateur est réutilisée.

- **Arrêter le scan** : visible pendant qu'un scan tourne, interrompt le
  scan en cours (les résultats déjà trouvés ne sont pas envoyés).
- **arrêter l'agent** (à côté de l'indicateur de connexion) : arrête le
  serveur local à distance depuis la page — équivalent à fermer la fenêtre
  du terminal / `start-agent.cmd`.

Le port peut être changé via la variable d'environnement `PORT` :

```bash
PORT=5180 npm run serve
```

Pour un usage répété en production, compilez l'agent une fois puis lancez le
serveur compilé (plus rapide au démarrage) :

```bash
npm run build
npm run start:serve
```

## Mode ligne de commande

```bash
npm run dev -- --range 192.168.0.1/24 --api-url http://localhost:4000/api --username admin --password admin123
```

Options disponibles :

| Option | Requis | Défaut | Description |
|---|---|---|---|
| `--range` | oui | — | Plage à scanner en notation CIDR (ex: `192.168.1.0/24`) ou IP unique |
| `--api-url` | oui | — | URL de l'API du serveur (ex: `http://192.168.1.10:4000/api`) |
| `--username` | oui | — | Identifiant de connexion au serveur |
| `--password` | oui | — | Mot de passe de connexion au serveur |
| `--label` | non | horodatage | Nom donné au scan dans l'application |
| `--community` | non | `public` | Communauté SNMP (v1/v2c) des équipements ciblés |
| `--concurrency` | non | `20` | Nombre de requêtes SNMP en parallèle |
| `--timeout` | non | `1500` | Timeout par requête SNMP, en millisecondes |

Exemple avec une communauté personnalisée :

```bash
npm run dev -- --range 10.20.30.0/24 --api-url http://localhost:4000/api --username admin --password admin123 --label "Site A - Atelier 3" --community monsite
```

Pour un usage répété, compilez l'agent une fois puis lancez le binaire
compilé (plus rapide au démarrage) :

```bash
npm run build
npm start -- --range 192.168.1.0/24 --api-url http://localhost:4000/api --username csaf --password ***
```

## Notes

- Le scan interroge les OID SNMP standard `sysDescr`, `sysName` et
  `sysObjectID` (SNMPv2c avec repli automatique en SNMPv1 si nécessaire).
- L'adresse MAC est récupérée depuis la table ARP locale du poste qui lance
  le scan : elle ne sera disponible que pour les équipements situés sur le
  même segment L2 que ce poste (comportement identique aux outils de
  découverte réseau du même type, comme PRONETA).
- Les résultats ne sont jamais fusionnés automatiquement dans l'inventaire :
  ils apparaissent en zone de relecture dans l'onglet "Découverte réseau",
  où vous choisissez lesquels importer et dans quel projet.
- En mode serveur, l'API locale de l'agent (`/status`, `/scan`, `/scan/:id`)
  n'est pas authentifiée : elle n'écoute que sur la machine locale et n'a de
  sens que pilotée depuis le navigateur du même technicien. Ne l'exposez pas
  sur un réseau partagé.
