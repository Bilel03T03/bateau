# Cap — analyse produit et architecture

Ce document répond au point 25 du cahier des charges : ce qui est indispensable, ce qui peut attendre, ce qui ne sert à rien, ce qui manquait, puis l'architecture retenue.

## 1. Le vrai besoin

Un étudiant en alternance (rythme **1 semaine à Perrimond, 3 semaines chez Auchan**) veut ouvrir un seul écran le matin et savoir : où être, à quelle heure, quoi faire en priorité, et s'il est en retard (sport, révisions, échéances). Il ne veut **pas** passer 20 minutes par jour à remplir un outil.

Deux contraintes structurent tout le reste :

1. **La saisie doit être quasi nulle.** L'emploi du temps de l'école arrive en PDF/papier, et les horaires Auchan changent parfois. D'où les horaires récurrents par type de semaine, l'import d'une photo par l'IA, l'ajout rapide en langage naturel et les confirmations en un clic (« ✓ Fait / ✗ Manqué »).
2. **Les calculs doivent être réalistes.** Trajets, repas, sommeil et temps libre sont pris en compte partout (planification, conflits, « Que faire maintenant ? »). Sinon l'outil propose des choses impossibles et on arrête de s'en servir.

## 2. Tri des fonctionnalités

### Indispensables (dans la V1)

| Fonction | Pourquoi |
|---|---|
| Accueil « Aujourd'hui » : heure, prochain événement avec **heure de départ**, planning du jour, rappels | C'est la raison d'ouvrir l'app le matin |
| **Que dois-je faire maintenant ?** (une seule action) | Supprime la paralysie du choix |
| **Organiser ma journée** (réveil → trajets → repas → travail → temps libre → coucher) | Répond à « où, quand, quoi » en une vue |
| **Planifier / réorganiser ma semaine** (sport, révisions, tâches) | Le cœur de l'automatisation |
| Rythme d'alternance école/Auchan + horaires récurrents | Évite de ressaisir les cours et le travail |
| Trajets entre lieux | Sans eux, conflits et suggestions sont faux |
| Détection des conflits + 3 solutions | Demandé explicitement, et évite les surprises |
| Tâches avec catégorie, priorité, durée, sous-tâches, statut | Base de tout le reste |
| Ajout rapide en langage naturel | Condition de l'usage quotidien |
| Sport : objectifs hebdo (CrossFit 2, squash 1), suivi, bilan mensuel | Objectif explicite |
| Révisions réparties (jamais tout la veille) | Objectif explicite, fort impact |
| Indicateur 🟢🟠🔴 calculé | Lecture en une seconde |
| Mode sombre, mobile, catégories colorées | Usage quotidien sur téléphone |

### Secondaires (présentes, mais volontairement simples)

- **Sommeil** : saisie en 2 secondes depuis l'accueil ; sert surtout à alléger les journées après une mauvaise nuit.
- **Repas** : 4 cases par jour, et un rappel « à emporter » les jours où tu es pris à midi.
- **Objectifs** court / moyen / long terme découpés en étapes.
- **Rappels administratifs** (papiers, factures, abonnements, renouvellements), avec répétition mensuelle/annuelle.
- **Bilan du dimanche** avec les 3 questions.
- **Statistiques** : une douzaine de chiffres utiles, pas plus.
- **Import .ics** (Google Agenda, Outlook) avec suppression des doublons.

### Écartées (inutiles ou trop coûteuses pour ce qu'elles apportent)

- Suivi nutritionnel (calories, macros) : hors sujet, demandé comme tel.
- Synchronisation bidirectionnelle Google Calendar en temps réel : demande un compte Google Cloud et OAuth ; tu n'utilises pas Google Agenda pour l'école. L'import .ics couvre le besoin ponctuel.
- Statistiques « pour remplir » (temps par matière au jour près, graphiques décoratifs).
- Gamification, badges, séries.
- Gestion d'équipe ou partage : c'est un outil personnel.

### Ce qui manquait dans le cahier des charges (et qui a été ajouté)

1. **Le type de chaque semaine** (école / Auchan / congés) avec exceptions : indispensable pour ton rythme 1+3.
2. **Les exceptions d'un horaire récurrent** : un cours annulé ou un service Auchan décalé ne doit modifier que cette date.
3. **L'heure de départ** plutôt que l'heure de début : « Départ à 08h35 » est plus utile que « 09h00 ».
4. **La confirmation des séances passées** (fait / manqué), sinon les objectifs sportifs et les révisions sont faux.
5. **Le coucher conseillé** quand le lendemain commence tôt.
6. **Un garde-fou de charge** : maximum de travail perso par type de journée, heure limite, temps libre minimum, soirées protégées.
7. **Des données d'exemple supprimables en un clic**, et une liste de premiers pas.
8. **Export / import** de sauvegarde pour ne jamais perdre tes données.
9. **L'import d'emploi du temps depuis une photo ou un PDF**, puisque Perrimond fournit des PDF.

## 3. Architecture

```
src/
  lib/        types du modèle, dates, libellés, accès à claude.ai
  core/       moteur pur, sans interface (testé) :
              schedule  alternance + horaires récurrents + exceptions
              frame     cadre d'une journée : trajets, repas, conflits, créneaux libres
              planner   planification automatique + résolution de conflits
              revisions répartition des révisions
              dayPlan   « Organiser ma journée »
              nowAdvisor « Que dois-je faire maintenant ? »
              load      indicateur 🟢🟠🔴
              alerts    rappels intelligents
              stats     statistiques et bilan
              quickAdd  compréhension des phrases (sans IA)
              ics       import de calendrier
  data/       réglages par défaut, données d'exemple
  store/      état (Zustand), sauvegarde locale ou claude.ai, préférences de l'appareil
  ai/         assistant : contexte, outils, Claude (compte ou clé API), assistant local
  ui/         pages, fiches de saisie, planning glisser-déposer, assistant
```

### Principes

- **Le moteur est séparé de l'interface.** Toute la logique de planification est dans `src/core`, en fonctions pures, couverte par des tests (`npm test`).
- **Proposer, puis valider.** Le planificateur et l'assistant IA ne modifient jamais rien seuls : ils proposent, tu appliques d'un clic (avec « Annuler »). Seule exception : quand tu déplaces une activité, les blocs *automatiques* devenus en conflit sont replacés tout seuls (c'est la demande « l'outil doit adapter mon planning »).
- **Un seul code, deux déploiements.**
  - **Page claude.ai** : données dans ton espace privé Claude (`data/users/<ton id>/…`), synchronisées entre ordinateur et téléphone ; assistant IA avec ton compte Claude, sans clé.
  - **Web app installable (GitHub Pages)** : données dans le navigateur (export/import pour changer d'appareil), fonctionne hors connexion, notifications tant que l'app est ouverte ; assistant IA avec une clé API facultative, sinon assistant local.
- **Stockage découpé** : pour la synchronisation, chaque collection est découpée par mois (événements, sommeil, repas, tâches) afin de rester sous les limites de taille et de ne réécrire que ce qui change.

### Algorithme de planification (résumé)

1. Retire les blocs automatiques futurs non commencés (ils seront recalculés).
2. **Sport** : complète les objectifs de la semaine en testant les créneaux habituels (ou des horaires réalistes), en rejetant tout ce qui crée un conflit de trajet ou de chevauchement, et en pénalisant les jours consécutifs, les journées chargées, les soirées protégées et les séances tardives avant un départ tôt.
3. **Capacité par jour** : maximum de travail perso selon le type de journée (cours / Auchan / libre), réduit après une nuit courte, une fatigue notée ou une grosse journée.
4. **Révisions** : réparties en séances d'environ 1 h, espacées, un peu plus longues à l'approche de l'examen, la veille limitée à une relecture ; le surplus d'un jour plein passe au lendemain.
5. **Tâches** : les plus urgentes d'abord, découpées en blocs de 45 à 90 min, avec au moins un jour de marge avant l'échéance.
6. Chaque bloc est placé dans un vrai créneau libre, avec une marge autour des obligations, un temps pour souffler après une longue journée, et jamais au-delà de l'heure limite ni au détriment du temps libre minimum.
7. Ce qui ne rentre pas est listé avec la raison, pour arbitrer en connaissance de cause.

## 4. Limites connues de la V1

- Les notifications ne fonctionnent que lorsque l'app est ouverte (un service de notifications push demanderait un serveur).
- La synchronisation automatique entre appareils n'existe que dans la page claude.ai ; la version web utilise l'export/import.
- Dans claude.ai, l'import d'emploi du temps accepte les images (capture d'écran d'un PDF) ; la version web avec clé API accepte aussi directement les PDF.
