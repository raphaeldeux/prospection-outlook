import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatutBadge } from "@/StatutBadge"

const sections = [
  { id: "principe", titre: "Le principe" },
  { id: "prerequis", titre: "Avant de commencer" },
  { id: "campagne", titre: "Créer une campagne" },
  { id: "contacts", titre: "Les contacts" },
  { id: "textes", titre: "Rédiger les mails" },
  { id: "generer", titre: "Créer les brouillons" },
  { id: "statuts", titre: "Lire le suivi" },
  { id: "faq", titre: "Questions fréquentes" },
]

function Section({ id, titre, children }: { id: string; titre: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-6">
      <CardHeader>
        <CardTitle className="text-base">{titre}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        {children}
      </CardContent>
    </Card>
  )
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8rem] text-foreground">{children}</code>
)

export function Guide() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Guide d'utilisation</h1>
        <p className="text-sm text-muted-foreground">
          Tout ce qu'il faut savoir pour mener une campagne de prospection par e-mail, de la liste de contacts aux relances.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1.5">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">{s.titre}</Badge>
          </a>
        ))}
      </nav>

      <Section id="principe" titre="Le principe">
        <p>
          Une campagne envoie jusqu'à <strong>4 mails</strong> à une liste de contacts : un premier mail (Mail1), puis
          jusqu'à 3 relances (Mail2, Mail3, Mail4). Chaque relance est une vraie <strong>réponse</strong> au mail précédent,
          dans le même fil de discussion.
        </p>
        <p>
          L'outil crée des <strong>brouillons</strong> dans Outlook, avec ta signature. <strong>Rien n'est jamais envoyé
          automatiquement</strong> : tu relis chaque brouillon et tu l'envoies toi-même depuis Outlook.
        </p>
        <p>
          Le suivi lit tes Éléments envoyés et ta Boîte de réception pour savoir où en est chaque contact : quels mails
          sont partis, qui a répondu, et qui peut être relancé.
        </p>
      </Section>

      <Section id="prerequis" titre="Avant de commencer">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Outlook classique ouvert</strong>, pas le « nouvel Outlook ». Si le bouton « Nouvel Outlook » en haut à
            droite est activé, désactive-le.
          </li>
          <li>
            <strong>Une signature par défaut</strong> pour les nouveaux messages : Outlook &gt; Fichier &gt; Options &gt;
            Courrier &gt; Signatures, champ « Nouveaux messages ».
          </li>
          <li>
            L'interface se lance en double-cliquant <Code>Interface.bat</Code> à la racine du dossier Prospection. Une
            fenêtre noire s'ouvre : <strong>laisse-la ouverte</strong> pendant l'utilisation, la fermer arrête l'interface.
          </li>
          <li>
            L'outil est portable : il ne demande ni droits administrateur ni installation dans Windows. Pour le mettre à jour,
            double-clique <Code>Installer ou mettre a jour.bat</Code> dans ton dossier Prospection. Tes campagnes sont
            conservées.
          </li>
        </ul>
      </Section>

      <Section id="campagne" titre="Créer une campagne">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            Clique sur <strong>Nouvelle campagne</strong> en bas de la liste, et donne-lui un nom daté, par exemple{" "}
            <Code>2026-11 Souveraineté du cloud</Code>.
          </li>
          <li>
            Dans l'onglet <strong>Contacts</strong>, définis les objets des mails puis ajoute tes destinataires (un par un, ou
            en les collant depuis Excel). Enregistre.
          </li>
          <li>
            Dans l'onglet <strong>Textes des mails</strong>, rédige Mail1 à Mail4 en t'aidant de l'aperçu. Tant qu'un texte
            contient <Code>[A COMPLETER]</Code>, son étape est bloquée. Enregistre chaque texte.
          </li>
          <li>
            Dans l'onglet <strong>Suivi et brouillons</strong>, crée les brouillons du Mail1, puis relis-les et envoie-les depuis
            Outlook.
          </li>
        </ol>
        <p>
          Une campagne est simplement un dossier dans <Code>Campagnes\</Code> (bouton « Dossier »). Tout se fait depuis
          l'interface : inutile d'ouvrir les fichiers à la main.
        </p>
      </Section>

      <Section id="contacts" titre="Les contacts">
        <p>L'onglet <strong>Contacts</strong> d'une campagne contient une ligne par destinataire :</p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <tbody className="[&_td]:border-b [&_td]:px-3 [&_td]:py-1.5 [&_tr:last-child_td]:border-0">
              <tr><td className="text-foreground">Civilité</td><td>Madame, Monsieur</td></tr>
              <tr><td className="text-foreground">Nom</td><td>Nom de famille</td></tr>
              <tr><td className="text-foreground">Entreprise</td><td>Nom de l'entreprise</td></tr>
              <tr><td className="text-foreground">Téléphone</td><td>Facultatif, pour mémoire</td></tr>
              <tr><td className="text-foreground">E-mail</td><td>Adresse du destinataire (obligatoire, en rouge si invalide ou en double)</td></tr>
              <tr><td className="text-foreground">Objet Mail1 … Mail4</td><td>L'objet de chacun des 4 mails</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>Objets :</strong> en général identiques pour tous. Saisis-les dans le bloc « Objets des mails » puis clique
          « Appliquer à tous ». Les variables <Code>{"{{CIVILITE}}"}</Code>, <Code>{"{{NOM}}"}</Code> et{" "}
          <Code>{"{{ENTREPRISE}}"}</Code> sont remplacées pour chaque contact, par exemple{" "}
          <Code>{"[{{ENTREPRISE}} / Wavestone] Discutons cybersécurité"}</Code>. Un objet vide arrête la séquence à cette étape
          pour ce contact.
        </p>
        <p>
          <strong>Coller depuis Excel :</strong> sélectionne tes lignes dans Excel (colonnes dans l'ordre Civilité, Nom,
          Entreprise, Téléphone, E-mail), copie, puis « Coller depuis Excel ». Les contacts sont ajoutés en fin de liste.
        </p>
        <p>N'oublie pas d'<strong>enregistrer</strong> : un point orange signale des modifications en attente.</p>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Deux règles importantes une fois la campagne lancée</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-inherit">Ne supprime pas et ne réordonne pas</strong> les contacts : ajoute les nouveaux{" "}
              <strong className="text-inherit">en fin de liste</strong>. L'objet de chaque mail dépend de la position du
              contact. Pour arrêter les relances d'un contact, vide plutôt ses objets Mail2 à Mail4.
            </li>
            <li>
              Ne modifie pas l'objet d'une étape déjà envoyée : le suivi ne retrouverait plus ces mails.
            </li>
          </ul>
        </div>
      </Section>

      <Section id="textes" titre="Rédiger les mails">
        <p>
          L'onglet <strong>Textes des mails</strong> affiche l'éditeur à gauche et l'aperçu du mail à droite, avec l'objet,
          pour le contact de ton choix. Les boutons au-dessus de l'éditeur insèrent les variables, le gras, les puces et les
          liens. Tu peux aussi écrire la mise en forme directement :
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <tbody className="[&_td]:border-b [&_td]:px-3 [&_td]:py-1.5 [&_tr:last-child_td]:border-0">
              <tr><td className="font-mono text-foreground">**texte**</td><td><strong>gras</strong></td></tr>
              <tr><td className="font-mono text-foreground">- texte</td><td>puce (en début de ligne)</td></tr>
              <tr><td className="font-mono text-foreground">[texte](https://…)</td><td>lien cliquable</td></tr>
              <tr><td className="font-mono text-foreground">ligne vide</td><td>saut de ligne</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          N'ajoute pas ta signature dans le texte : elle est ajoutée automatiquement. Les relances (Mail2 à Mail4) citent
          automatiquement le mail précédent en dessous.
        </p>
      </Section>

      <Section id="generer" titre="Créer les brouillons">
        <p>
          Dans une campagne, chaque étape a son bouton <strong>Créer les brouillons</strong>. Le chiffre indique combien de
          contacts sont concernés. Après création, va dans le dossier <strong>Brouillons</strong> d'Outlook, relis et
          envoie.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Mail1</strong> : pour tous les contacts qui n'ont encore rien reçu.</li>
          <li>
            <strong>Relances</strong> : uniquement pour les contacts dont le mail précédent est parti depuis au moins{" "}
            <strong>3 jours</strong> et qui n'ont pas répondu.
          </li>
        </ul>
        <p>Tu peux relancer une étape sans risque : l'outil saute automatiquement</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>les contacts qui ont déjà un brouillon ou un mail envoyé pour cette étape ;</li>
          <li>les contacts qui t'ont répondu (il faut alors reprendre la main toi-même) ;</li>
          <li>les lignes sans adresse e-mail ou sans objet pour l'étape.</li>
        </ul>
        <p>Le journal affiché après chaque création indique ce qui a été fait, contact par contact.</p>
      </Section>

      <Section id="statuts" titre="Lire le suivi">
        <div className="space-y-2">
          {([
            ["relance", "Le dernier mail date d'au moins 3 jours : la relance suivante peut être créée."],
            ["afaire", "Aucun mail envoyé pour l'instant : crée le Mail1."],
            ["brouillon", "Un brouillon attend dans Outlook : relis-le et envoie-le."],
            ["attente", "Le dernier mail est trop récent, la date de relance possible est indiquée."],
            ["repondu", "Le contact a écrit depuis le premier envoi : les relances s'arrêtent, à toi de jouer."],
            ["termine", "Les 4 mails (ou toutes les étapes prévues) sont partis, sans réponse."],
          ] as const).map(([code, texte]) => (
            <div key={code} className="flex items-start gap-3">
              <StatutBadge code={code} className="mt-0.5 w-32 justify-center" />
              <span>{texte}</span>
            </div>
          ))}
        </div>
        <p>
          Les dates affichées sont celles d'envoi réel, lues dans Outlook. Le suivi remonte jusqu'à 180 jours en arrière.
          Clique sur <strong>Actualiser</strong> après avoir envoyé des mails.
        </p>
      </Section>

      <Section id="faq" titre="Questions fréquentes">
        <dl className="space-y-3">
          <div>
            <dt className="font-medium text-foreground">« Outlook (classique) ne semble pas ouvert »</dt>
            <dd>Ouvre Outlook classique (pas le nouvel Outlook), attends qu'il soit chargé, puis réessaie.</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Un contact a répondu par un message d'absence</dt>
            <dd>
              L'outil considère tout mail reçu du contact comme une réponse et arrête ses relances. Si c'était seulement
              une absence, relance-le à la main depuis Outlook.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">« Plusieurs signatures Outlook existent… »</dt>
            <dd>
              Choisis une signature pour les nouveaux messages dans Outlook (Fichier &gt; Options &gt; Courrier &gt;
              Signatures).
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Les accents sont cassés dans les objets</dt>
            <dd>
              Le fichier des contacts a été modifié hors de l'interface sans le format UTF-8. Corrige les objets dans l'onglet
              Contacts et enregistre : l'interface enregistre toujours au bon format.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Un contact n'apparaît pas comme envoyé alors qu'il l'est</dt>
            <dd>
              L'objet du mail envoyé doit commencer exactement par la colonne <Code>SujetN</Code> du fichier, et l'adresse
              doit être identique. Vérifie aussi que le mail est dans les Éléments envoyés (et pas archivé).
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">L'interface ne s'ouvre pas</dt>
            <dd>
              Vérifie que la fenêtre noire d'<Code>Interface.bat</Code> est toujours ouverte, puis va sur{" "}
              <Code>http://localhost:8765</Code>. Si elle indique que le port est occupé, une autre fenêtre de l'interface
              est déjà ouverte.
            </dd>
          </div>
        </dl>
      </Section>
    </div>
  )
}
