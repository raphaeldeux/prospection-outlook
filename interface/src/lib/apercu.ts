import type { LigneContact } from "@/lib/api"

/** Remplace {{CIVILITE}}, {{PRENOM}}, {{NOM}}, {{ENTREPRISE}} comme le font les scripts PowerShell */
export function resoudreVariables(texte: string, contact?: LigneContact) {
  return texte
    .replaceAll("{{CIVILITE}}", contact?.Civilite || "Madame")
    .replaceAll("{{PRENOM}}", contact?.Prenom || "Claire")
    .replaceAll("{{NOM}}", contact?.Nom || "Martin")
    .replaceAll("{{ENTREPRISE}}", contact?.Entreprise || "Entreprise")
}

const echapper = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

/**
 * Meme mise en forme que Convert-MarkdownLiteToHtml (Scripts/Commun.ps1) :
 * **gras**, lignes "- " en puces, [texte](lien), ligne vide = saut de ligne.
 */
export function texteVersHtml(texte: string) {
  const html: string[] = []
  let liste = false
  for (const brute of texte.split(/\r?\n/)) {
    const ligne = brute.trimEnd()
    if (!ligne.trim()) {
      if (liste) { html.push("</ul>"); liste = false }
      html.push("<br>")
      continue
    }
    let l = echapper(ligne)
    l = l.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) =>
      /^(https?:|mailto:)/i.test(u) ? `<a href="${u}" target="_blank" rel="noreferrer">${t}</a>` : `${t}`,
    )
    l = l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    if (l.trimStart().startsWith("- ")) {
      if (!liste) { html.push('<ul style="margin:0 0 0 20px;padding:0;list-style:disc">'); liste = true }
      html.push(`<li>${l.trimStart().slice(2)}</li>`)
    } else {
      if (liste) { html.push("</ul>"); liste = false }
      html.push(`${l}<br>`)
    }
  }
  if (liste) html.push("</ul>")
  return html.join("\n")
}

export const estEmailValide = (e: string) => /^[^\s@;]+@[^\s@;]+\.[a-z]{2,}$/i.test(e.trim())

/** Objet commun d'une étape = l'objet le plus fréquent parmi les contacts (les autres ont un objet personnalisé) */
export function objetCommun(contacts: LigneContact[], etape: number) {
  const n = new Map<string, number>()
  contacts.map((c) => c[`Sujet${etape}`] ?? "").filter(Boolean).forEach((v) => n.set(v, (n.get(v) ?? 0) + 1))
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
}

/** Colonnes d'objet (Sujet1..Sujet4) : modifiées dans le bloc « Objets des mails » et l'onglet Textes, pas dans le tableau */
export const estColonneObjet = (colonne: string) => /^Sujet[1-4]$/.test(colonne)
