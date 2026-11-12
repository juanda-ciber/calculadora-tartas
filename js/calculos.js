// Cálculos de precios. Solo funciones "puras": reciben datos y devuelven
// resultados, sin tocar la pantalla ni el almacenamiento. Así se pueden
// probar fácilmente (ver carpeta pruebas/).
import { aBase, MEDIDAS, medidaDeUnidad } from './unidades.js';

/**
 * Precio por unidad base (€ por gramo, por ml o por unidad).
 * precio = { cantidad: 1, unidad: 'kg', precio: 1.61 } → 0,00161 €/g
 */
export function precioPorBase(precio) {
  if (!precio) return null;
  const base = aBase(precio.cantidad, precio.unidad);
  if (!(base > 0)) return null;
  if (typeof precio.precio !== 'number' || !(precio.precio >= 0)) return null;
  return precio.precio / base;
}

/** Precio "de referencia" fácil de leer: € por kg, por L o por unidad. */
export function precioReferencia(porBase, medida) {
  if (porBase === null || porBase === undefined) return null;
  const m = MEDIDAS[medida];
  if (!m) return null;
  return porBase * m.unidades[m.referencia];
}

/**
 * Qué precio se usa para calcular las recetas.
 * - producto.usarPrecio === 'barato' (o vacío) → el más barato por g/ml/ud.
 * - producto.usarPrecio === id de un precio → ese, si es válido;
 *   si no lo es, se usa el más barato.
 * Devuelve { precio, porBase } o null si no hay ningún precio válido.
 */
export function precioVigente(producto) {
  const validos = (producto?.precios ?? [])
    .map((p) => ({ precio: p, porBase: precioPorBase(p) }))
    .filter((x) => x.porBase !== null);
  if (validos.length === 0) return null;
  if (producto.usarPrecio && producto.usarPrecio !== 'barato') {
    const elegido = validos.find((x) => x.precio.id === producto.usarPrecio);
    if (elegido) return elegido;
  }
  return validos.reduce((min, x) => (x.porBase < min.porBase ? x : min));
}

/** Días que han pasado desde una fecha 'AAAA-MM-DD' hasta hoy. */
export function diasDesde(fechaISO, hoyISO) {
  if (!fechaISO) return null;
  const a = Date.parse(fechaISO + 'T00:00:00Z');
  const b = Date.parse(hoyISO + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** ¿El precio lleva más de `dias` días sin actualizarse? */
export function esPrecioAntiguo(precio, dias, hoyISO) {
  const d = diasDesde(precio?.fecha, hoyISO);
  return d !== null && d > dias;
}

/**
 * Aplica un cambio a un precio. Si cambia el importe o el tamaño del
 * paquete, el valor anterior se guarda en el historial.
 * Devuelve un objeto nuevo (no modifica el original).
 */
export function actualizarPrecio(anterior, cambios, hoyISO) {
  const nuevo = { ...anterior, ...cambios, historial: [...(anterior.historial ?? [])] };
  const cambiaImporte =
    anterior.precio !== nuevo.precio ||
    anterior.cantidad !== nuevo.cantidad ||
    anterior.unidad !== nuevo.unidad;
  if (cambiaImporte && typeof anterior.precio === 'number') {
    nuevo.historial.push({
      precio: anterior.precio,
      cantidad: anterior.cantidad,
      unidad: anterior.unidad,
      fecha: anterior.fecha,
    });
  }
  // Al confirmar el precio (aunque no cambie) la fecha pasa a ser hoy.
  nuevo.fecha = hoyISO;
  return nuevo;
}

/** Saca el dominio de un enlace: 'https://www.carrefour.es/x' → 'carrefour.es'. */
export function dominioDe(enlace) {
  try {
    const url = new URL(String(enlace).trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** ¿Es un enlace web seguro de abrir? (solo http y https) */
export function esEnlaceValido(enlace) {
  return dominioDe(enlace) !== null;
}

/**
 * Busca qué proveedor corresponde a un enlace, comparando su web
 * (ej. 'carrefour.es') con el dominio del enlace (ej. 'carrefour.es'
 * o 'tienda.mercadona.es').
 */
export function detectarProveedor(enlace, proveedores) {
  const dominio = dominioDe(enlace);
  if (!dominio) return null;
  return (
    proveedores.find((p) => {
      const web = dominioDe(p.web?.includes('://') ? p.web : 'https://' + (p.web ?? '')) ;
      return web && (dominio === web || dominio.endsWith('.' + web));
    }) ?? null
  );
}

/** Propone un nombre de tienda a partir del enlace: 'tienda.mercadona.es' → 'Mercadona'. */
export function nombreTiendaDesdeEnlace(enlace) {
  const dominio = dominioDe(enlace);
  if (!dominio) return null;
  const partes = dominio.split('.');
  const principal = partes.length >= 2 ? partes[partes.length - 2] : partes[0];
  return principal.charAt(0).toUpperCase() + principal.slice(1);
}

// ---------------------------------------------------------------------------
// RECETAS
// Una receta tiene "líneas". Cada línea es:
//   - un producto: { id, productoId, cantidad, unidad }  (unidad: g, kg, ml, L, ud)
//   - otra receta (sub-receta): { id, recetaId, cantidad, unidad }
//     con unidad 'receta' (veces la receta entera) o 'g' / 'kg' (por peso).
// ---------------------------------------------------------------------------

export const UNIDADES_SUBRECETA = ['receta', 'g', 'kg'];

/** Prepara búsquedas rápidas por id. */
export function crearContexto(productos, recetas) {
  return {
    productos: new Map(productos.map((p) => [p.id, p])),
    recetas: new Map(recetas.map((r) => [r.id, r])),
  };
}

/**
 * Gramos que aporta una cantidad de producto (para el peso de la receta).
 * g/kg → gramos; ml/L → se cuenta 1 ml ≈ 1 g; unidades → solo si el
 * producto tiene "peso por unidad" (ej. huevo = 55 g). Si no se sabe, null.
 */
export function gramosDeProducto(producto, cantidad, unidad) {
  const base = aBase(cantidad, unidad);
  if (base === null) return null;
  const medida = medidaDeUnidad(unidad);
  if (medida === 'peso' || medida === 'volumen') return base;
  return producto?.pesoUnidad > 0 ? base * producto.pesoUnidad : null;
}

function calcularLinea(linea, ctx, visitando) {
  const r = { linea, nombre: '', tipo: 'ingrediente', coste: null, gramos: null, problema: null };
  const cantidad = linea.cantidad;
  const cantidadOk = typeof cantidad === 'number' && Number.isFinite(cantidad) && cantidad >= 0;

  if (linea.productoId) {
    const p = ctx.productos.get(linea.productoId);
    if (!p) { r.nombre = 'Producto borrado'; r.problema = 'Este producto ya no existe. Quítalo de la receta.'; return r; }
    r.nombre = p.nombre;
    r.tipo = p.tipo === 'material' ? 'material' : 'ingrediente';
    if (!cantidadOk) { r.problema = `Falta la cantidad de ${p.nombre}.`; return r; }
    if (medidaDeUnidad(linea.unidad) !== p.medida) {
      r.problema = `La unidad de ${p.nombre} no encaja: se mide en ${MEDIDAS[p.medida]?.nombre.toLowerCase()}.`;
      return r;
    }
    const vigente = precioVigente(p);
    if (!vigente) r.problema = `Falta el precio de ${p.nombre}.`;
    else r.coste = aBase(cantidad, linea.unidad) * vigente.porBase;
    if (r.tipo === 'ingrediente') r.gramos = gramosDeProducto(p, cantidad, linea.unidad);
    return r;
  }

  if (linea.recetaId) {
    r.tipo = 'receta';
    const sub = ctx.recetas.get(linea.recetaId);
    if (!sub) { r.nombre = 'Receta borrada'; r.problema = 'Esta receta ya no existe. Quítala de aquí.'; return r; }
    r.nombre = sub.nombre;
    if (!cantidadOk) { r.problema = `Falta la cantidad de ${sub.nombre}.`; return r; }
    const res = calcularReceta(sub, ctx, visitando);
    if (res.bucle) { r.problema = `«${sub.nombre}» no puede usarse dentro de sí misma.`; return r; }
    let veces = null;
    if (linea.unidad === 'receta') veces = cantidad;
    else if (linea.unidad === 'g' || linea.unidad === 'kg') {
      const gramos = aBase(cantidad, linea.unidad);
      if (res.peso > 0) veces = gramos / res.peso;
      else { r.problema = `No se sabe cuánto pesa «${sub.nombre}». Escribe su peso final en esa receta o usa "receta entera".`; return r; }
    } else { r.problema = `La unidad de ${sub.nombre} no es válida.`; return r; }
    r.coste = res.coste * veces;
    r.gramos = res.peso > 0 ? res.peso * veces : null;
    if (!res.completa) r.problema = `A «${sub.nombre}» le faltan precios: el coste puede ser mayor.`;
    return r;
  }

  r.problema = 'Línea vacía.';
  return r;
}

/**
 * Calcula todo lo de una receta:
 *   coste (€), completa (¿están todos los precios?), lineas (detalle),
 *   peso (g), costePorRacion, costePorKg...
 */
export function calcularReceta(receta, ctx, visitando = new Set()) {
  if (visitando.has(receta.id)) return { bucle: true, coste: 0, completa: false, lineas: [], peso: null };
  const dentro = new Set(visitando).add(receta.id);
  const lineas = (receta.lineas ?? []).map((l) => calcularLinea(l, ctx, dentro));
  const coste = lineas.reduce((s, l) => s + (l.coste ?? 0), 0);
  const problemas = lineas.filter((l) => l.problema).map((l) => l.problema);
  const conPeso = lineas.filter((l) => l.tipo !== 'material');
  const pesoCalculado = conPeso.reduce((s, l) => s + (l.gramos ?? 0), 0);
  const pesoParcial = conPeso.some((l) => l.gramos === null);
  const peso = receta.pesoFinal > 0 ? receta.pesoFinal : pesoCalculado;
  return {
    coste,
    completa: problemas.length === 0,
    problemas,
    lineas,
    pesoCalculado,
    pesoParcial,
    peso,
    costeIngredientes: lineas.filter((l) => l.tipo !== 'material').reduce((s, l) => s + (l.coste ?? 0), 0),
    costeMateriales: lineas.filter((l) => l.tipo === 'material').reduce((s, l) => s + (l.coste ?? 0), 0),
    costePorRacion: receta.raciones > 0 ? coste / receta.raciones : null,
    costePorKg: peso > 0 ? (coste / peso) * 1000 : null,
  };
}

/** ¿La receta `recetaId` usa (directa o indirectamente) la receta `buscadaId`? */
export function usaReceta(recetaId, buscadaId, ctx, visitadas = new Set()) {
  if (recetaId === buscadaId) return true;
  if (visitadas.has(recetaId)) return false;
  visitadas.add(recetaId);
  const r = ctx.recetas.get(recetaId);
  return (r?.lineas ?? []).some((l) => l.recetaId && usaReceta(l.recetaId, buscadaId, ctx, visitadas));
}

/** Recetas que usan directamente esta receta o este producto. */
export function recetasQueUsan(id, recetas) {
  return recetas.filter((r) => (r.lineas ?? []).some((l) => l.productoId === id || l.recetaId === id));
}

/**
 * Multiplica las cantidades de una receta (para escalarla).
 * Los materiales (caja, base, velas…) NO se multiplican: una tarta más
 * grande sigue llevando una caja. Para saberlo hace falta el contexto.
 */
export function escalarReceta(receta, factor, ctx = null) {
  const esMaterial = (l) => l.productoId && ctx?.productos.get(l.productoId)?.tipo === 'material';
  return {
    ...receta,
    lineas: (receta.lineas ?? []).map((l) => ({
      ...l,
      cantidad: typeof l.cantidad === 'number' && !esMaterial(l) ? l.cantidad * factor : l.cantidad,
    })),
    raciones: receta.raciones > 0 ? Math.max(1, Math.round(receta.raciones * factor)) : receta.raciones,
    pesoFinal: receta.pesoFinal > 0 ? receta.pesoFinal * factor : receta.pesoFinal,
  };
}

/** Molde redondo: de 20 cm a 24 cm hace falta 1,44 veces la receta (por superficie). */
export function factorMolde(desdeCm, hastaCm) {
  if (!(desdeCm > 0) || !(hastaCm > 0)) return null;
  return (hastaCm / desdeCm) ** 2;
}

/** De 8 a 12 raciones → 1,5 veces la receta. */
export function factorRaciones(desde, hasta) {
  if (!(desde > 0) || !(hasta > 0)) return null;
  return hasta / desde;
}

// ---------------------------------------------------------------------------
// PRECIO DE VENTA
// coste total = ingredientes + materiales + otros gastos
//             + gastos de casa (luz, gas, agua, desgaste) + tu trabajo
// precio      = coste total + beneficio (margen %), redondeado hacia arriba
// ---------------------------------------------------------------------------

/** Valores recomendados (se pueden cambiar en Ajustes). */
export const AJUSTES_PRECIO = {
  precioHora: 12,          // € por hora de trabajo
  modoGastos: 'porcentaje', // 'porcentaje' o 'mensual'
  gastosPct: 10,           // % sobre ingredientes y materiales
  gastosMensuales: 0,      // € al mes (modo mensual)
  tartasMes: 0,            // tartas que vende al mes (modo mensual)
  margenPct: 30,           // % de beneficio sobre el coste total
  redondeo: 'auto',        // 'auto', 0 (sin redondear), 0.5, 1
};

/** Ajustes guardados + valores recomendados para lo que falte. */
export function ajustesPrecio(ajustes = {}) {
  const r = { ...AJUSTES_PRECIO };
  for (const k of Object.keys(AJUSTES_PRECIO)) {
    if (ajustes[k] !== undefined && ajustes[k] !== null && ajustes[k] !== '') r[k] = ajustes[k];
  }
  return r;
}

/**
 * Redondea hacia arriba. 'auto': a 0,50 € si es menos de 10 €; a 1 € si es más.
 * 63,35 → 64 ; 3,20 → 3,50 ; con 0 no redondea.
 */
export function redondearPrecio(precio, redondeo = 'auto') {
  if (!(precio > 0)) return 0;
  const paso = redondeo === 'auto' ? (precio < 10 ? 0.5 : 1) : Number(redondeo);
  if (!(paso > 0)) return Math.round(precio * 100) / 100;
  // El pequeño margen evita que 64,0000001 suba a 65 por errores de decimales.
  return Math.ceil(precio / paso - 1e-9) * paso;
}

/**
 * Calcula el precio de venta de una receta a partir de su cálculo de costes
 * (lo que devuelve calcularReceta) y de los ajustes.
 */
export function calcularPrecio(receta, calculo, ajustesGuardados = {}) {
  const a = ajustesPrecio(ajustesGuardados);
  const ingredientes = calculo.costeIngredientes;
  const materiales = calculo.costeMateriales;
  const otros = receta.otrosGastos > 0 ? receta.otrosGastos : 0;

  let gastosCasa = 0;
  let explicacionGastos = '';
  if (a.modoGastos === 'mensual') {
    if (a.tartasMes > 0) {
      gastosCasa = a.gastosMensuales / a.tartasMes;
      explicacionGastos = `gastos del mes ÷ ${a.tartasMes} tartas`;
    } else {
      explicacionGastos = 'falta el número de tartas al mes en Ajustes';
    }
  } else {
    gastosCasa = ((ingredientes + materiales) * a.gastosPct) / 100;
    explicacionGastos = `${a.gastosPct} % de ingredientes y materiales`;
  }

  const horas = receta.minutos > 0 ? receta.minutos / 60 : 0;
  const trabajo = horas * a.precioHora;
  const costeTotal = ingredientes + materiales + otros + gastosCasa + trabajo;
  const beneficio = (costeTotal * a.margenPct) / 100;
  const precioExacto = costeTotal + beneficio;
  const precio = redondearPrecio(precioExacto, a.redondeo);
  const beneficioReal = precio - costeTotal;

  const avisos = [];
  if (!(horas > 0)) avisos.push('No has puesto cuánto tiempo trabajas en ella: el precio no incluye tu trabajo.');
  if (!calculo.completa) avisos.push('Faltan precios de algún ingrediente: el precio real debería ser algo mayor.');
  if (a.modoGastos === 'mensual' && !(a.tartasMes > 0)) avisos.push('Para repartir los gastos del mes, escribe en Ajustes cuántas tartas vendes al mes.');

  return {
    ajustes: a,
    ingredientes, materiales, otros, gastosCasa, explicacionGastos,
    horas, trabajo, costeTotal, beneficio, precioExacto, precio, beneficioReal,
    // Lo que se lleva la repostera: su trabajo + el beneficio.
    teLlevas: trabajo + beneficioReal,
    porRacion: receta.raciones > 0 ? precio / receta.raciones : null,
    avisos,
  };
}

/**
 * Si ya la vende a un precio, ¿cuánto gana de verdad?
 * Devuelve lo que le queda tras pagar ingredientes, materiales y gastos,
 * y a cuánto le sale la hora de trabajo.
 */
export function analizarPrecioActual(precioActual, p) {
  if (!(precioActual > 0)) return null;
  const gastosSinTrabajo = p.costeTotal - p.trabajo;
  const leQueda = precioActual - gastosSinTrabajo;
  return {
    leQueda,
    porHora: p.horas > 0 ? leQueda / p.horas : null,
    diferencia: precioActual - p.precio, // negativo: cobra menos de lo recomendado
    pierde: leQueda < 0,
  };
}
