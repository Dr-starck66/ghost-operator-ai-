# Ghost Operator — préproduction hébergée (2026-10-17)

## Déploiement réellement observé

- Fournisseur : AppDeploy, sur le compte déjà connecté.
- Application : `ghost-operator-astra-evidence-preview-3tvjpc`.
- URL : https://ghost-operator-astra-evidence-preview-3tvjpc.v2.appdeploy.ai/
- Statut fournisseur à la fin du déploiement : **ready**.
- Erreurs remontées par le contrôle fournisseur : aucune erreur frontend ni backend.
- Le site utilise l'authentification AppDeploy et une base de données app-scoped pour les tâches et résultats.
- Fonction testable : extraction de texte public, titre et URL source via un service de scrape géré.
- Une tâche en échec reste enregistrée et une reprise manuelle est possible ; ce n'est **pas** un moteur général autonome avec exécution 24/7.

## Limites majeures : ne pas transformer en faux PASS

- Ce déploiement est une **adaptation serveurless AppDeploy distincte**, pas le code `server.ts` Express de cette branche.
- Compilation complète, tests d'intégration Express/Vite et déploiement du SHA GitHub **non réalisés**, **UNVERIFIED**.
- Test de consultation et de résultat authentifiés sur l'URL publique : **UNVERIFIED** (le statut ready confirme uniquement le build/déploiement de la plateforme).
- Persistance après fermeture du navigateur : conception en base gérée, mais **pas de preuve end-to-end avec l'utilisateur**.
- Persistance lors d'un redémarrage matériel de l'hébergement AppDeploy : **UNVERIFIED**.
- Le traitement d'une nouvelle tâche est lancé pendant la requête API, **pas** par un véritable processus permanent après fermeture du navigateur.
- Ne pas utiliser ce prototype comme preuve d'une capacité d'agent universel ou d'une valorisation commerciale.

## Blocage Render

Création d'un web service `plan=free` dans `Dr's workspace` :
`HTTP 402 — Payment information is required`. Aucun service Render créé, aucune carte bancaire ajoutée.

## Prochaines preuves

1. Déployer **le dépôt GitHub original** sur un hôte compatible sans frais, ou finaliser le portage en respectant la même architecture et les mêmes tests.
2. Obtenir `npm ci`, `npm run lint`, `npm run build`, `npm test` sur le SHA GitHub exact.
3. Vérifier une vraie tâche authentifiée, sa consultation depuis un second navigateur et sa persistance après redémarrage réel, avec journal daté.
4. Préserver les anciens sites et automatisations ; aucun surcoût, aucun nouveau scheduler.

Statuts par preuve : **AppDeploy ready = PASS plateforme**, **Github original build = UNVERIFIED**, **autonomie permanente = UNVERIFIED**.
