import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BookOpenIcon,
  CircleArrowUpIcon,
  SettingsIcon,
  InboxIcon,
  ListTodoIcon,
  SearchIcon,
  FileTextIcon,
  FolderOpenIcon,
  Loader2Icon,
  MailPlusIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  TimerIcon,
  CopyIcon,
  PenLineIcon,
  PencilIcon,
  ArrowRightLeftIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EditeurContacts } from "@/EditeurContacts"
import { EditeurTextes } from "@/EditeurTextes"
import { ActionsContact } from "@/ActionsContact"
import { AFaire } from "@/AFaire"
import { DerniereActualisation } from "@/DerniereActualisation"
import { Guide } from "@/Guide"
import { detailStatut, nomAffiche } from "@/lib/statut"
import { NouvelleCampagne } from "@/NouvelleCampagne"
import { SigneDeVie } from "@/SigneDeVie"
import { Parametres } from "@/Parametres"
import { dateCourte, lireNomCampagne } from "@/lib/campagne"
import {
  chargerFichiers,
  chargerVersion,
  chargerSuivi,
  creerCampagne,
  deplacerContacts,
  renommerCampagne,
  enregistrerCc,
  enregistrerDelai,
  etapeSuivante,
  genererBrouillons,
  ouvrirBrouillonsOutlook,
  ouvrirDossier,
  type Campagne,
  type Code,
  type Fichiers,
  type Suivi,
} from "@/lib/api"
import { ccInvalide, decouperAdresses } from "@/lib/apercu"
import { cn } from "@/lib/utils"
import { StatutBadge, statuts } from "@/StatutBadge"

/** Contact en cours de glisser-déposer vers une autre campagne */
export type ContactGlisse = { campagne: string; emails: string[]; noms: string }

const nomsEtapes = ["", "Mail1", "Mail2 · relance 1", "Mail3 · relance 2", "Mail4 · relance 3"]
const GUIDE = "__guide__"
const AFAIRE = "__afaire__"
const PARAMETRES = "__parametres__"

function lireSelection() {
  try {
    return localStorage.getItem("campagne") || AFAIRE
  } catch {
    return AFAIRE
  }
}

export default function App() {
  const [suivi, setSuivi] = useState<Suivi | null>(null)
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<{ message: string; journal?: string } | null>(null)
  const [selection, setSelection] = useState(lireSelection)
  const [filtre, setFiltre] = useState<Code | null>(null)
  const [aConfirmer, setAConfirmer] = useState<{ etape: number; nb: number; raison?: string } | null>(null)
  const [enCours, setEnCours] = useState<number | null>(null)
  const [journal, setJournal] = useState<{ titre: string; texte: string; ok: boolean } | null>(null)
  const [nouvelle, setNouvelle] = useState<string | null>(null)
  const [aRenommer, setARenommer] = useState<string | null>(null)
  // Glisser-déposer d'un contact sur une campagne de la barre de gauche
  const [glisse, setGlisse] = useState<ContactGlisse | null>(null)
  const [survol, setSurvol] = useState<string | null>(null)
  const [aDeplacer, setADeplacer] = useState<(ContactGlisse & { cible: string }) | null>(null)
  const [deplacement, setDeplacement] = useState(false)
  // Incrémenté après un déplacement : la campagne affichée relit ses fichiers
  const [rechargement, setRechargement] = useState(0)
  const [onglet, setOnglet] = useState("suivi")
  const [etapeTexte, setEtapeTexte] = useState(1)
  const [modifs, setModifs] = useState<Record<string, boolean>>({})
  const modifsEnCours = Object.values(modifs).some(Boolean)

  // Avertit avant de fermer l'onglet du navigateur avec des modifications non enregistrées
  useEffect(() => {
    if (!modifsEnCours) return
    const avertir = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", avertir)
    return () => window.removeEventListener("beforeunload", avertir)
  }, [modifsEnCours])
  const signalerModif = useCallback((zone: string, m: boolean) => setModifs((x) => (x[zone] === m ? x : { ...x, [zone]: m })), [])

  /** Clôt un contact dans l'affichage, sans relire Outlook (l'enregistrement se fait en arrière-plan) */
  const majIssueLocale = useCallback((nomCampagne: string, email: string, issue: string) => {
    const aujourdhui = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
    setSuivi((s) =>
      s && {
        ...s,
        Campagnes: s.Campagnes.map((c) =>
          c.Nom !== nomCampagne
            ? c
            : {
                ...c,
                Contacts: c.Contacts.map((x) => {
                  if (x.Email.trim().toLowerCase() !== email.trim().toLowerCase()) return x
                  if (issue) return { ...x, Code: "clos" as const, Issue: issue, IssueLe: aujourdhui, IssueNote: "" }
                  // Rouvrir : même logique que Suivi-Campagnes.ps1, à partir des dates déjà connues
                  const derniere = [1, 2, 3, 4].filter((n) => x[`Mail${n}` as "Mail1"]).pop() ?? 0
                  const m = x.RelancePossibleLe?.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
                  const possibleLe = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null
                  const code: Code = x.DateReponse
                    ? "repondu"
                    : derniere === 0
                      ? "afaire"
                      : derniere + 1 > x.NbEtapes
                        ? "termine"
                        : possibleLe && possibleLe.getTime() > Date.now()
                          ? "attente"
                          : "relance"
                  return { ...x, Code: code, Issue: "", IssueLe: "", IssueNote: "" }
                }),
              },
        ),
      },
    )
  }, [])

  const actualiser = useCallback(async () => {
    setChargement(true)
    try {
      setSuivi(await chargerSuivi())
      setErreur(null)
    } catch (e) {
      const err = e as Error & { journal?: string }
      setErreur({ message: err.message, journal: err.journal })
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    void actualiser()
  }, [actualiser])

  // Vérifie si une mise à jour est disponible (pastille sur « Paramètres ») : au démarrage, puis toutes les heures
  // et quand la fenêtre revient au premier plan (au plus une fois par quart d'heure). L'API GitHub sans compte est
  // limitée à 60 appels par heure.
  const [majDispo, setMajDispo] = useState(false)
  // Version installée, affichée à côté du nom de l'outil (lecture locale, sans attendre GitHub)
  const [versionInstallee, setVersionInstallee] = useState("")
  useEffect(() => {
    chargerVersion(true)
      .then((v) => setVersionInstallee(v.installee?.version ?? ""))
      .catch(() => {})
    let derniere = 0
    const verifier = () => {
      if (Date.now() - derniere < 15 * 60_000) return
      derniere = Date.now()
      chargerVersion()
        .then((v) => v.aJour !== null && setMajDispo(!v.aJour))
        .catch(() => {})
    }
    verifier()
    const minuteur = window.setInterval(verifier, 60 * 60_000)
    const auPremierPlan = () => document.visibilityState === "visible" && verifier()
    window.addEventListener("focus", auPremierPlan)
    document.addEventListener("visibilitychange", auPremierPlan)
    return () => {
      window.clearInterval(minuteur)
      window.removeEventListener("focus", auPremierPlan)
      document.removeEventListener("visibilitychange", auPremierPlan)
    }
  }, [])

  function choisir(nom: string, filtreInitial: Code | null = null) {
    if (nom === selection && !filtreInitial) return
    if (nom !== selection && modifsEnCours && !window.confirm("Des modifications ne sont pas enregistrées. Les abandonner ?")) return
    if (nom !== selection) setModifs({})
    setSelection(nom)
    setFiltre(filtreInitial)
    setOnglet("suivi")
    try {
      localStorage.setItem("campagne", nom)
    } catch {
      /* stockage indisponible : sans importance */
    }
  }

  // les plus récentes en premier (le nom de dossier commence par AAAA-MM)
  const campagnes = [...(suivi?.Campagnes ?? [])].sort((a, b) => b.Nom.localeCompare(a.Nom))
  const campagne: Campagne | undefined =
    selection === GUIDE || selection === AFAIRE || selection === PARAMETRES ? undefined : (campagnes.find((c) => c.Nom === selection) ?? campagnes[0])
  const totalAFaire = campagnes.reduce(
    (s, c) => s + c.Contacts.filter((x) => ["relance", "afaire", "brouillon"].includes(x.Code)).length,
    0,
  )

  async function ouvrirOutlook() {
    try {
      await ouvrirBrouillonsOutlook()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function lancer(etape: number) {
    if (!campagne) return
    setAConfirmer(null)
    setEnCours(etape)
    try {
      const r = await genererBrouillons(campagne.Nom, etape)
      setJournal({ titre: `${nomsEtapes[etape]} · ${lireNomCampagne(campagne.Nom).titre}`, texte: r.journal, ok: r.ok })
      if (r.ok) toast.success("Brouillons créés dans Outlook")
      else toast.error("La création a échoué, voir le journal")
      void actualiser()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setEnCours(null)
    }
  }

  async function ouvrirLeDossier() {
    if (!campagne) return
    try {
      await ouvrirDossier(campagne.Nom)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function renommer(ancien: string, nom: string) {
    try {
      const r = await renommerCampagne(ancien, nom)
      setARenommer(null)
      toast.success(`Campagne renommée : « ${lireNomCampagne(r.nom).titre} »`)
      if (selection === ancien) {
        setSelection(r.nom)
        try {
          localStorage.setItem("campagne", r.nom)
        } catch {
          /* stockage indisponible : sans importance */
        }
      }
      await actualiser()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** Un contact lâché sur une campagne : vérifications, puis confirmation */
  function deposer(cible: string) {
    const g = glisse
    setSurvol(null)
    setGlisse(null)
    if (!g || g.campagne === cible) return
    if (modifs.contacts) {
      toast.error("Enregistre ou annule d'abord les modifications de l'onglet Contacts.")
      return
    }
    const dejaLa = campagnes.find((c) => c.Nom === cible)?.Contacts.some((x) => g.emails.includes(x.Email.trim().toLowerCase()))
    if (dejaLa) {
      toast.error(`${g.noms} est déjà dans « ${lireNomCampagne(cible).titre} ».`)
      return
    }
    setADeplacer({ ...g, cible })
  }

  async function confirmerDeplacement() {
    if (!aDeplacer) return
    setDeplacement(true)
    try {
      await deplacerContacts(aDeplacer.campagne, aDeplacer.cible, aDeplacer.emails)
      toast.success(`${aDeplacer.noms} déplacé(e) vers « ${lireNomCampagne(aDeplacer.cible).titre} »`)
      setADeplacer(null)
      setRechargement((n) => n + 1)
      await actualiser()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeplacement(false)
    }
  }

  // Contacts déplacés déjà contactés dans leur campagne actuelle (mails envoyés ou brouillon en attente)
  const dejaContactes = aDeplacer
    ? (campagnes.find((c) => c.Nom === aDeplacer.campagne)?.Contacts ?? []).filter(
        (x) => aDeplacer.emails.includes(x.Email.trim().toLowerCase()) && (x.Mail1 || x.Code === "brouillon"),
      )
    : []

  async function valider(nom: string) {
    try {
      const r = await creerCampagne(nom)
      setNouvelle(null)
      toast.success(`Campagne « ${lireNomCampagne(r.nom).titre} » créée : remplis ses contacts et ses textes.`)
      choisir(r.nom)
      await actualiser()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="flex h-svh bg-background text-foreground">
      <SigneDeVie />
      <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/30">
        <div className="flex items-center gap-2 px-4 py-4">
          <MailPlusIcon className="size-5" />
          <span className="font-semibold">Prospection</span>
          {versionInstallee && (
            <button
              className="text-xs text-muted-foreground tabular-nums hover:text-foreground"
              onClick={() => choisir(PARAMETRES)}
              title="Version installée : voir les mises à jour"
            >
              {versionInstallee}
            </button>
          )}
        </div>
        <div className="px-2 pb-3">
          <button
            onClick={() => choisir(AFAIRE)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
              selection === AFAIRE && "bg-muted font-medium",
            )}
          >
            <span className="flex items-center gap-2"><ListTodoIcon className="size-4" /> À faire</span>
            {totalAFaire > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {totalAFaire}
              </span>
            )}
          </button>
        </div>
        <div className="px-4 pb-1 text-xs font-medium text-muted-foreground">Campagnes</div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {!suivi && chargement && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="mx-2 my-2 h-5" />)}
          {campagnes.map((c) => {
            const aTraiter = c.Contacts.filter((x) => ["relance", "afaire", "brouillon"].includes(x.Code)).length
            return (
              <button
                key={c.Nom}
                onClick={() => choisir(c.Nom)}
                onDragOver={(e) => {
                  if (!glisse || glisse.campagne === c.Nom) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = "move"
                  if (survol !== c.Nom) setSurvol(c.Nom)
                }}
                onDragLeave={() => survol === c.Nom && setSurvol(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  deposer(c.Nom)
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  campagne?.Nom === c.Nom && "bg-muted font-medium",
                  glisse && glisse.campagne !== c.Nom && "outline-1 outline-dashed outline-muted-foreground/40",
                  survol === c.Nom && "bg-sky-100 outline-sky-500 dark:bg-sky-950",
                )}
              >
                <span className="min-w-0" title={c.Nom}>
                  <span className="block truncate">{lireNomCampagne(c.Nom).titre}</span>
                  {lireNomCampagne(c.Nom).date && (
                    <span className="block text-xs font-normal text-muted-foreground">{dateCourte(lireNomCampagne(c.Nom))}</span>
                  )}
                </span>
                {aTraiter > 0 && (
                  <span
                    title={`${aTraiter} contact(s) à traiter : mail à préparer ou brouillon à envoyer`}
                    className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  >
                    {aTraiter}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
        <div className="space-y-1 border-t p-2">
          <Button variant="ghost" className="w-full justify-start" onClick={() => setNouvelle("")}>
            <PlusIcon /> Nouvelle campagne
          </Button>
          <Button
            variant={selection === GUIDE ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => choisir(GUIDE)}
          >
            <BookOpenIcon /> Guide d'utilisation
          </Button>
          <Button
            variant={selection === PARAMETRES ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => choisir(PARAMETRES)}
          >
            <SettingsIcon /> Paramètres
            {majDispo && (
              <span
                className="ml-auto flex items-center gap-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900 dark:bg-sky-950 dark:text-sky-200"
                title="Une nouvelle version est disponible : clique pour l'installer"
              >
                <CircleArrowUpIcon className="size-3.5" /> Mise à jour dispo
              </span>
            )}
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {selection === GUIDE ? (
          <Guide />
        ) : selection === PARAMETRES ? (
          <Parametres modifsEnCours={modifsEnCours} />
        ) : selection === AFAIRE && suivi && campagnes.length > 0 ? (
          <AFaire suivi={suivi} campagnes={campagnes} onOuvrir={(nom, f) => choisir(nom, f ?? null)} onActualiser={actualiser} chargement={chargement} onIssueLocale={majIssueLocale} />
        ) : erreur && !suivi ? (
          <EcranErreur erreur={erreur} onReessayer={actualiser} chargement={chargement} />
        ) : !campagne ? (
          chargement || !suivi ? (
            <ChargementSuivi />
          ) : (
            <Card className="mx-auto max-w-md">
              <CardHeader>
                <CardTitle>Lance ta première campagne</CardTitle>
                <CardDescription>
                  Crée une campagne, ajoute tes contacts et rédige tes mails. Le guide explique chaque étape.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button onClick={() => setNouvelle("")}><PlusIcon /> Nouvelle campagne</Button>
                <Button variant="outline" onClick={() => choisir(GUIDE)}><BookOpenIcon /> Lire le guide</Button>
              </CardContent>
            </Card>
          )
        ) : (
          <VueCampagne
            campagne={campagne}
            suivi={suivi!}
            chargement={chargement}
            filtre={filtre}
            setFiltre={setFiltre}
            enCours={enCours}
            onActualiser={actualiser}
            onGenerer={(etape, nb, raison) => setAConfirmer({ etape, nb, raison })}
            onOuvrirDossier={ouvrirLeDossier}
            onglet={onglet}
            setOnglet={setOnglet}
            etapeTexte={etapeTexte}
            setEtapeTexte={setEtapeTexte}
            onModifie={signalerModif}
            modifs={modifs}
            onIssueLocale={majIssueLocale}
            onRenommer={() => (modifsEnCours ? toast.error("Enregistre d'abord tes modifications en cours.") : setARenommer(campagne.Nom))}
            onGlisser={(g) => setGlisse(g)}
            rechargement={rechargement}
          />
        )}
      </main>

      <AlertDialog open={!!aConfirmer} onOpenChange={(o) => !o && setAConfirmer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Créer les brouillons {aConfirmer && nomsEtapes[aConfirmer.etape]} ?</AlertDialogTitle>
            <AlertDialogDescription>
              {aConfirmer?.nb
                ? `${aConfirmer.nb} contact(s) semblent concernés. `
                : `${aConfirmer?.raison || "Aucun contact ne semble concerné pour l'instant."} L'outil vérifiera à nouveau dans Outlook. `}
              Les brouillons seront créés dans Outlook. Rien n'est envoyé : tu relis et tu envoies toi-même.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button onClick={() => aConfirmer && lancer(aConfirmer.etape)}>Créer les brouillons</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!journal} onOpenChange={(o) => !o && setJournal(null)}>
        <AlertDialogContent className="data-[size=default]:max-w-2xl data-[size=default]:sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{journal?.ok ? "Brouillons créés" : "La création a échoué"}</AlertDialogTitle>
            <AlertDialogDescription>
              {journal?.titre}. {journal?.ok && "Relis-les puis envoie-les depuis le dossier Brouillons d'Outlook."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {journal?.texte || "(aucun message)"}
          </pre>
          <AlertDialogFooter>
            <AlertDialogCancel>Fermer</AlertDialogCancel>
            {journal?.ok && (
              <Button onClick={() => void ouvrirOutlook()}>
                <InboxIcon /> Ouvrir les brouillons dans Outlook
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NouvelleCampagne ouvert={nouvelle !== null} onFermer={() => setNouvelle(null)} onCreer={(nom) => void valider(nom)} />
      <NouvelleCampagne
        ouvert={aRenommer !== null}
        actuel={aRenommer ?? undefined}
        onFermer={() => setARenommer(null)}
        onCreer={(nom) => aRenommer && void renommer(aRenommer, nom)}
      />

      <AlertDialog open={!!aDeplacer} onOpenChange={(o) => !o && !deplacement && setADeplacer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Déplacer {aDeplacer?.noms} vers « {aDeplacer && lireNomCampagne(aDeplacer.cible).titre} » ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Le contact est retiré de « {aDeplacer && lireNomCampagne(aDeplacer.campagne).titre} » et ajouté en fin de liste de
              l'autre campagne, avec ses objets communs. Son texte personnalisé, s'il en a un, le suit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dejaContactes.length > 0 && (
            <p className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
              <span>
                {dejaContactes.some((x) => x.Mail1)
                  ? "Ce contact a déjà reçu des mails de cette campagne : ils ne seront plus suivis, et il recevra le Mail1 de la nouvelle campagne."
                  : "Un brouillon de cette campagne l'attend dans Outlook : supprime-le pour ne pas l'envoyer par erreur."}
              </span>
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deplacement}>Annuler</AlertDialogCancel>
            <Button onClick={() => void confirmerDeplacement()} disabled={deplacement}>
              {deplacement ? <Loader2Icon className="animate-spin" /> : <ArrowRightLeftIcon />} Déplacer
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function VueCampagne(props: {
  campagne: Campagne
  suivi: Suivi
  chargement: boolean
  filtre: Code | null
  setFiltre: (c: Code | null) => void
  enCours: number | null
  onActualiser: () => void
  onGenerer: (etape: number, nb: number, raison?: string) => void
  onOuvrirDossier: () => void
  onglet: string
  setOnglet: (o: string) => void
  etapeTexte: number
  setEtapeTexte: (n: number) => void
  onModifie: (zone: string, modifie: boolean) => void
  modifs: Record<string, boolean>
  onIssueLocale: (campagne: string, email: string, issue: string) => void
  onRenommer: () => void
  /** Début du glisser d'un contact (vers une campagne de la barre de gauche) ; null à la fin */
  onGlisser: (g: ContactGlisse | null) => void
  rechargement: number
}) {
  const { campagne, suivi, chargement, filtre, setFiltre, enCours, onglet, setOnglet } = props
  const contacts = campagne.Contacts

  // Contenu des fichiers (contacts.csv, Textes\MailN.txt), pour les éditeurs
  const [fichiers, setFichiers] = useState<Fichiers | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => setFichiers(null), [campagne.Nom])
  useEffect(() => {
    // Rechargé au changement de campagne et après chaque enregistrement. Les éditeurs ne sont pas
    // recréés (même clé) : les modifications en cours dans l'autre éditeur sont conservées.
    let actif = true
    chargerFichiers(campagne.Nom)
      .then((f) => actif && setFichiers(f))
      .catch((e) => toast.error((e as Error).message))
    return () => {
      actif = false
    }
  }, [campagne.Nom, version, props.rechargement])
  const campagneDemarree = contacts.some((c) => c.Mail1)
  // Étapes déjà envoyées par adresse : sert à alerter si on modifie un contact déjà contacté
  const envois = useMemo(() => {
    const r: Record<string, number[]> = {}
    contacts.forEach((c) => {
      const etapes = [1, 2, 3, 4].filter((n) => c[`Mail${n}` as "Mail1"])
      if (c.Email && etapes.length) r[c.Email.trim().toLowerCase()] = etapes
    })
    return r
  }, [contacts])
  /** Après un enregistrement, et bouton Actualiser : relit contacts.csv et les textes, puis le suivi Outlook */
  const apresEnregistrement = () => {
    setVersion((v) => v + 1)
    props.onActualiser()
  }

  const compteurs = useMemo(() => {
    const r: Partial<Record<Code, number>> = {}
    contacts.forEach((c) => (r[c.Code] = (r[c.Code] ?? 0) + 1))
    return r
  }, [contacts])

  const etapes = [1, 2, 3, 4].map((n) => {
    const texte = campagne.Textes.find((t) => t.Etape === n)?.Etat ?? "absent"
    const aCreer = contacts.filter((c) =>
      n === 1 ? c.Code === "afaire" : c.Code === "relance" && etapeSuivante(c) === n,
    ).length
    const brouillons = contacts.filter((c) => c.Code === "brouillon" && etapeSuivante(c) === n).length
    const envoyes = contacts.filter((c) => c[`Mail${n}` as "Mail1"]).length
    const prevus = contacts.filter((c) => c.NbEtapes >= n).length
    const enAttente = n === 1 ? 0 : contacts.filter((c) => c.Code === "attente" && etapeSuivante(c) === n).length
    // Pourquoi personne n'est prêt : affiché dans la confirmation
    const concernes = contacts.filter((c) => c.NbEtapes >= n && !c[`Mail${n}` as "Mail1"])
    const detail = [
      prevus === 0 && `aucun contact n'a d'objet pour Mail${n} (onglet Textes des mails)`,
      enAttente > 0 && `${enAttente} attendent le délai de ${campagne.DelaiRelance} jour(s)`,
      brouillons > 0 && `${brouillons} ont déjà un brouillon à envoyer`,
      n > 1 && concernes.filter((c) => etapeSuivante(c) < n && c.Code !== "repondu").length > 0 &&
        `${concernes.filter((c) => etapeSuivante(c) < n && c.Code !== "repondu").length} n'ont pas encore reçu Mail${n - 1}`,
      concernes.filter((c) => c.Code === "repondu").length > 0 &&
        `${concernes.filter((c) => c.Code === "repondu").length} ont répondu`,
    ].filter(Boolean)
    const raison = detail.length ? `Personne n'est prêt pour l'instant : ${detail.join(", ")}.` : ""
    return { n, texte, aCreer, brouillons, envoyes, prevus, enAttente, raison }
  })

  const [recherche, setRecherche] = useState("")
  const terme = recherche.trim().toLowerCase()
  const visibles = contacts.filter(
    (c) =>
      (!filtre || c.Code === filtre) &&
      (!terme || [c.Prenom, c.Nom, c.Entreprise, c.Email].some((v) => (v ?? "").toLowerCase().includes(terme))),
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-baseline gap-x-3 text-xl font-semibold">
            {lireNomCampagne(campagne.Nom).titre}
            {lireNomCampagne(campagne.Nom).date && (
              <span className="text-sm font-normal text-muted-foreground">{lireNomCampagne(campagne.Nom).date}</span>
            )}
            <Button variant="ghost" size="icon-xs" className="self-center text-muted-foreground" onClick={props.onRenommer} title="Renommer la campagne (titre, mois)">
              <PencilIcon />
            </Button>
          </h1>
          <p className="text-sm text-muted-foreground">{contacts.length} contact(s)</p>
          <ReglageDelai key={campagne.Nom} campagne={campagne.Nom} delai={campagne.DelaiRelance} onEnregistre={props.onActualiser} />
          <ReglageCc key={`cc-${campagne.Nom}`} campagne={campagne.Nom} cc={campagne.Cc ?? ""} onEnregistre={props.onActualiser} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DerniereActualisation genereLe={suivi.GenereLe} chargement={chargement} />
          <Button variant="outline" onClick={apresEnregistrement} disabled={chargement} title="Relit Outlook, contacts.csv et les textes">
            <RefreshCwIcon className={cn(chargement && "animate-spin")} /> Actualiser
          </Button>
          <Button variant="outline" onClick={props.onOuvrirDossier}><FolderOpenIcon /> Dossier</Button>
        </div>
      </div>

      <Tabs value={onglet} onValueChange={(v) => setOnglet(String(v))}>
        <TabsList>
          <TabsTrigger value="suivi"><MailPlusIcon /> Suivi et brouillons</TabsTrigger>
          <TabsTrigger value="contacts">
            <UsersIcon /> Contacts ({contacts.length})
            {props.modifs.contacts && <span className="size-1.5 rounded-full bg-amber-500" title="Modifications non enregistrées" />}
          </TabsTrigger>
          <TabsTrigger value="textes">
            <FileTextIcon /> Textes des mails
            {props.modifs.textes && <span className="size-1.5 rounded-full bg-amber-500" title="Modifications non enregistrées" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="pt-4" keepMounted>
          {fichiers ? (
            <EditeurContacts
              key={campagne.Nom}
              onGlisser={props.onGlisser}
              campagne={campagne.Nom}
              colonnes={fichiers.colonnes}
              contacts={fichiers.contacts}
              objets={fichiers.objets}
              campagneDemarree={campagneDemarree}
              envois={envois}
              onEnregistre={apresEnregistrement}
              onModifie={(m) => props.onModifie("contacts", m)}
            />
          ) : (
            <Skeleton className="h-64" />
          )}
        </TabsContent>

        <TabsContent value="textes" className="pt-4" keepMounted>
          {fichiers ? (
            <EditeurTextes
              key={campagne.Nom}
              campagne={campagne.Nom}
              textes={fichiers.textes}
              personnalises={fichiers.personnalises}
              contacts={fichiers.contacts}
              envois={envois}
              contactsModifies={!!props.modifs.contacts}
              objets={fichiers.objets}
              etape={props.etapeTexte}
              setEtape={props.setEtapeTexte}
              onEnregistre={apresEnregistrement}
              onModifie={(m) => props.onModifie("textes", m)}
            />
          ) : (
            <Skeleton className="h-96" />
          )}
        </TabsContent>

        <TabsContent value="suivi" className="space-y-6 pt-4">

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {etapes.map((e) => {
          const bloque = e.texte !== "pret"
          return (
            <Card key={e.n} size="sm">
              <CardHeader>
                <CardTitle className="text-sm">{nomsEtapes[e.n]}</CardTitle>
                <CardDescription>
                  {e.envoyes}/{e.prevus} envoyé(s)
                  {e.brouillons > 0 && ` · ${e.brouillons} brouillon(s) à envoyer`}
                </CardDescription>
              </CardHeader>
              {/* flex-1 + mt-auto : les boutons restent alignés en bas des 4 cartes, quelle que soit la longueur du message */}
              <CardContent className="flex flex-1 flex-col gap-2">
                {e.prevus === 0 && contacts.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Étape non prévue (aucun objet Mail{e.n}).{" "}
                    <button className="underline underline-offset-2 hover:text-foreground" onClick={() => { props.setEtapeTexte(e.n); setOnglet("textes") }}>
                      Ajouter cette relance
                    </button>
                  </p>
                ) : bloque ? (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                    {e.texte === "absent" ? "Texte pas encore créé." : "Texte à compléter avant de créer les brouillons."}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {e.aCreer > 0 ? `${e.aCreer} contact(s) prêt(s)` : "Aucun contact prêt pour l'instant"}
                    {e.enAttente > 0 && ` · ${e.enAttente} en attente du délai de ${campagne.DelaiRelance} j`}
                  </p>
                )}
                <div className="mt-auto flex gap-2">
                  <Button
                    size="sm"
                    className="min-w-0 flex-1"
                    variant={e.aCreer > 0 && !bloque ? "default" : "outline"}
                    disabled={bloque || e.prevus === 0 || enCours !== null}
                    onClick={() => props.onGenerer(e.n, e.aCreer, e.raison)}
                    title="Créer les brouillons"
                  >
                    {enCours === e.n ? <Loader2Icon className="animate-spin" /> : <MailPlusIcon />}
                    {/* truncate : sur une carte étroite, le libellé se raccourcit au lieu de pousser le bouton Texte hors de la carte */}
                    <span className="truncate">{enCours === e.n ? "Création…" : "Créer les brouillons"}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      props.setEtapeTexte(e.n)
                      setOnglet("textes")
                    }}
                    title="Modifier le texte"
                  >
                    <FileTextIcon /> Texte
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un contact"
            className="h-7 w-52 pl-7 text-sm"
          />
        </div>
        <Button size="sm" variant={filtre === null ? "secondary" : "ghost"} onClick={() => setFiltre(null)}>
          Tous ({contacts.length})
        </Button>
        {(Object.keys(statuts) as Code[])
          .filter((c) => compteurs[c])
          .map((c) => (
            <Button key={c} size="sm" variant={filtre === c ? "secondary" : "ghost"} onClick={() => setFiltre(filtre === c ? null : c)}>
              {statuts[c].libelle} ({compteurs[c]})
            </Button>
          ))}
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Contact</TableHead>
              <TableHead>Entreprise</TableHead>
              {[1, 2, 3, 4].map((n) => <TableHead key={n}>Mail{n}</TableHead>)}
              <TableHead>Statut</TableHead>
              <TableHead className="pr-4">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {contacts.length === 0
                    ? "Aucun contact. Ajoute-les dans l'onglet « Contacts »."
                    : "Aucun contact ne correspond."}
                </TableCell>
              </TableRow>
            )}
            {visibles.map((c, i) => (
              <TableRow
                key={`${i}-${c.Email}`}
                draggable={!!c.Email}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move"
                  e.dataTransfer.setData("text/plain", c.Email)
                  props.onGlisser({ campagne: campagne.Nom, emails: [c.Email.trim().toLowerCase()], noms: nomAffiche(c) })
                }}
                onDragEnd={() => props.onGlisser(null)}
                className="cursor-grab active:cursor-grabbing"
                title="Glisse ce contact sur une campagne, à gauche, pour l'y déplacer"
              >
                <TableCell className="pl-4">
                  <div className="font-medium">{nomAffiche(c)}</div>
                  <div className="text-xs text-muted-foreground">{c.Email || "adresse manquante"}</div>
                  {(c.TextesPerso?.length ?? 0) > 0 && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-sky-700 dark:text-sky-400">
                      <PenLineIcon className="size-3" /> Texte perso : {c.TextesPerso!.map((n) => `Mail${n}`).join(", ")}
                    </div>
                  )}
                </TableCell>
                <TableCell>{c.Entreprise}</TableCell>
                {[1, 2, 3, 4].map((n) => (
                  <TableCell key={n} className="tabular-nums">
                    {n > c.NbEtapes ? (
                      <span className="text-muted-foreground/50">–</span>
                    ) : (
                      c[`Mail${n}` as "Mail1"].slice(0, 5) || <span className="text-muted-foreground/50">·</span>
                    )}
                  </TableCell>
                ))}
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatutBadge code={c.Code} issue={c.Issue} />
                    <span className="text-xs text-muted-foreground">{detailStatut(c)}</span>
                  </div>
                </TableCell>
                <TableCell className="pr-4">
                  <ActionsContact campagne={campagne.Nom} contact={c} onChange={props.onActualiser} onIssueLocale={props.onIssueLocale} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Délai minimal entre deux mails de la séquence, propre à la campagne (0 = pas d'attente) */
function ReglageDelai(props: { campagne: string; delai: number; onEnregistre: () => void }) {
  const [valeur, setValeur] = useState(String(props.delai ?? 3))
  const [sauvegarde, setSauvegarde] = useState(false)
  const n = Number(valeur)
  const valide = valeur.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 90
  const modifie = valide && n !== props.delai

  async function enregistrer() {
    setSauvegarde(true)
    try {
      await enregistrerDelai(props.campagne, n)
      toast.success(n === 0 ? "Relances possibles sans délai" : `Relance possible ${n} jour(s) après le mail précédent`)
      props.onEnregistre()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSauvegarde(false)
    }
  }

  return (
    <form
      className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
      onSubmit={(e) => {
        e.preventDefault()
        if (modifie) void enregistrer()
      }}
    >
      <TimerIcon className="size-4" />
      <span>Relancer au plus tôt</span>
      <Input
        type="number"
        min={0}
        max={90}
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
        aria-invalid={!valide || undefined}
        className="h-7 w-16 px-2 text-center"
        aria-label="Délai avant relance, en jours"
      />
      <span>jour(s) après le mail précédent</span>
      {modifie && (
        <Button type="submit" size="sm" disabled={sauvegarde}>
          {sauvegarde ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Enregistrer
        </Button>
      )}
      {valeur === "0" && !modifie && <span className="text-xs">(relance possible à tout moment)</span>}
    </form>
  )
}

/** Adresses mises en copie (CC) de tous les brouillons de la campagne */
function ReglageCc(props: { campagne: string; cc: string; onEnregistre: () => void }) {
  const [valeur, setValeur] = useState(props.cc)
  const [sauvegarde, setSauvegarde] = useState(false)
  const normaliser = (t: string) => decouperAdresses(t).join("; ")
  const invalide = ccInvalide(valeur)
  const modifie = !invalide && normaliser(valeur) !== normaliser(props.cc)

  async function enregistrer() {
    setSauvegarde(true)
    try {
      await enregistrerCc(props.campagne, normaliser(valeur))
      const n = decouperAdresses(valeur).length
      toast.success(n === 0 ? "Plus personne en copie des mails" : `${n} adresse(s) en copie de tous les mails de la campagne`)
      setValeur(normaliser(valeur))
      props.onEnregistre()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSauvegarde(false)
    }
  }

  return (
    <form
      className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
      onSubmit={(e) => {
        e.preventDefault()
        if (modifie) void enregistrer()
      }}
    >
      <CopyIcon className="size-4" />
      <span title="Ces adresses sont mises en copie de chaque brouillon de la campagne (Mail1 et relances).">En copie (CC) des mails</span>
      <Input
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
        placeholder="aucune (adresses séparées par ;)"
        aria-invalid={invalide || undefined}
        className="h-7 w-80 max-w-full px-2"
        aria-label="Adresses en copie de tous les mails de la campagne"
      />
      {modifie && (
        <Button type="submit" size="sm" disabled={sauvegarde}>
          {sauvegarde ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Enregistrer
        </Button>
      )}
      {invalide && <span className="text-xs text-destructive">adresse invalide</span>}
    </form>
  )
}

function ChargementSuivi() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> Lecture d'Outlook en cours (envoyés, brouillons, réception)…
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

function EcranErreur(props: { erreur: { message: string; journal?: string }; onReessayer: () => void; chargement: boolean }) {
  const outlook = /outlook/i.test(props.erreur.journal ?? props.erreur.message)
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TriangleAlertIcon className="size-5 text-amber-600" />
          {outlook ? "Outlook n'est pas accessible" : "Le suivi n'a pas pu être chargé"}
        </CardTitle>
        <CardDescription>
          {outlook
            ? "Ouvre Outlook classique (pas le nouvel Outlook), attends qu'il soit chargé, puis réessaie."
            : props.erreur.message}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.erreur.journal && (
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
            {props.erreur.journal}
          </pre>
        )}
        <Button onClick={props.onReessayer} disabled={props.chargement}>
          <RefreshCwIcon className={cn(props.chargement && "animate-spin")} /> Réessayer
        </Button>
      </CardContent>
    </Card>
  )
}
