import { ArrowRightIcon, CalendarDaysIcon, CheckCircle2Icon, InboxIcon, MailPlusIcon, MessageSquareReplyIcon, PenLineIcon, RefreshCwIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { etapeSuivante, ouvrirBrouillonsOutlook, type Campagne, type Code, type Contact, type Suivi } from "@/lib/api"
import { lireNomCampagne } from "@/lib/campagne"
import { pl } from "@/lib/texte"
import { nomAffiche } from "@/lib/statut"
import { cn } from "@/lib/utils"
import { ActionsContact } from "@/ActionsContact"
import { DerniereActualisation } from "@/DerniereActualisation"

const versDate = (d?: string) => {
  const m = d?.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null
}
const titre = (c: Campagne) => lireNomCampagne(c.Nom).titre
const jourLong = (d: Date) => {
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Contact à préparer pour l'étape n : Mail1 jamais créé, ou relance possible pour cette étape */
const aPreparer = (x: Contact, n: number) => (n === 1 ? x.Code === "afaire" : x.Code === "relance" && etapeSuivante(x) === n)
/** Brouillon de l'étape n qui attend dans Outlook */
const aEnvoyer = (x: Contact, n: number) => x.Code === "brouillon" && etapeSuivante(x) === n
/** Relance de l'étape n qui attend la fin du délai */
const aVenir = (x: Contact, n: number) => x.Code === "attente" && etapeSuivante(x) === n
const envoye = (x: Contact, n: number) => !![x.Mail1, x.Mail2, x.Mail3, x.Mail4][n - 1]

/** Étiquette « Mail 2 » placée devant chaque ligne */
function Etiquette(p: { etape: number; alerte?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
        p.alerte ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-muted text-muted-foreground",
      )}
    >
      Mail {p.etape}
    </span>
  )
}

function Numero(p: { n: number }) {
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{p.n}</span>
  )
}

function Ligne(p: { libelle: string; valeur: number; fort?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{p.libelle}</span>
      <span className={cn("tabular-nums", p.valeur === 0 ? "text-muted-foreground/60" : p.fort ? "font-semibold" : "font-medium")}>
        {p.valeur}
      </span>
    </div>
  )
}

/** Accueil : ce qu'il y a à faire, toutes campagnes confondues, rangé par étape de la séquence */
export function AFaire(props: {
  suivi: Suivi
  campagnes: Campagne[]
  onOuvrir: (campagne: string, filtre?: Code) => void
  /** Ouvre l'onglet Textes de la campagne sur l'étape donnée */
  onRediger: (campagne: string, etape: number) => void
  onActualiser: () => void
  chargement: boolean
  onIssueLocale: (campagne: string, email: string, issue: string) => void
}) {
  const { campagnes } = props
  const tous = campagnes.flatMap((c) => c.Contacts)
  const nbEtapes = Math.min(4, Math.max(1, ...tous.map((x) => x.NbEtapes || 1)))
  const etapes = Array.from({ length: nbEtapes }, (_, i) => i + 1)

  // Vue d'ensemble : une colonne par étape
  const colonnes = etapes.map((n) => ({
    etape: n,
    preparer: tous.filter((x) => aPreparer(x, n)).length,
    envoyer: tous.filter((x) => aEnvoyer(x, n)).length,
    venir: tous.filter((x) => aVenir(x, n)).length,
    envoyes: tous.filter((x) => envoye(x, n)).length,
    aRediger: tous.some((x) => (aPreparer(x, n) || aVenir(x, n)) && x.ARediger),
  }))

  // 1. Brouillons à créer, par étape puis par campagne
  const aCreer = etapes.flatMap((n) =>
    campagnes
      .map((c) => {
        const liste = c.Contacts.filter((x) => aPreparer(x, n))
        return { campagne: c, etape: n, nb: liste.length, aRediger: liste.some((x) => x.ARediger) }
      })
      .filter((x) => x.nb > 0),
  )
  // 2. Brouillons à relire et envoyer, par étape puis par campagne
  const brouillons = etapes.flatMap((n) =>
    campagnes.map((c) => ({ campagne: c, etape: n, nb: c.Contacts.filter((x) => aEnvoyer(x, n)).length })).filter((x) => x.nb > 0),
  )
  // 3. Réponses, les plus récentes d'abord
  const reponses = campagnes
    .flatMap((c) => c.Contacts.filter((x) => x.Code === "repondu").map((x) => ({ campagne: c, contact: x })))
    .sort((a, b) => (versDate(b.contact.DateReponse)?.getTime() ?? 0) - (versDate(a.contact.DateReponse)?.getTime() ?? 0))

  // Prochains jours : relances qui deviennent possibles, regroupées par date
  const parDate = new Map<number, { date: Date; etapes: Map<number, number>; campagnes: Set<string>; aRediger: boolean }>()
  for (const c of campagnes)
    for (const x of c.Contacts.filter((x) => x.Code === "attente")) {
      const d = versDate(x.RelancePossibleLe)
      if (!d) continue
      const j = parDate.get(d.getTime()) ?? { date: d, etapes: new Map<number, number>(), campagnes: new Set<string>(), aRediger: false }
      const n = etapeSuivante(x)
      j.etapes.set(n, (j.etapes.get(n) ?? 0) + 1)
      j.campagnes.add(titre(c))
      j.aRediger ||= !!x.ARediger
      parDate.set(d.getTime(), j)
    }
  const prochains = [...parDate.values()].sort((a, b) => a.date.getTime() - b.date.getTime())

  const nbRdv = tous.filter((x) => x.Code === "clos" && x.Issue === "rdv").length
  const totalCreer = aCreer.reduce((s, x) => s + x.nb, 0)
  const totalBrouillons = brouillons.reduce((s, x) => s + x.nb, 0)
  const rienAFaire = totalCreer === 0 && totalBrouillons === 0 && reponses.length === 0

  async function ouvrirOutlook() {
    try {
      await ouvrirBrouillonsOutlook()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">À faire</h1>
          <p className="text-sm text-muted-foreground">Toutes tes campagnes, d'après Outlook, rangées par étape.</p>
        </div>
        <div className="flex items-center gap-2">
          <DerniereActualisation genereLe={props.suivi.GenereLe} chargement={props.chargement} />
          <Button variant="outline" onClick={props.onActualiser} disabled={props.chargement}>
            <RefreshCwIcon className={props.chargement ? "animate-spin" : ""} /> Actualiser
          </Button>
        </div>
      </div>

      {/* Vue d'ensemble : une colonne par mail de la séquence, puis les réponses */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {colonnes.map((c) => (
          <div key={c.etape} className={cn("space-y-1 rounded-xl border bg-card p-3", c.aRediger && "border-amber-400 dark:border-amber-700")}>
            <div className="mb-1.5 font-medium">Mail {c.etape}</div>
            <Ligne libelle="À préparer" valeur={c.preparer} fort />
            <Ligne libelle="À envoyer" valeur={c.envoyer} fort />
            {c.etape > 1 && <Ligne libelle="À venir" valeur={c.venir} />}
            <Ligne libelle="Envoyés" valeur={c.envoyes} />
            {c.aRediger && (
              <div className="flex items-center gap-1 pt-1 text-xs text-amber-700 dark:text-amber-300">
                <PenLineIcon className="size-3" /> Texte à rédiger
              </div>
            )}
          </div>
        ))}
        <div className="space-y-1 rounded-xl border bg-card p-3">
          <div className="mb-1.5 font-medium">Réponses</div>
          <Ligne libelle="À traiter" valeur={reponses.length} fort />
          <Ligne libelle="RDV obtenus" valeur={nbRdv} />
        </div>
      </div>

      {rienAFaire && (
        <Card>
          <CardContent className="flex items-center gap-3 py-2 text-sm">
            <CheckCircle2Icon className="size-5 text-emerald-600" />
            <span>
              Rien à préparer, à envoyer ni à traiter pour l'instant.
              {prochains.length > 0 && ` Prochaine relance possible : ${jourLong(prochains[0].date).toLowerCase()}.`}
            </span>
          </CardContent>
        </Card>
      )}

      {aCreer.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Numero n={1} /> <MailPlusIcon className="size-4" /> Préparer les brouillons
            </CardTitle>
            <CardDescription>Les brouillons sont créés dans Outlook ; rien n'est envoyé sans toi.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {aCreer.map((x) => (
              <div key={`${x.campagne.Nom}-${x.etape}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Etiquette etape={x.etape} alerte={x.aRediger} />
                  <div className="min-w-0">
                    <div className="font-medium">{titre(x.campagne)}</div>
                    <div className="text-sm text-muted-foreground">
                      {x.etape === 1 ? pl(x.nb, "premier mail à créer", "premiers mails à créer") : pl(x.nb, "relance à créer", "relances à créer")}
                      {x.aRediger && (
                        <span className="text-amber-700 dark:text-amber-300"> · le texte du Mail {x.etape} n'est pas encore écrit</span>
                      )}
                    </div>
                  </div>
                </div>
                {x.aRediger ? (
                  <Button size="sm" variant="outline" onClick={() => props.onRediger(x.campagne.Nom, x.etape)}>
                    <PenLineIcon /> Rédiger le Mail {x.etape}
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => props.onOuvrir(x.campagne.Nom, x.etape === 1 ? "afaire" : "relance")}>
                    Préparer <ArrowRightIcon />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {brouillons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Numero n={2} /> <SendIcon className="size-4" /> Relire et envoyer dans Outlook
            </CardTitle>
            <CardDescription>Ils attendent dans le dossier Brouillons d'Outlook. Actualise après les avoir envoyés.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="divide-y">
              {brouillons.map((x) => (
                <div key={`${x.campagne.Nom}-${x.etape}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Etiquette etape={x.etape} />
                    <span className="font-medium">{titre(x.campagne)}</span>
                    <span className="text-sm text-muted-foreground">· {pl(x.nb, "brouillon", "brouillons")}</span>
                  </div>
                  <Button size="xs" variant="ghost" onClick={() => props.onOuvrir(x.campagne.Nom, "brouillon")} title="Voir les contacts">
                    Voir <ArrowRightIcon />
                  </Button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={ouvrirOutlook}>
              <InboxIcon /> Ouvrir les brouillons dans Outlook
            </Button>
          </CardContent>
        </Card>
      )}

      {reponses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Numero n={3} /> <MessageSquareReplyIcon className="size-4" /> Traiter les réponses
            </CardTitle>
            <CardDescription>
              Ces contacts ont écrit et leurs relances sont arrêtées. Lis leur réponse, puis indique l'issue (RDV obtenu, pas
              intéressé…) pour la retirer de cette liste.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {reponses.slice(0, 15).map(({ campagne, contact }) => {
              const dernier = etapeSuivante(contact) - 1
              return (
                <div key={`${campagne.Nom}-${contact.Email}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <span className="font-medium">{nomAffiche(contact)}</span>
                    {contact.Entreprise && <span className="text-muted-foreground"> · {contact.Entreprise}</span>}
                    <div className="text-xs text-muted-foreground">
                      {titre(campagne)}
                      {dernier > 0 && ` · a répondu après le Mail ${dernier}`}
                      {contact.DateReponse && `, le ${contact.DateReponse.slice(0, 5)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ActionsContact campagne={campagne.Nom} contact={contact} onChange={props.onActualiser} onIssueLocale={props.onIssueLocale} />
                    <Button size="xs" variant="ghost" onClick={() => props.onOuvrir(campagne.Nom, "repondu")} title="Voir la campagne">
                      <ArrowRightIcon />
                    </Button>
                  </div>
                </div>
              )
            })}
            {reponses.length > 15 && (
              <p className="pt-2 text-xs text-muted-foreground">… et {pl(reponses.length - 15, "autre", "autres")}, visibles dans chaque campagne.</p>
            )}
          </CardContent>
        </Card>
      )}

      {prochains.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><CalendarDaysIcon className="size-4" /> Prochains jours</CardTitle>
            <CardDescription>Relances qui attendent la fin du délai : elles passeront dans « Préparer les brouillons » à ces dates.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {prochains.slice(0, 7).map((j) => (
              <div key={j.date.getTime()} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{jourLong(j.date)}</div>
                  <div className="truncate text-xs text-muted-foreground">{[...j.campagnes].join(" · ")}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[...j.etapes.entries()]
                    .sort((a, b) => a[0] - b[0])
                    .map(([n, nb]) => (
                      <span key={n} className="flex items-center gap-1">
                        <Etiquette etape={n} /> <span className="tabular-nums text-muted-foreground">× {nb}</span>
                      </span>
                    ))}
                  {j.aRediger && <span className="text-xs text-amber-700 dark:text-amber-300">texte à rédiger</span>}
                </div>
              </div>
            ))}
            {prochains.length > 7 && (
              <p className="pt-2 text-xs text-muted-foreground">… et {pl(prochains.length - 7, "autre date", "autres dates")}.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
