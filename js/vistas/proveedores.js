// Pantalla: tiendas (proveedores).
import * as almacen from '../almacen.js';
import { dominioDe } from '../calculos.js';
import { esc, normalizar, avisar, abrirDialogo, confirmar, mostrarError } from './comun.js';

export async function vistaProveedores(cont) {
  const [proveedores, productos] = await Promise.all([almacen.listar('proveedores'), almacen.listar('productos')]);
  const usos = (id) => productos.reduce((n, p) => n + p.precios.filter((x) => x.proveedorId === id).length, 0);
  proveedores.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  cont.innerHTML = `
    <header class="cabecera">
      <h1>Tiendas</h1>
      <button type="button" class="boton principal" id="nueva">+ Añadir</button>
    </header>
    <p class="ayuda">Donde compras los productos. Si guardas su web, la app la reconoce sola al pegar un enlace.</p>
    <div class="lista">
      ${proveedores.length === 0 ? '<p class="vacio">Todavía no hay tiendas.</p>' : proveedores.map((t) => {
        const n = usos(t.id);
        return `
          <button type="button" class="tarjeta" data-id="${esc(t.id)}">
            <span class="tarjeta-titulo">${esc(t.nombre)}</span>
            <span class="tarjeta-detalle">${t.web ? esc(t.web) + ' · ' : ''}${n === 0 ? 'Sin precios todavía' : n === 1 ? '1 precio' : `${n} precios`}</span>
          </button>`;
      }).join('')}
    </div>`;

  function dialogo(tienda) {
    const d = abrirDialogo(`
      <form class="formulario" novalidate>
        <h2>${tienda ? 'Editar tienda' : 'Nueva tienda'}</h2>
        <label class="campo"><span>Nombre</span>
          <input name="nombre" value="${esc(tienda?.nombre ?? '')}" placeholder="Ej.: Mercadona" autocomplete="off"></label>
        <label class="campo"><span>Web <small>(opcional)</small></span>
          <input name="web" value="${esc(tienda?.web ?? '')}" placeholder="Ej.: mercadona.es" inputmode="url" autocomplete="off"></label>
        <p class="error-form" role="alert" hidden></p>
        <div class="botones">
          <button type="submit" class="boton principal grande">Guardar</button>
          <button type="button" class="boton" data-cancelar>Cancelar</button>
          ${tienda ? '<button type="button" class="boton peligro" data-borrar>Borrar tienda</button>' : ''}
        </div>
      </form>`);
    const f = d.querySelector('form');

    d.addEventListener('click', async (e) => {
      if (e.target.closest('[data-cancelar]')) d.close();
      if (e.target.closest('[data-borrar]')) {
        const n = usos(tienda.id);
        const ok = await confirmar(
          n ? `«${tienda.nombre}» tiene ${n} precio(s). Si la borras, esos precios se quedan como "Tienda sin indicar". ¿Borrarla?`
            : `¿Borrar la tienda «${tienda.nombre}»?`,
          { si: 'Borrar', peligro: true });
        if (!ok) return;
        for (const p of productos) {
          if (p.precios.some((x) => x.proveedorId === tienda.id)) {
            p.precios = p.precios.map((x) => (x.proveedorId === tienda.id ? { ...x, proveedorId: null } : x));
            await almacen.guardar('productos', p);
          }
        }
        await almacen.borrar('proveedores', tienda.id);
        d.close();
        avisar('Tienda borrada');
        vistaProveedores(cont);
      }
    });

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = f.elements.nombre.value.trim().replace(/\s+/g, ' ');
      let web = f.elements.web.value.trim();
      if (!nombre) return mostrarError(f, 'Escribe el nombre de la tienda.');
      if (proveedores.some((t) => t.id !== tienda?.id && normalizar(t.nombre) === normalizar(nombre))) {
        return mostrarError(f, `Ya tienes una tienda llamada «${nombre}».`);
      }
      if (web) {
        const dominio = dominioDe(web.includes('://') ? web : 'https://' + web);
        if (!dominio || !dominio.includes('.')) return mostrarError(f, 'La web no parece correcta. Escribe algo como mercadona.es, o déjala vacía.');
        web = dominio;
      }
      await almacen.guardar('proveedores', { id: tienda?.id ?? almacen.nuevoId('tienda'), nombre, web });
      d.close();
      avisar('Tienda guardada');
      vistaProveedores(cont);
    });
    f.elements.nombre.focus();
  }

  cont.querySelector('#nueva').addEventListener('click', () => dialogo(null));
  cont.querySelector('.lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) dialogo(proveedores.find((t) => t.id === b.dataset.id));
  });
}
