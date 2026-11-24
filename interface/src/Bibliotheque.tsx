import { useCallback, useEffect, useMemo, useState } from "react"
import { CopyIcon, FilePenLineIcon, LibraryIcon, Loader2Icon, RefreshCwIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { chargerBibliotheque, type MailType } from "@/lib/api"
import { lireNomCampagne } from "@/lib/campagne"
import { pl } from "@/lib/texte"
import { cn } from "@/lib/utils"

const nomsEtapes = ["", "Mail1", "Mail2 · relance 1", "Mail3 · relance 2", "Mail4 · relance 3"]
const selectClasse = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm"

/** Mail type repris dans l'onglet Textes d'une campagne (à relire puis enregistrer) */
export type MailRepris = { campagne: string; etape: number; objet: string; texte: string; id: number }

/**
 * Bibliothèque de mails type : un exemple réellement envoyé (lu dans Outlook) par campagne et par étape, à
 * consulter, copier, ou reprendre dans une campagne.
 */
export function Bibliotheque(props: { campagnes: string[]; onUtiliser: (m: Omit<MailRepris, "id">) => void }) {
  const [mails, setMails] = useState<MailType[] | null>(null)
  const [genereLe, setGenereLe] = useState("")
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState("")
  const [recherche, setRecherche] = useState("")
  const [campagne, setCampagne] = useState("")
  const [etape, setEtape] = useState(0)
  const [aUtiliser, setAUtiliser] = useState<MailType | null>(null)

  const charger = useCallback(async () => {
    setChargement(true)
    try {
      const r = await chargerBibliotheque()
      setMails(r.Mails)
      setGenereLe(r.GenereLe)
      setErreur("")
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setChargement(false)
    }
  }, [])
  useEffect(() => {
    void charger()
  }, [charger])

  const terme = recherche.trim().toLowerCase()
  const visibles = useMemo(
    () =>
      (mails ?? []).filter(
        (m) =>
          (!campagne || m.Campagne === campagne) &&
          (!etape || (etape === 2 ? m.Etape > 1 : m.Etape === etape)) &&
          (!terme || [m.Objet, m.Texte, lireNomCampagne(m.Campagne).titre].some((v) => v.toLowerCase().includes(terme))),
      ),
    [mails, campagne, etape, terme],
  )
  const campagnesAvecMails = [...new Set((mails ?? []).map((m) => m.Campagne))]

  async function copier(m: MailType) {
    try {
      await navigator.clipboard.writeText(`${m.Objet}\n\n${m.Texte}`)
      toast.success("Objet et texte copiés")
    } catch {
      toast.error("Copie impossible : sélectionne le texte à la main.")
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><LibraryIcon className="size-5" /> Bibliothèque de mails</h1>
          <p className="text-sm text-muted-foreground">
            Les mails réellement envoyés, un exemple par campagne et par étape, lus dans Outlook. Les noms sont remis en
            variables ({"{{NOM}}"}, {"{{ENTREPRISE}}"}…) pour être réutilisés.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {genereLe && <span className="text-xs text-muted-foreground">Lu le {genereLe}</span>}
          <Button variant="outline" onClick={() => void charger()} disabled={chargement}>
            <RefreshCwIcon className={cn(chargement && "animate-spin")} /> Actualiser
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Chercher un mot dans les objets et les textes" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </div>
        <select className={selectClasse} value={campagne} onChange={(e) => setCampagne(e.target.value)} aria-label="Campagne">
          <option value="">Toutes les campagnes</option>
          {campagnesAvecMails.map((c) => (
            <option key={c} value={c}>{lireNomCampagne(c).titre}</option>
          ))}
        </select>
        <div className="flex gap-1">
          {[
            [0, "Tous"],
            [1, "Premiers mails"],
            [2, "Relances"],
          ].map(([v, l]) => (
            <Button key={v} size="sm" variant={etape === v ? "secondary" : "ghost"} onClick={() => setEtape(v as number)}>
              {l}
            </Button>
          ))}
        </div>
      </div>

      {erreur ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">La bibliothèque n'a pas pu être lue</CardTitle>
            <CardDescription>{erreur}</CardDescription>
          </CardHeader>
        </Card>
      ) : !mails ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Lecture des Éléments envoyés d'Outlook…
          </p>
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {mails.length === 0 ? "Aucun mail de campagne envoyé pour l'instant." : "Aucun mail ne correspond."}
        </p>
      ) : (
        <div className="space-y-4">
          {visibles.map((m) => (
            <Card key={`${m.Campagne}-${m.Etape}`}>
              <CardHeader>
                <CardDescription className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium text-foreground">{lireNomCampagne(m.Campagne).titre}</span>
                  <span>· {nomsEtapes[m.Etape]}</span>
                  <span>
                    · envoyé à {pl(m.NbEnvois, "contact", "contacts")} · exemple : {m.Destinataire || "un contact"}, le {m.EnvoyeLe.slice(0, 5)}
                  </span>
                </CardDescription>
                <CardTitle className="text-base">{m.Objet}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="max-h-72 overflow-y-auto rounded-lg bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-wrap">{m.Texte}</div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copier(m)}><CopyIcon /> Copier</Button>
                  <Button size="sm" onClick={() => setAUtiliser(m)}><FilePenLineIcon /> Utiliser pour…</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Utiliser
        mail={aUtiliser}
        campagnes={props.campagnes}
        onFermer={() => setAUtiliser(null)}
        onValider={(c, n) => {
          if (!aUtiliser) return
          setAUtiliser(null)
          props.onUtiliser({ campagne: c, etape: n, objet: aUtiliser.Objet, texte: aUtiliser.Texte })
        }}
      />
    </div>
  )
}

/** Choix de la campagne et de l'étape où reprendre un mail type */
function Utiliser(props: { mail: MailType | null; campagnes: string[]; onFermer: () => void; onValider: (campagne: string, etape: number) => void }) {
  const [campagne, setCampagne] = useState("")
  const [etape, setEtape] = useState(1)
  useEffect(() => {
    if (!props.mail) return
    setCampagne(props.campagnes[0] ?? "")
    setEtape(props.mail.Etape)
  }, [props.mail]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AlertDialog open={!!props.mail} onOpenChange={(o) => !o && props.onFermer()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Utiliser ce mail</AlertDialogTitle>
          <AlertDialogDescription>
            L'objet et le texte sont repris dans l'onglet « Textes des mails » de la campagne choisie. Rien n'est enregistré
            tant que tu n'as pas relu et cliqué sur « Enregistrer ».
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Campagne</span>
            <select className={selectClasse} value={campagne} onChange={(e) => setCampagne(e.target.value)}>
              {props.campagnes.map((c) => (
                <option key={c} value={c}>{lireNomCampagne(c).titre}{lireNomCampagne(c).date && ` · ${lireNomCampagne(c).date}`}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Étape</span>
            <select className={selectClasse} value={etape} onChange={(e) => setEtape(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{nomsEtapes[n]}</option>
              ))}
            </select>
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <Button disabled={!campagne} onClick={() => props.onValider(campagne, etape)}>Reprendre dans cette campagne</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
