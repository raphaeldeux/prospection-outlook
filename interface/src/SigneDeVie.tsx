import { useEffect, useState } from "react"
import { PowerOffIcon } from "lucide-react"
import { ping } from "@/lib/api"

/**
 * Signe de vie envoyé au serveur toutes les 30 secondes : en mode application, le serveur s'arrête seul quelques
 * minutes après la fermeture de la fenêtre (plus aucun signe de vie). Si le serveur ne répond plus (application
 * quittée depuis l'icône près de l'horloge), un message le dit clairement ; la page se recharge dès qu'il revient.
 */
export function SigneDeVie() {
  const [ferme, setFerme] = useState(false)

  useEffect(() => {
    let echecs = 0
    let arrete = false
    let minuteur: ReturnType<typeof setTimeout>
    const verifier = async () => {
      try {
        await ping()
        if (echecs >= 2) return window.location.reload() // le serveur est revenu : page à jour
        echecs = 0
      } catch {
        echecs++
        if (echecs >= 2) setFerme(true)
      }
      // serveur absent : on vérifie plus souvent, pour se recharger vite quand il est relancé
      if (!arrete) minuteur = setTimeout(verifier, echecs >= 2 ? 5000 : 30000)
    }
    minuteur = setTimeout(verifier, 30000)
    return () => {
      arrete = true
      clearTimeout(minuteur)
    }
  }, [])

  if (!ferme) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-6 backdrop-blur-sm">
      <div className="max-w-md space-y-3 text-center">
        <PowerOffIcon className="mx-auto size-8 text-muted-foreground" />
        <p className="text-lg font-semibold">Prospection Outlook est fermé</p>
        <p className="text-sm text-muted-foreground">
          Tu peux fermer cette fenêtre. Pour reprendre, double-clique le raccourci <strong>Prospection Outlook</strong> : cette
          page se rechargera d'elle-même.
        </p>
      </div>
    </div>
  )
}
