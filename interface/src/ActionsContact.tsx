import { useState } from "react"
import { Loader2Icon, MailOpenIcon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { enregistrerIssue, ouvrirReponseOutlook, type Contact } from "@/lib/api"
import { issues, libelleIssue } from "@/lib/issues"

/**
 * Actions sur un contact, dans le tableau de suivi et sur l'accueil :
 *  - ouvrir sa réponse dans Outlook (s'il a répondu)
 *  - renseigner l'issue (RDV obtenu, pas intéressé…) : le contact est alors clos, plus de relance
 *  - rouvrir un contact clos
 */
export function ActionsContact(props: {
  campagne: string
  contact: Contact
  onChange: () => void
  /** Met à jour l'affichage tout de suite, sans relire Outlook (l'enregistrement se fait en arrière-plan) */
  onIssueLocale?: (campagne: string, email: string, issue: string) => void
  compact?: boolean
}) {
  const { contact } = props
  const [occupe, setOccupe] = useState<"reponse" | "issue" | null>(null)

  async function ouvrirReponse() {
    setOccupe("reponse")
    try {
      await ouvrirReponseOutlook(contact.Email)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOccupe(null)
    }
  }

  async function changerIssue(issue: string) {
    // Clore : affichage immédiat, enregistrement en arrière-plan (inutile de relire Outlook pour ça).
    // En cas d'échec, on relit le suivi pour revenir à l'état réel.
    if (issue && props.onIssueLocale) {
      props.onIssueLocale(props.campagne, contact.Email, issue)
      toast.success(`${libelleIssue(issue)} : plus aucun mail ne sera préparé pour ce contact`)
      enregistrerIssue(props.campagne, contact.Email, issue).catch((e) => {
        toast.error(`Non enregistré : ${(e as Error).message}`)
        props.onChange()
      })
      return
    }
    // Rouvrir : statut recalculé tout de suite à partir des données déjà chargées, puis le suivi est relu en
    // arrière-plan pour confirmer (un brouillon en attente, par exemple, n'est connu que d'Outlook)
    if (!issue && props.onIssueLocale) {
      props.onIssueLocale(props.campagne, contact.Email, "")
      toast.success("Contact rouvert")
      enregistrerIssue(props.campagne, contact.Email, "")
        .then(() => props.onChange())
        .catch((e) => {
          toast.error(`Non enregistré : ${(e as Error).message}`)
          props.onChange()
        })
      return
    }
    setOccupe("issue")
    try {
      await enregistrerIssue(props.campagne, contact.Email, issue)
      toast.success(issue ? `${libelleIssue(issue)} : plus aucun mail ne sera préparé pour ce contact` : "Contact rouvert")
      props.onChange()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOccupe(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {contact.DateReponse && (
        <Button size="xs" variant="outline" onClick={ouvrirReponse} disabled={occupe !== null} title="Ouvrir sa réponse dans Outlook">
          {occupe === "reponse" ? <Loader2Icon className="animate-spin" /> : <MailOpenIcon />}
          {!props.compact && "Lire la réponse"}
        </Button>
      )}
      {contact.Code === "clos" ? (
        <Button size="xs" variant="ghost" onClick={() => changerIssue("")} disabled={occupe !== null} title="Rouvrir ce contact (les relances pourront reprendre)">
          {occupe === "issue" ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />} Rouvrir
        </Button>
      ) : (
        contact.Email && (
          <select
            className="h-6 rounded-md border border-input bg-background px-1 text-xs text-foreground"
            value=""
            disabled={occupe !== null}
            onChange={(e) => e.target.value && changerIssue(e.target.value)}
            title="Indiquer l'issue : le contact sera clos et ne recevra plus de relance"
          >
            <option value="">{contact.Code === "repondu" ? "Issue…" : "Clore…"}</option>
            {Object.entries(issues).map(([cle, i]) => (
              <option key={cle} value={cle}>{i.libelle}</option>
            ))}
          </select>
        )
      )}
    </div>
  )
}
