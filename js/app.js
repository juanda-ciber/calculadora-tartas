// Punto de entrada: carga los datos y decide qué pantalla mostrar
// según la dirección (#/productos, #/producto/ID, #/proveedores…).
import * as almacen from './almacen.js';
import { vistaProductos } from './vistas/productos.js';
import { vistaProductoEditar } from './vistas/producto-editar.js';
import { vistaProveedores } from './vistas/proveedores.js';
import { vistaRecetas } from './vistas/recetas.js';
import { vistaRecetaFicha } from './vistas/receta-ficha.js';
import { vistaRecetaEditar } from './vistas/receta-editar.js';
import { vistaAjustes } from './vistas/ajustes.js';
import { marcarMenu } from './vistas/comun.js';

const cont = document.getElementById('app');

async function cargarIniciales() {
  const resp = await fetch('datos/datos-iniciales.json');
  if (!resp.ok) throw new Error('No se han encontrado los datos iniciales.');
  return resp.json();
}

async function mostrar() {
  // La pantalla principal es "Tartas". "#/recetas" (versión anterior) también lleva ahí.
  let hash = location.hash || '#/tartas';
  if (hash === '#/recetas') hash = '#/tartas';
  const [ruta, textoConsulta = ''] = hash.slice(1).split('?');
  const partes = ruta.split('/').filter(Boolean);
  const consulta = new URLSearchParams(textoConsulta);

  // Las pantallas de una receta marcan ellas mismas "Tartas" o "Bases".
  marcarMenu({ producto: 'productos' }[partes[0]] ?? partes[0]);

  try {
    if (partes[0] === 'producto' && partes[1]) await vistaProductoEditar(cont, decodeURIComponent(partes[1]), consulta);
    else if (partes[0] === 'productos') await vistaProductos(cont);
    else if (partes[0] === 'proveedores') await vistaProveedores(cont);
    else if (partes[0] === 'ajustes') await vistaAjustes(cont, consulta);
    else if (partes[0] === 'receta' && partes[1] === 'nueva') await vistaRecetaEditar(cont, 'nueva', consulta);
    else if (partes[0] === 'receta' && partes[1] && partes[2] === 'editar') await vistaRecetaEditar(cont, decodeURIComponent(partes[1]), consulta);
    else if (partes[0] === 'receta' && partes[1]) await vistaRecetaFicha(cont, decodeURIComponent(partes[1]));
    else if (partes[0] === 'bases') await vistaRecetas(cont, 'preparacion');
    else { marcarMenu('tartas'); await vistaRecetas(cont, 'venta'); }
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    cont.innerHTML = `<p class="info">Algo no ha ido bien al abrir esta pantalla. Prueba a volver a <a href="#/tartas">Tartas</a>.</p>`;
  }
}

/**
 * Si los datos se crearon con una versión anterior (sin recetas), añade
 * las recetas del Excel y lo que falte, SIN tocar lo que ya hay.
 */
async function ponerAlDia() {
  const ajustes = await almacen.leerAjustes();
  if (ajustes.recetasExcelImportadas) return;
  const ini = await cargarIniciales();
  const productos = await almacen.listar('productos');
  const recetas = await almacen.listar('recetas');
  const huevos = productos.find((p) => p.id === 'p-huevos');
  if (huevos && !huevos.pesoUnidad) await almacen.guardar('productos', { ...huevos, pesoUnidad: 55 });
  const idsProductos = new Set(productos.map((p) => p.id));
  for (const r of ini.recetas) {
    const sePuede = r.lineas.every((l) => !l.productoId || idsProductos.has(l.productoId));
    if (sePuede && !recetas.some((x) => x.id === r.id)) await almacen.guardar('recetas', r);
  }
  await almacen.guardarAjustes({
    categoriasVenta: ajustes.categoriasVenta ?? ini.ajustes.categoriasVenta,
    categoriasPreparacion: ajustes.categoriasPreparacion ?? ini.ajustes.categoriasPreparacion,
    recetasExcelImportadas: true,
  });
}

async function arrancar() {
  try {
    await almacen.iniciar(cargarIniciales);
    await ponerAlDia();
  } catch (err) {
    console.error(err);
    cont.innerHTML = `<p class="info">No se han podido cargar los datos. Comprueba la conexión y recarga la página.</p>`;
    return;
  }
  window.addEventListener('hashchange', mostrar);
  mostrar();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

arrancar();
