// Capa de almacenamiento. Es el ÚNICO archivo que sabe DÓNDE se guardan
// los datos. Ahora usa localStorage (memoria del navegador del propio
// dispositivo). Para pasar a la nube más adelante, basta con reescribir
// este archivo manteniendo las mismas funciones (todas devuelven promesas,
// igual que lo haría una base de datos en internet).

const CLAVE = 'calculadora-tartas:datos';
const VERSION = 1;

let datos = null; // copia en memoria

function vacio() {
  return { version: VERSION, productos: [], proveedores: [], recetas: [], ajustes: {} };
}

function escribir() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    throw new Error(
      'No se ha podido guardar. Puede que el móvil no tenga espacio o que estés en modo incógnito.'
    );
  }
}

/** Carga los datos. Si es la primera vez, usa los datos iniciales. */
export async function iniciar(cargarIniciales) {
  let texto = null;
  try {
    texto = localStorage.getItem(CLAVE);
  } catch {
    texto = null;
  }
  if (texto) {
    try {
      datos = { ...vacio(), ...JSON.parse(texto) };
      return { primeraVez: false };
    } catch {
      // Datos dañados: se guardan aparte para no perderlos y se empieza de nuevo.
      try { localStorage.setItem(CLAVE + ':danado', texto); } catch { /* sin espacio */ }
    }
  }
  datos = { ...vacio(), ...(cargarIniciales ? await cargarIniciales() : {}) };
  escribir();
  return { primeraVez: true };
}

function coleccion(nombre) {
  if (!datos) throw new Error('Los datos aún no están cargados.');
  if (!Array.isArray(datos[nombre])) datos[nombre] = [];
  return datos[nombre];
}

/** Crea un identificador único para un elemento nuevo. */
export function nuevoId(prefijo) {
  const aleatorio = globalThis.crypto?.randomUUID?.() ??
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  return `${prefijo}-${aleatorio}`;
}

export async function listar(nombre) {
  return structuredClone(coleccion(nombre));
}

export async function obtener(nombre, id) {
  const el = coleccion(nombre).find((x) => x.id === id);
  return el ? structuredClone(el) : null;
}

/** Guarda (crea o reemplaza) un elemento. */
export async function guardar(nombre, elemento) {
  const lista = coleccion(nombre);
  const copia = structuredClone(elemento);
  const i = lista.findIndex((x) => x.id === copia.id);
  if (i >= 0) lista[i] = copia;
  else lista.push(copia);
  escribir();
  return structuredClone(copia);
}

export async function borrar(nombre, id) {
  const lista = coleccion(nombre);
  const i = lista.findIndex((x) => x.id === id);
  if (i >= 0) {
    lista.splice(i, 1);
    escribir();
  }
}

export async function leerAjustes() {
  if (!datos) throw new Error('Los datos aún no están cargados.');
  return structuredClone(datos.ajustes ?? {});
}

export async function guardarAjustes(cambios) {
  datos.ajustes = { ...(datos.ajustes ?? {}), ...structuredClone(cambios) };
  escribir();
  return structuredClone(datos.ajustes);
}

/** Todos los datos juntos (para la copia de seguridad). */
export async function exportarTodo() {
  return structuredClone(datos);
}

/**
 * Reemplaza TODOS los datos (al recuperar una copia de seguridad).
 * Si no se puede guardar, deja los datos como estaban.
 */
export async function reemplazarTodo(nuevos) {
  const anteriores = datos;
  datos = { ...vacio(), ...structuredClone(nuevos), version: VERSION };
  try {
    escribir();
  } catch (err) {
    datos = anteriores;
    throw err;
  }
}
