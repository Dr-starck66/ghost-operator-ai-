# ASTRA ARENA Ω — Inkling 2 Small / Nemotron — 9 novembre 2026

**Statut : PARTIAL.** Le banc d'essai déterministe est exécutable hors réseau, mais **aucune génération Inkling 2 Small n'a été réalisée**. Le moteur Nemotron reste celui déjà présent dans `server/nemotron.mjs`.

## Vérification des contraintes de marché (sources officielles)

- Thinking Machines, annonce du 05/11/2026 : https://thinkingmachines.ai/news/inkling-2-small/ — Inkling 2 Small disponible via Tinker, poids encore fermés, publication Apache 2.0 annoncée sous réserve de vérifications de sécurité.
- Thinking Machines, tarif consulté le 09/11/2026 : https://thinkingmachines.ai/tinker/pricing/ — inférence Tinker : 0,30 USD/M tokens entrée + 1,00 USD/M tokens sortie (256 K). **Pas d'appel payant autorisé.** Une interface Playground ne suffit pas à prouver une API gratuite automatisable.

## Réutilisation des briques existantes

- Dépôt : `Dr-starck66/ghost-operator-ai-`.
- Adaptateur NVIDIA **réutilisé** : `server/nemotron.mjs` (`invokeNemotron`).
- Sonde initiale ARENA, inchangée : `server/astra-arena-first-real-probe.mjs`.
- Garde zéro coût : `runPairedArena` exige **deux droits explicites d'appel gratuits** (`freeEntitlements.nemotron === true`, `freeEntitlements.inkling === true`) et `liveEnabled === true` ; sinon **0 appel sortant**. Le paramètre doit résulter d'une vérification réelle des droits, jamais d'une simple supposition.
- Aucun secret, données utilisateur, code généré ou DNS n'est modifié. Le scorer n'exécute jamais de code produit par les modèles.

## Protocole de comparaison

8 tâches communes et déterministes : SEO (indexabilité et redirection historique), agents (preuve CI et dédoublonnage), sciences (témoins indépendants et causalité), calcul (pairs et unicité). Même prompt SHA-256 pour les deux candidats, corrections exactes sur JSON strict, couverture, erreurs et empreintes. Des résultats obtenus par les *doubles de test* démontrent le scorer **mais ne sont pas des résultats de modèles**.

Exécuter sans réseau ni configuration :

```sh
node --test tests/astra-arena-inkling-benchmark.test.mjs
node server/astra-arena-inkling-benchmark.mjs
```

Sortie normale : `UNVERIFIED` et `LIVE_TWO_MODEL_ZERO_COST_GATE_NOT_SATISFIED`, `liveCalls: 0`. Pour un essai réel, un adaptateur Tinker officiel et des autorisations gratuites vérifiées doivent être raccordés au harnais, puis des reçus indépendants doivent être conservés. `PARTIAL` sur l'exécution en mémoire du harnais ne constitue pas une preuve indépendante d'identité du modèle ni de facture nulle.

## Non-objectifs et limites

- Aucun classement de modèles avant essais réels sur les **mêmes** tâches.
- Pas de service payant, pas de nouveau cron, pas de montée en production et pas de tentative de contournement de quotas/contrôles.
- La suite mesure l'exactitude sur JSON court, **pas** une capacité d'ingénierie logicielle agentique de longue durée.
