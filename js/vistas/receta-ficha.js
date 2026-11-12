// Pantalla: ficha de una receta (ingredientes, costes, escalar, duplicar).
import * as almacen from '../almacen.js';
import {
  crearContexto, calcularReceta, escalarReceta, factorMolde, factorRaciones, recetasQueUsan,
  calcularPrecio, analizarPrecioActual,
} from '../calculos.js';
import { NOMBRE_CORTO } from '../unidades.js';
import { euros, numero, leerNumero, cantidad, duracion, peso } from '../formato.js';
import { esc, avisar, confirmar, marcarMenu, seccionDeReceta } from './comun.js';

/** Bloque del precio de venta: precio grande + de dónde sale cada euro. */
function htmlPrecio(p, raciones) {
  const a = p.ajustes;
  const filas = [
    ['Ingredientes', '', p.ingredientes],
    ['Materiales', 'caja, base, velas…', p.materiales],
    p.otros > 0 ? ['Otros gastos', 'de esta tarta', p.otros] : null,
    ['Luz, gas y desgaste', p.explicacionGastos, p.gastosCasa],
    ['Tu trabajo', p.horas > 0 ? `${numero(p.horas, 2)} h × ${euros(a.precioHora)}` : 'sin tiempo puesto', p.trabajo],
  ].filter(Boolean);
  return `
    <div class="precio-venta">
      <span>Precio recomendado</span>
      <strong>${euros(p.precio)}</strong>
      ${p.porRacion !== null ? `<small>${euros(p.porRacion)} por ración (${numero(raciones)} raciones)</small>` : ''}
    </div>
    <div class="cifras">
      <div class="cifra"><span>Te llevas</span><strong>${euros(p.teLlevas)}</strong><small>tu trabajo + beneficio</small></div>
      <div class="cifra"><span>Coste total</span><strong>${euros(p.costeTotal)}</strong><small>con tu trabajo</small></div>
    </div>
    ${p.avisos.length ? `<div class="info alerta-caja"><ul>${p.avisos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <details class="desglose">
      <summary>¿De dónde sale este precio?</summary>
      <ul class="tabla-lineas">
        ${filas.map(([t, d, v]) => `<li class="linea-ficha"><span class="linea-nombre">${t}${d ? `<small> · ${esc(d)}</small>` : ''}</span><span></span><span class="linea-coste">${euros(v)}</span></li>`).join('')}
        <li class="linea-ficha total"><span class="linea-nombre">Coste total</span><span></span><span class="linea-coste">${euros(p.costeTotal)}</span></li>
        <li class="linea-ficha"><span class="linea-nombre">Beneficio<small> · ${numero(a.margenPct, 2)} % del coste</small></span><span></span><span class="linea-coste">${euros(p.beneficio)}</span></li>
        ${Math.abs(p.precio - p.precioExacto) > 0.004 ? `<li class="linea-ficha"><span class="linea-nombre">Redondeo<small> · hacia arriba</small></span><span></span><span class="linea-coste">${euros(p.precio - p.precioExacto)}</span></li>` : ''}
        <li class="linea-ficha total"><span class="linea-nombre">Precio de venta</span><span></span><span class="linea-coste">${euros(p.precio)}</span></li>
      </ul>
      <p class="ayuda">El precio por hora, los gastos y el beneficio se cambian en <a href="#/ajustes">Ajustes</a>.</p>
    </details>`;
}

/** "200 g", "5 ud.", "1 receta", "0,5 recetas" */
export function textoCantidad(n, unidad) {
  if (unidad === 'receta') {
    if (n === 1) return 'receta entera';
    if (n === 0.5) return 'media receta';
    return `${cantidad(n, unidad)} recetas`;
  }
  return `${cantidad(n, unidad)} ${NOMBRE_CORTO[unidad] ?? unidad}`;
}

export async function vistaRecetaFicha(cont, id) {
  const [recetas, productos, ajustes] = await Promise.all([
    almacen.listar('recetas'), almacen.listar('productos'), almacen.leerAjustes(),
  ]);
  const receta = recetas.find((r) => r.id === id);
  if (!receta) {
    cont.innerHTML = '<p class="vacio">Esta receta ya no existe. <a href="#/tartas">Volver a tartas</a></p>';
    return;
  }
  const esTarta = receta.uso === 'venta';
  marcarMenu(seccionDeReceta(receta));
  const ctx = crearContexto(productos, recetas);
  const usadaEn = recetasQueUsan(receta.id, recetas);

  // Estado del escalado (solo en pantalla, hasta que se guarde como nueva).
  let modo = receta.molde > 0 && !(receta.raciones > 0) ? 'molde' : 'raciones';
  let factor = 1;
  let destino = null;

  const datos = [
    esTarta ? 'Tarta' : 'Base o relleno',
    receta.categoria,
    receta.molde > 0 ? `Molde de ${numero(receta.molde)} cm` : '',
    duracion(receta.minutos) ? `⏱ ${duracion(receta.minutos)}` : '',
  ].filter(Boolean);

  cont.innerHTML = `
    <header class="cabecera">
      <a class="volver" href="${esTarta ? '#/tartas">‹ Tartas' : '#/bases">‹ Bases y rellenos'}</a>
      <h1>${esc(receta.nombre)}</h1>
    </header>
    <p class="subtitulo">${datos.map(esc).join(' · ')}</p>
    <div id="resumen"></div>

    ${esTarta ? `
    <section class="bloque">
      <h2>¿A cuánto la vendes ahora?</h2>
      <label class="campo"><span class="oculto">Precio al que la vendes ahora</span>
        <span class="con-sufijo"><input id="precio-actual" inputmode="decimal" value="${receta.precioActual > 0 ? numero(receta.precioActual, 2) : ''}" placeholder="Ej.: 40" autocomplete="off"><span>€</span></span></label>
      <div id="analisis-actual"></div>
    </section>` : ''}

    <section class="bloque">
      <h2>Escalar la receta</h2>
      <div class="filtros" role="group" aria-label="Escalar por">
        <button type="button" class="chip" data-modo="raciones">Por raciones</button>
        <button type="button" class="chip" data-modo="molde">Por tamaño de molde</button>
      </div>
      <div id="escalar"></div>
    </section>

    <section class="bloque">
      <h2 id="titulo-ingredientes">Ingredientes</h2>
      <div id="lineas"></div>
    </section>

    ${receta.notas ? `<section class="bloque"><h2>Notas</h2><p class="notas">${esc(receta.notas)}</p></section>` : ''}
    ${usadaEn.length ? `<section class="bloque"><h2>Se usa en</h2><ul class="enlaces">${usadaEn.map((r) => `<li><a href="#/receta/${encodeURIComponent(r.id)}">${esc(r.nombre)}</a></li>`).join('')}</ul></section>` : ''}

    <div class="botones fijos">
      <a class="boton principal grande" href="#/receta/${encodeURIComponent(receta.id)}/editar">Editar</a>
      <button type="button" class="boton" id="duplicar">Duplicar</button>
      <button type="button" class="boton peligro" id="borrar">Borrar</button>
    </div>`;

  let precioVista = null;

  /** Compara el precio al que la vende ahora con el recomendado. */
  function pintarAnalisis() {
    const caja = cont.querySelector('#analisis-actual');
    if (!caja || !precioVista) return;
    const actual = leerNumero(cont.querySelector('#precio-actual').value);
    const r = analizarPrecioActual(actual, precioVista);
    if (!r) {
      caja.innerHTML = '<p class="ayuda">Escribe lo que cobras ahora por ella y te digo cuánto ganas de verdad.</p>';
      return;
    }
    let texto;
    if (r.pierde) {
      texto = `<strong>Estás perdiendo dinero:</strong> con ${euros(actual)} no llegas a pagar los ingredientes, materiales y gastos (${euros(precioVista.costeTotal - precioVista.trabajo)}). Pierdes ${euros(-r.leQueda)} en cada tarta.`;
    } else {
      texto = `Después de pagar ingredientes, materiales y gastos te quedan <strong>${euros(r.leQueda)}</strong>`;
      if (r.porHora !== null) texto += `: tu trabajo te sale a <strong>${euros(r.porHora)} la hora</strong>`;
      texto += '.';
      if (r.diferencia < -0.005) texto += ` Es <strong>${euros(-r.diferencia)} menos</strong> de lo recomendado.`;
      else if (r.diferencia > 0.005) texto += ` Es ${euros(r.diferencia)} más de lo recomendado: ¡bien!`;
      else texto += ' Es justo el precio recomendado. ¡Bien!';
    }
    caja.innerHTML = `<p class="info ${r.pierde || r.diferencia < -0.005 ? 'alerta-caja' : 'exito-caja'}">${texto}</p>`;
  }

  if (esTarta) {
    const entrada = cont.querySelector('#precio-actual');
    entrada.addEventListener('input', pintarAnalisis);
    entrada.addEventListener('change', async () => {
      const v = entrada.value.trim() ? leerNumero(entrada.value) : null;
      if (entrada.value.trim() && !(v > 0)) return;
      const guardada = await almacen.obtener('recetas', receta.id);
      if (!guardada) return;
      await almacen.guardar('recetas', { ...guardada, precioActual: v });
      receta.precioActual = v;
      avisar('Guardado');
    });
  }

  function pintarEscalar() {
    cont.querySelectorAll('[data-modo]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.modo === modo));
    const caja = cont.querySelector('#escalar');
    if (modo === 'raciones') {
      caja.innerHTML = receta.raciones > 0
        ? `<div class="fila-escalar"><span>De <strong>${numero(receta.raciones)}</strong> a</span>
             <input id="hasta" inputmode="decimal" value="${destino ?? ''}" placeholder="${numero(receta.raciones)}" aria-label="Raciones que quieres">
             <span>raciones</span></div>`
        : '<p class="ayuda">Para escalar por raciones, primero <a href="#/receta/' + encodeURIComponent(receta.id) + '/editar">escribe cuántas raciones salen</a>.</p>';
    } else {
      caja.innerHTML = receta.molde > 0
        ? `<div class="fila-escalar"><span>Molde redondo de <strong>${numero(receta.molde)} cm</strong> a</span>
             <input id="hasta" inputmode="decimal" value="${destino ?? ''}" placeholder="${numero(receta.molde)}" aria-label="Centímetros del molde nuevo">
             <span>cm</span></div>`
        : '<p class="ayuda">Para escalar por molde, primero <a href="#/receta/' + encodeURIComponent(receta.id) + '/editar">escribe el tamaño del molde</a>.</p>';
    }
    caja.insertAdjacentHTML('beforeend', `<p class="resultado" id="factor"></p><div class="botones" id="acciones-escalar" hidden>
      <button type="button" class="boton principal" id="guardar-escalada">Guardar como receta nueva</button>
      <button type="button" class="boton" id="quitar-escala">Volver a la original</button></div>`);
    caja.querySelector('#hasta')?.addEventListener('input', (e) => {
      destino = e.target.value;
      const hasta = leerNumero(destino);
      const f = modo === 'raciones' ? factorRaciones(receta.raciones, hasta) : factorMolde(receta.molde, hasta);
      factor = f ?? 1;
      pintarDatos();
    });
    pintarDatos();
  }

  function pintarDatos() {
    const vista = factor === 1 ? receta : escalarReceta(receta, factor, ctx);
    const c = calcularReceta(vista, ctx);

    const tFactor = cont.querySelector('#factor');
    if (tFactor) tFactor.innerHTML = factor !== 1 ? `Hace falta <strong>${numero(factor, 2)} veces</strong> la receta. Las cantidades de abajo ya están cambiadas.` : '';
    const acciones = cont.querySelector('#acciones-escalar');
    if (acciones) acciones.hidden = factor === 1;

    const problemas = c.completa ? '' : `<div class="info alerta-caja"><strong>Faltan datos, el coste real será mayor:</strong>
        <ul>${[...new Set(c.problemas)].map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;

    if (esTarta) {
      precioVista = calcularPrecio(vista, c, ajustes);
      cont.querySelector('#resumen').innerHTML = htmlPrecio(precioVista, vista.raciones) + problemas;
      pintarAnalisis();
    } else {
      const tarjetas = [
        ['Coste total', euros(c.coste)],
        c.costePorRacion !== null ? [`Por ración (${numero(vista.raciones)})`, euros(c.costePorRacion)] : null,
        c.peso > 0 ? [`Peso ${vista.pesoFinal > 0 ? '' : 'aprox. '}${peso(c.peso)}`, `${euros(c.costePorKg)} / kg`] : null,
      ].filter(Boolean);
      cont.querySelector('#resumen').innerHTML =
        `<div class="cifras">${tarjetas.map(([t, v]) => `<div class="cifra"><span>${esc(t)}</span><strong>${v}</strong></div>`).join('')}</div>${problemas}`;
    }

    const ingredientes = c.lineas.filter((l) => l.tipo !== 'material');
    const materiales = c.lineas.filter((l) => l.tipo === 'material');
    const fila = (l) => `
      <li class="linea-ficha ${l.problema ? 'con-problema' : ''}">
        <span class="linea-nombre">${l.linea.recetaId ? `<a href="#/receta/${encodeURIComponent(l.linea.recetaId)}">${esc(l.nombre)}</a>` : esc(l.nombre)}</span>
        <span class="linea-cantidad">${textoCantidad(l.linea.cantidad, l.linea.unidad)}</span>
        <span class="linea-coste">${l.coste !== null ? euros(l.coste) : '⚠️'}</span>
      </li>`;
    cont.querySelector('#lineas').innerHTML = (c.lineas.length === 0
      ? '<p class="vacio">Esta receta todavía no tiene ingredientes. Pulsa <strong>Editar</strong> para añadirlos.</p>'
      : `<ul class="tabla-lineas">${ingredientes.map(fila).join('')}</ul>`) +
      (materiales.length ? `<h3 class="subtitulo-lineas">Materiales y decoración</h3><ul class="tabla-lineas">${materiales.map(fila).join('')}</ul>` : '');
  }

  cont.querySelector('[aria-label="Escalar por"]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-modo]');
    if (!b || b.dataset.modo === modo) return;
    modo = b.dataset.modo; factor = 1; destino = null;
    pintarEscalar();
  });

  cont.querySelector('#escalar').addEventListener('click', async (e) => {
    if (e.target.closest('#quitar-escala')) { factor = 1; destino = null; pintarEscalar(); }
    if (e.target.closest('#guardar-escalada')) {
      const hasta = leerNumero(destino);
      const sufijo = modo === 'raciones' ? `${numero(hasta)} raciones` : `molde ${numero(hasta)} cm`;
      const nueva = escalarReceta(receta, factor, ctx);
      nueva.id = almacen.nuevoId('r');
      nueva.nombre = `${receta.nombre} (${sufijo})`;
      if (modo === 'molde') nueva.molde = hasta;
      if (modo === 'raciones') nueva.raciones = hasta;
      nueva.lineas = nueva.lineas.map((l) => ({ ...l, cantidad: Math.round(l.cantidad * 100) / 100 }));
      await almacen.guardar('recetas', nueva);
      avisar('Receta nueva guardada');
      location.hash = `#/receta/${encodeURIComponent(nueva.id)}`;
    }
  });

  cont.querySelector('#duplicar').addEventListener('click', async () => {
    const copia = structuredClone(receta);
    copia.id = almacen.nuevoId('r');
    let nombre = `${receta.nombre} (copia)`;
    for (let n = 2; recetas.some((r) => r.nombre === nombre); n++) nombre = `${receta.nombre} (copia ${n})`;
    copia.nombre = nombre;
    await almacen.guardar('recetas', copia);
    avisar('Receta duplicada. Cámbiale lo que quieras.');
    location.hash = `#/receta/${encodeURIComponent(copia.id)}/editar`;
  });

  cont.querySelector('#borrar').addEventListener('click', async () => {
    if (usadaEn.length) {
      await confirmar(`No se puede borrar: se usa en ${usadaEn.map((r) => r.nombre).join(', ')}. Quítala antes de esas recetas.`, { si: 'Entendido', no: 'Cerrar' });
      return;
    }
    const ok = await confirmar(`¿Borrar la receta «${receta.nombre}»? No se puede deshacer.`, { si: 'Borrar', peligro: true });
    if (!ok) return;
    await almacen.borrar('recetas', receta.id);
    avisar('Receta borrada');
    location.hash = esTarta ? '#/tartas' : '#/bases';
  });

  pintarEscalar();
}
