// Pantalla: lista de productos con buscador y filtros.
import * as almacen from '../almacen.js';
import { precioVigente, precioReferencia, esPrecioAntiguo, diasDesde } from '../calculos.js';
import { MEDIDAS } from '../unidades.js';
import { euros, hoyISO, haceTiempo } from '../formato.js';
import { esc, normalizar } from './comun.js';

// Se recuerdan al cambiar de pantalla y volver.
let busqueda = '';
let filtro = 'todos';

const FILTROS = [
  ['todos', 'Todos'],
  ['ingrediente', 'Ingredientes'],
  ['material', 'Materiales'],
  ['revisar', 'Para revisar'],
];

/** Problemas de un producto: falta el precio o es antiguo. */
export function estadoProducto(producto, diasAviso, hoy) {
  const vigente = precioVigente(producto);
  if (!vigente) return { vigente, faltaPrecio: true, antiguo: false };
  return { vigente, faltaPrecio: false, antiguo: esPrecioAntiguo(vigente.precio, diasAviso, hoy) };
}

export async function vistaProductos(cont) {
  const [productos, proveedores, ajustes] = await Promise.all([
    almacen.listar('productos'), almacen.listar('proveedores'), almacen.leerAjustes(),
  ]);
  const diasAviso = ajustes.diasAvisoPrecio ?? 90;
  const hoy = hoyISO();
  const nombreTienda = (id) => proveedores.find((p) => p.id === id)?.nombre ?? 'Tienda sin indicar';

  cont.innerHTML = `
    <header class="cabecera">
      <h1>Productos</h1>
      <a class="boton principal" href="#/producto/nuevo">+ Añadir</a>
    </header>
    <label class="buscador">
      <span class="oculto">Buscar producto</span>
      <input type="search" id="buscar" placeholder="🔍 Buscar producto…" value="${esc(busqueda)}" autocomplete="off">
    </label>
    <div class="filtros" role="group" aria-label="Filtrar">
      ${FILTROS.map(([v, t]) => `<button type="button" class="chip" data-filtro="${v}" aria-pressed="${filtro === v}">${t}</button>`).join('')}
    </div>
    <div id="lista"></div>`;

  const lista = cont.querySelector('#lista');

  function pintar() {
    const q = normalizar(busqueda);
    const visibles = productos
      .map((p) => ({ p, e: estadoProducto(p, diasAviso, hoy) }))
      .filter(({ p, e }) => {
        if (filtro === 'ingrediente' || filtro === 'material') { if (p.tipo !== filtro) return false; }
        if (filtro === 'revisar' && !e.faltaPrecio && !e.antiguo) return false;
        if (!q) return true;
        const texto = normalizar([p.nombre, p.categoria, ...p.precios.map((x) => x.nombreTienda)].join(' '));
        return q.split(/\s+/).every((palabra) => texto.includes(palabra));
      })
      .sort((a, b) => a.p.nombre.localeCompare(b.p.nombre, 'es'));

    if (visibles.length === 0) {
      lista.innerHTML = productos.length === 0
        ? `<p class="vacio">Todavía no hay productos. Pulsa <strong>+ Añadir</strong> para crear el primero.</p>`
        : `<p class="vacio">No hay ningún producto que coincida.${busqueda ? ` <a href="#/producto/nuevo?nombre=${encodeURIComponent(busqueda)}">Crear «${esc(busqueda)}»</a>` : ''}</p>`;
      return;
    }

    // Agrupar por categoría.
    const grupos = new Map();
    for (const item of visibles) {
      const cat = item.p.categoria || 'Sin categoría';
      if (!grupos.has(cat)) grupos.set(cat, []);
      grupos.get(cat).push(item);
    }
    const categorias = [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'es'));

    lista.innerHTML = categorias.map((cat) => `
      <section class="grupo">
        <h2 class="grupo-titulo">${esc(cat)}</h2>
        ${grupos.get(cat).map(({ p, e }) => {
          let detalle = '';
          if (!e.faltaPrecio) {
            const ref = precioReferencia(e.vigente.porBase, p.medida);
            const unidadRef = MEDIDAS[p.medida]?.referencia;
            detalle = `${euros(ref)} / ${unidadRef === 'ud' ? 'unidad' : unidadRef} · ${esc(nombreTienda(e.vigente.precio.proveedorId))}`;
          }
          const etiquetas = [
            e.faltaPrecio ? '<span class="etiqueta alerta">Falta el precio</span>' : '',
            e.antiguo ? `<span class="etiqueta aviso-suave">Precio de ${haceTiempo(diasDesde(e.vigente.precio.fecha, hoy))}</span>` : '',
            p.tipo === 'material' && filtro === 'todos' ? '<span class="etiqueta">Material</span>' : '',
          ].join('');
          return `
            <a class="tarjeta" href="#/producto/${encodeURIComponent(p.id)}">
              <span class="tarjeta-titulo">${esc(p.nombre)}</span>
              ${detalle ? `<span class="tarjeta-detalle">${detalle}</span>` : ''}
              ${etiquetas ? `<span class="etiquetas">${etiquetas}</span>` : ''}
            </a>`;
        }).join('')}
      </section>`).join('');
  }

  cont.querySelector('#buscar').addEventListener('input', (e) => { busqueda = e.target.value; pintar(); });
  cont.querySelector('.filtros').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    filtro = b.dataset.filtro;
    cont.querySelectorAll('[data-filtro]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    pintar();
  });

  pintar();
}
