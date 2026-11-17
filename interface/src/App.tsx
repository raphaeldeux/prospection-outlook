import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BookOpenIcon,
  FileTextIcon,
  FolderOpenIcon,
  Loader2Icon,
  MailPlusIcon,
  PlusIcon,
  RefreshCwIcon,
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
import { Guide } from "@/Guide"
import {
  chargerFichiers,
  chargerSuivi,
  creerCampagne,
  etapeSuivante,
  genererBrouillons,
  ouvrirDossier,
  type Campagne,
  type Code,
  type Fichiers,
  type Suivi,
} from "@/lib/api"
import { cn } from "@/lib/utils"
import { StatutBadge, statuts } from "@/StatutBadge"

const nomsEtapes = ["", "Mail1", "Mail2 · relance 1", "Mail3 · relance 2", "Mail4 · relance 3"]
const GUIDE = "__guide__"

function lireSelection() {
  try {
    return localStorage.getItem("campagne") ?? ""
  } catch {
    return ""
  }
}

export default function App() {
  const [suivi, setSuivi] = useState<Suivi | null>(null)
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<{ message: string; journal?: string } | null>(null)
  const [selection, setSelection] = useState(lireSelection)
  const [filtre, setFiltre] = useState<Code | null>(null)
  const [aConfirmer, setAConfirmer] = useState<{ etape: number; nb: number } | null>(null)
  const [enCours, setEnCours] = useState<number | null>(null)
  const [journal, setJournal] = useState<{ titre: string; texte: string; ok: boolean } | null>(null)
  const [nouvelle, setNouvelle] = useState<string | null>(null)
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

  function choisir(nom: string) {
    if (nom === selection) return
    if (modifsEnCours && !window.confirm("Des modifications ne sont pas enregistrées. Les abandonner ?")) return
    setModifs({})
    setSelection(nom)
    setFiltre(null)
    setOnglet("suivi")
    try {
      localStorage.setItem("campagne", nom)
    } catch {
      /* stockage indisponible : sans importance */
    }
  }

  const campagnes = suivi?.Campagnes ?? []
  const campagne: Campagne | undefined =
    selection === GUIDE ? undefined : (campagnes.find((c) => c.Nom === selection) ?? campagnes[0])

  async function lancer(etape: number) {
    if (!campagne) return
    setAConfirmer(null)
    setEnCours(etape)
    try {
      const r = await genererBrouillons(campagne.Nom, etape)
      setJournal({ titre: `${nomsEtapes[etape]} · ${campagne.Nom}`, texte: r.journal, ok: r.ok })
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

  async function valider(nom: string) {
    try {
      const r = await creerCampagne(nom)
      setNouvelle(null)
      toast.success(`Campagne « ${r.nom} » créée : remplis ses contacts et ses textes.`)
      choisir(r.nom)
      await actualiser()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="flex h-svh bg-background text-foreground">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/30">
        <div className="flex items-center gap-2 px-4 py-4">
          <MailPlusIcon className="size-5" />
          <span className="font-semibold">Prospection</span>
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
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  campagne?.Nom === c.Nom && "bg-muted font-medium",
                )}
              >
                <span className="truncate" title={c.Nom}>{c.Nom}</span>
                {aTraiter > 0 && (
                  <span
                    title={`${aTraiter} contact(s) à traiter`}
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
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {selection === GUIDE ? (
          <Guide />
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
            onGenerer={(etape, nb) => setAConfirmer({ etape, nb })}
            onOuvrirDossier={ouvrirLeDossier}
            onglet={onglet}
            setOnglet={setOnglet}
            etapeTexte={etapeTexte}
            setEtapeTexte={setEtapeTexte}
            onModifie={signalerModif}
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
                : "Aucun contact ne semble concerné pour l'instant, l'outil vérifiera à nouveau. "}
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
              {journal?.titre}. {journal?.ok && "Va dans le dossier Brouillons d'Outlook pour relire et envoyer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {journal?.texte || "(aucun message)"}
          </pre>
          <AlertDialogFooter>
            <AlertDialogCancel>Fermer</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={nouvelle !== null} onOpenChange={(o) => !o && setNouvelle(null)}>
        <AlertDialogContent>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault()
              if (nouvelle?.trim()) void valider(nouvelle.trim())
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Nouvelle campagne</AlertDialogTitle>
              <AlertDialogDescription>
                Un dossier est créé dans Campagnes\ à partir du modèle, avec un fichier de contacts vide.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              autoFocus
              placeholder="2026-12 Souveraineté du cloud"
              value={nouvelle ?? ""}
              onChange={(e) => setNouvelle(e.target.value)}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <Button type="submit" disabled={!nouvelle?.trim()}>Créer</Button>
            </AlertDialogFooter>
          </form>
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
  onGenerer: (etape: number, nb: number) => void
  onOuvrirDossier: () => void
  onglet: string
  setOnglet: (o: string) => void
  etapeTexte: number
  setEtapeTexte: (n: number) => void
  onModifie: (zone: string, modifie: boolean) => void
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
  }, [campagne.Nom, version])
  const campagneDemarree = contacts.some((c) => c.Mail1)
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
    return { n, texte, aCreer, brouillons, envoyes, prevus }
  })

  const visibles = filtre ? contacts.filter((c) => c.Code === filtre) : contacts

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{campagne.Nom}</h1>
          <p className="text-sm text-muted-foreground">
            {contacts.length} contact(s) · suivi lu dans Outlook le {suivi.GenereLe} · relance possible à J+{suivi.MinJours}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={props.onOuvrirDossier}><FolderOpenIcon /> Dossier</Button>
          <Button variant="outline" onClick={props.onActualiser} disabled={chargement}>
            <RefreshCwIcon className={cn(chargement && "animate-spin")} /> Actualiser
          </Button>
        </div>
      </div>

      <Tabs value={onglet} onValueChange={(v) => setOnglet(String(v))}>
        <TabsList>
          <TabsTrigger value="suivi"><MailPlusIcon /> Suivi et brouillons</TabsTrigger>
          <TabsTrigger value="contacts"><UsersIcon /> Contacts ({contacts.length})</TabsTrigger>
          <TabsTrigger value="textes"><FileTextIcon /> Textes des mails</TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="pt-4">
          {fichiers ? (
            <EditeurContacts
              key={campagne.Nom}
              campagne={campagne.Nom}
              colonnes={fichiers.colonnes}
              contacts={fichiers.contacts}
              campagneDemarree={campagneDemarree}
              onEnregistre={apresEnregistrement}
              onModifie={(m) => props.onModifie("contacts", m)}
            />
          ) : (
            <Skeleton className="h-64" />
          )}
        </TabsContent>

        <TabsContent value="textes" className="pt-4">
          {fichiers ? (
            <EditeurTextes
              key={campagne.Nom}
              campagne={campagne.Nom}
              textes={fichiers.textes}
              contacts={fichiers.contacts}
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
              <CardContent className="space-y-2">
                {bloque ? (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                    {e.texte === "absent" ? "Texte pas encore créé." : "Texte à compléter avant de créer les brouillons."}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {e.aCreer > 0 ? `${e.aCreer} contact(s) prêt(s)` : "Aucun contact prêt pour l'instant"}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    variant={e.aCreer > 0 && !bloque ? "default" : "outline"}
                    disabled={bloque || enCours !== null}
                    onClick={() => props.onGenerer(e.n, e.aCreer)}
                  >
                    {enCours === e.n ? <Loader2Icon className="animate-spin" /> : <MailPlusIcon />}
                    {enCours === e.n ? "Création…" : "Créer les brouillons"}
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
              <TableHead className="pr-4">Prochaine action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {contacts.length === 0
                    ? "Aucun contact. Ajoute-les dans l'onglet « Contacts »."
                    : "Aucun contact avec ce statut."}
                </TableCell>
              </TableRow>
            )}
            {visibles.map((c, i) => (
              <TableRow key={`${i}-${c.Email}`}>
                <TableCell className="pl-4">
                  <div className="font-medium">{[c.Civilite, c.Nom].filter(Boolean).join(" ")}</div>
                  <div className="text-xs text-muted-foreground">{c.Email || "adresse manquante"}</div>
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
                <TableCell className="pr-4">
                  <div className="flex flex-col items-start gap-1">
                    <StatutBadge code={c.Code} />
                    {c.Code === "attente" && <span className="text-xs text-muted-foreground">{c.Action}</span>}
                  </div>
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
