# Cap

Tableau de bord personnel pour un étudiant en alternance : **école (Perrimond), alternance (Auchan), sport, révisions, sommeil, repas, objectifs et temps libre** au même endroit.

On l'ouvre le matin et on sait tout de suite où être, à quelle heure, quoi faire en priorité, et si on est en retard sur ses objectifs.

- 🏠 **Accueil** : heure, prochain événement avec l'heure de départ, planning du jour, rappels, tâches importantes, résumé de la semaine et indicateur 🟢🟠🔴.
- 👉 **Que dois-je faire maintenant ?** : une seule action, selon l'heure, le prochain départ, les échéances et la fatigue.
- 🗓️ **Organiser ma journée** : réveil, trajets, cours/travail, repas, sport, révisions, temps libre, coucher.
- ✨ **Planifier / réorganiser ma semaine** : sport manquant, révisions réparties, tâches urgentes, temps libre protégé.
- 📅 **Planning** jour / semaine / mois / repas, glisser-déposer, détection des conflits avec solutions.
- ✅ Tâches (sous-tâches, priorités, statuts) et « À ne pas oublier » (papiers, factures, abonnements…).
- 🎓 Perrimond, 💼 Auchan, 🏋️ Sport et sommeil, 📚 Révisions, 🎯 Objectifs, 📊 Statistiques et bilan du dimanche.
- ✨ **Assistant IA** : « Trouve-moi un moment pour mon deuxième CrossFit », « J'ai un examen vendredi et je n'ai rien révisé », « Ma semaine est trop chargée »… Il propose, tu valides.
- 📷 **Import de l'emploi du temps** depuis une photo ou un PDF.

L'analyse produit (indispensable, secondaire, écarté, oublié) et l'architecture sont dans [`docs/ANALYSE.md`](docs/ANALYSE.md).

## Deux façons de l'utiliser

| | Page claude.ai | Web app (GitHub Pages) |
|---|---|---|
| Accès | claude.ai ou l'app Claude, ordinateur et téléphone | navigateur, installable sur l'écran d'accueil |
| Données | ton espace privé Claude, **synchronisées** entre appareils | ce navigateur (export/import pour changer d'appareil) |
| Assistant IA | inclus, avec ton compte Claude | avec une clé API Claude (facultative), sinon assistant local |
| Hors connexion | non | oui |

## Premiers pas

L'application démarre avec des **données d'exemple** (semaine Auchan, semaine d'école, partiel, sport…). Quand tu es prêt, clique sur **Supprimer les exemples** : la **configuration guidée** s'ouvre et te fait saisir ta vraie semaine en 6 étapes (environ 5 minutes) :

1. **Toi** : réveil, coucher, sommeil visé.
2. **Alternance** : 1 semaine d'école puis 3 semaines Auchan, et le prochain lundi d'école.
3. **Auchan** : tes horaires habituels, jour par jour.
4. **Cours** : ta semaine type à Perrimond, ou une photo/PDF de l'emploi du temps lue par l'IA.
5. **Trajets** : domicile ↔ Perrimond, Auchan, salle de sport…
6. **Sport** : objectifs par semaine et créneaux de ta box.

Tu peux la relancer à tout moment depuis Paramètres → Configuration guidée.

Ensuite, au quotidien :

- ajoute en langage naturel dans la barre du haut (ou le bouton + sur téléphone) ;
- confirme tes séances d'un clic (✓ Fait / ✗ Manqué) : une séance manquée te propose aussitôt de la replacer ;
- quand ton planning Auchan change, **Auchan → Horaires de la semaine** : tu recopies la semaine en 30 secondes, le reste s'adapte ;
- utilise « Réorganiser ma semaine » quand quelque chose change.

## Développement

```bash
npm install
npm run dev        # serveur local
npm test           # tests du moteur de planification
npm run build      # dist/index.html (web app) + dist-artifact/cap.html (page claude.ai)
```

Stack : React 19, TypeScript, Zustand, Vite (un seul fichier HTML autonome), SDK Anthropic pour l'assistant avec clé API.

### Déploiement GitHub Pages

Le workflow `.github/workflows/pages.yml` construit et publie la web app à chaque push sur `main`. Dans GitHub : **Settings → Pages → Source : GitHub Actions**. L'app sera alors disponible sur `https://<utilisateur>.github.io/bateau/`.
