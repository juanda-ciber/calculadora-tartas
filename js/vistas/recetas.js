// Pantallas "Tartas" (recetas para vender) y "Bases" (preparaciones que se
// usan dentro de otras: bizcochos, rellenos, cremas…).
import * as almacen from '../almacen.js';
import { crearContexto, calcularReceta, calcularPrecio } from '../calculos.js';
import { euros } from '../formato.js';
import { esc, normalizar } from './comun.js';
import { htmlRecordatorioCopia } from './copia-ui.js';

// Búsqueda y filtro recordados por separado en cada pantalla.
const estado = { venta: { busqueda: '', filtro: 'todas' }, preparacion: { busqueda: '', filtro: 'todas' } };

const TEXTOS = {
  venta: {
    titulo: 'Tartas',
    nueva: 'Nueva tarta',
    buscar: 'Buscar tarta…',
    ayuda: 'Tus tartas y postres para vender, con el precio que deberías cobrar.',
  },
  preparacion: {
    titulo: 'Bases y rellenos',
    nueva: 'Nueva base',
    buscar: 'Buscar base o relleno…',
    ayuda: 'Bizcochos, rellenos y cremas. Se usan para montar las tartas: si cambias una, se actualizan todas las tartas que la llevan.',
  },
};

export async function vistaRecetas(cont, uso = 'venta') {
  const [todas, productos, ajustes] = await Promise.all([
    almacen.listar('recetas'), almacen.listar('productos'), almacen.leerAjustes(),
  ]);
  const ctx = crearContexto(productos, todas);
  const recetas = todas.filter((r) => (uso === 'venta' ? r.uso === 'venta' : r.uso !== 'venta'));
  const t = TEXTOS[uso];
  const e = estado[uso];

  const calculos = new Map(recetas.map((r) => {
    const c = calcularReceta(r, ctx);
    return [r.id, { c, p: uso === 'venta' ? calcularPrecio(r, c, ajustes) : null }];
  }));

  cont.innerHTML = `
    <header class="cabecera">
      <h1>${t.titulo}</h1>
      <a class="boton principal" href="#/receta/nueva?uso=${uso}">+ Añadir</a>
    </header>
    <p class="ayuda">${t.ayuda}</p>
    ${uso === 'venta' ? htmlRecordatorioCopia(ajustes, recetas.length > 0) : ''}
    ${recetas.length ? `
      <label class="buscador">
        <span class="oculto">${t.buscar}</span>
        <input type="search" id="buscar" placeholder="🔍 ${t.buscar}" value="${esc(e.busqueda)}" autocomplete="off">
      </label>
      <div class="filtros" role="group" aria-label="Filtrar">
        <button type="button" class="chip" data-filtro="todas" aria-pressed="${e.filtro === 'todas'}">Todas</button>
        <button type="button" class="chip" data-filtro="revisar" aria-pressed="${e.filtro === 'revisar'}">Les faltan datos</button>
      </div>` : ''}
    <div id="lista"></div>`;

  const lista = cont.querySelector('#lista');

  if (recetas.length === 0) {
    lista.innerHTML = uso === 'venta' ? `
      <div class="bienvenida">
        <h2>Crea tu primera tarta 🎂</h2>
        <p>Una tarta se monta como en la cocina:</p>
        <ol>
          <li><strong>Bases y rellenos</strong> que ya tienes (bizcocho de vainilla, brigadeiro, crema…).</li>
          <li><strong>Materiales</strong>: caja, base de cartón, velas, topper…</li>
          <li><strong>Tu tiempo</strong> de trabajo.</li>
        </ol>
        <p>Con eso la app te dice <strong>cuánto cobrar</strong>.</p>
        <a class="boton principal grande" href="#/receta/nueva?uso=venta">Crear mi primera tarta</a>
      </div>`
      : '<p class="vacio">Todavía no hay bases. Pulsa <strong>+ Añadir</strong> para crear la primera.</p>';
    return;
  }

  function pintar() {
    const q = normalizar(e.busqueda);
    const visibles = recetas.filter((r) => {
      const { c, p } = calculos.get(r.id);
      if (e.filtro === 'revisar' && c.completa && !(p?.avisos.length)) return false;
      if (!q) return true;
      const texto = normalizar(`${r.nombre} ${r.categoria}`);
      return q.split(/\s+/).every((x) => texto.includes(x));
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    if (visibles.length === 0) {
      lista.innerHTML = '<p class="vacio">No hay ninguna que coincida.</p>';
      return;
    }

    const grupos = new Map();
    for (const r of visibles) {
      const cat = r.categoria || 'Sin categoría';
      if (!grupos.has(cat)) grupos.set(cat, []);
      grupos.get(cat).push(r);
    }

    lista.innerHTML = [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'es')).map((cat) => `
      <section class="grupo">
        <h2 class="grupo-titulo">${esc(cat)}</h2>
        ${grupos.get(cat).map((r) => {
          const { c, p } = calculos.get(r.id);
          const faltan = !c.completa || p?.avisos.length;
          let detalle;
          if (p) {
            detalle = `<span class="tarjeta-precio">${euros(p.precio)}</span>
              <span class="tarjeta-detalle">${p.porRacion !== null ? `${euros(p.porRacion)} / ración · ` : ''}te llevas ${euros(p.teLlevas)}</span>`;
          } else {
            detalle = `<span class="tarjeta-detalle">Coste ${euros(c.coste)}${c.costePorKg !== null ? ` · ${euros(c.costePorKg)} / kg` : ''}</span>`;
          }
          return `
            <a class="tarjeta" href="#/receta/${encodeURIComponent(r.id)}">
              <span class="tarjeta-titulo">${esc(r.nombre)}</span>
              ${detalle}
              ${faltan ? '<span class="etiquetas"><span class="etiqueta alerta">Le faltan datos</span></span>' : ''}
            </a>`;
        }).join('')}
      </section>`).join('');
  }

  cont.querySelector('#buscar').addEventListener('input', (ev) => { e.busqueda = ev.target.value; pintar(); });
  cont.querySelector('.filtros').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-filtro]');
    if (!b) return;
    e.filtro = b.dataset.filtro;
    cont.querySelectorAll('[data-filtro]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    pintar();
  });
  pintar();
}
