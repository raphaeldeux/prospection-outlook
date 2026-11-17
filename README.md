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

Prérequis : Windows et **Outlook classique** (pas le « nouvel Outlook »), avec une signature par défaut. Rien d'autre : l'outil est **portable**. Il ne demande ni droits administrateur ni installation dans Windows, et n'a pas besoin de Node.js pour fonctionner.

1. Télécharge **[Installer.bat](https://github.com/raphaeldeux/prospection-outlook/releases/latest/download/Installer.bat)**.
2. Double-clique dessus. Si Windows affiche « Windows a protégé votre ordinateur », clique sur *Informations complémentaires* puis *Exécuter quand même*.
3. Accepte le dossier proposé (`Documents\Prospection`) ou indiques-en un autre. Réponds **N** à la question sur les outils de développement.
4. Ouvre Outlook, puis double-clique le raccourci **Prospection Outlook** sur le Bureau. L'interface s'ouvre dans ton navigateur : laisse la fenêtre noire ouverte pendant l'utilisation.
5. Clique sur **Guide d'utilisation**, en bas à gauche de l'interface.

L'installeur :

- vérifie les prérequis : Outlook classique et signature ;
- télécharge la dernière version depuis ce dépôt ;
- la copie dans ton dossier ;
- crée les raccourcis sur le Bureau et dans le menu Démarrer.

**Mettre à jour** : double-clique `Installer ou mettre a jour.bat` dans ton dossier Prospection, ou relance un `Installer.bat` fraîchement téléchargé : il retrouve tout seul ton dossier d'installation, même s'il ne s'agit pas du dossier par défaut. Tes campagnes, dans `Campagnes\`, ne sont jamais modifiées : seule la campagne modèle `_Modele campagne` est remplacée.

**Sans l'installeur** : clique sur *Code > Download ZIP* et copie le contenu du dossier `outil` où tu veux.

## Confidentialité

Tes campagnes (contacts, textes) restent sur ton poste, dans `Campagnes\`. L'interface ne fonctionne qu'en local (`http://localhost:8765`), et aucune donnée n'est envoyée ailleurs. Ne publie jamais ton dossier `Campagnes\` : le `.gitignore` du dépôt l'exclut.

## Organisation du dépôt

```
Installer.bat           installeur / mise à jour portable (fichier autonome, publié dans les Releases)
outil/                  ce que les utilisateurs copient (prêt à l'emploi)
  Interface.bat         lance l'interface
  Scripts/              moteur PowerShell (pilote Outlook en COM)
  Interface/app/        interface compilée (versionnée : pas besoin de Node pour l'utiliser)
  Campagnes/_Modele campagne/
interface/              code source de l'interface (React + Vite + shadcn/ui)
Deployer.ps1            copie outil/ vers un dossier de travail sans toucher aux campagnes
```

## Développement

Lance `Installer.bat` et réponds **O** à la question sur les outils de développement. L'installeur :

- télécharge **Node.js portable**, la dernière LTS, dans `%LOCALAPPDATA%\Programs`, et vérifie son empreinte SHA-256 ;
- clone ce dépôt dans `%LOCALAPPDATA%\prospection-outlook` (ou le copie si git est absent) ;
- installe les dépendances ;
- crée `Developpement.cmd`, qui ouvre une console avec Node dans le PATH.

Dans cette console, qui s'ouvre directement dans `interface\` :

```bat
npm run dev       & rem interface en mode developpement (http://localhost:5173), avec le serveur lance a cote :
                  & rem powershell -File ..\outil\Scripts\Serveur-Interface.ps1 -SansNavigateur
npm run build     & rem compile dans outil\Interface\app
cd ..
powershell -File Deployer.ps1 -Cible "C:\chemin\vers\ton\dossier\Prospection"
```

Pour publier une nouvelle version de l'installeur, ajoute `Installer.bat` comme fichier joint d'une Release GitHub. Le lien `releases/latest/download/Installer.bat` pointe toujours sur la dernière Release.

Pense à mettre à jour le guide intégré (`interface/src/Guide.tsx`) quand un comportement change.
