# ASTRA CIVIC WATCH Ω — collecte automatique, 0 € de nouvelle infrastructure

## Infrastructure réellement réutilisée
- Ghost Operator : `server.ts` Express et dossier de données existant `GHOST_DATA_DIR`, sans nouveau service.
- ASTRA OSINT Ω et ASTRA MULTI-AGENTS Ω : analysés, non sollicités pour surveiller des personnes ; l'observatoire n'effectue que des lectures HTTP publiques.
- Registre de revendications chiffrées préexistant `astra/civic-watch.mjs` : réexposé séparément sur `/api/astra/civic/claims`, jamais confondu avec la collecte automatique des liens.

## Sources officielles (consultées via pages publiques le 1er novembre 2026)
1. Gendinfo, rubrique « Criminalité organisée et enquêtes » : https://www.gendarmerie.interieur.gouv.fr/gendinfo/criminalite-organisee-et-enquetes
2. Flux RSS indiqué sur la page : https://www.gendarmerie.interieur.gouv.fr/gendinfo/rss/55328 — **adresse RSS découverte dans le lien officiel du site ; réponse XML distante non testée en Node**.
3. Ministère de la Justice, espace presse : https://www.justice.gouv.fr/espace-presse

Le contenu lui-même **n'est pas certifié** par la collecte. Les publications restent des informations attribuées.

## Collecte, preuve et protection
- Deux index institutionnels prédéfinis seulement : aucune recherche de comptes personnels, pas de suivi d'individus, pas de vidéos, pas de géolocalisation, pas d'envoi automatique aux autorités.
- 1 cycle par jour en cas de réussite, relance bornée après 4 h si échec. Une vérification de nécessité toutes les heures **dans le processus Ghost existant**, sans nouvelle automation ChatGPT ni GitHub Actions.
- GET HTTPS, redirections interdites, délai 8 s, 1,2 Mo/source maximum. N'utilise pas d'API payante.
- Seuls sont conservés : source et URL institutionnelles, thème, date publique éventuelle, empreinte du titre, et contrôles d'intégrité SHA-256. Le titre lui-même et le corps de l'article ne sont pas stockés.
- Dédoublonnage, persistance atomique `GHOST_DATA_DIR/astra-civic-sources.json`, blocage de toute écriture en cas de corruption de l'historique.
- Statut PASS = les **deux index** ont été réellement récupérés et interprétés ; PARTIAL = un ; FAIL = aucun ; aucune de ces mentions ne valide la véracité de leurs contenus.
- Tous les endpoints privés exigent `GHOST_ADMIN_TOKEN` transmis par l'en-tête `x-ghost-token`. Un jeton absent vaut HTTP 401.

## Interfaces intégrées au serveur existant
- `GET /api/astra/civic/status` : état, date et contrôles
- `GET /api/astra/civic/report` : index des métadonnées pseudonymisées
- `GET /api/astra/civic/dashboard` : tableau HTML
- `GET /api/astra/civic/claims` : ancien registre des chiffres agrégés, distinct et non modifié
- `POST /api/astra/civic/scan` : cycle manuel authentifié, `{ "force": true }` pour contourner le contrôle quotidien

Configuration : `ASTRA_CIVIC_AUTO_ENABLED=false` désactive le démarrage automatique sans supprimer les routes ; l'activation est par défaut lorsque le code est réellement déployé.

## Exécution indépendante sur un runner ASTRA déjà existant
```bash
node --test tests/astra-civic-monitor.test.mjs
node server/astra-civic-monitor-cli.mjs
```
N'ajouter ni service d'hébergement ni cron autonome. Une exécution Node locale ne prouve pas le déploiement.

## Vérification et limites
- Tests Node et jeux d'essai disponibles, aucun contenu privé n'est collecté.
- L'environnement de test actuel ne résout pas les noms des sites institutionnels ; le live fetch et sa répétition serveur ne sont **pas vérifiés**.
- Les modifications sont dans la branche isolée `astra/civic-watch-zero-cost-20261101`. Aucune fusion automatique de la PR, aucun DNS modifié et aucun coût engagé.
- Pour déclarer production opérationnelle : valider la PR, le serveur Ghost existant et son volume durable, vérifier HTTP 401 sans jeton, exécuter un cycle et lire les deux preuves source réellement téléchargées, contrôler le lendemain sans doublon.

## Version accessible mise en service le 1er novembre 2026
- Interface publique (documents institutionnels uniquement) : https://astra-civic-watch-bxuud6.v2.appdeploy.ai/
- AppDeploy free : projet distinct sur compte déjà actif, application prête, cron interne quotidien 09:15 Europe/Paris. Ceci ne démontre pas encore une collecte réseau réussie ; vérifier le premier passage.
- Cette branche Ghost reste en brouillon, sans fusion ni frais Railway.
