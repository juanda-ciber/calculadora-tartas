// Formato español: euros, coma decimal y fechas.

const EUROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/** 1.5 → "1,50 €" */
export function euros(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return EUROS.format(n);
}

/** Euros con más decimales para precios muy pequeños (por gramo): 0,00161 € */
export function eurosPequenos(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 5,
  }).format(n);
}

/** 0.25 → "0,25"; 1000 → "1000" (sin puntos de miles para no confundir) */
export function numero(n, maxDecimales = 3) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: maxDecimales, useGrouping: false,
  }).format(n);
}

/**
 * Lee un número escrito por la usuaria. Acepta coma o punto decimal:
 * "1,5" → 1.5 ; "2.25" → 2.25 ; " 3 € " → 3. Devuelve null si no es un número.
 */
export function leerNumero(texto) {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  if (typeof texto !== 'string') return null;
  const limpio = texto.replace(/[€\s]/g, '').replace(',', '.');
  if (limpio === '' || !/^\d*\.?\d+$|^\d+\.$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Fecha de hoy como 'AAAA-MM-DD' (hora local). */
export function hoyISO(ahora = new Date()) {
  const a = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

/** '2026-11-11' → '11 nov 2026' */
export function fecha(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** 45 → 'hace 45 días'; 120 → 'hace 4 meses' */
export function haceTiempo(dias) {
  if (dias === null || dias === undefined) return '';
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 60) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  if (meses < 24) return `hace ${meses} meses`;
  return `hace ${Math.round(dias / 365)} años`;
}

/** Cantidad fácil de leer: 352,4 g → "352"; 1,25 kg → "1,25"; 7,2 ud → "7,2" */
export function cantidad(n, unidad) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  if ((unidad === 'g' || unidad === 'ml') && Math.abs(n) >= 10) return numero(Math.round(n), 0);
  return numero(n, 2);
}

/** 90 → "1 h 30 min"; 45 → "45 min" */
export function duracion(minutos) {
  if (!(minutos > 0)) return '';
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (h && m) return `${h} h ${m} min`;
  return h ? `${h} h` : `${m} min`;
}

/** 1479 → "1,48 kg"; 390 → "390 g" */
export function peso(gramos) {
  if (!(gramos > 0)) return '';
  return gramos >= 1000 ? `${numero(gramos / 1000, 2)} kg` : `${numero(Math.round(gramos), 0)} g`;
}
