// Pantalla: crear o editar un producto y sus precios por tienda.
import * as almacen from '../almacen.js';
import {
  precioPorBase, precioReferencia, precioVigente, esPrecioAntiguo, diasDesde,
  actualizarPrecio, detectarProveedor, nombreTiendaDesdeEnlace, esEnlaceValido, dominioDe,
} from '../calculos.js';
import { MEDIDAS, unidadesDe, NOMBRE_UNIDAD, NOMBRE_CORTO } from '../unidades.js';
import { euros, eurosPequenos, numero, leerNumero, hoyISO, fecha, haceTiempo } from '../formato.js';
import { esc, normalizar, avisar, abrirDialogo, confirmar, mostrarError } from './comun.js';

const TEXTO_MEDIDA = {
  peso: 'Peso (g, kg)',
  volumen: 'Líquido (ml, L)',
  unidades: 'Unidades (huevos, cajas…)',
};

/** "1,61 € / kg" o "0,25 € / unidad" */
function textoReferencia(porBase, medida) {
  const ref = precioReferencia(porBase, medida);
  const u = MEDIDAS[medida].referencia;
  return `${euros(ref)} / ${u === 'ud' ? 'unidad' : u}`;
}

export async function vistaProductoEditar(cont, id, consulta) {
  const [proveedores, ajustes, productos] = await Promise.all([
    almacen.listar('proveedores'), almacen.leerAjustes(), almacen.listar('productos'),
  ]);
  const esNuevo = id === 'nuevo';
  const guardado = esNuevo ? null : await almacen.obtener('productos', id);
  if (!esNuevo && !guardado) {
    cont.innerHTML = `<p class="vacio">Este producto ya no existe. <a href="#/productos">Volver a productos</a></p>`;
    return;
  }

  const borrador = guardado ?? {
    id: almacen.nuevoId('p'),
    nombre: consulta.get('nombre') ?? '',
    tipo: 'ingrediente',
    categoria: '',
    medida: 'peso',
    usarPrecio: 'barato',
    precios: [],
  };
  const diasAviso = ajustes.diasAvisoPrecio ?? 90;
  const hoy = hoyISO();

  const categoriasDe = (tipo) => {
    const base = tipo === 'material' ? ajustes.categoriasMaterial : ajustes.categoriasIngrediente;
    const lista = [...(base ?? [])];
    if (borrador.categoria && borrador.tipo === tipo && !lista.includes(borrador.categoria)) lista.push(borrador.categoria);
    return lista;
  };
  const nombreTienda = (pid) => proveedores.find((p) => p.id === pid)?.nombre ?? 'Tienda sin indicar';

  cont.innerHTML = `
    <header class="cabecera">
      <a class="volver" href="#/productos">‹ Productos</a>
      <h1>${esNuevo ? 'Nuevo producto' : esc(borrador.nombre)}</h1>
    </header>
    <form id="form-producto" class="formulario" novalidate>
      <label class="campo">
        <span>Nombre</span>
        <input name="nombre" required value="${esc(borrador.nombre)}" placeholder="Ej.: Harina de trigo" autocomplete="off">
      </label>

      <fieldset class="campo">
        <legend>¿Qué es?</legend>
        <div class="opciones">
          <label class="opcion"><input type="radio" name="tipo" value="ingrediente" ${borrador.tipo === 'ingrediente' ? 'checked' : ''}>
            <span><strong>Ingrediente</strong><small>Va dentro de la receta</small></span></label>
          <label class="opcion"><input type="radio" name="tipo" value="material" ${borrador.tipo === 'material' ? 'checked' : ''}>
            <span><strong>Material</strong><small>Caja, base, velas, topper…</small></span></label>
        </div>
      </fieldset>

      <label class="campo">
        <span>Categoría</span>
        <select name="categoria"></select>
      </label>
      <label class="campo" id="campo-nueva-cat" hidden>
        <span>Nombre de la nueva categoría</span>
        <input name="nuevaCategoria" placeholder="Ej.: Frutas" autocomplete="off">
      </label>

      <fieldset class="campo">
        <legend>¿Cómo se mide?</legend>
        <div class="opciones">
          ${Object.keys(MEDIDAS).map((m) => `
            <label class="opcion"><input type="radio" name="medida" value="${m}" ${borrador.medida === m ? 'checked' : ''}>
              <span><strong>${TEXTO_MEDIDA[m]}</strong></span></label>`).join('')}
        </div>
        <p class="ayuda" id="ayuda-medida" hidden>Para cambiar cómo se mide, primero borra sus precios.</p>
      </fieldset>

      <label class="campo" id="campo-peso-unidad" ${borrador.medida === 'unidades' ? '' : 'hidden'}>
        <span>¿Cuánto pesa cada unidad? <small>(gramos, opcional)</small></span>
        <input name="pesoUnidad" inputmode="decimal" value="${borrador.pesoUnidad > 0 ? numero(borrador.pesoUnidad) : ''}" placeholder="Ej.: 55 (un huevo sin cáscara)" autocomplete="off">
        <small>Sirve para calcular cuánto pesa una receta. Si no lo sabes, déjalo vacío.</small>
      </label>

      <section class="bloque">
        <h2>Precios</h2>
        <div id="precios"></div>
        <button type="button" class="boton" id="anadir-precio">+ Añadir precio</button>
      </section>

      <p class="error-form" role="alert" hidden></p>

      <div class="botones fijos">
        <button type="submit" class="boton principal grande">Guardar</button>
        ${esNuevo ? '' : '<button type="button" class="boton peligro" id="borrar">Borrar producto</button>'}
      </div>
    </form>`;

  const form = cont.querySelector('#form-producto');
  const selCat = form.elements.categoria;
  const campoNuevaCat = cont.querySelector('#campo-nueva-cat');

  function pintarCategorias() {
    const tipo = form.elements.tipo.value;
    const lista = categoriasDe(tipo);
    const actual = borrador.tipo === tipo && borrador.categoria ? borrador.categoria : lista[0];
    selCat.innerHTML = lista.map((c) => `<option ${c === actual ? 'selected' : ''}>${esc(c)}</option>`).join('') +
      '<option value="__nueva">+ Nueva categoría…</option>';
    campoNuevaCat.hidden = true;
  }

  function pintarMedida() {
    const hayPrecios = borrador.precios.length > 0;
    form.querySelectorAll('input[name="medida"]').forEach((r) => { r.disabled = hayPrecios && r.value !== borrador.medida; });
    cont.querySelector('#ayuda-medida').hidden = !hayPrecios;
  }

  function pintarPrecios() {
    const caja = cont.querySelector('#precios');
    const medida = borrador.medida;
    if (borrador.precios.length === 0) {
      caja.innerHTML = `<p class="info">Todavía no tiene precio. Pulsa <strong>+ Añadir precio</strong> y escribe lo que cuesta en una tienda.</p>`;
      pintarMedida();
      return;
    }
    const vigente = precioVigente(borrador);
    const varios = borrador.precios.length > 1;

    caja.innerHTML = borrador.precios.map((p) => {
      const porBase = precioPorBase(p);
      const antiguo = esPrecioAntiguo(p, diasAviso, hoy);
      const usado = vigente?.precio.id === p.id;
      const baseU = MEDIDAS[medida].base;
      return `
        <article class="precio ${usado ? 'usado' : ''}">
          <header>
            <strong>${esc(nombreTienda(p.proveedorId))}</strong>
            ${usado && varios ? '<span class="etiqueta exito">Se usa en las recetas</span>' : ''}
          </header>
          ${p.nombreTienda ? `<p class="precio-nombre">${esc(p.nombreTienda)}</p>` : ''}
          <p class="precio-importe">Paquete de ${numero(p.cantidad)} ${NOMBRE_CORTO[p.unidad]} → <strong>${euros(p.precio)}</strong></p>
          ${porBase !== null ? `<p class="precio-ref">Sale a <strong>${textoReferencia(porBase, medida)}</strong>${baseU !== 'ud' ? ` (${eurosPequenos(porBase)} / ${baseU})` : ''}</p>` : ''}
          <p class="precio-fecha ${antiguo ? 'antiguo' : ''}">${antiguo ? '⚠️ ' : ''}Actualizado ${haceTiempo(diasDesde(p.fecha, hoy))} (${fecha(p.fecha)})${antiguo ? ' — conviene revisarlo' : ''}</p>
          ${p.historial?.length ? `
            <details class="historial"><summary>Precios anteriores (${p.historial.length})</summary>
              <ul>${[...p.historial].reverse().map((h) => `<li>${fecha(h.fecha)}: ${euros(h.precio)} (paquete de ${numero(h.cantidad)} ${NOMBRE_CORTO[h.unidad]})</li>`).join('')}</ul>
            </details>` : ''}
          <div class="botones">
            ${p.enlace && esEnlaceValido(p.enlace) ? `<a class="boton" href="${esc(p.enlace)}" target="_blank" rel="noopener noreferrer">Ver en la tienda ↗</a>` : ''}
            <button type="button" class="boton principal" data-editar="${esc(p.id)}">Cambiar precio</button>
            <button type="button" class="boton peligro" data-borrar="${esc(p.id)}">Borrar</button>
          </div>
        </article>`;
    }).join('') + (varios ? `
      <fieldset class="campo usar-precio">
        <legend>¿Qué precio uso para calcular las recetas?</legend>
        <div class="opciones">
          <label class="opcion"><input type="radio" name="usarPrecio" value="barato" ${borrador.usarPrecio === 'barato' || !borrador.usarPrecio ? 'checked' : ''}>
            <span><strong>El más barato</strong><small>Recomendado: la app elige sola la tienda más barata</small></span></label>
          ${borrador.precios.map((p) => `
            <label class="opcion"><input type="radio" name="usarPrecio" value="${esc(p.id)}" ${borrador.usarPrecio === p.id ? 'checked' : ''}>
              <span><strong>${esc(nombreTienda(p.proveedorId))}</strong><small>${precioPorBase(p) !== null ? textoReferencia(precioPorBase(p), medida) : ''}</small></span></label>`).join('')}
        </div>
      </fieldset>` : '');
    pintarMedida();
  }

  /** Guarda en el almacén solo los precios (para no perderlos al salir sin pulsar Guardar). */
  async function persistirPrecios() {
    if (esNuevo) return;
    const actual = await almacen.obtener('productos', borrador.id);
    if (!actual) return;
    actual.precios = borrador.precios;
    actual.usarPrecio = borrador.usarPrecio;
    await almacen.guardar('productos', actual);
  }

  function dialogoPrecio(precio) {
    const medida = borrador.medida;
    const unidades = unidadesDe(medida);
    const p = precio ?? {
      id: almacen.nuevoId('pr'), proveedorId: null, cantidad: null,
      unidad: MEDIDAS[medida].referencia, precio: null, nombreTienda: '', enlace: '', historial: [],
    };
    const d = abrirDialogo(`
      <form class="formulario" method="dialog" novalidate>
        <h2>${precio ? 'Cambiar precio' : 'Añadir precio'}</h2>
        <label class="campo">
          <span>Enlace del producto en la web <small>(opcional)</small></span>
          <input name="enlace" type="url" inputmode="url" value="${esc(p.enlace)}" placeholder="Pega aquí el enlace de la tienda" autocomplete="off">
        </label>
        <p class="ayuda" id="tienda-detectada" hidden></p>
        <label class="campo">
          <span>Tienda</span>
          <select name="proveedorId">
            <option value="">Sin indicar</option>
            ${proveedores.map((t) => `<option value="${esc(t.id)}" ${t.id === p.proveedorId ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}
          </select>
        </label>
        <label class="campo">
          <span>Nombre en la tienda <small>(opcional)</small></span>
          <input name="nombreTienda" value="${esc(p.nombreTienda)}" placeholder="Ej.: Harina de trigo Hacendado 1 kg" autocomplete="off">
        </label>
        <div class="fila">
          <label class="campo">
            <span>El paquete trae</span>
            <input name="cantidad" inputmode="decimal" value="${p.cantidad ?? ''}" placeholder="Ej.: 1" autocomplete="off">
          </label>
          <label class="campo">
            <span>Unidad</span>
            <select name="unidad">
              ${unidades.map((u) => `<option value="${u}" ${u === p.unidad ? 'selected' : ''}>${NOMBRE_UNIDAD[u]}</option>`).join('')}
            </select>
          </label>
        </div>
        <label class="campo">
          <span>Precio del paquete (€)</span>
          <input name="precio" inputmode="decimal" value="${p.precio !== null && p.precio !== undefined ? numero(p.precio, 2) : ''}" placeholder="Ej.: 1,61" autocomplete="off">
        </label>
        <p class="resultado" id="vista-previa" aria-live="polite"></p>
        <p class="error-form" role="alert" hidden></p>
        <div class="botones">
          <button type="submit" class="boton principal grande" value="ok">Guardar precio</button>
          <button type="button" class="boton" data-cancelar>Cancelar</button>
        </div>
      </form>`);

    const f = d.querySelector('form');
    // Muestra los números con coma al editar (ej. 0,4 en vez de 0.4).
    if (p.cantidad !== null && p.cantidad !== undefined) f.elements.cantidad.value = numero(p.cantidad);
    const previa = d.querySelector('#vista-previa');
    const detectada = d.querySelector('#tienda-detectada');

    function actualizarPrevia() {
      const cantidad = leerNumero(f.elements.cantidad.value);
      const importe = leerNumero(f.elements.precio.value);
      const porBase = precioPorBase({ cantidad, unidad: f.elements.unidad.value, precio: importe });
      previa.innerHTML = porBase !== null && cantidad > 0
        ? `Sale a <strong>${textoReferencia(porBase, medida)}</strong>`
        : '';
    }

    function revisarEnlace() {
      const enlace = f.elements.enlace.value.trim();
      detectada.hidden = true;
      if (!enlace) return;
      if (!esEnlaceValido(enlace)) {
        detectada.hidden = false;
        detectada.textContent = 'Este enlace no parece una página web. Debe empezar por https://';
        return;
      }
      const tienda = detectarProveedor(enlace, proveedores);
      if (tienda) {
        f.elements.proveedorId.value = tienda.id;
        detectada.hidden = false;
        detectada.textContent = `✓ Tienda reconocida: ${tienda.nombre}`;
      } else {
        const nombre = nombreTiendaDesdeEnlace(enlace);
        detectada.hidden = false;
        detectada.innerHTML = `No conozco esta tienda. <button type="button" class="enlace" data-crear-tienda>Añadir la tienda «${esc(nombre)}»</button>`;
      }
    }

    f.addEventListener('input', (e) => {
      if (e.target.name === 'enlace') revisarEnlace();
      actualizarPrevia();
    });
    f.addEventListener('change', actualizarPrevia);
    d.addEventListener('click', async (e) => {
      if (e.target.closest('[data-cancelar]')) d.close();
      if (e.target.closest('[data-crear-tienda]')) {
        const enlace = f.elements.enlace.value.trim();
        const nueva = await almacen.guardar('proveedores', {
          id: almacen.nuevoId('tienda'), nombre: nombreTiendaDesdeEnlace(enlace), web: dominioDe(enlace),
        });
        proveedores.push(nueva);
        f.elements.proveedorId.insertAdjacentHTML('beforeend', `<option value="${esc(nueva.id)}">${esc(nueva.nombre)}</option>`);
        f.elements.proveedorId.value = nueva.id;
        detectada.textContent = `✓ Tienda «${nueva.nombre}» añadida`;
      }
    });

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cantidad = leerNumero(f.elements.cantidad.value);
      const importe = leerNumero(f.elements.precio.value);
      const enlace = f.elements.enlace.value.trim();
      if (!(cantidad > 0)) return mostrarError(f, 'Escribe cuánto trae el paquete, por ejemplo 1 o 500.');
      if (importe === null) return mostrarError(f, 'Escribe el precio del paquete, por ejemplo 1,61.');
      if (enlace && !esEnlaceValido(enlace)) return mostrarError(f, 'El enlace no es válido. Cópialo entero desde la web de la tienda, o déjalo vacío.');

      const cambios = {
        proveedorId: f.elements.proveedorId.value || null,
        nombreTienda: f.elements.nombreTienda.value.trim(),
        enlace,
        cantidad,
        unidad: f.elements.unidad.value,
        precio: importe,
      };
      const i = borrador.precios.findIndex((x) => x.id === p.id);
      if (i >= 0) borrador.precios[i] = actualizarPrecio(borrador.precios[i], cambios, hoy);
      else borrador.precios.push({ ...p, ...cambios, fecha: hoy, historial: [] });

      try {
        await persistirPrecios();
      } catch (err) {
        return mostrarError(f, err.message);
      }
      d.close();
      pintarPrecios();
      avisar(esNuevo ? 'Precio añadido. Recuerda pulsar Guardar.' : 'Precio guardado');
    });

    actualizarPrevia();
    if (p.enlace) revisarEnlace();
    (precio ? f.elements.precio : f.elements.enlace).focus();
  }

  // --- Eventos del formulario principal ---
  form.addEventListener('change', (e) => {
    if (e.target.name === 'tipo') pintarCategorias();
    if (e.target.name === 'categoria') {
      campoNuevaCat.hidden = selCat.value !== '__nueva';
      if (!campoNuevaCat.hidden) form.elements.nuevaCategoria.focus();
    }
    if (e.target.name === 'medida') {
      borrador.medida = e.target.value;
      cont.querySelector('#campo-peso-unidad').hidden = borrador.medida !== 'unidades';
    }
    if (e.target.name === 'usarPrecio') {
      borrador.usarPrecio = e.target.value;
      persistirPrecios().then(() => { pintarPrecios(); if (!esNuevo) avisar('Guardado'); });
    }
  });

  cont.querySelector('#anadir-precio').addEventListener('click', () => {
    borrador.medida = form.elements.medida.value;
    dialogoPrecio(null);
  });

  cont.querySelector('#precios').addEventListener('click', async (e) => {
    const editar = e.target.closest('[data-editar]');
    const borrarB = e.target.closest('[data-borrar]');
    if (editar) dialogoPrecio(borrador.precios.find((p) => p.id === editar.dataset.editar));
    if (borrarB) {
      const p = borrador.precios.find((x) => x.id === borrarB.dataset.borrar);
      const ok = await confirmar(`¿Borrar el precio de ${nombreTienda(p.proveedorId)}?`, { si: 'Borrar', peligro: true });
      if (!ok) return;
      borrador.precios = borrador.precios.filter((x) => x.id !== p.id);
      if (borrador.usarPrecio === p.id) borrador.usarPrecio = 'barato';
      await persistirPrecios();
      pintarPrecios();
      avisar('Precio borrado');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = form.elements.nombre.value.trim().replace(/\s+/g, ' ');
    if (!nombre) return mostrarError(form, 'Escribe el nombre del producto.');
    const repetido = productos.find((p) => p.id !== borrador.id && normalizar(p.nombre) === normalizar(nombre));
    if (repetido) return mostrarError(form, `Ya tienes un producto llamado «${repetido.nombre}». Cambia el nombre o edita ese.`);

    const tipo = form.elements.tipo.value;
    let categoria = selCat.value;
    if (categoria === '__nueva') {
      categoria = form.elements.nuevaCategoria.value.trim();
      if (!categoria) return mostrarError(form, 'Escribe el nombre de la nueva categoría.');
      const clave = tipo === 'material' ? 'categoriasMaterial' : 'categoriasIngrediente';
      const lista = ajustes[clave] ?? [];
      if (!lista.some((c) => normalizar(c) === normalizar(categoria))) {
        ajustes[clave] = [...lista, categoria];
        await almacen.guardarAjustes({ [clave]: ajustes[clave] });
      }
    }

    const medida = form.elements.medida.value;
    let pesoUnidad = null;
    if (medida === 'unidades' && form.elements.pesoUnidad.value.trim()) {
      pesoUnidad = leerNumero(form.elements.pesoUnidad.value);
      if (!(pesoUnidad > 0)) return mostrarError(form, 'El peso por unidad debe ser un número de gramos, por ejemplo 55.');
    }
    const final = { ...borrador, nombre, tipo, categoria, medida, pesoUnidad };
    try {
      await almacen.guardar('productos', final);
    } catch (err) {
      return mostrarError(form, err.message);
    }
    avisar('Producto guardado');
    location.hash = '#/productos';
  });

  cont.querySelector('#borrar')?.addEventListener('click', async () => {
    const recetas = await almacen.listar('recetas');
    const usadoEn = recetas.filter((r) => (r.lineas ?? []).some((l) => l.productoId === borrador.id));
    if (usadoEn.length) {
      await confirmar(`No se puede borrar: se usa en ${usadoEn.map((r) => r.nombre).join(', ')}. Quítalo antes de esas recetas.`, { si: 'Entendido', no: 'Cerrar' });
      return;
    }
    const ok = await confirmar(`¿Borrar «${borrador.nombre}» y todos sus precios? No se puede deshacer.`, { si: 'Borrar', peligro: true });
    if (!ok) return;
    await almacen.borrar('productos', borrador.id);
    avisar('Producto borrado');
    location.hash = '#/productos';
  });

  pintarCategorias();
  pintarPrecios();
  if (esNuevo) form.elements.nombre.focus();
}
