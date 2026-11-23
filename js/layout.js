/**
 * La composition « bento » de la galerie, partagée par le script de génération (Node) et le navigateur.
 *
 * La grille a 12 colonnes et des rangées fines (une demi-colonne de haut). Les photos sont posées par bandes
 * pleines, sans trou, quel que soit le filtre actif :
 *
 *   W        un panoramique seul, sur toute la largeur
 *   L + P    un paysage sur 8 colonnes et un portrait sur 4 (le portrait change de côté d'une bande à l'autre)
 *   L + L    deux paysages, 7 + 5, 5 + 7 puis 6 + 6
 *   P + P + P  trois portraits sur 4 colonnes
 *   P + P + L  deux portraits sur 3 colonnes et un paysage sur 6
 *
 * kind : 'W' panoramique (ratio >= 1,9), 'P' portrait (ratio < 0,95), 'L' paysage.
 */

export const COLS = 12;

export function kindOf(ratio) {
  if (ratio >= 1.9) return 'W';
  if (ratio < 0.95) return 'P';
  return 'L';
}

/**
 * @param {{ id: string, kind: 'W'|'L'|'P' }[]} items les photos visibles, dans l'ordre d'affichage
 * @returns {{ cells: Map<string, { col: number, span: number, row: number, rows: number }>, rows: number }}
 */
export function packBento(items) {
  const cells = new Map();
  let row = 1;
  let band = 0;
  let pairs = 0;
  const put = (item, col, span, rows) => cells.set(item.id, { col, span, row, rows });
  const close = (rows) => { row += rows; band += 1; };

  for (let i = 0; i < items.length;) {
    const a = items[i], b = items[i + 1], c = items[i + 2];

    if (a.kind === 'W') { put(a, 1, 12, 9); close(9); i += 1; continue; }

    if (a.kind === 'L') {
      if (b && b.kind === 'P') {                       // paysage + portrait
        if (band % 2 === 0) { put(a, 1, 8, 9); put(b, 9, 4, 9); } else { put(b, 1, 4, 9); put(a, 5, 8, 9); }
        close(9); i += 2; continue;
      }
      if (b && b.kind === 'L') {                       // deux paysages, largeurs alternées
        const [wa, wb] = [[7, 5], [5, 7], [6, 6]][pairs % 3];
        put(a, 1, wa, 7); put(b, 1 + wa, wb, 7);
        pairs += 1; close(7); i += 2; continue;
      }
      put(a, 1, 12, 10); close(10); i += 1; continue;  // un paysage seul ferme la page en grand
    }

    // a est un portrait
    if (b && b.kind === 'L') {                         // portrait + paysage
      if (band % 2 === 0) { put(a, 1, 4, 9); put(b, 5, 8, 9); } else { put(b, 1, 8, 9); put(a, 9, 4, 9); }
      close(9); i += 2; continue;
    }
    if (b && b.kind === 'P' && c && c.kind === 'P') {   // trois portraits
      put(a, 1, 4, 9); put(b, 5, 4, 9); put(c, 9, 4, 9);
      close(9); i += 3; continue;
    }
    if (b && b.kind === 'P' && c && c.kind === 'L') {   // deux portraits + un paysage
      if (band % 2 === 0) { put(a, 1, 3, 7); put(b, 4, 3, 7); put(c, 7, 6, 7); } else { put(c, 1, 6, 7); put(a, 7, 3, 7); put(b, 10, 3, 7); }
      close(7); i += 3; continue;
    }
    if (b && b.kind === 'P') {                         // deux portraits, centrés
      put(a, 3, 4, 9); put(b, 7, 4, 9);
      close(9); i += 2; continue;
    }
    put(a, 5, 4, 9); close(9); i += 1;                 // un portrait seul, centré
  }

  return { cells, rows: row - 1 };
}

/** La valeur de `sizes` d'une vignette selon la largeur de sa cellule (12 colonnes, page plafonnée à 2560 px). */
export function sizesFor(span) {
  const share = span / COLS;
  return `(max-width: 719px) 100vw, (min-width: 2700px) ${Math.round(2440 * share)}px, ${Math.round(share * 94)}vw`;
}
