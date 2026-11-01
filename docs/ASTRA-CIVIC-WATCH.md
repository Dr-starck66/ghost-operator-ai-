# ASTRA CIVIC WATCH Ω — candidat isolé

**Finalité:** observatoire documentaire de statistiques agrégées issues de publications officielles. Ce n'est ni une enquête policière ni un système pour identifier ou suivre des individus. Pas de fichage nominatif, localisation précise, reconnaissance faciale, crawling automatisé, prise de contact, signalement automatique, interception ou collecte de témoignages.

**Réutilisation effective du code existant:** `astra/mission-ledger.mjs` de Ghost Operator pour l'écriture persistante, dédoublonnage, preuves SHA-256 ; autres briques ASTRA OSINT et ASTRA MULTI-AGENTS analysées mais **non intégrées à l'exécution** de ce prototype.

**Exécution dans un environnement Node.js autorisé, sans frais ajoutés :**
```bash
node --test astra/civic-watch.test.mjs
node astra/civic-watch-demo.mjs /tmp/civic-watch-demo
```
Produit `civic-ledger.json`, `civic-brief.json`, `civic-dashboard.html` sans réseau. Aucun nouvel hébergement ou tâche programmée.

**Contrôle négatif :** le communiqué Gendinfo du 14 mars 2026 sur l'opération Octopus cite **43** interpellations en introduction puis **42** dans le bilan. Le communiqué rétrospectif du **17 juillet 2026** mentionne **42**. La contradiction est conservée, jamais arbitrée automatiquement. Sources :
- https://www.gendarmerie.interieur.gouv.fr/gendinfo/criminalite-organisee-et-enquetes/2026/operation-octopus-nouveau-coup-de-filet-contre-la-dz-mafia
- https://www.gendarmerie.interieur.gouv.fr/gendinfo/actualites/2026/le-succes-est-collectif-l-adieu-aux-armes-du-general-de-corps-d-armee-arnaud-browaeys

**Attention :** SHA-256 prouve l'intégrité locale de la copie, pas la fiabilité ni la mise à jour du site officiel. Les URLs ont été consultées publiquement par l'assistant le 1er novembre 2026 ; la démo ne refait pas cette lecture. Revue humaine indispensable.

**Orientation légale :** tchat officiel anonyme `masecurite.interieur.gouv.fr` pour les trafics, PHAROS pour les contenus illicites sur Internet, 17/112 pour l'urgence. Aucune confrontation ni enquête privée.

**Statut :** branche GitHub isolée, non fusionnée, sans endpoint de production ni déploiement public ; tests distants non exécutés par l'action d'écriture GitHub.
