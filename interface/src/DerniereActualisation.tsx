import { useEffect, useState } from "react"
import { ClockIcon } from "lucide-react"

const joursSemaine = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]
const moisCourts = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]

/** "17/11/2026 15:07" → Date */
function lireDate(texte: string): Date | null {
  const m = texte.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/)
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5])) : null
}

/** Formulation naturelle : à l'instant, il y a 12 min, aujourd'hui à 9h05, hier à 18h30, lundi à 10h00, le 3 nov. à 14h15 */
export function quandRelatif(d: Date, maintenant = new Date()): string {
  const minutes = Math.floor((maintenant.getTime() - d.getTime()) / 60000)
  const heure = `${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}`
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const jour = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const ecartJours = Math.round((jour(maintenant) - jour(d)) / 86400000)
  if (ecartJours === 0) return `aujourd'hui à ${heure}`
  if (ecartJours === 1) return `hier à ${heure}`
  if (ecartJours < 7) return `${joursSemaine[d.getDay()]} à ${heure}`
  const annee = d.getFullYear() !== maintenant.getFullYear() ? ` ${d.getFullYear()}` : ""
  return `le ${d.getDate()} ${moisCourts[d.getMonth()]}${annee} à ${heure}`
}

/** « Actualisé il y a 5 min », mis à jour toutes les 30 secondes ; la date exacte au survol */
export function DerniereActualisation(props: { genereLe: string; chargement?: boolean }) {
  const [, setTic] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTic((x) => x + 1), 30000)
    return () => clearInterval(t)
  }, [])
  const d = lireDate(props.genereLe)
  if (props.chargement) return <span className="text-xs text-muted-foreground">Lecture d'Outlook…</span>
  if (!d) return null
  const ancien = Date.now() - d.getTime() > 4 * 3600 * 1000
  return (
    <span
      className={`flex items-center gap-1 text-xs ${ancien ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}
      title={`Données lues dans Outlook le ${props.genereLe}${ancien ? " : pense à actualiser" : ""}`}
    >
      <ClockIcon className="size-3.5" /> Actualisé {quandRelatif(d)}
    </span>
  )
}
