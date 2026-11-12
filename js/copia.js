// Copia de seguridad: comprobar que un archivo es una copia válida de la app
// antes de recuperarla. Funciones puras (se prueban en pruebas/copia.test.js).

export const TIPO_COPIA = 'calculadora-tartas';

/** Prepara el contenido del archivo de copia. */
export function crearCopia(datos, fechaISO) {
  return { tipo: TIPO_COPIA, fecha: fechaISO, ...datos };
}

/** Nombre del archivo: copia-tartas-2026-11-12.json */
export function nombreArchivoCopia(fechaISO) {
  return `copia-tartas-${fechaISO}.json`;
}

/**
 * Lee el texto de un archivo de copia. Devuelve
 *   { ok: true, datos, resumen }  o  { ok: false, error: 'mensaje sencillo' }
 */
export function leerCopia(texto) {
  let obj;
  try {
    obj = JSON.parse(texto);
  } catch {
    return { ok: false, error: 'Este archivo no es una copia de la calculadora. Elige el archivo que empieza por «copia-tartas».' };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'Este archivo no es una copia de la calculadora.' };
  }
  // Las copias llevan tipo; también se aceptan datos sin él si tienen la forma correcta.
  if (obj.tipo && obj.tipo !== TIPO_COPIA) {
    return { ok: false, error: 'Este archivo es de otra aplicación, no de la calculadora de tartas.' };
  }
  for (const clave of ['productos', 'proveedores', 'recetas']) {
    if (!Array.isArray(obj[clave])) {
      return { ok: false, error: 'La copia está incompleta o dañada. Prueba con otro archivo de copia.' };
    }
  }
  const malos = [...obj.productos, ...obj.proveedores, ...obj.recetas]
    .some((x) => !x || typeof x.id !== 'string' || typeof x.nombre !== 'string');
  if (malos) return { ok: false, error: 'La copia está dañada. Prueba con otro archivo de copia.' };

  const { tipo, fecha, ...datos } = obj;
  datos.ajustes = obj.ajustes && typeof obj.ajustes === 'object' ? obj.ajustes : {};
  return {
    ok: true,
    datos,
    resumen: {
      fecha: fecha ?? null,
      productos: obj.productos.length,
      tiendas: obj.proveedores.length,
      tartas: obj.recetas.filter((r) => r.uso === 'venta').length,
      bases: obj.recetas.filter((r) => r.uso !== 'venta').length,
    },
  };
}
