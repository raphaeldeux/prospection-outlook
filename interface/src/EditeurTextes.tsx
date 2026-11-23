import { useEffect, useRef, useState } from "react"
import {
  BoldIcon,
  LinkIcon,
  ListIcon,
  Loader2Icon,
  PenLineIcon,
  SaveIcon,
  TriangleAlertIcon,
  Undo2Icon,
  Trash2Icon,
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { enregistrerObjet, enregistrerTexte, type LigneContact, type TextePersonnalise } from "@/lib/api"
import { objetDeCampagne, resoudreVariables, texteVersHtml } from "@/lib/apercu"
import { nomAffiche } from "@/lib/statut"
import { cn } from "@/lib/utils"

const libelles = ["", "Mail1", "Mail2 · relance 1", "Mail3 · relance 2", "Mail4 · relance 3"]

/** "" = texte commun à tous les contacts ; sinon adresse (minuscules) du contact dont on édite le mail */
type Cible = string
const cle = (cible: Cible, etape: number) => `${cible}|${etape}`
const normaliser = (email: string | undefined) => (email ?? "").trim().toLowerCase()
/** Prénom + nom (prénom déduit de l'adresse s'il manque) ; adresse pour un contact absent de la liste */
const nomContact = (c: LigneContact | undefined, email: string) =>
  c ? nomAffiche({ Civilite: c.Civilite ?? "", Prenom: c.Prenom, Nom: c.Nom ?? "", Email: c.Email ?? "" }) || email : email
const etapeDeCle = (c: string) => Number(c.slice(c.lastIndexOf("|") + 1))
const emailDeCle = (c: string) => c.slice(0, c.lastIndexOf("|"))

export function EditeurTextes(props: {
  campagne: string
  textes: { etape: number; contenu: string }[]
  personnalises: TextePersonnalise[]
  contacts: LigneContact[]
  /** Objets communs mémorisés pour la campagne (parametres.json) */
  objets?: (string | null)[] | null
  /** Étapes déjà envoyées, par adresse (minuscules) : changer leur objet empêcherait le suivi de retrouver le mail */
  envois: Record<string, number[]>
  /** Des modifications non enregistrées dans l'onglet Contacts : les objets ne sont pas modifiables ici en attendant */
  contactsModifies: boolean
  etape: number
  setEtape: (n: number) => void
  onEnregistre: () => void
  onModifie: (modifie: boolean) => void
}) {
  const { campagne, etape, setEtape } = props

  // Textes enregistrés et en cours d'édition, par (cible, étape). Une clé absente pour un contact = il reçoit le texte commun.
  const lireTextes = () => {
    const r: Record<string, string> = {}
    for (const n of [1, 2, 3, 4]) r[cle("", n)] = props.textes.find((t) => t.etape === n)?.contenu ?? ""
    for (const p of props.personnalises) r[cle(normaliser(p.email), p.etape)] = p.contenu
    return r
  }
  const [enregistres, setEnregistres] = useState<Record<string, string>>(lireTextes)
  const [brouillons, setBrouillons] = useState<Record<string, string>>(enregistres)

  // Textes relus sur le disque (bouton Actualiser, fichier modifié hors de l'outil) : on reprend la nouvelle version,
  // sauf pour les textes en cours de modification ici, qui sont gardés tels quels.
  const textesRecus = JSON.stringify([props.textes, props.personnalises])
  useEffect(() => {
    const nouveaux = lireTextes()
    if (JSON.stringify(nouveaux) === JSON.stringify(enregistres)) return
    setBrouillons((b) => {
      const r: Record<string, string> = {}
      for (const c of new Set([...Object.keys(b), ...Object.keys(nouveaux)])) {
        const enCours = b[c] !== enregistres[c]
        const v = enCours ? b[c] : nouveaux[c]
        if (v !== undefined) r[c] = v
      }
      return r
    })
    setEnregistres(nouveaux)
  }, [textesRecus]) // eslint-disable-line react-hooks/exhaustive-deps
  // Objets propres à un contact en cours d'édition (la valeur enregistrée est dans contacts.csv, colonne SujetN)
  const [objetsEdites, setObjetsEdites] = useState<Record<string, string>>({})
  const [objetsEnregistres, setObjetsEnregistres] = useState<Record<string, string>>({})
  const [cible, setCible] = useState<Cible>("")
  const [sauvegarde, setSauvegarde] = useState(false)
  const [confirmerRetour, setConfirmerRetour] = useState(false)
  const [apercuContact, setApercuContact] = useState(0)
  const zone = useRef<HTMLTextAreaElement>(null)

  const contactsValides = props.contacts.filter((c) => c.Nom || c.Email)
  const parEmail = new Map(contactsValides.filter((c) => normaliser(c.Email)).map((c) => [normaliser(c.Email), c]))

  // Objets enregistrés connus localement depuis le dernier chargement : repartent des contacts reçus quand ils changent
  const recus = JSON.stringify(props.contacts)
  useEffect(() => setObjetsEnregistres({}), [recus])

  const k = cle(cible, etape)
  const objetDeLEtape = (n: number) => objetDeCampagne(props.objets, props.contacts, n)
  /** Objet enregistré : celui du contact (SujetN de sa ligne), ou l'objet commun pour la clé "" */
  const objetEnregistre = (c: string) =>
    objetsEnregistres[c] ??
    (emailDeCle(c) === "" ? objetDeLEtape(etapeDeCle(c)) : (parEmail.get(emailDeCle(c))?.[`Sujet${etapeDeCle(c)}`] ?? ""))
  const modifieObjet = (c: string) => objetsEdites[c] !== undefined && objetsEdites[c] !== objetEnregistre(c)
  const modifieTexte = (c: string) => brouillons[c] !== enregistres[c]
  const modifieCle = (c: string) => modifieTexte(c) || modifieObjet(c)
  const toutesCles = () => Object.keys({ ...brouillons, ...enregistres, ...objetsEdites })
  const modifieEtape = (n: number) => toutesCles().some((c) => etapeDeCle(c) === n && modifieCle(c))
  const unModifie = [1, 2, 3, 4].some(modifieEtape)
  useEffect(() => props.onModifie(unModifie), [unModifie]) // eslint-disable-line react-hooks/exhaustive-deps

  // Contacts qui ont leur propre texte et/ou leur propre objet (différent de l'objet commun = le plus fréquent)
  const texteDifferent = (email: string, n: number) => brouillons[cle(email, n)] !== undefined
  const aRecu = (email: string, n: number) => (props.envois[email] ?? []).includes(n)
  // Objet propre au contact. Un mail déjà envoyé garde son objet d'origine (pour que le suivi le retrouve) :
  // ce n'est pas une personnalisation, il n'est pas compté.
  const objetDifferent = (email: string, n: number) =>
    !aRecu(email, n) && (objetsEdites[cle(email, n)] ?? objetEnregistre(cle(email, n))) !== objetDeLEtape(n)
  const personnalisesEtape = (n: number) => {
    const emails = new Set([
      ...Object.keys(brouillons).filter((c) => !c.startsWith("|") && etapeDeCle(c) === n).map(emailDeCle),
      ...[...parEmail.keys()].filter((e) => objetDifferent(e, n)),
    ])
    return [...emails]
  }
  const persoIci = personnalisesEtape(etape)
  const orphelins = persoIci.filter((e) => !parEmail.has(e))

  const commun = brouillons[cle("", etape)] ?? ""
  const textePerso = cible !== "" && brouillons[k] !== undefined
  const texte = cible === "" ? commun : (brouillons[k] ?? commun)
  const setTexte = (v: string) => setBrouillons((b) => ({ ...b, [k]: v }))

  const contactCible = cible ? parEmail.get(cible) : undefined
  const objetCommunIci = objetDeLEtape(etape)
  const objetCible = objetsEdites[k] ?? objetEnregistre(k)
  const setObjetCible = (v: string) => setObjetsEdites((o) => ({ ...o, [k]: v }))
  const dejaEnvoye = !!cible && aRecu(cible, etape)
  // Même objet qu'une autre étape (pour ce contact, ou en commun) : les deux mails seraient indiscernables
  const objetIdentique = objetCible.trim()
    ? [1, 2, 3, 4].find(
        (n) => n !== etape && (cible ? (contactCible?.[`Sujet${n}`] ?? "") : objetDeLEtape(n)).trim() === objetCible.trim(),
      )
    : undefined
  // Objet commun : contacts à qui il s'applique (ceux qui avaient l'objet commun ou aucun), sauf ceux qui ont
  // déjà reçu ce mail (le suivi ne le retrouverait plus) ; ceux qui ont leur propre objet ne sont pas touchés
  const avecEmail = [...parEmail.keys()]
  const recoiventCommun = avecEmail.filter((e) => {
    const o = objetEnregistre(cle(e, etape))
    return (o === objetCommunIci || !o) && !aRecu(e, etape)
  })
  const nbDejaRecu = avecEmail.filter((e) => aRecu(e, etape)).length
  const objetPersoEnregistre = !!cible && objetEnregistre(k) !== objetCommunIci
  const [confirmerObjet, setConfirmerObjet] = useState(false)

  // Aperçu : le contact choisi en haut quand on édite son mail, sinon celui de la liste "Pour"
  const contact = cible ? contactCible : (contactsValides[apercuContact] ?? contactsValides[0])
  // (objet commun en cours de modification : l'aperçu le montre pour les contacts qui le recevront)
  const objetContact = normaliser(contact?.Email)
  const objet = resoudreVariables(
    cible || recoiventCommun.includes(objetContact) ? objetCible : (contact?.[`Sujet${etape}`] ?? ""),
    contact,
  )

  /** Entoure la sélection (ou insère à la position du curseur) */
  function inserer(avant: string, apres = "", parDefaut = "") {
    const el = zone.current
    if (!el) return
    const { selectionStart: d, selectionEnd: f } = el
    const sel = texte.slice(d, f) || parDefaut
    setTexte(texte.slice(0, d) + avant + sel + apres + texte.slice(f))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(d + avant.length, d + avant.length + sel.length)
    })
  }

  function puce() {
    const el = zone.current
    if (!el) return
    const debutLigne = texte.lastIndexOf("\n", el.selectionStart - 1) + 1
    setTexte(texte.slice(0, debutLigne) + "- " + texte.slice(debutLigne))
    requestAnimationFrame(() => el.focus())
  }

  /** Enregistre l'objet (s'il a changé) puis le texte (s'il a changé) de la vue en cours */
  async function enregistrer() {
    setSauvegarde(true)
    try {
      let message = cible ? `${libelles[etape]} de ${nomContact(contactCible, cible)} enregistré` : `${libelles[etape]} enregistré`
      if (modifieObjet(k)) {
        const valeur = objetCible.trim()
        if (cible) {
          await enregistrerObjet(campagne, [cible], etape, valeur)
        } else {
          const r = await enregistrerObjet(campagne, recoiventCommun, etape, valeur, true)
          if (r.nb > 0) message += ` : objet appliqué à ${r.nb} contact(s)`
          if (nbDejaRecu > 0) message += ` (${nbDejaRecu} ayant déjà reçu ce mail gardent leur objet)`
        }
        setObjetsEnregistres((o) => ({ ...o, [k]: valeur }))
        setObjetsEdites((o) => ({ ...o, [k]: valeur }))
      }
      if (modifieTexte(k)) {
        await enregistrerTexte(campagne, etape, texte, cible || undefined)
        setEnregistres((e) => ({ ...e, [k]: texte }))
      }
      toast.success(message)
      props.onEnregistre()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSauvegarde(false)
    }
  }

  /** Annule les modifications ; un texte personnalisé jamais enregistré disparaît (retour au texte commun) */
  function annuler() {
    setBrouillons((b) => {
      const n = { ...b }
      if (enregistres[k] === undefined) delete n[k]
      else n[k] = enregistres[k]
      return n
    })
    setObjetsEdites((o) => {
      const n = { ...o }
      delete n[k]
      return n
    })
  }

  /** Supprime le texte personnalisé : le contact reçoit de nouveau le texte commun */
  async function revenirAuCommun() {
    setConfirmerRetour(false)
    if (enregistres[k] !== undefined) {
      try {
        await enregistrerTexte(campagne, etape, "", cible)
        props.onEnregistre()
      } catch (e) {
        toast.error((e as Error).message)
        return
      }
    }
    const retirer = (r: Record<string, string>) => {
      const n = { ...r }
      delete n[k]
      return n
    }
    setEnregistres(retirer)
    setBrouillons(retirer)
    toast.success(`${nomContact(contactCible, cible)} reçoit de nouveau le texte commun pour ${libelles[etape]}`)
  }

  /** Supprime l'objet personnalisé : le contact reprend l'objet commun de l'étape */
  async function supprimerObjetPerso() {
    setConfirmerObjet(false)
    try {
      await enregistrerObjet(campagne, [cible], etape, objetCommunIci)
    } catch (e) {
      toast.error((e as Error).message)
      return
    }
    setObjetsEnregistres((o) => ({ ...o, [k]: objetCommunIci }))
    setObjetsEdites((o) => {
      const n = { ...o }
      delete n[k]
      return n
    })
    toast.success(`${nomContact(contactCible, cible)} reprend l'objet commun pour ${libelles[etape]}`)
    props.onEnregistre()
  }

  const aCompleter = texte.includes("[A COMPLETER]")
  const nomCible = nomContact(contactCible, cible)

  const barreBoutons = (
    <div className="flex flex-wrap gap-2">
      <Button onClick={enregistrer} disabled={!modifieCle(k) || sauvegarde || (!cible && modifieObjet(k) && props.contactsModifies)}>
        {sauvegarde ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Enregistrer
      </Button>
      <Button variant="ghost" disabled={!modifieCle(k)} onClick={annuler}>
        <Undo2Icon /> Annuler les modifications
      </Button>
      {cible && (objetPersoEnregistre || (textePerso && enregistres[k] !== undefined)) && (
        <div className="ml-auto flex flex-wrap gap-2">
          {objetPersoEnregistre && (
            <Button variant="ghost" onClick={() => setConfirmerObjet(true)} disabled={props.contactsModifies}>
              <Trash2Icon /> Supprimer l'objet personnalisé
            </Button>
          )}
          {textePerso && enregistres[k] !== undefined && (
            <Button variant="ghost" onClick={() => setConfirmerRetour(true)}>
              <Trash2Icon /> Supprimer le mail personnalisé
            </Button>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[1, 2, 3, 4].map((n) => {
          const nbPerso = personnalisesEtape(n).length
          return (
            <Button key={n} size="sm" variant={etape === n ? "secondary" : "ghost"} onClick={() => setEtape(n)}>
              {libelles[n]}
              {nbPerso > 0 && (
                <span className="text-xs text-muted-foreground" title={`${nbPerso} contact(s) avec leur propre texte ou objet`}>
                  · {nbPerso} perso
                </span>
              )}
              {modifieEtape(n) && <span className="size-1.5 rounded-full bg-amber-500" title="Modifications non enregistrées" />}
            </Button>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <span>{libelles[etape]} pour</span>
              <select
                className="h-7 max-w-full rounded-md border bg-background px-1.5 text-xs font-normal text-foreground"
                value={cible}
                onChange={(e) => setCible(e.target.value)}
                aria-label="Destinataires de ce mail"
              >
                <option value="">tous les contacts (texte commun)</option>
                {[...parEmail.entries()].map(([email, c]) => (
                  <option key={email} value={email}>
                    {nomContact(c, email)}
                    {persoIci.includes(email) ? " — personnalisé" : ""}
                  </option>
                ))}
                {orphelins.map((email) => (
                  <option key={email} value={email}>{email} — n'est plus dans les contacts</option>
                ))}
              </select>
              {aCompleter && <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">À compléter</Badge>}
            </CardTitle>
            <CardDescription>
              {cible === ""
                ? "Envoyé à tous les contacts, sauf ceux qui ont leur propre texte pour cette étape."
                : `Objet et texte propres à ${nomCible} : ils remplacent ceux de la campagne pour lui seul.`}{" "}
              Ta signature Outlook est ajoutée automatiquement.
              {etape > 1 && " La relance répond au mail précédent, qui est cité en dessous."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Objet du mail : commun (tous les contacts) ou propre au contact choisi */}
            {cible === "" || contactCible ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium" htmlFor="objet-mail">
                  {cible ? `Objet pour ${nomCible}` : "Objet (tous les contacts)"}
                </label>
                <Input
                  id="objet-mail"
                  value={objetCible}
                  onChange={(e) => setObjetCible(e.target.value)}
                  disabled={props.contactsModifies}
                  aria-invalid={objetIdentique ? true : undefined}
                  placeholder={
                    cible
                      ? "Vide : pas de mail à cette étape pour ce contact"
                      : etape === 1
                        ? "[{{ENTREPRISE}}] Échangeons sur vos priorités"
                        : `Vide : pas de ${libelles[etape]}, la séquence s'arrête avant`
                  }
                />
                {props.contactsModifies ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Enregistre ou annule d'abord les modifications de l'onglet Contacts pour changer l'objet ici.
                  </p>
                ) : (
                  <>
                    {!cible && (
                      <p className="text-xs text-muted-foreground">
                        Variables possibles : {"{{CIVILITE}}"}, {"{{PRENOM}}"}, {"{{NOM}}"}, {"{{ENTREPRISE}}"}.
                        {etape > 1 && " Un objet vide arrête la séquence avant cette relance."}
                      </p>
                    )}
                    {cible && objetCible !== objetCommunIci && (
                      <p className="text-xs text-muted-foreground">Objet commun : « {objetCommunIci || "aucun"} ».</p>
                    )}
                    {objetIdentique && (
                      <p className="text-xs text-destructive">
                        Identique {cible ? "à son" : "à l'"} objet Mail{objetIdentique} : l'outil ne pourrait pas distinguer les deux
                        mails. Donne un objet différent à chaque étape, par exemple avec « Re: » devant.
                      </p>
                    )}
                    {cible && dejaEnvoye && modifieObjet(k) && (
                      <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                        <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                        {libelles[etape]} est déjà parti pour ce contact : avec un autre objet, le suivi ne retrouvera plus ce mail.
                      </p>
                    )}
                    {!cible && modifieObjet(k) && nbDejaRecu > 0 && (
                      <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                        <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                        {nbDejaRecu} contact(s) ont déjà reçu {libelles[etape]} : ils gardent leur objet actuel, pour que le suivi
                        retrouve leur mail.
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : null}

            {/* Corps du mail */}
            {cible !== "" && !textePerso ? (
              <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4 text-sm">
                <p className="text-muted-foreground">
                  {nomCible} reçoit le texte commun. Tu peux lui écrire un texte entièrement différent pour {libelles[etape]} : le
                  texte commun sert de point de départ.
                </p>
                <Button size="sm" variant="outline" onClick={() => setTexte(commun)}>
                  <PenLineIcon /> Écrire un texte pour {nomCible}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1">
                  {["CIVILITE", "PRENOM", "NOM", "ENTREPRISE"].map((v) => (
                    <Button key={v} size="xs" variant="outline" onClick={() => inserer(`{{${v}}}`)} title={`Insérer la variable ${v}`}>
                      {`{{${v}}}`}
                    </Button>
                  ))}
                  <span className="mx-1 w-px bg-border" />
                  <Button size="icon-xs" variant="outline" onClick={() => inserer("**", "**", "texte en gras")} title="Gras"><BoldIcon /></Button>
                  <Button size="icon-xs" variant="outline" onClick={puce} title="Puce"><ListIcon /></Button>
                  <Button size="icon-xs" variant="outline" onClick={() => inserer("[", "](https://)", "texte du lien")} title="Lien"><LinkIcon /></Button>
                </div>
                <Textarea
                  ref={zone}
                  value={texte}
                  onChange={(e) => setTexte(e.target.value)}
                  className="min-h-96 font-mono text-[13px] leading-relaxed"
                  spellCheck
                />
                {aCompleter && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                    Retire le marqueur [A COMPLETER] une fois le texte rédigé : tant qu'il est présent, ce mail ne peut pas être créé.
                  </p>
                )}
              </>
            )}
            {barreBoutons}

            {cible === "" && persoIci.length > 0 && (
              <div className="space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
                <p>Ces contacts ont leur propre objet ou texte pour {libelles[etape]} :</p>
                <div className="flex flex-wrap gap-1.5">
                  {persoIci.map((email) => {
                    const quoi = [objetDifferent(email, etape) && "objet", texteDifferent(email, etape) && "texte"].filter(Boolean).join(" + ")
                    return (
                      <Button key={email} size="xs" variant="outline" onClick={() => setCible(email)}>
                        <PenLineIcon /> {nomContact(parEmail.get(email), email)}
                        <span className="text-muted-foreground">({quoi})</span>
                        {modifieCle(cle(email, etape)) && <span className="size-1.5 rounded-full bg-amber-500" />}
                      </Button>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Aperçu</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              Pour
              {cible ? (
                <span className="text-foreground">{nomCible}</span>
              ) : contactsValides.length > 0 ? (
                <select
                  className="h-7 rounded-md border bg-background px-1.5 text-xs text-foreground"
                  value={apercuContact}
                  onChange={(e) => setApercuContact(Number(e.target.value))}
                >
                  {contactsValides.map((c, i) => (
                    <option key={i} value={i}>{nomContact(c, c.Email ?? "")}</option>
                  ))}
                </select>
              ) : (
                <span>un contact fictif (aucun contact saisi)</span>
              )}
              {!cible && contact && texteDifferent(normaliser(contact.Email), etape) && (
                <span className="text-amber-700 dark:text-amber-300">
                  (ce contact a son propre texte : choisis-le en haut à gauche pour le voir)
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Objet : </span>
              {objet ? <span className="font-medium">{objet}</span> : (
                <span className="text-amber-700 dark:text-amber-300">vide pour ce contact (pas de mail à cette étape)</span>
              )}
            </div>
            <div
              className={cn("rounded-lg border bg-white p-4 text-[14px] leading-normal text-black [&_a]:text-blue-700 [&_a]:underline")}
              style={{ fontFamily: "Aptos, Calibri, Helvetica, sans-serif" }}
              dangerouslySetInnerHTML={{ __html: texteVersHtml(resoudreVariables(texte, contact)) }}
            />
            <p className="text-xs text-muted-foreground">+ ta signature Outlook{etape > 1 && ", puis le mail précédent cité"}.</p>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmerRetour} onOpenChange={(o) => !o && setConfirmerRetour(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le mail personnalisé de {nomCible} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Son texte personnalisé de {libelles[etape]} sera supprimé, et il recevra le texte commun comme les autres contacts.
              Son objet ne change pas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button variant="destructive" onClick={revenirAuCommun}>Supprimer le mail personnalisé</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmerObjet} onOpenChange={(o) => !o && setConfirmerObjet(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'objet personnalisé de {nomCible} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Son objet de {libelles[etape]} redevient l'objet commun : « {objetCommunIci || "aucun"} ».
              {dejaEnvoye && " Attention : ce mail lui a déjà été envoyé avec son objet personnalisé, le suivi ne le retrouvera plus."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button variant="destructive" onClick={supprimerObjetPerso}>Supprimer l'objet personnalisé</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
