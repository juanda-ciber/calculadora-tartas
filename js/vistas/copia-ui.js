// Partes de la pantalla de Ajustes: copia de seguridad e instalar en el móvil.
import * as almacen from '../almacen.js';
import { crearCopia, leerCopia, nombreArchivoCopia } from '../copia.js';
import { diasDesde } from '../calculos.js';
import { hoyISO, fecha, haceTiempo } from '../formato.js';
import { avisar, confirmar } from './comun.js';

// Android/Chrome avisa de que la app se puede instalar: se guarda el aviso
// para poder mostrar un botón "Instalar".
let avisoInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  avisoInstalar = e;
});

const estaInstalada = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

/** ¿Conviene recordar que haga una copia? (nunca hecha o hace más de 30 días) */
export function tocaCopia(ajustes, hoy = hoyISO()) {
  if (!ajustes.ultimaCopia) return true;
  return diasDesde(ajustes.ultimaCopia, hoy) > 30;
}

export function htmlCopiaEInstalar(ajustes) {
  const ultima = ajustes.ultimaCopia;
  return `
    <section class="bloque" id="copia">
      <h2>💾 Copia de seguridad</h2>
      <p class="ayuda">Los datos se guardan solo en este dispositivo. Si se borra el navegador o cambias de móvil, se perderían.
        Guarda una copia de vez en cuando (por ejemplo, una vez al mes) y mándatela por WhatsApp o correo, o guárdala en Drive.</p>
      <p class="${ultima && diasDesde(ultima, hoyISO()) <= 30 ? 'info exito-caja' : 'info alerta-caja'}">
        ${ultima ? `Última copia: <strong>${fecha(ultima)}</strong> (${haceTiempo(diasDesde(ultima, hoyISO()))}).` : 'Todavía no has guardado ninguna copia.'}
      </p>
      <div class="botones">
        <button type="button" class="boton principal" id="guardar-copia">Guardar copia</button>
        <button type="button" class="boton" id="enviar-copia" hidden>Enviar copia…</button>
        <button type="button" class="boton" id="recuperar-copia">Recuperar una copia</button>
      </div>
      <input type="file" id="archivo-copia" accept=".json,application/json" hidden>
      <p class="ayuda">Para <strong>pasar tus datos a otro móvil u ordenador</strong>: guarda una copia aquí, mándatela, y en el otro dispositivo pulsa «Recuperar una copia».</p>
    </section>

    <section class="bloque" id="instalar">
      <h2>📱 Tenerla en el móvil como una app</h2>
      <div id="caja-instalar"></div>
    </section>`;
}

export function activarCopiaEInstalar(cont) {
  const hoy = hoyISO();

  async function contenidoCopia() {
    const datos = await almacen.exportarTodo();
    const texto = JSON.stringify(crearCopia(datos, hoy), null, 2);
    return new File([texto], nombreArchivoCopia(hoy), { type: 'application/json' });
  }

  async function apuntarCopia() {
    await almacen.guardarAjustes({ ultimaCopia: hoy });
  }

  cont.querySelector('#guardar-copia').addEventListener('click', async () => {
    const archivo = await contenidoCopia();
    const url = URL.createObjectURL(archivo);
    const a = document.createElement('a');
    a.href = url;
    a.download = archivo.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    await apuntarCopia();
    avisar(`Copia guardada en Descargas: ${archivo.name}`);
    setTimeout(() => location.reload(), 1500);
  });

  // "Enviar" solo existe en móviles que permiten compartir archivos.
  const botonEnviar = cont.querySelector('#enviar-copia');
  const prueba = new File(['{}'], 'prueba.json', { type: 'application/json' });
  if (navigator.canShare?.({ files: [prueba] })) {
    botonEnviar.hidden = false;
    botonEnviar.addEventListener('click', async () => {
      try {
        const archivo = await contenidoCopia();
        await navigator.share({ files: [archivo], title: 'Copia de la calculadora de tartas' });
        await apuntarCopia();
        avisar('Copia enviada');
      } catch {
        // La usuaria canceló el envío: no pasa nada.
      }
    });
  }

  const entrada = cont.querySelector('#archivo-copia');
  cont.querySelector('#recuperar-copia').addEventListener('click', () => entrada.click());
  entrada.addEventListener('change', async () => {
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    const r = leerCopia(await archivo.text());
    if (!r.ok) {
      await confirmar(r.error, { si: 'Entendido', no: 'Cerrar' });
      return;
    }
    const s = r.resumen;
    const ok = await confirmar(
      `Esta copia${s.fecha ? ` es del ${fecha(s.fecha)} y` : ''} tiene ${s.tartas} tartas, ${s.bases} bases y ${s.productos} productos. ` +
      'Se van a cambiar TODOS los datos de este dispositivo por los de la copia. ¿Seguir?',
      { si: 'Sí, recuperar', peligro: true });
    if (!ok) return;
    try {
      await almacen.reemplazarTodo(r.datos);
    } catch (err) {
      await confirmar(err.message, { si: 'Entendido', no: 'Cerrar' });
      return;
    }
    avisar('Copia recuperada');
    setTimeout(() => { location.hash = '#/tartas'; location.reload(); }, 800);
  });

  // --- Instalar ---
  const caja = cont.querySelector('#caja-instalar');
  const esIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (estaInstalada()) {
    caja.innerHTML = '<p class="info exito-caja">✓ Ya la estás usando como app.</p>';
  } else {
    caja.innerHTML = `
      ${avisoInstalar ? '<button type="button" class="boton principal" id="boton-instalar">Instalar en este móvil</button>' : ''}
      <p class="ayuda">Así aparece con su icono en la pantalla de inicio y funciona sin internet.</p>
      <details class="desglose" ${esIphone ? '' : 'open'}><summary>En Android (Chrome)</summary>
        <ol><li>Pulsa el menú <strong>⋮</strong> (arriba a la derecha).</li>
        <li>Elige <strong>«Añadir a pantalla de inicio»</strong> o <strong>«Instalar aplicación»</strong>.</li></ol></details>
      <details class="desglose" ${esIphone ? 'open' : ''}><summary>En iPhone (Safari)</summary>
        <ol><li>Pulsa el botón <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba).</li>
        <li>Elige <strong>«Añadir a pantalla de inicio»</strong>.</li></ol></details>
      <p class="ayuda">Solo funciona cuando la app está publicada en internet (no desde el ordenador con «Abrir calculadora»).</p>`;
    caja.querySelector('#boton-instalar')?.addEventListener('click', async () => {
      avisoInstalar.prompt();
      await avisoInstalar.userChoice.catch(() => null);
      avisoInstalar = null;
    });
  }
}

/** Recordatorio pequeño para la pantalla de Tartas. */
export function htmlRecordatorioCopia(ajustes, hayTartas) {
  if (!hayTartas || !tocaCopia(ajustes)) return '';
  return `<p class="info recordatorio">💾 ${ajustes.ultimaCopia ? 'Hace más de un mes que no guardas una copia de tus datos.' : 'Todavía no has guardado ninguna copia de tus datos.'}
    <a href="#/ajustes?ir=copia">Guardar copia ahora</a></p>`;
}
