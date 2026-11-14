# ASTRA WORK FREE Ω v0.1.0

**Statut initial : PARTIAL.** Orchestrateur d'audits HTTP réellement hébergeable, strictement en lecture seule. Ne se prétend pas être le mode Work propriétaire.

- Réemploie : ASTRA-057 (Cloud Browser pour les extensions autorisées), ASTRA-060 (Et Maintenant), ASTRA-068 (Release Bridge), ASTRA-070 (Continuous Execution), ASTRA-074 (Execution Until Done), ASTRA-278 (Browser Free), ASTRA-279 (GitHub Rescue).
- Runtime isolé : \`api/run.js\` + \`runner.mjs\`, sans secrets, sans URL arbitraire, sans DNS ou mutation.
- Vérification négative : 404, redirections, noindex, format invalide, réseau indisponible, corps excessifs.
- PREUVE : \`GET /api/health\` confirme le runtime, \`GET /api/run?project=freehotels\` exécute 3 requêtes HTTP réelles et renvoie le hash de chaque corps.
- Contrainte de coûts : hébergement Vercel Hobby seulement si quotas et règles de licence sont respectés. Aucun service payant ni compte supplémentaires.
- Frontières : une fonction hébergée ne donne pas automatiquement accès à ChatGPT, ses connecteurs, les sessions de navigateur, au PC, aux secrets ou à une exécution 24/7.
- Évolutions autorisées à rattacher au runtime : lecture GitHub et PR via connecteur, browser/cloud via ASTRA Browser Free, contrôles Release Bridge, journal persistant GitHub ou stockage déjà autorisé, planificateur existant uniquement.
- Il faut obtenir une preuve d'intégration réelle de chaque adaptateur avant de le déclarer PASS.

Tests : \`node --test tools/astra-work-free-omega/tests/runner.test.mjs\`.

Déploiement : fichiers \`runner.mjs\`, \`api/run.js\`, \`api/health.js\`, \`index.html\`, \`package.json\`, \`vercel.json\` à la racine d'un projet Vercel isolé, cible preview uniquement. Ne modifie aucun site historique.