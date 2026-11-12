// Piezas que usan todas las pantallas.

/** Evita que un texto escrito por la usuaria se interprete como HTML. */
export function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Quita tildes y mayúsculas para buscar: "Azúcar" → "azucar". */
export function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

let temporizador = null;
/** Mensaje corto abajo de la pantalla ("Guardado", etc.). */
export function avisar(texto, tipo = 'ok') {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.dataset.tipo = tipo;
  el.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { el.hidden = true; }, tipo === 'error' ? 5000 : 2500);
}

/**
 * Abre una ventana (dialog) con el HTML dado. Devuelve el elemento.
 * Se borra sola al cerrarse.
 */
export function abrirDialogo(html) {
  const d = document.createElement('dialog');
  d.className = 'dialogo';
  d.innerHTML = html;
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove());
  // Cerrar tocando fuera de la ventana.
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.showModal();
  return d;
}

/** Pregunta sí/no con palabras claras. Devuelve una promesa con true/false. */
export function confirmar(mensaje, { si = 'Sí', no = 'Cancelar', peligro = false } = {}) {
  return new Promise((resolver) => {
    const d = abrirDialogo(`
      <p class="dialogo-texto">${esc(mensaje)}</p>
      <div class="botones">
        <button type="button" class="boton ${peligro ? 'peligro' : 'principal'}" data-r="si">${esc(si)}</button>
        <button type="button" class="boton" data-r="no">${esc(no)}</button>
      </div>`);
    let respuesta = false;
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      respuesta = b.dataset.r === 'si';
      d.close();
    });
    d.addEventListener('close', () => resolver(respuesta));
  });
}

/** Muestra un error dentro de un formulario (o lo quita si texto está vacío). */
export function mostrarError(form, texto) {
  const el = form.querySelector('.error-form');
  if (!el) return;
  el.textContent = texto || '';
  el.hidden = !texto;
  if (texto) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Marca en el menú de abajo la sección en la que estamos. */
export function marcarMenu(seccion) {
  document.querySelectorAll('.menu a').forEach((a) => {
    a.toggleAttribute('aria-current', a.dataset.seccion === seccion);
  });
}

/** Sección del menú de una receta: las de vender son "tartas", el resto "bases". */
export function seccionDeReceta(receta) {
  return receta?.uso === 'venta' ? 'tartas' : 'bases';
}
