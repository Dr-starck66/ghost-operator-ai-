# Ghost Operator — Serveur d'extraction autonome V1 (candidate)

## Ce qui change

- L'extraction s'exécute **sur le serveur**, dès la création d'une tâche. La fermeture du navigateur n'interrompt pas l'exécution.
- Une seule tâche est traitée à la fois, en FIFO, sans cron, sans GitHub Actions ni appel à une API d'IA payante.
- Les tâches, états, journaux et résultats sont écrits dans un fichier JSON avec remplacement atomique. Les tâches interrompues sont reprises au redémarrage du **même processus / hôte**.
- L'API accepte uniquement des cibles HTTPS publiques, bloque les IP privées à la résolution DNS de la connexion, désactive les redirections automatiques et les proxies HTTP et limite les ressources explorées.
- L'ancien point d'entrée `/api/scrape` et la modification de statut par le navigateur ont été supprimés.
- Le serveur de production exige une authentification HTTP Basic. Aucune clé Gemini n'est injectée dans le JavaScript public.

## Tester localement sans coût

Pré-requis : Node.js 20+.

```bash
npm ci
npm test
npm run lint
npm run build
npm run dev
```

Ouvrir l'interface locale et créer une tâche avec `https://example.com/` et l'objectif `Extract external links`. Le serveur démarre le travail immédiatement, même si l'onglet est fermé. Les résultats sont consultables via `/api/tasks` et `/api/tasks/{id}`. Le point de contrôle `/api/health` indique uniquement l'état du processus local et **ne prouve pas** une exécution réussie.

## Déploiement sur un serveur existant

Mettre les valeurs suivantes dans les secrets privés de l'hébergeur :

- `GHOST_OPERATOR_USER` : identifiant de connexion.
- `GHOST_OPERATOR_PASSWORD` : mot de passe unique et fort.
- `GHOST_OPERATOR_DATA_DIR` : chemin de stockage réellement persistant, monté en écriture.
- `NODE_ENV=production` et `PORT` selon l'hôte existant.

Utiliser **HTTPS** devant le service (l'authentification Basic seule n'assure pas le chiffrement). Un environnement à disque éphémère **ne conserve pas** les tâches après une reconstruction / migration de machine. Ne pas lancer plusieurs replicas partageant ce fichier : le verrou de file n'est pas distribué. En production sans identifiants, le serveur refuse volontairement le démarrage.

## Limites réelles

- Extraction **déterministe** de métadonnées et liens : ce n'est pas encore un agent capable de toutes les actions exprimées en langage naturel.
- Chaque tâche parcourt au plus **5 pages HTML** du même hôte, extrait au maximum **300 liens externes uniques** et évite d'exécuter du JavaScript dans les pages.
- HTTPS seulement, aucun port personnalisé, IPv4 public vérifié à la connexion. Les redirections HTTP ne sont pas suivies.
- Les liens ne sont pas classés par IA ni vérifiés pour leur destination finale ; ne pas déduire d'affiliation ou de partenariat sans preuve.
- Respecter les conditions des sites et `robots.txt` avant de lancer une collecte, et ne pas utiliser cet outil pour du contenu privé ou des accès non autorisés.
- Un service toujours disponible nécessite un hôte réellement actif et une persistance vérifiée. La présence de ce code **ne prouve pas** le déploiement.

## Preuves et statut au 17 octobre 2026

- **SOURCE :** branche `astra/ghost-server-runner-20261017`.
- **TESTS :** 7/7 tests locaux PASS (5 tests du moteur, 2 tests d'intégration HTTP sur serveur de test avec pages simulées, fermeture de connexion, SIGKILL et redémarrage). Les sources locales étaient des copies de travail ; leur identité octet à octet avec le SHA GitHub n'est pas attestée.
- **Transpilation isolée de `server.ts` :** 0 diagnostic TypeScript sur une copie locale de `server.ts` non identique octet à octet au SHA GitHub; ce n'est PAS une compilation complète du candidat.
- **Compilation complète (npm ci / npm run lint / npm run build) et tests Express/Vite réels : UNVERIFIED** faute de dépendances installables dans l'environnement de test sans accès réseau.
- **Déploiement HTTPS : UNVERIFIED** ; aucun hébergement existant Ghost Operator identifié parmi les projets consultés; Render exige la confirmation du workspace avant la lecture des services.
- **Autonomie de production 24/7 et durabilité du disque hébergé : UNVERIFIED**.

Les tests d'intégration utilisent `tests/restart-fixture.mjs` et n'instancient PAS le serveur Express de production; ils vérifient le moteur de stockage et d'extraction dans un processus HTTP indépendant.

Aucun nouveau service, tâche planifiée ou abonnement payant n'a été créé. Conserver la branche séparée de `main` jusqu'aux contrôles d'intégration et d'exploitation.
