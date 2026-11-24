import { ArrowRightIcon, CheckCircle2Icon, InboxIcon, MailPlusIcon, MessageSquareReplyIcon, RefreshCwIcon, SendIcon, TimerIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { etapeSuivante, ouvrirBrouillonsOutlook, type Campagne, type Code, type Suivi } from "@/lib/api"
import { lireNomCampagne } from "@/lib/campagne"
import { nomAffiche } from "@/lib/statut"
import { ActionsContact } from "@/ActionsContact"
import { DerniereActualisation } from "@/DerniereActualisation"

/** "1 brouillon" / "3 brouillons" */
const pl = (n: number, singulier: string, pluriel: string) => `${n} ${n > 1 ? pluriel : singulier}`

const versDate = (d?: string) => {
  const m = d?.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null
}

/** Accueil : ce qu'il y a à faire aujourd'hui, toutes campagnes confondues */
export function AFaire(props: {
  suivi: Suivi
  campagnes: Campagne[]
  onOuvrir: (campagne: string, filtre?: Code) => void
  onActualiser: () => void
  chargement: boolean
  onIssueLocale: (campagne: string, email: string, issue: string) => void
}) {
  const { campagnes } = props

  // Brouillons à créer, par campagne et par étape
  const aCreer = campagnes.flatMap((c) =>
    [1, 2, 3, 4]
      .map((n) => ({
        campagne: c,
        etape: n,
        nb: c.Contacts.filter((x) => (n === 1 ? x.Code === "afaire" : x.Code === "relance" && etapeSuivante(x) === n)).length,
        // relance attendue mais pas encore rédigée (aucun objet pour cette étape dans la campagne)
        aRediger: c.Contacts.some((x) => x.Code === "relance" && etapeSuivante(x) === n && x.ARediger),
      }))
      .filter((x) => x.nb > 0),
  )
  const brouillons = campagnes
    .map((c) => ({ campagne: c, nb: c.Contacts.filter((x) => x.Code === "brouillon").length }))
    .filter((x) => x.nb > 0)
  const reponses = campagnes
    .flatMap((c) => c.Contacts.filter((x) => x.Code === "repondu").map((x) => ({ campagne: c, contact: x })))
    .sort((a, b) => (versDate(b.contact.DateReponse)?.getTime() ?? 0) - (versDate(a.contact.DateReponse)?.getTime() ?? 0))
  const prochaines = campagnes
    .flatMap((c) => c.Contacts.filter((x) => x.Code === "attente").map((x) => versDate(x.RelancePossibleLe)))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())

  const nbRdv = campagnes.reduce((s, c) => s + c.Contacts.filter((x) => x.Code === "clos" && x.Issue === "rdv").length, 0)
  const totalCreer = aCreer.reduce((s, x) => s + x.nb, 0)
  const totalBrouillons = brouillons.reduce((s, x) => s + x.nb, 0)
  const rienAFaire = totalCreer === 0 && totalBrouillons === 0

  async function ouvrirOutlook() {
    try {
      await ouvrirBrouillonsOutlook()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const Indicateur = (p: { icone: React.ReactNode; valeur: number; libelle: string }) => (
    <div className="rounded-xl bg-muted/50 p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">{p.icone} {p.libelle}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{p.valeur}</div>
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">À faire</h1>
          <p className="text-sm text-muted-foreground">Toutes tes campagnes, d'après Outlook.</p>
        </div>
        <div className="flex items-center gap-2">
          <DerniereActualisation genereLe={props.suivi.GenereLe} chargement={props.chargement} />
          <Button variant="outline" onClick={props.onActualiser} disabled={props.chargement}>
            <RefreshCwIcon className={props.chargement ? "animate-spin" : ""} /> Actualiser
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicateur icone={<MailPlusIcon className="size-4" />} valeur={totalCreer} libelle="Mails à préparer" />
        <Indicateur icone={<SendIcon className="size-4" />} valeur={totalBrouillons} libelle="Brouillons à envoyer" />
        <Indicateur icone={<MessageSquareReplyIcon className="size-4" />} valeur={reponses.length} libelle="Réponses à traiter" />
        <Indicateur icone={<CheckCircle2Icon className="size-4" />} valeur={nbRdv} libelle="RDV obtenus" />
      </div>

      {rienAFaire && (
        <Card>
          <CardContent className="flex items-center gap-3 py-2 text-sm">
            <CheckCircle2Icon className="size-5 text-emerald-600" />
            <span>
              Rien à préparer ni à envoyer pour l'instant.
              {prochaines.length > 0 &&
                ` Prochaine relance possible le ${prochaines[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.`}
            </span>
          </CardContent>
        </Card>
      )}

      {aCreer.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><MailPlusIcon className="size-4" /> Mails à préparer</CardTitle>
            <CardDescription>Les brouillons sont créés dans Outlook ; rien n'est envoyé sans toi.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {aCreer.map((x) => (
              <div key={`${x.campagne.Nom}-${x.etape}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <div className="font-medium">{lireNomCampagne(x.campagne.Nom).titre}</div>
                  <div className="text-sm text-muted-foreground">
                    {x.etape === 1
                      ? pl(x.nb, "premier mail à créer", "premiers mails à créer")
                      : pl(x.nb, `relance Mail${x.etape} possible`, `relances Mail${x.etape} possibles`)}
                    {x.aRediger && <span className="text-amber-700 dark:text-amber-300"> · Mail{x.etape} à rédiger</span>}
                  </div>
                </div>
                <Button size="sm" onClick={() => props.onOuvrir(x.campagne.Nom, x.etape === 1 ? "afaire" : "relance")}>
                  Préparer <ArrowRightIcon />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {brouillons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><SendIcon className="size-4" /> Brouillons à relire et envoyer</CardTitle>
            <CardDescription>Ils attendent dans le dossier Brouillons d'Outlook.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-1 text-sm">
              {brouillons.map((x) => (
                <li key={x.campagne.Nom}>
                  <button className="hover:underline" onClick={() => props.onOuvrir(x.campagne.Nom, "brouillon")}>
                    {lireNomCampagne(x.campagne.Nom).titre}
                  </button>{" "}
                  <span className="text-muted-foreground">· {pl(x.nb, "brouillon", "brouillons")}</span>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="outline" onClick={ouvrirOutlook}>
              <InboxIcon /> Ouvrir les brouillons dans Outlook
            </Button>
          </CardContent>
        </Card>
      )}

      {reponses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><MessageSquareReplyIcon className="size-4" /> Réponses à traiter</CardTitle>
            <CardDescription>
              Ces contacts ont écrit et leurs relances sont arrêtées. Lis leur réponse, puis indique l'issue (RDV obtenu, pas
              intéressé…) pour la retirer de cette liste.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {reponses.slice(0, 15).map(({ campagne, contact }) => (
              <div key={`${campagne.Nom}-${contact.Email}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <span className="font-medium">{nomAffiche(contact)}</span>
                  {contact.Entreprise && <span className="text-muted-foreground"> · {contact.Entreprise}</span>}
                  <div className="text-xs text-muted-foreground">
                    {lireNomCampagne(campagne.Nom).titre}
                    {contact.DateReponse && ` · réponse du ${contact.DateReponse.slice(0, 5)}`}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <ActionsContact campagne={campagne.Nom} contact={contact} onChange={props.onActualiser} onIssueLocale={props.onIssueLocale} />
                  <Button size="xs" variant="ghost" onClick={() => props.onOuvrir(campagne.Nom, "repondu")} title="Voir la campagne">
                    <ArrowRightIcon />
                  </Button>
                </div>
              </div>
            ))}
            {reponses.length > 15 && (
              <p className="pt-2 text-xs text-muted-foreground">… et {pl(reponses.length - 15, "autre", "autres")}, visibles dans chaque campagne.</p>
            )}
          </CardContent>
        </Card>
      )}

      {prochaines.length > 0 && !rienAFaire && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <TimerIcon className="size-4" />
          {pl(prochaines.length, "relance attend", "relances attendent")} le délai ; la prochaine sera possible le{" "}
          {prochaines[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.
        </p>
      )}
    </div>
  )
}
