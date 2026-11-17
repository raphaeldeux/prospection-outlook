import { useEffect, useRef, useState } from "react"
import { BoldIcon, LinkIcon, ListIcon, Loader2Icon, SaveIcon, TriangleAlertIcon, Undo2Icon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { enregistrerTexte, type LigneContact } from "@/lib/api"
import { resoudreVariables, texteVersHtml } from "@/lib/apercu"
import { cn } from "@/lib/utils"

const libelles = ["", "Mail1", "Mail2 · relance 1", "Mail3 · relance 2", "Mail4 · relance 3"]

export function EditeurTextes(props: {
  campagne: string
  textes: { etape: number; contenu: string }[]
  contacts: LigneContact[]
  etape: number
  setEtape: (n: number) => void
  onEnregistre: () => void
  onModifie: (modifie: boolean) => void
}) {
  const { campagne, etape, setEtape } = props
  const initial = (n: number) => props.textes.find((t) => t.etape === n)?.contenu ?? ""
  const [brouillons, setBrouillons] = useState<Record<number, string>>(() =>
    Object.fromEntries([1, 2, 3, 4].map((n) => [n, initial(n)])),
  )
  const [enregistres, setEnregistres] = useState<Record<number, string>>(() =>
    Object.fromEntries([1, 2, 3, 4].map((n) => [n, initial(n)])),
  )
  const [sauvegarde, setSauvegarde] = useState(false)
  const [apercuContact, setApercuContact] = useState(0)
  const zone = useRef<HTMLTextAreaElement>(null)

  const modifie = (n: number) => brouillons[n] !== enregistres[n]
  const unModifie = [1, 2, 3, 4].some(modifie)
  useEffect(() => props.onModifie(unModifie), [unModifie]) // eslint-disable-line react-hooks/exhaustive-deps

  const texte = brouillons[etape] ?? ""
  const setTexte = (v: string) => setBrouillons((b) => ({ ...b, [etape]: v }))
  const contactsValides = props.contacts.filter((c) => c.Nom || c.Email)
  const contact = contactsValides[apercuContact] ?? contactsValides[0]
  const objet = resoudreVariables(contact?.[`Sujet${etape}`] ?? "", contact)

  /** Entoure la sélection (ou insère à la position du curseur) */
  function inserer(avant: string, apres = "", parDefaut = "") {
    const el = zone.current
    if (!el) return
    const { selectionStart: d, selectionEnd: f } = el
    const sel = texte.slice(d, f) || parDefaut
    const nouveau = texte.slice(0, d) + avant + sel + apres + texte.slice(f)
    setTexte(nouveau)
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

  async function enregistrer() {
    setSauvegarde(true)
    try {
      await enregistrerTexte(campagne, etape, texte)
      setEnregistres((e) => ({ ...e, [etape]: texte }))
      toast.success(`Texte ${libelles[etape]} enregistré`)
      props.onEnregistre()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSauvegarde(false)
    }
  }

  const aCompleter = texte.includes("[A COMPLETER]")

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[1, 2, 3, 4].map((n) => (
          <Button key={n} size="sm" variant={etape === n ? "secondary" : "ghost"} onClick={() => setEtape(n)}>
            {libelles[n]}
            {modifie(n) && <span className="size-1.5 rounded-full bg-amber-500" title="Modifications non enregistrées" />}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              Texte de {libelles[etape]}
              {aCompleter && <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">À compléter</Badge>}
            </CardTitle>
            <CardDescription>
              Ta signature Outlook est ajoutée automatiquement.
              {etape > 1 && " La relance répond au mail précédent, qui est cité en dessous."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {["CIVILITE", "NOM", "ENTREPRISE"].map((v) => (
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
                Retire le marqueur [A COMPLETER] une fois le texte rédigé : tant qu'il est présent, les brouillons de cette étape ne
                peuvent pas être créés.
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={enregistrer} disabled={!modifie(etape) || sauvegarde}>
                {sauvegarde ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Enregistrer
              </Button>
              <Button variant="ghost" disabled={!modifie(etape)} onClick={() => setTexte(enregistres[etape])}>
                <Undo2Icon /> Annuler les modifications
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Aperçu</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              Pour
              {contactsValides.length > 0 ? (
                <select
                  className="h-7 rounded-md border bg-background px-1.5 text-xs text-foreground"
                  value={apercuContact}
                  onChange={(e) => setApercuContact(Number(e.target.value))}
                >
                  {contactsValides.map((c, i) => (
                    <option key={i} value={i}>{[c.Civilite, c.Nom].filter(Boolean).join(" ") || c.Email}</option>
                  ))}
                </select>
              ) : (
                <span>un contact fictif (aucun contact saisi)</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Objet : </span>
              {objet ? <span className="font-medium">{objet}</span> : (
                <span className="text-amber-700 dark:text-amber-300">colonne Sujet{etape} vide pour ce contact (pas de mail à cette étape)</span>
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
    </div>
  )
}
