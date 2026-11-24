/**
 * Nombre suivi du mot accordé, à la française : singulier pour 0 et 1, pluriel au-delà.
 * pl(0, "contact", "contacts") → "0 contact" ; pl(3, "envoyé", "envoyés") → "3 envoyés"
 */
export const pl = (n: number, singulier: string, pluriel: string) => `${n} ${n > 1 ? pluriel : singulier}`

/** Le mot seul, accordé (sans le nombre) */
export const accord = (n: number, singulier: string, pluriel: string) => (n > 1 ? pluriel : singulier)
