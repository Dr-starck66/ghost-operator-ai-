# ASTRA ARENA Ω — Accès Inkling 2 Small légal depuis UE (audit du 09/11/2026)

## État vérifié

1. **Inkling 2 Small Free sur OpenCode** : tarif affiché gratuit, mais **exclusion explicite de l'Union européenne** : https://opencode.ai/docs/console/models (rubrique Free models). Ce n'est pas une panne Vercel, ni une erreur DNS. Le 09/11 un test réel depuis un Sandbox Vercel à Francfort a reçu `This model is not available in your country`. **FAIL GEO.**
2. **Thinking Machines**, annonce du 05/11/2026 : modèle accessible sur Tinker avec poids fermés ; intention de publier les poids Apache 2.0 la semaine du 09/11 sous réserve de validation de sécurité. Une intention n'est **pas** une publication : https://thinkingmachines.ai/news/inkling-2-small/ .
3. **Carte officielle** : licence actuelle Tinker Terms of Use, pas encore Apache 2.0 : https://thinkingmachines.ai/model-card/inkling-2-small/ .
4. **Hugging Face officiel** : https://huggingface.co/thinkingmachines . À l'audit du 09/11, organisation affichant 6 modèles dont la première génération Inkling et Inkling-Small ; aucun dépôt public exact `thinkingmachines/Inkling-2-Small` contenant les nouveaux poids. **UNVERIFIED_PUBLIC_WEIGHTS**.
5. **Support Tinker** : adresse publiée par https://tinker-docs.thinkingmachines.ai/support : `tinker@thinkingmachines.ai`.

## Action sortante réalisée

Le 09/11/2026, un courriel de demande d'accès de recherche officiel et **sans coût** a été envoyé via Gmail connecté à `tinker@thinkingmachines.ai`, objet :
`EU research evaluation request — Inkling 2 Small (no-cost authorized access)`.

- Reçu Gmail : message ID / thread ID `1a1c2774abb87aca`, libellé `SENT`.
- Le courriel décrit ASTRA Ω, l'évaluation sur huit tâches publiques, le refus géographique, l'absence de contournement et sollicite une petite allocation gratuite légalement accessible dans l'UE, des précisions sur la restriction UE et le dépôt de poids officiel.
- **Statut de livraison : UNVERIFIED**. `SENT` confirme l'envoi, pas la réception ni l'acceptation par Thinking Machines. Aucun abonnement, nouveau compte, activation de facturation ni clé Tinker demandé.

## Suivi transversal activé

La tâche **existante** `ASTRA Ω — Pilotage gratuit centralisé` (`6ae5fe6216e0819197eddcfe2786a44e`) a été mise à jour **sans changer son calendrier, son état activé ou les missions antérieures**. Sous-section ajoutée : `ASTRA-281 — VEILLE OFFICIELLE INKLING 2 SMALL UE`. Surveillance conditionnelle des annonces officielles, de la page de modèles OpenCode, du dépôt Hugging Face Thinking Machines et de la réponse Gmail. Aucun nouvel automate/crontab.

Conditions pour déclarer **PASS_ACCESS** :
- autorisation gratuite **écrite** pour notre région et conditions d'accès vérifiées, sans paiement automatique ; **ou**
- poids publics **officiels et téléchargeables** sous licence attestée Apache-2.0 (publication de poids ne vaut pas disponibilité d'inférence gratuite, notamment avec 594B de paramètres).

Pas de VPN, proxy, fausse déclaration de région, déplacement de VM pour éviter des conditions, réessais automatiques d'une région interdite ou utilisation d'une API payante.

## Statuts

| Contrôle | Statut | Preuve |
|---|---|---|
| Identification du blocage géographique UE | PASS | documentation OpenCode officielle et résultat CLI réel |
| Canal de contact officiel | PASS | documentation support Tinker |
| Demande de recherche émise | PASS_SENT | accusé Gmail `SENT` ; réponse et remise UNVERIFIED |
| Veille raccordée à une tâche existante | PASS_CONFIGURATION | retour `success:true` Automations, calendrier inchangé |
| Poids Inkling 2 Small publiés | UNVERIFIED | aucun dépôt officiel visible à la date contrôlée |
| Premier résultat d'inférence Inkling en UE | FAIL_GEO | requête refusée, aucune génération |
| Coût nouveau | Aucun paiement engagé | facture finale de la VM antérieure toujours UNVERIFIED |

## Prochaine action autorisée

À réception d'une réponse explicite favorable, ou à publication réelle de poids, évaluer les droits et l'exécuteur sans changer la production. Ne lancer aucune inférence facturée et ne pas contourner les restrictions régionales.
