import { useEffect, useState, type ReactNode } from "react"
import { ArrowUpIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatutBadge } from "@/StatutBadge"

/** Plan du guide : parties et sections (sert au sommaire) */
const plan = [
  {
    partie: "Bien démarrer",
    sections: [
      { id: "principe", titre: "Le principe" },
      { id: "journee", titre: "Ta journée type" },
      { id: "prerequis", titre: "Prérequis" },
    ],
  },
  {
    partie: "Préparer une campagne",
    sections: [
      { id: "campagne", titre: "Créer une campagne" },
      { id: "objets", titre: "Les objets des mails" },
      { id: "contacts", titre: "Ajouter des contacts" },
      { id: "textes", titre: "Rédiger les mails" },
      { id: "personnalises", titre: "Un objet ou un texte différent pour un contact" },
      { id: "regles", titre: "Les règles à respecter" },
    ],
  },
  {
    partie: "Envoyer et suivre",
    sections: [
      { id: "afaire", titre: "La page « À faire »" },
      { id: "brouillons", titre: "Créer et envoyer les brouillons" },
      { id: "delai", titre: "Choisir quand relancer" },
      { id: "statuts", titre: "Comprendre les statuts" },
      { id: "reponses", titre: "Traiter les réponses" },
    ],
  },
  {
    partie: "Aide",
    sections: [
      { id: "maj", titre: "Mettre à jour l'outil" },
      { id: "faq", titre: "Questions fréquentes" },
    ],
  },
]
const toutesSections = plan.flatMap((p) => p.sections)

function aller(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

// Mise en page « lecture continue » : pas de cartes ni d'encadrés arrondis, seulement des titres, des traits fins
// et un liseré de couleur pour les astuces et mises en garde.
function Partie({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="pt-6">
      <h2 className="border-b-2 border-foreground pb-1.5 text-sm font-semibold tracking-wide uppercase">{titre}</h2>
      <div className="divide-y">{children}</div>
    </div>
  )
}

function Section({ id, titre, children }: { id: string; titre: string; children: ReactNode }) {
  return (
    <section id={id} data-section className="scroll-mt-6 py-5">
      <h3 className="mb-2 text-base font-semibold">{titre}</h3>
      <div className="space-y-3 leading-relaxed text-muted-foreground [&_strong]:text-foreground">{children}</div>
    </section>
  )
}

const Code = ({ children }: { children: ReactNode }) => <code className="font-mono text-[0.85rem] text-foreground">{children}</code>

const Astuce = ({ children }: { children: ReactNode }) => (
  <div className="border-l-2 border-sky-500 pl-3 text-sm">
    <span className="font-medium text-sky-700 dark:text-sky-300">Astuce · </span>
    {children}
  </div>
)

const Attention = ({ children }: { children: ReactNode }) => (
  <div className="border-l-2 border-amber-500 pl-3 text-sm [&_strong]:text-foreground">{children}</div>
)

/** Sommaire collant : reste visible au défilement et met en évidence la section lue */
function Sommaire() {
  const [active, setActive] = useState(toutesSections[0].id)
  useEffect(() => {
    // La zone qui défile est <main> (pas la fenêtre). Section active : la dernière dont le titre a passé
    // le haut de la zone ; tout en bas de page, la dernière section.
    const zone = document.querySelector("main")
    if (!zone) return
    const calculer = () => {
      const haut = zone.getBoundingClientRect().top + 120
      let courante = toutesSections[0].id
      for (const s of toutesSections) {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top <= haut) courante = s.id
      }
      if (zone.scrollTop + zone.clientHeight >= zone.scrollHeight - 4) courante = toutesSections[toutesSections.length - 1].id
      setActive(courante)
    }
    calculer()
    zone.addEventListener("scroll", calculer, { passive: true })
    return () => zone.removeEventListener("scroll", calculer)
  }, [])

  return (
    <nav className="sticky top-0 hidden max-h-[calc(100svh-3rem)] space-y-4 overflow-y-auto text-sm lg:block" aria-label="Sommaire du guide">
      <p className="font-medium">Sommaire</p>
      {plan.map((p) => (
        <div key={p.partie} className="space-y-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{p.partie}</p>
          {p.sections.map((s) => (
            <button
              key={s.id}
              onClick={() => aller(s.id)}
              className={cn(
                "block w-full border-l-2 py-0.5 pl-3 text-left transition-colors",
                active === s.id
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {s.titre}
            </button>
          ))}
        </div>
      ))}
      <button onClick={() => aller("haut-du-guide")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowUpIcon className="size-3.5" /> Haut de page
      </button>
    </nav>
  )
}

export function Guide() {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="min-w-0 space-y-2">
        <div id="haut-du-guide" className="scroll-mt-6">
          <h1 className="text-xl font-semibold">Guide d'utilisation</h1>
          <p className="text-sm text-muted-foreground">
            Tout ce qu'il faut savoir pour mener une campagne de prospection par e-mail, de la liste de contacts au rendez-vous.
          </p>
        </div>

        {/* Sommaire compact pour les petits écrans (le sommaire latéral n'y est pas affiché) */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm lg:hidden">
          {toutesSections.map((s) => (
            <button key={s.id} onClick={() => aller(s.id)} className="text-muted-foreground underline-offset-2 hover:underline">
              {s.titre}
            </button>
          ))}
        </div>

        <Partie titre="Bien démarrer">
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
              Le suivi lit tes Éléments envoyés et ta Boîte de réception pour savoir où en est chaque contact : mails partis,
              réponses reçues, relances possibles.
            </p>
          </Section>

          <Section id="journee" titre="Ta journée type">
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Ouvre Outlook, puis l'interface (raccourci « Prospection Outlook »).</li>
              <li>
                Va sur <strong>À faire</strong> : tout ce qui t'attend, toutes campagnes confondues.
              </li>
              <li>
                <strong>Prépare</strong> les mails et relances proposés (« Préparer » puis « Créer les brouillons »).
              </li>
              <li>
                Clique sur <strong>Ouvrir les brouillons dans Outlook</strong>, relis et envoie.
              </li>
              <li>
                <strong>Traite les réponses</strong> : lis-les, réponds depuis Outlook, puis indique l'issue (RDV obtenu…).
              </li>
            </ol>
          </Section>

          <Section id="prerequis" titre="Prérequis">
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
                L'outil se lance avec le raccourci <strong>Prospection Outlook</strong> (l'icône enveloppe, dans ton dossier Prospection ou sur le Bureau). Il
                s'ouvre dans <strong>sa propre fenêtre</strong>, et une <strong>icône près de l'horloge</strong> permet de le
                rouvrir ou de le quitter (clic droit). Fermer la fenêtre suffit : l'outil s'arrête seul quelques minutes plus
                tard.
              </li>
              <li>L'outil est portable : ni droits administrateur, ni installation dans Windows.</li>
            </ul>
          </Section>
        </Partie>

        <Partie titre="Préparer une campagne">
          <Section id="campagne" titre="Créer une campagne">
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                Clique sur <strong>Nouvelle campagne</strong> en bas à gauche : donne un titre (par exemple « Souveraineté du
                cloud ») et choisis le mois et l'année de lancement.
              </li>
              <li>Onglet <strong>Contacts</strong> : ajoute tes destinataires.</li>
              <li>Onglet <strong>Textes des mails</strong> : pour Mail1 à Mail4, saisis l'objet et rédige le texte.</li>
              <li>Onglet <strong>Suivi et brouillons</strong> : crée les brouillons du Mail1.</li>
            </ol>
            <p>
              Tout se fait depuis l'interface. Une campagne est un dossier de <Code>Campagnes\</Code> (bouton « Dossier ») : inutile
              d'ouvrir les fichiers à la main.
            </p>
          </Section>

          <Section id="objets" titre="Les objets des mails">
            <p>
              L'objet de chaque étape se saisit dans l'onglet <strong>Textes des mails</strong>, au-dessus du texte, avec «
              tous les contacts » choisi. Il s'applique à tous les contacts, y compris ceux ajoutés plus tard. Pour donner un
              autre objet à un contact précis, choisis-le dans la même liste (voir « Un objet ou un texte différent pour un
              contact »).
            </p>
            <p>
              Les variables <Code>{"{{CIVILITE}}"}</Code>, <Code>{"{{PRENOM}}"}</Code>, <Code>{"{{NOM}}"}</Code> et{" "}
              <Code>{"{{ENTREPRISE}}"}</Code> sont remplacées pour chaque contact, par exemple{" "}
              <Code>{"[{{ENTREPRISE}}] Discutons cybersécurité"}</Code>.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Un objet vide</strong> arrête la séquence à cette étape (par exemple : pas de Mail4).
              </li>
              <li>
                <strong>Chaque étape doit avoir un objet différent</strong>, par exemple en ajoutant « Re: » devant : l'outil
                reconnaît une étape à son objet. Une alerte rouge signale les objets identiques.
              </li>
              <li>
                Changer l'objet d'une étape déjà envoyée ne touche pas les contacts qui ont déjà reçu ce mail : ils gardent leur
                objet, pour que le suivi retrouve leur mail.
              </li>
            </ul>
          </Section>

          <Section id="contacts" titre="Ajouter des contacts">
            <p>
              <strong>Ajouter en masse</strong> (le plus rapide) : clique sur le bouton, colle, vérifie l'aperçu, ajoute. Sont
              acceptés :
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                des lignes copiées depuis <strong>Excel</strong> (ou un CSV), avec ou sans en-têtes, colonnes dans n'importe
                quel ordre. Une liste en tête de chaque colonne de l'aperçu permet de corriger ;
              </li>
              <li>des destinataires copiés depuis <strong>Outlook</strong> (« DUPONT Jean &lt;jean.dupont@acme.fr&gt;; … ») ;</li>
              <li>une simple <strong>liste d'adresses</strong>.</li>
            </ul>
            <p>
              Prénom, nom et entreprise manquants sont déduits des adresses de type <Code>prenom.nom@entreprise.fr</Code>. Les
              adresses déjà présentes et invalides sont ignorées.
            </p>
            <Astuce>
              Dans le tableau, colle un bloc copié depuis Excel directement dans une case : il remplit les cases suivantes comme
              dans Excel. <strong>Entrée</strong> passe à la ligne suivante.
            </Astuce>
            <div className="overflow-x-auto border-y">
              <table className="w-full text-sm">
                <tbody className="[&_td]:border-b [&_td]:px-3 [&_td]:py-1.5 [&_tr:last-child_td]:border-0">
                  <tr><td className="text-foreground">Civilité, Prénom, Nom</td><td>Utilisés dans les variables des objets et des textes</td></tr>
                  <tr><td className="text-foreground">Entreprise</td><td>Variable {"{{ENTREPRISE}}"}</td></tr>
                  <tr><td className="text-foreground">Téléphone</td><td>Facultatif, pour mémoire</td></tr>
                  <tr><td className="text-foreground">E-mail</td><td>Obligatoire ; en rouge si invalide ou en double</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              Tant que des modifications ne sont pas enregistrées, une barre reste affichée en bas de l'écran (et une pastille
              orange sur l'onglet) : clique sur <strong>Enregistrer</strong>.
            </p>
          </Section>

          <Section id="textes" titre="Rédiger les mails">
            <p>
              L'onglet <strong>Textes des mails</strong> affiche l'éditeur à gauche et l'<strong>aperçu</strong> à droite (objet
              compris), pour le contact de ton choix. Les boutons insèrent les variables, le gras, les puces et les liens.
            </p>
            <div className="overflow-x-auto border-y">
              <table className="w-full text-sm">
                <tbody className="[&_td]:border-b [&_td]:px-3 [&_td]:py-1.5 [&_tr:last-child_td]:border-0">
                  <tr><td className="font-mono text-foreground">**texte**</td><td><strong>gras</strong></td></tr>
                  <tr><td className="font-mono text-foreground">- texte</td><td>puce (en début de ligne)</td></tr>
                  <tr><td className="font-mono text-foreground">[texte](https://…)</td><td>lien cliquable</td></tr>
                  <tr><td className="font-mono text-foreground">ligne vide</td><td>saut de ligne</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc space-y-1 pl-5">
              <li>Ta signature est ajoutée automatiquement : ne la recopie pas.</li>
              <li>Les relances citent automatiquement le mail précédent en dessous.</li>
              <li>
                Tant qu'un texte contient <Code>[A COMPLETER]</Code>, son étape est bloquée.
              </li>
            </ul>
          </Section>

          <Section id="personnalises" titre="Un objet ou un texte différent pour un contact">
            <p>
              Pour n'importe quelle étape (Mail1 à Mail4), un contact peut recevoir un <strong>objet</strong> et/ou un{" "}
              <strong>texte entièrement différents</strong> de ceux de la campagne.
            </p>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Onglet <strong>Textes des mails</strong>, choisis l'étape.</li>
              <li>
                Dans la liste <strong>« Mail1 pour »</strong>, remplace « tous les contacts » par le contact voulu.
              </li>
              <li>
                Modifie son <strong>objet</strong> dans le champ « Objet pour … ».
              </li>
              <li>
                Pour le texte, clique sur <strong>Écrire un texte pour …</strong> : le texte commun est recopié comme point de
                départ. Modifie-le librement (les variables fonctionnent toujours).
              </li>
              <li><strong>Enregistrer</strong> enregistre l'objet et le texte.</li>
            </ol>
            <ul className="list-disc space-y-1 pl-5">
              <li>Ce contact reçoit son objet et son texte ; tous les autres gardent ceux de la campagne.</li>
              <li>
                Les contacts concernés sont listés sous le texte commun, marqués « perso » dans les onglets d'étape, et signalés
                dans le suivi (« Texte perso : Mail1, Mail3 »).
              </li>
              <li>
                <strong>Supprimer l'objet personnalisé</strong> et <strong>Supprimer le mail personnalisé</strong> lui redonnent
                l'objet et le texte de la campagne (une confirmation est demandée).
              </li>
              <li>
                Ne change pas l'objet d'une étape déjà envoyée à ce contact : le suivi ne retrouverait plus le mail (un message
                orange le rappelle).
              </li>
            </ul>
            <Attention>
              Le texte personnalisé est rattaché à l'<strong>adresse e-mail</strong> du contact : si tu changes son adresse, il
              reçoit de nouveau le texte commun. L'ancien texte reste visible dans la liste (« n'est plus dans les contacts ») pour
              le recopier ou le supprimer.
            </Attention>
          </Section>

          <Section id="regles" titre="Les règles à respecter">
            <Attention>
              <p className="font-medium text-amber-700 dark:text-amber-300">Une fois la campagne lancée</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>
                  <strong>Ne supprime pas et ne réordonne pas</strong> les contacts : ajoute les nouveaux{" "}
                  <strong>en fin de liste</strong>. Pour arrêter les relances d'un contact, clos-le plutôt (voir « Traiter les
                  réponses »).
                </li>
                <li>
                  Ne modifie ni l'adresse, ni l'objet (ni le nom ou l'entreprise s'ils apparaissent dans l'objet) d'un contact qui
                  a déjà reçu un mail : le suivi ne retrouverait plus ce mail. L'interface signale ces modifications en orange
                  et demande confirmation.
                </li>
                <li>Ne modifie pas l'objet d'une étape déjà envoyée.</li>
              </ul>
            </Attention>
          </Section>
        </Partie>

        <Partie titre="Envoyer et suivre">
          <Section id="afaire" titre="La page « À faire »">
            <p>
              C'est la page d'accueil. Elle résume toutes tes campagnes : <strong>mails à préparer</strong>,{" "}
              <strong>brouillons à envoyer</strong>, <strong>réponses à traiter</strong> et nombre de <strong>RDV obtenus</strong>.
              Un clic sur « Préparer » ouvre la bonne campagne, déjà filtrée.
            </p>
            <p>
              L'heure de la dernière lecture d'Outlook est affichée à côté de <strong>Actualiser</strong> ; elle passe en orange
              au-delà de 4 heures. Actualise après avoir envoyé des mails.
            </p>
          </Section>

          <Section id="brouillons" titre="Créer et envoyer les brouillons">
            <p>
              Dans l'onglet <strong>Suivi et brouillons</strong>, chaque étape a son bouton <strong>Créer les brouillons</strong>.
              La carte indique combien de contacts sont prêts ; si personne ne l'est, la confirmation explique pourquoi.
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong>Mail1</strong> : pour les contacts qui n'ont encore rien reçu.</li>
              <li>
                <strong>Relances</strong> : pour ceux qui n'ont pas répondu et dont le mail précédent date d'au moins le délai de
                la campagne.
              </li>
            </ul>
            <p>
              Ensuite, <strong>Ouvrir les brouillons dans Outlook</strong> affiche le dossier Brouillons : relis et envoie.
            </p>
            <Astuce>
              Tu peux relancer une étape sans risque : les contacts qui ont déjà un brouillon ou un mail pour cette étape, ceux
              qui ont répondu ou qui sont clos, et les lignes incomplètes sont sautés. Le journal détaille ce qui a été fait.
            </Astuce>
          </Section>

          <Section id="delai" titre="Choisir quand relancer">
            <p>
              Sous le nom de la campagne : « Relancer au plus tôt <em>N</em> jour(s) après le mail précédent ». Le délai vaut{" "}
              <strong>3 jours</strong> par défaut et est propre à chaque campagne.
            </p>
            <p>
              Mets <strong>0</strong> pour pouvoir relancer à tout moment : c'est alors toi qui décides en cliquant sur « Créer
              les brouillons ».
            </p>
          </Section>

          <Section id="statuts" titre="Comprendre les statuts">
            <div className="space-y-2">
              {([
                ["afaire", "Aucun mail envoyé pour l'instant : crée le Mail1."],
                ["brouillon", "Un brouillon attend dans Outlook : relis-le et envoie-le."],
                ["attente", "Le dernier mail est trop récent : la date de relance possible est indiquée."],
                ["relance", "Le délai est écoulé : la relance suivante peut être créée."],
                ["repondu", "Le contact a écrit : ses relances s'arrêtent. Lis sa réponse puis indique l'issue."],
                ["clos", "L'issue est indiquée (RDV obtenu, pas intéressé…) : plus aucun mail ne lui est préparé."],
                ["termine", "Toutes les étapes prévues sont parties, sans réponse."],
              ] as const).map(([code, texte]) => (
                <div key={code} className="flex items-start gap-3">
                  <StatutBadge code={code} className="mt-0.5 w-36 justify-center" />
                  <span>{texte}</span>
                </div>
              ))}
            </div>
            <p>Les dates sont celles d'envoi réel, lues dans Outlook (jusqu'à 180 jours en arrière).</p>
          </Section>

          <Section id="reponses" titre="Traiter les réponses">
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                <strong>Lire la réponse</strong> ouvre le mail du contact dans Outlook. Réponds-lui depuis Outlook.
              </li>
              <li>
                Choisis l'<strong>issue</strong> : RDV obtenu, intéressé à suivre, à recontacter plus tard, pas intéressé,
                mauvais interlocuteur ou traité.
              </li>
            </ol>
            <p>
              Le contact est alors <strong>clos</strong> : plus aucun mail ne lui est préparé, et il quitte la liste des réponses à
              traiter. <strong>Rouvrir</strong> annule.
            </p>
            <Astuce>
              Tu peux aussi clore un contact qui n'a pas répondu par mail (après un appel, un salon…) avec la liste « Clore… » :
              ses relances s'arrêtent.
            </Astuce>
          </Section>
        </Partie>

        <Partie titre="Aide">
          <Section id="maj" titre="Mettre à jour l'outil">
            <p>
              Va dans <strong>Paramètres</strong> (en bas à gauche) : version installée, nouveautés, et bouton{" "}
              <strong>Mettre à jour</strong>. La mise à jour prend environ une minute, ne touche jamais à tes campagnes, et
              l'interface redémarre seule : la page se recharge d'elle-même sur la nouvelle version. Une pastille signale quand une nouvelle version est disponible.
            </p>
            <p>
              Seules les <strong>versions publiées</strong> (releases v1.7.0, v1.8.0…) sont installées, jamais un travail en cours.
            </p>
          </Section>

          <Section id="faq" titre="Questions fréquentes">
            <dl className="space-y-3">
              {[
                ["« Outlook (classique) ne semble pas ouvert »", "Ouvre Outlook classique (pas le nouvel Outlook), attends qu'il soit chargé, puis réessaie."],
                ["Un contact a répondu par un message d'absence", "Les réponses automatiques (absence du bureau, « Réponse automatique », « Automatic reply »…) sont ignorées : ses relances continuent. Si un message d'absence est quand même compté comme une réponse, relance-le à la main depuis Outlook."],
                ["Où l'outil cherche-t-il les réponses ?", "Dans la Boîte de réception et tous ses sous-dossiers (y compris ceux remplis par tes règles Outlook), sur les 12 derniers mois. Une réponse archivée ailleurs (dossier Archive, autre boîte) n'est pas vue : clos alors le contact avec « Clore… »."],
                ["« objet identique à celui du MailN »", "Deux étapes ont le même objet pour ce contact : l'outil ne peut pas savoir laquelle est partie, il ne prépare donc rien. Donne un objet différent à chaque étape (par exemple « Re: » devant)."],
                ["Un contact n'apparaît pas comme envoyé alors qu'il l'est", "L'objet du mail envoyé doit commencer exactement par l'objet de l'étape, à la même adresse. Vérifie aussi qu'il est dans les Éléments envoyés (pas archivé), et que tu n'as pas modifié le contact après l'envoi."],
                ["« Plusieurs signatures Outlook existent… »", "Choisis une signature pour les nouveaux messages : Outlook > Fichier > Options > Courrier > Signatures."],
                ["L'interface ne s'ouvre pas", "Clic droit sur l'icône Prospection près de l'horloge (dans la flèche ^ si elle est masquée) : « Ouvrir Prospection ». Sinon « Journal » montre ce qui s'est passé, ou lance « Programme\\Interface.bat /console » pour voir le journal en direct dans une fenêtre noire."],
                ["« Prospection Outlook est fermé »", "L'outil a été quitté (icône près de l'horloge) ou s'est arrêté : double-clique le raccourci Prospection Outlook, la page se recharge d'elle-même."],
                ["« Route inconnue » ou message de redémarrage", "L'outil vient d'être mis à jour : quitte-le (icône près de l'horloge) puis relance-le. Les versions récentes redémarrent seules."],
              ].map(([q, r]) => (
                <div key={q}>
                  <dt className="font-medium text-foreground">{q}</dt>
                  <dd>{r}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </Partie>
      </div>

      <Sommaire />
    </div>
  )
}
