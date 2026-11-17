# Prospection Outlook

Outil de campagnes de prospection par e-mail pour **Outlook classique (Windows)** : un premier mail puis jusqu'à 3 relances, chaque relance répondant au mail précédent dans le même fil de discussion.

L'outil prépare des **brouillons** dans Outlook, avec ta signature. **Rien n'est jamais envoyé automatiquement** : tu relis et tu envoies toi-même depuis Outlook.

Tout se fait depuis une interface web locale :

- création des campagnes ;
- saisie des contacts (ou collage depuis Excel) et des objets de mail ;
- rédaction des 4 mails, avec aperçu ;
- suivi contact par contact (mails envoyés, réponses, relance possible) ;
- création des brouillons en un clic ;
- guide d'utilisation intégré.

## Installation (utilisateurs)

Prérequis : Windows, **Outlook classique** (pas le « nouvel Outlook ») avec une signature par défaut. Aucune autre installation n'est nécessaire.

1. Sur cette page, clique sur **Code** puis **Download ZIP**.
2. Dans le ZIP, copie le contenu du dossier **`outil`** où tu veux, par exemple `Documents\Prospection`.
3. Ouvre Outlook, puis double-clique **`Interface.bat`**. L'interface s'ouvre dans ton navigateur. Laisse la fenêtre noire ouverte pendant l'utilisation.
4. Clique sur **Guide d'utilisation**, en bas à gauche de l'interface.

Si Windows affiche « Windows a protégé votre ordinateur » au premier lancement, clique sur *Informations complémentaires* puis *Exécuter quand même*. Les scripts sont lisibles dans `outil\Scripts`.

**Mettre à jour** : retélécharge le ZIP et recopie le contenu de `outil` par-dessus ton dossier. Tes campagnes, dans `Campagnes\`, ne sont pas écrasées : seule la campagne modèle `_Modele campagne` est remplacée.

## Confidentialité

Tes campagnes (contacts, textes) restent sur ton poste, dans `Campagnes\`. L'interface ne fonctionne qu'en local (`http://localhost:8765`), et aucune donnée n'est envoyée ailleurs. Ne publie jamais ton dossier `Campagnes\` : le `.gitignore` du dépôt l'exclut.

## Organisation du dépôt

```
outil/                  ce que les utilisateurs copient (prêt à l'emploi)
  Interface.bat         lance l'interface
  Scripts/              moteur PowerShell (pilote Outlook en COM)
  Interface/app/        interface compilée (versionnée : pas besoin de Node pour l'utiliser)
  Campagnes/_Modele campagne/
interface/              code source de l'interface (React + Vite + shadcn/ui)
Deployer.ps1            copie outil/ vers un dossier de travail sans toucher aux campagnes
```

## Développement

Il faut Node.js. La version portable (ZIP) suffit, sans installation.

```powershell
cd interface
npm install
npm run dev       # interface en mode développement (http://localhost:5173), avec le serveur lancé à côté :
                  # powershell -File ..\outil\Scripts\Serveur-Interface.ps1 -SansNavigateur
npm run build     # compile dans outil/Interface/app
cd ..
.\Deployer.ps1 -Cible "C:\chemin\vers\ton\dossier\Prospection"
```

Pense à mettre à jour le guide intégré (`interface/src/Guide.tsx`) quand un comportement change.
