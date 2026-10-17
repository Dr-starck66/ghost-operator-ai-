# ASTRA Ω — Nemotron Cloud Bridge (Netlify Free)

Indépendant d'AppDeploy et de toute exécution sur le PC. Git branch isolée ; **ne pas fusionner dans main**.

## Déploiement par navigateur

Lien officiel prérempli, sur la branche isolée :

https://app.netlify.com/start/deploy?repository=https://github.com/Dr-starck66/ghost-operator-ai-&branch=astra%2Fnemotron-netlify-free-bridge

Se connecter, choisir l'équipe Netlify Free puis confirmer la création du site. Vérifier que la branche sélectionnée est `astra/nemotron-netlify-free-bridge`. La configuration du dépôt indique le dossier `nemotron-bridge`, la publication `public` et la fonction `netlify/functions/nemotron.mjs`. Aucun terminal ni installation locale.

Une fois déployé, l'URL `https://<site>.netlify.app/api/nemotron` doit répondre `status:ready`. **Ceci n'est pas un succès d'inférence.**

## Clé NVIDIA

La clé déjà enregistrée chez AppDeploy ne peut pas être exportée depuis son coffre de secrets, et n'est **pas** disponible dans Netlify. Pour une exécution immédiate, la page demande la clé `nvapi-` une seule fois par test et l'envoie au backend Netlify par HTTPS, sans localStorage, cookies ni journal de clé dans le code.

Option d'exploitation récurrente: définir `NVIDIA_API_KEY` et **`ASTRA_ACCESS_CODE`** comme secrets Netlify (portée Functions), puis appeler l'API avec `x-astra-access-code`. Il est interdit d'utiliser une clé serveur sans contrôle d'accès.

## Contrôles

`node --test nemotron-bridge/tests/nemotron.test.mjs` → 5/5 PASS en local (NVIDIA simulé). Contrôles négatifs: clé absente, origine étrangère, erreur fournisseur sans divulgation. `node --check nemotron-bridge/netlify/functions/nemotron.mjs` et `node --check nemotron-bridge/public/app.js` → PASS.

SHA blob du backend testé réellement: `a44c8f74b2f2ca4048ed8159ceb38a29d4667056`. SHA blob du navigateur validé syntaxiquement: `460cacf2d8b70550bac48103916d171920f009ba`.

**UNVERIFIED** : déploiement Netlify, connexion effective à NVIDIA, reconnaissance visuelle, quotas en production et disponibilité durable. Aucun appel NVIDIA réel n'a été effectué dans ces tests, aucun coût engagé.
