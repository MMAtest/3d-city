# Origine des données — Marseille 3D / AFFLUE Lab

Version expérimentale du 8 novembre 2026.

## Jeu de données initial

- Géométrie urbaine, littoral, voies, espaces verts : contributeurs **OpenStreetMap**, licence **ODbL 1.0**. Tuiles vecteur : OpenFreeMap/OpenMapTiles, attribution correspondante.
- Terrain mondial servant de socle : **Mapzen / AWS Terrain Tiles**, licences détaillées par [Tilezen / Joerd](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
- Géométrie des bâtiments OSM et hauteurs enrichies : données extraites et appariées dans le prototype AFFLUE `feat/marseille-osm-3d-poc`. Hauteurs issues de la **BD TOPO IGN**, Géoplateforme, **Licence Ouverte Etalab 2.0**. Correspondance approximative par géométrie, pas un relevé certifié.
- Relief des secteurs Vieux-Port et Cours Julien : **IGN RGE ALTI**, Géoplateforme, Licence Ouverte 2.0. Grilles stockées dans `public/afflue`.
- LiDAR HD sur **La Plaine et rue André-Poggioli**, MNT/MNS (modèle de terrain + modèle de surface), **IGN Licence Ouverte 2.0**. Campagne mesurée **du 26 juin au 17 octobre 2021**, mission `21LHD7PQ` ; la situation immobilière peut avoir changé depuis.
- Orthophotos géoréférencées : **IGN BD ORTHO**, source WMS Géoplateforme `HR.ORTHOIMAGERY.ORTHOPHOTOS`, Licence Ouverte 2.0. **Année de prise de vue non déterminée**. Ces clichés ne sont pas de la photogrammétrie de façade.

## Licences et redistribution

- Code de YourPlace3D / ce fork : **MIT** (voir `LICENSE`). La licence du code ne remplace pas les licences de données.
- Données OSM : **ODbL**. Mentionner « © OpenStreetMap contributors » et respecter les obligations de partage de bases dérivées applicables.
- Données IGN : **Licence Ouverte / Open Licence 2.0** (attribution © IGN, provenance, indication des modifications).
- Les photos Panoramax / Wikimedia de la branche AFFLUE ne sont **pas reprises** dans la nouvelle version. Elles ont chacune leurs auteurs/licences et demandent un contrôle séparé avant publication commerciale.
- Aucun contenu Google Earth ou Google Photorealistic 3D Tiles n'est extrait ou distribué.

## Précautions de précision

Cette scène sert à la **visualisation**, non à la validation de limites de propriété, d'autorisations de travaux ou de mesures architecturales. Un bâtiment n'est enrichi avec une hauteur IGN que lorsque son emprise source semble correspondre géométriquement à l'emprise vectorielle ; des erreurs d'appariement peuvent subsister. Le LiDAR sert ici au calcul de la hauteur médiane toiture-sol, **pas** à générer des toits irréguliers complets et texturés. Les rues, murs et façades conservent une géométrie simplifiée dans ce moteur.

La vue principale est un carré de **6 × 6 km**, et non l'union géodésique exacte des 1er, 2e, 6e et 7e arrondissements. Les quartiers hors emprise s'ouvrent via les boutons de navigation. Les îles du Frioul sont une vue séparée.

Le LOD de la vue large réduit volontairement le nombre de bâtiments affichés sur appareils tactiles. Des bâtiments sont donc masqués en grand angle, puis rechargés dans les vues locales ; ne pas utiliser cette vue pour compter les bâtiments officiellement.

## Prochaines étapes documentées

1. Construire des tuiles 3D incrémentales avec LOD continu selon altitude/caméra ; ne plus reconstruire tout le carré pour chaque zone.
2. Vérifier les sources OSM ↔ IGN par intersection polygonale et métriques de confiance, gérer les bâtiments divisés en `building:part`.
3. Ajouter des **toitures LiDAR avec géométrie** et orthophotos correctement plaquées, sans prétendre couvrir des façades réelles.
4. Limites administratives exactes (y compris le 2e portuaire et les îles), à partir de données libres documentées et mise à jour.
5. Benchmarks de FPS, mémoire GPU et température sur vrais Android/iOS avant tout usage grand public.
6. Modèles photogrammétriques tiers uniquement avec droits commerciaux et attribution explicite.
