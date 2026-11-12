// Unidades de medida y conversiones.
// Todo se guarda internamente en una "unidad base":
//   peso → gramos (g), líquido → mililitros (ml), unidades → ud.
// Así la usuaria puede escribir kg, g, L o ml y la app convierte sola.

export const MEDIDAS = {
  peso: { base: 'g', nombre: 'Peso', unidades: { g: 1, kg: 1000 }, referencia: 'kg' },
  volumen: { base: 'ml', nombre: 'Líquido', unidades: { ml: 1, L: 1000 }, referencia: 'L' },
  unidades: { base: 'ud', nombre: 'Unidades', unidades: { ud: 1 }, referencia: 'ud' },
};

export const NOMBRE_UNIDAD = {
  g: 'gramos', kg: 'kilos', ml: 'mililitros', L: 'litros', ud: 'unidades',
};

export const NOMBRE_CORTO = { g: 'g', kg: 'kg', ml: 'ml', L: 'L', ud: 'ud.' };

/** Devuelve 'peso', 'volumen' o 'unidades' según la unidad (o null). */
export function medidaDeUnidad(unidad) {
  for (const [medida, datos] of Object.entries(MEDIDAS)) {
    if (unidad in datos.unidades) return medida;
  }
  return null;
}

/** Lista de unidades que se pueden usar con una medida. */
export function unidadesDe(medida) {
  return Object.keys(MEDIDAS[medida]?.unidades ?? {});
}

/** Pasa una cantidad a la unidad base (g, ml o ud). Devuelve null si no se puede. */
export function aBase(cantidad, unidad) {
  const medida = medidaDeUnidad(unidad);
  if (!medida || typeof cantidad !== 'number' || !Number.isFinite(cantidad)) return null;
  return cantidad * MEDIDAS[medida].unidades[unidad];
}

/** Convierte una cantidad entre dos unidades de la misma medida (ej. 0,5 kg → 500 g). */
export function convertir(cantidad, desde, hasta) {
  if (medidaDeUnidad(desde) !== medidaDeUnidad(hasta)) return null;
  const base = aBase(cantidad, desde);
  if (base === null) return null;
  return base / MEDIDAS[medidaDeUnidad(hasta)].unidades[hasta];
}
