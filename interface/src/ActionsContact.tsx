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
export function ActionsContact(props: { campagne: string; contact: Contact; onChange: () => void; compact?: boolean }) {
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
