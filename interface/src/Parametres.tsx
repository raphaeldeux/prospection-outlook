import { useEffect, useState } from "react"
import { CheckCircle2Icon, DownloadIcon, ExternalLinkIcon, Loader2Icon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { chargerVersion, lancerMiseAJour, type InfosVersion } from "@/lib/api"

/** Rend lisibles les notes de version (Markdown simple : titres, listes, gras, code) */
function Notes({ texte }: { texte: string }) {
  const lignes = texte.replace(/\r/g, "").split("\n")
  const gras = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((m, i) =>
      m.startsWith("**") ? <strong key={i}>{m.slice(2, -2)}</strong> : m.startsWith("`") ? <code key={i}>{m.slice(1, -1)}</code> : m.replace(/\*([^*]+)\*/g, "$1"),
    )
  return (
    <div className="space-y-1 text-sm text-muted-foreground [&_strong]:text-foreground">
      {lignes.map((l, i) =>
        !l.trim() ? null : l.trim().startsWith("- ") ? (
          <div key={i} className="flex gap-2 pl-2"><span>•</span><span>{gras(l.trim().slice(2))}</span></div>
        ) : (
          <p key={i}>{gras(l.replace(/^#+\s*/, ""))}</p>
        ),
      )}
    </div>
  )
}

/** Page Paramètres : version de l'outil et mise à jour en un clic */
export function Parametres(props: { modifsEnCours: boolean }) {
  const [infos, setInfos] = useState<InfosVersion | null>(null)
  const [chargement, setChargement] = useState(false)
  const [miseAJour, setMiseAJour] = useState(false)
  /** La mise à jour dure plus longtemps que prévu : on propose de recharger à la main */
  const [lente, setLente] = useState(false)

  async function verifier() {
    setChargement(true)
    try {
      setInfos(await chargerVersion())
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setChargement(false)
    }
  }
  useEffect(() => {
    void verifier()
  }, [])

  async function mettreAJour() {
    if (props.modifsEnCours && !window.confirm("Des modifications ne sont pas enregistrées et seront perdues. Continuer ?")) return
    setMiseAJour(true)
    setLente(false)
    // Etat du serveur AVANT la mise à jour : on reconnaîtra le nouveau serveur à son identifiant de démarrage
    let avant: InfosVersion | null = null
    try {
      avant = await chargerVersion(true)
      await lancerMiseAJour()
    } catch (e) {
      toast.error((e as Error).message)
      setMiseAJour(false)
      return
    }
    // Le serveur s'arrête, l'installeur tourne, puis l'interface redémarre : dès que le NOUVEAU serveur
    // répond (identifiant de démarrage ou version différents), on recharge la page pour afficher la nouvelle version.
    // Pas de comparaison avec la version annoncée : elle peut différer (format, GitHub injoignable, réinstallation).
    const debut = Date.now()
    let serveurArrete = false
    await new Promise((r) => setTimeout(r, 3000))
    for (;;) {
      try {
        const v = await chargerVersion(true)
        const nouveau =
          serveurArrete ||
          (v.instance !== undefined && v.instance !== avant?.instance) ||
          v.installee?.version !== avant?.installee?.version
        if (nouveau) {
          window.location.reload()
          return
        }
      } catch {
        serveurArrete = true // serveur en cours de redémarrage : la prochaine réponse viendra du nouveau
      }
      if (Date.now() - debut > 2 * 60 * 1000) setLente(true)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  const v = infos
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">Version de l'outil et mises à jour.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Version</CardTitle>
          <CardDescription>
            Les mises à jour remplacent l'outil mais ne touchent jamais à tes campagnes (contacts, textes, suivi).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {miseAJour && (
            <div role="status" className="flex gap-3 rounded-lg border border-sky-300 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/40">
              <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">Mise à jour en cours…</p>
                <p className="text-muted-foreground">
                  Une fenêtre « Mise à jour de Prospection Outlook » s'ouvre et se ferme toute seule. Ne ferme pas cette page :
                  elle se rechargera automatiquement sur la nouvelle version (environ une minute).
                </p>
                {lente && (
                  <div className="space-y-2 pt-1">
                    <p className="text-amber-700 dark:text-amber-300">
                      C'est plus long que prévu. Si la fenêtre de mise à jour est fermée, recharge la page.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                      <RefreshCwIcon /> Recharger la page
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
          {!v ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" /> Vérification…</p>
          ) : (
            <>
              <div className="grid gap-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Version installée : </span>
                  {v.installee ? `du ${v.installee.date || "?"} (${v.installee.version})` : "inconnue"}
                </div>
                <div>
                  <span className="text-muted-foreground">Dernière version : </span>
                  {v.publiee ? `du ${v.publiee.date} (${v.publiee.version})` : "impossible de vérifier (pas de connexion à GitHub ?)"}
                </div>
              </div>

              {v.aJour === true && (
                <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2Icon className="size-4" /> Tu as la dernière version.
                </p>
              )}
              {(v.aJour === false || (v.publiee && !v.installee)) && (
                <div className="rounded-lg border border-sky-300 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/40">
                  <p className="font-medium">Une nouvelle version est disponible.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    La mise à jour prend environ une minute : une fenêtre s'ouvre, l'interface redémarre puis cette page se recharge.
                    Garde Outlook ouvert.
                  </p>
                  <Button className="mt-3" onClick={mettreAJour} disabled={miseAJour}>
                    {miseAJour ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
                    {miseAJour ? "Mise à jour en cours…" : "Mettre à jour"}
                  </Button>
                </div>
              )}
              {v.aJour === null && v.publiee === null && (
                <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                  <TriangleAlertIcon className="size-4" /> Vérification impossible pour l'instant. Réessaie plus tard.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={verifier} disabled={chargement || miseAJour}>
                  <RefreshCwIcon className={chargement ? "animate-spin" : ""} /> Rechercher une mise à jour
                </Button>
                {v.aJour === true && (
                  <Button variant="ghost" size="sm" onClick={mettreAJour} disabled={miseAJour} title="Réinstaller la même version (en cas de fichier abîmé)">
                    {miseAJour ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />} Réinstaller
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {v?.release && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nouveautés : {v.release.nom}</CardTitle>
            <CardDescription>Publiée le {v.release.date}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Notes texte={v.release.notes} />
            <a href={v.release.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline underline-offset-2">
              Toutes les versions <ExternalLinkIcon className="size-3.5" />
            </a>
          </CardContent>
        </Card>
      )}

      {v && (
        <p className="text-xs text-muted-foreground">Dossier de l'outil : {v.dossier}</p>
      )}
    </div>
  )
}
