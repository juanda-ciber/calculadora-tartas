// Pantalla: crear o editar una receta.
import * as almacen from '../almacen.js';
import { crearContexto, calcularReceta, usaReceta, UNIDADES_SUBRECETA } from '../calculos.js';
import { MEDIDAS, unidadesDe, NOMBRE_UNIDAD } from '../unidades.js';
import { euros, numero, leerNumero, peso } from '../formato.js';
import { esc, normalizar, avisar, abrirDialogo, mostrarError, marcarMenu, seccionDeReceta, confirmar } from './comun.js';

const NOMBRE_UNIDAD_RECETA = { receta: 'receta entera', g: 'gramos', kg: 'kilos' };
const UNIDAD_INICIAL = { peso: 'g', volumen: 'ml', unidades: 'ud' };

export async function vistaRecetaEditar(cont, id, consulta = new URLSearchParams()) {
  const [recetas, productos, ajustes] = await Promise.all([
    almacen.listar('recetas'), almacen.listar('productos'), almacen.leerAjustes(),
  ]);
  const esNueva = id === 'nueva';
  const guardada = esNueva ? null : recetas.find((r) => r.id === id);
  if (!esNueva && !guardada) {
    cont.innerHTML = '<p class="vacio">Esta receta ya no existe. <a href="#/tartas">Volver a tartas</a></p>';
    return;
  }
  const borrador = guardada ? structuredClone(guardada) : {
    id: almacen.nuevoId('r'), nombre: '', uso: consulta.get('uso') === 'preparacion' ? 'preparacion' : 'venta', categoria: '', raciones: null, otrosGastos: null,
    molde: null, minutos: null, pesoFinal: null, notas: '', lineas: [],
  };
  const esTarta = borrador.uso === 'venta';
  marcarMenu(seccionDeReceta(borrador));
  const volver = esNueva ? `#/${seccionDeReceta(borrador)}` : `#/receta/${encodeURIComponent(borrador.id)}`;

  /** Contexto de cálculo con el borrador en lugar de la versión guardada. */
  const contexto = () => crearContexto(productos, [...recetas.filter((r) => r.id !== borrador.id), borrador]);
  const categoriasDe = (uso) => {
    const lista = [...((uso === 'venta' ? ajustes.categoriasVenta : ajustes.categoriasPreparacion) ?? [])];
    if (borrador.categoria && borrador.uso === uso && !lista.includes(borrador.categoria)) lista.push(borrador.categoria);
    return lista;
  };
  const horas = borrador.minutos > 0 ? Math.floor(borrador.minutos / 60) : '';
  const mins = borrador.minutos > 0 ? Math.round(borrador.minutos % 60) : '';

  cont.innerHTML = `
    <header class="cabecera">
      <a class="volver" href="${volver}">‹ ${esNueva ? (esTarta ? 'Tartas' : 'Bases y rellenos') : 'Volver'}</a>
      <h1>${esNueva ? (esTarta ? 'Nueva tarta' : 'Nueva base o relleno') : (esTarta ? 'Editar tarta' : 'Editar base o relleno')}</h1>
    </header>
    <form id="form-receta" class="formulario" novalidate>
      <label class="campo"><span>Nombre</span>
        <input name="nombre" value="${esc(borrador.nombre)}" placeholder="${esTarta ? 'Ej.: Tarta de pistacho' : 'Ej.: Bizcocho de chocolate'}" autocomplete="off"></label>

      <input type="hidden" name="uso" value="${esc(borrador.uso)}">

      <label class="campo"><span>Categoría</span><select name="categoria"></select></label>
      <label class="campo" id="campo-nueva-cat" hidden><span>Nombre de la nueva categoría</span>
        <input name="nuevaCategoria" placeholder="Ej.: Tartas de cumpleaños" autocomplete="off"></label>

      <div class="fila">
        <label class="campo"><span>Raciones <small>(opcional)</small></span>
          <input name="raciones" inputmode="decimal" value="${borrador.raciones > 0 ? numero(borrador.raciones) : ''}" placeholder="Ej.: 12" autocomplete="off"></label>
        <label class="campo"><span>Molde <small>(cm, opcional)</small></span>
          <input name="molde" inputmode="decimal" value="${borrador.molde > 0 ? numero(borrador.molde) : ''}" placeholder="Ej.: 20" autocomplete="off"></label>
      </div>

      <fieldset class="campo"><legend>Tiempo que trabajas en ella</legend>
        <div class="fila">
          <label class="campo"><span class="oculto">Horas</span>
            <span class="con-sufijo"><input name="horas" inputmode="numeric" value="${horas}" placeholder="0" autocomplete="off"><span>h</span></span></label>
          <label class="campo"><span class="oculto">Minutos</span>
            <span class="con-sufijo"><input name="minutos" inputmode="numeric" value="${mins}" placeholder="0" autocomplete="off"><span>min</span></span></label>
        </div>
        <p class="ayuda">Cuenta solo el tiempo que estás ocupada (preparar, montar, decorar), no el que la tarta está sola en el horno. En las tartas es importante: con esto se calcula lo que cobras por tu trabajo.</p>
      </fieldset>

      <label class="campo" id="campo-otros" ${esTarta ? '' : 'hidden'}><span>Otros gastos de esta tarta <small>(€, opcional)</small></span>
        <input name="otrosGastos" inputmode="decimal" value="${borrador.otrosGastos > 0 ? numero(borrador.otrosGastos, 2) : ''}" placeholder="Ej.: 3 (envío, impresión del topper…)" autocomplete="off">
        <small>Lo que no es un producto: un envío, imprimir una foto… La caja, la base o las velas mejor añádelas abajo como materiales.</small></label>

      <section class="bloque">
        <h2>${esTarta ? '¿Qué lleva?' : 'Ingredientes'}</h2>
        ${esTarta ? '<p class="ayuda">Añade las bases y rellenos (bizcocho, brigadeiro…), los ingredientes sueltos (fruta, decoración…) y los materiales (caja, base de cartón, velas…).</p>' : ''}
        <ul id="lineas" class="lineas-editar"></ul>
        <button type="button" class="boton" id="anadir-linea">+ Añadir ${esTarta ? 'base, ingrediente o material' : 'ingrediente'}</button>
        <div id="total" class="cifras"></div>
        <div id="problemas"></div>
      </section>

      <label class="campo" ${esTarta ? 'hidden' : ''}><span>Peso al terminar <small>(gramos, opcional)</small></span>
        <input name="pesoFinal" inputmode="decimal" value="${borrador.pesoFinal > 0 ? numero(borrador.pesoFinal) : ''}" autocomplete="off">
        <small>Solo hace falta si vas a usar esta base <strong>por gramos</strong> en una tarta (por ejemplo, «200 g de brigadeiro»).
          Al hornear o cocer se pierde agua, así que pesa menos que la suma de los ingredientes. Si la pesas al terminar, escríbelo y la cuenta por gramos será exacta. Si no, déjalo vacío.</small>
        <small id="ayuda-peso"></small></label>

      <label class="campo"><span>Notas <small>(opcional)</small></span>
        <textarea name="notas" rows="3" placeholder="Pasos, trucos, temperatura del horno…">${esc(borrador.notas)}</textarea></label>

      <p class="error-form" role="alert" hidden></p>
      <div class="botones fijos">
        <button type="submit" class="boton principal grande">Guardar</button>
        <a class="boton" href="${volver}">Cancelar</a>
      </div>
      ${esNueva ? '' : `<p class="ayuda mover">¿Está en el sitio equivocado? <button type="button" class="enlace" id="mover">Mover a ${esTarta ? 'Bases y rellenos' : 'Tartas'}</button></p>`}
    </form>`;

  const form = cont.querySelector('#form-receta');
  const selCat = form.elements.categoria;
  const campoNuevaCat = cont.querySelector('#campo-nueva-cat');
  const listaLineas = cont.querySelector('#lineas');

  function pintarCategorias() {
    const uso = form.elements.uso.value;
    const lista = categoriasDe(uso);
    const actual = borrador.uso === uso && borrador.categoria ? borrador.categoria : lista[0];
    selCat.innerHTML = lista.map((c) => `<option ${c === actual ? 'selected' : ''}>${esc(c)}</option>`).join('') +
      '<option value="__nueva">+ Nueva categoría…</option>';
    campoNuevaCat.hidden = true;
  }

  function opcionesUnidad(linea) {
    if (linea.recetaId) {
      return UNIDADES_SUBRECETA.map((u) => `<option value="${u}" ${u === linea.unidad ? 'selected' : ''}>${NOMBRE_UNIDAD_RECETA[u]}</option>`).join('');
    }
    const p = productos.find((x) => x.id === linea.productoId);
    const unidades = p ? unidadesDe(p.medida) : [linea.unidad];
    return unidades.map((u) => `<option value="${u}" ${u === linea.unidad ? 'selected' : ''}>${NOMBRE_UNIDAD[u] ?? u}</option>`).join('');
  }

  function pintarLineas() {
    const c = calcularReceta(borrador, contexto());
    listaLineas.innerHTML = c.lineas.length === 0
      ? '<li class="info">Todavía no hay nada. Pulsa el botón de abajo para añadir el primer ingrediente.</li>'
      : c.lineas.map((r) => `
        <li class="linea-editar" data-id="${esc(r.linea.id)}">
          <div class="linea-cab">
            <strong>${esc(r.nombre)}${r.tipo === 'receta' ? ' <span class="etiqueta">Base</span>' : r.tipo === 'material' ? ' <span class="etiqueta">Material</span>' : ''}</strong>
            <span class="linea-coste"></span>
            <button type="button" class="boton-icono" data-quitar aria-label="Quitar ${esc(r.nombre)}">✕</button>
          </div>
          <div class="fila">
            <input name="cantidad" inputmode="decimal" value="${r.linea.cantidad !== null && r.linea.cantidad !== undefined ? numero(r.linea.cantidad) : ''}" placeholder="Cantidad" aria-label="Cantidad de ${esc(r.nombre)}" autocomplete="off">
            <select name="unidad" aria-label="Unidad de ${esc(r.nombre)}">${opcionesUnidad(r.linea)}</select>
          </div>
          <p class="linea-ayuda" hidden></p>
          <p class="linea-problema" hidden></p>
        </li>`).join('');
    recalcular();
  }

  /** "1 = la receta entera de Brigadeiro (710 g, 3,72 €)…" */
  function textoAyudaBase(linea) {
    const ctx = contexto();
    const sub = ctx.recetas.get(linea.recetaId);
    const n = linea.cantidad;
    if (!sub || !(n > 0)) return '';
    const cs = calcularReceta(sub, ctx);
    const entera = `${cs.peso > 0 ? peso(cs.peso) + ', ' : ''}${euros(cs.coste)}`;
    if (linea.unidad === 'receta') {
      if (n === 1) return `1 = toda la receta de «${sub.nombre}» (${entera}). Si usas solo una parte, pon 0,5 para la mitad o cámbialo a gramos.`;
      return `${n === 0.5 ? 'Media receta' : `${numero(n, 2)} veces la receta`} de «${sub.nombre}»${cs.peso > 0 ? `, unos ${peso(cs.peso * n)}` : ''}. La receta entera es ${entera}.`;
    }
    const gramos = linea.unidad === 'kg' ? n * 1000 : n;
    if (!(cs.peso > 0)) return '';
    return `La receta entera de «${sub.nombre}» pesa unos ${peso(cs.peso)} y cuesta ${euros(cs.coste)}. Usas ${peso(gramos)}, el ${numero((gramos / cs.peso) * 100, 0)} % de la receta.`;
  }

  /** Actualiza costes y avisos sin volver a dibujar (para no perder el foco al escribir). */
  function recalcular() {
    const c = calcularReceta(borrador, contexto());
    for (const r of c.lineas) {
      const li = listaLineas.querySelector(`[data-id="${CSS.escape(r.linea.id)}"]`);
      if (!li) continue;
      li.querySelector('.linea-coste').textContent = r.coste !== null ? euros(r.coste) : '';
      const prob = li.querySelector('.linea-problema');
      prob.textContent = r.problema ?? '';
      prob.hidden = !r.problema;
      const ayuda = li.querySelector('.linea-ayuda');
      ayuda.textContent = r.tipo === 'receta' && !r.problema ? textoAyudaBase(r.linea) : '';
      ayuda.hidden = !ayuda.textContent;
    }
    const raciones = leerNumero(form.elements.raciones.value);
    cont.querySelector('#total').innerHTML = `
      <div class="cifra"><span>Coste total</span><strong>${euros(c.coste)}</strong></div>
      ${raciones > 0 ? `<div class="cifra"><span>Por ración</span><strong>${euros(c.coste / raciones)}</strong></div>` : ''}`;
    const ayudaPeso = cont.querySelector('#ayuda-peso');
    ayudaPeso.textContent = c.pesoCalculado > 0
      ? `Ahora se usa la suma de los ingredientes: unos ${peso(c.pesoCalculado)}${c.pesoParcial ? ' (sin contar algunos)' : ''}.`
      : '';
    form.elements.pesoFinal.placeholder = c.pesoCalculado > 0 ? numero(Math.round(c.pesoCalculado)) : 'Ej.: 1200';
  }

  function anadirLinea(linea) {
    borrador.lineas.push({ id: almacen.nuevoId('l'), ...linea });
    pintarLineas();
    const ultima = listaLineas.querySelector('.linea-editar:last-child input[name="cantidad"]');
    ultima?.focus();
    ultima?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function dialogoElegir() {
    const ctx = contexto();
    const recetasValidas = recetas.filter((r) => r.id !== borrador.id && !usaReceta(r.id, borrador.id, ctx));
    const d = abrirDialogo(`
      <div class="formulario">
        <h2>Añadir</h2>
        <input type="search" id="buscar-linea" placeholder="🔍 Escribe para buscar…" autocomplete="off" aria-label="Buscar">
        <div id="resultados" class="resultados"></div>
        <div class="botones"><button type="button" class="boton" data-cancelar>Cerrar</button></div>
      </div>`);
    const buscador = d.querySelector('#buscar-linea');
    const resultados = d.querySelector('#resultados');

    function pintar() {
      const q = normalizar(buscador.value);
      const coincide = (texto) => !q || q.split(/\s+/).every((p) => normalizar(texto).includes(p));
      const prods = productos.filter((p) => coincide(`${p.nombre} ${p.categoria}`)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      const recs = recetasValidas.filter((r) => coincide(`${r.nombre} ${r.categoria}`)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      const exacto = productos.some((p) => normalizar(p.nombre) === q) || recetas.some((r) => normalizar(r.nombre) === q);
      resultados.innerHTML = `
        ${q && !exacto ? `<div class="crear-rapido">
          <p><strong>¿No está?</strong> Crea «${esc(buscador.value.trim())}» ahora y ponle el precio luego.</p>
          <p class="ayuda">¿Cómo se mide?</p>
          <div class="botones">${Object.entries(MEDIDAS).map(([m, x]) => `<button type="button" class="boton" data-crear="${m}">${x.nombre}</button>`).join('')}</div>
          <label class="casilla"><input type="checkbox" id="es-material"> Es un material (caja, vela, topper…)</label>
        </div>` : ''}
        ${recs.length ? `<h3 class="grupo-titulo">Bases y rellenos</h3>${recs.map((r) => `
          <button type="button" class="tarjeta" data-receta="${esc(r.id)}">
            <span class="tarjeta-titulo">${esc(r.nombre)}</span><span class="tarjeta-detalle">${esc(r.categoria)}</span></button>`).join('')}` : ''}
        ${prods.length ? `<h3 class="grupo-titulo">Productos</h3>${prods.map((p) => `
          <button type="button" class="tarjeta" data-producto="${esc(p.id)}">
            <span class="tarjeta-titulo">${esc(p.nombre)}</span><span class="tarjeta-detalle">${p.tipo === 'material' ? 'Material' : 'Ingrediente'} · ${esc(p.categoria)}${p.precios.length ? '' : ' · <span class="texto-alerta">sin precio</span>'}</span></button>`).join('')}` : ''}
        ${!recs.length && !prods.length && !q ? '<p class="vacio">No hay productos ni recetas.</p>' : ''}`;
    }

    buscador.addEventListener('input', pintar);
    d.addEventListener('click', async (e) => {
      if (e.target.closest('[data-cancelar]')) return d.close();
      const bp = e.target.closest('[data-producto]');
      const br = e.target.closest('[data-receta]');
      const bc = e.target.closest('[data-crear]');
      if (bp) {
        const p = productos.find((x) => x.id === bp.dataset.producto);
        d.close();
        anadirLinea({ productoId: p.id, cantidad: null, unidad: UNIDAD_INICIAL[p.medida] });
      } else if (br) {
        d.close();
        anadirLinea({ recetaId: br.dataset.receta, cantidad: 1, unidad: 'receta' });
      } else if (bc) {
        const nombre = buscador.value.trim().replace(/\s+/g, ' ');
        const nombreBonito = nombre.charAt(0).toUpperCase() + nombre.slice(1);
        const esMaterial = d.querySelector('#es-material')?.checked;
        const nuevo = await almacen.guardar('productos', {
          id: almacen.nuevoId('p'), nombre: nombreBonito, tipo: esMaterial ? 'material' : 'ingrediente',
          categoria: esMaterial ? 'Otros materiales' : 'Otros ingredientes',
          medida: bc.dataset.crear, usarPrecio: 'barato', precios: [],
        });
        productos.push(nuevo);
        d.close();
        anadirLinea({ productoId: nuevo.id, cantidad: null, unidad: UNIDAD_INICIAL[nuevo.medida] });
        avisar(`«${nuevo.nombre}» creado sin precio. Añádelo luego en Productos.`);
      }
    });
    pintar();
    buscador.focus();
  }

  // --- Eventos ---
  form.addEventListener('change', (e) => {
    if (e.target.name === 'categoria') {
      campoNuevaCat.hidden = selCat.value !== '__nueva';
      if (!campoNuevaCat.hidden) form.elements.nuevaCategoria.focus();
    }
  });

  listaLineas.addEventListener('input', (e) => {
    const li = e.target.closest('[data-id]');
    if (!li) return;
    const linea = borrador.lineas.find((l) => l.id === li.dataset.id);
    if (e.target.name === 'cantidad') linea.cantidad = leerNumero(e.target.value);
    if (e.target.name === 'unidad') linea.unidad = e.target.value;
    recalcular();
  });
  listaLineas.addEventListener('change', (e) => {
    if (e.target.name !== 'unidad') return;
    const li = e.target.closest('[data-id]');
    borrador.lineas.find((l) => l.id === li.dataset.id).unidad = e.target.value;
    recalcular();
  });
  listaLineas.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quitar]');
    if (!b) return;
    const idLinea = b.closest('[data-id]').dataset.id;
    borrador.lineas = borrador.lineas.filter((l) => l.id !== idLinea);
    pintarLineas();
  });
  form.elements.raciones.addEventListener('input', recalcular);
  form.elements.pesoFinal.addEventListener('input', () => {
    borrador.pesoFinal = leerNumero(form.elements.pesoFinal.value);
  });
  cont.querySelector('#anadir-linea').addEventListener('click', dialogoElegir);
  cont.querySelector('#mover')?.addEventListener('click', async () => {
    const destino = esTarta ? 'preparacion' : 'venta';
    const ok = await confirmar(`¿Mover «${borrador.nombre}» a ${esTarta ? 'Bases y rellenos' : 'Tartas'}? Los cambios que no hayas guardado se pierden.`, { si: 'Mover' });
    if (!ok) return;
    const g = await almacen.obtener('recetas', borrador.id);
    g.uso = destino;
    g.categoria = categoriasDe(destino)[0] ?? '';
    await almacen.guardar('recetas', g);
    avisar(`Movida a ${esTarta ? 'Bases y rellenos' : 'Tartas'}`);
    location.hash = `#/receta/${encodeURIComponent(g.id)}`;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = form.elements.nombre.value.trim().replace(/\s+/g, ' ');
    if (!nombre) return mostrarError(form, 'Escribe el nombre de la receta.');
    const repetida = recetas.find((r) => r.id !== borrador.id && normalizar(r.nombre) === normalizar(nombre));
    if (repetida) return mostrarError(form, `Ya tienes una receta llamada «${repetida.nombre}». Cambia el nombre.`);

    const ctx = contexto();
    const sinCantidad = calcularReceta(borrador, ctx).lineas.find((r) => !(r.linea.cantidad > 0));
    if (sinCantidad) return mostrarError(form, `Escribe la cantidad de ${sinCantidad.nombre} (o quítalo de la receta).`);

    const leerOpcional = (campo, texto) => {
      const v = form.elements[campo].value.trim();
      if (!v) return { valor: null };
      const n = leerNumero(v);
      return n !== null && n > 0 ? { valor: n } : { error: texto };
    };
    const raciones = leerOpcional('raciones', 'Las raciones deben ser un número, por ejemplo 12.');
    const molde = leerOpcional('molde', 'El molde debe ser un número de centímetros, por ejemplo 20.');
    const pesoFinal = leerOpcional('pesoFinal', 'El peso debe ser un número de gramos, por ejemplo 1200.');
    const otrosGastos = leerOpcional('otrosGastos', 'Los otros gastos deben ser un número de euros, por ejemplo 3.');
    for (const x of [raciones, molde, pesoFinal, otrosGastos]) if (x.error) return mostrarError(form, x.error);
    const h = form.elements.horas.value.trim() ? leerNumero(form.elements.horas.value) : 0;
    const m = form.elements.minutos.value.trim() ? leerNumero(form.elements.minutos.value) : 0;
    if (h === null || m === null) return mostrarError(form, 'El tiempo debe ser un número de horas y minutos.');

    const uso = form.elements.uso.value;
    let categoria = selCat.value;
    if (categoria === '__nueva') {
      categoria = form.elements.nuevaCategoria.value.trim();
      if (!categoria) return mostrarError(form, 'Escribe el nombre de la nueva categoría.');
      const clave = uso === 'venta' ? 'categoriasVenta' : 'categoriasPreparacion';
      const lista = ajustes[clave] ?? [];
      if (!lista.some((c) => normalizar(c) === normalizar(categoria))) {
        await almacen.guardarAjustes({ [clave]: [...lista, categoria] });
      }
    }

    const final = {
      ...borrador, nombre, uso, categoria,
      raciones: raciones.valor, molde: molde.valor, pesoFinal: pesoFinal.valor,
      otrosGastos: uso === 'venta' ? otrosGastos.valor : null,
      minutos: h * 60 + m > 0 ? h * 60 + m : null,
      notas: form.elements.notas.value.trim(),
    };
    try {
      await almacen.guardar('recetas', final);
    } catch (err) {
      return mostrarError(form, err.message);
    }
    avisar(uso === 'venta' ? 'Tarta guardada' : 'Base guardada');
    location.hash = `#/receta/${encodeURIComponent(final.id)}`;
  });

  pintarCategorias();
  pintarLineas();
  if (esNueva) form.elements.nombre.focus();
}
