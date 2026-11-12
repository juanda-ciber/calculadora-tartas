// Pantalla: Ajustes (precio por hora, gastos de casa, beneficio, redondeo).
import * as almacen from '../almacen.js';
import { AJUSTES_PRECIO, ajustesPrecio, calcularPrecio } from '../calculos.js';
import { euros, numero, leerNumero } from '../formato.js';
import { avisar, mostrarError, confirmar } from './comun.js';
import { htmlCopiaEInstalar, activarCopiaEInstalar } from './copia-ui.js';

export async function vistaAjustes(cont, consulta = new URLSearchParams()) {
  const guardados = await almacen.leerAjustes();
  const a = ajustesPrecio(guardados);
  const dias = guardados.diasAvisoPrecio ?? 90;

  cont.innerHTML = `
    <header class="cabecera"><h1>Ajustes</h1></header>
    <p class="ayuda">Estos valores se usan para calcular el precio de <strong>todas</strong> las tartas. Ya vienen puestos unos valores recomendados: cámbialos solo si quieres.</p>

    <form id="form-ajustes" class="formulario" novalidate>
      <section class="bloque">
        <h2>👩‍🍳 Tu trabajo</h2>
        <label class="campo"><span>¿Cuánto cobras por hora?</span>
          <span class="con-sufijo"><input name="precioHora" inputmode="decimal" value="${numero(a.precioHora, 2)}" autocomplete="off"><span>€ / hora</span></span></label>
        <p class="ayuda">Recomendado: <strong>12 €/hora</strong>. El salario mínimo en España ronda los 9-10 € por hora, y una tarta hecha a mano es un trabajo especializado. Si cobras menos, estás trabajando casi gratis.</p>
      </section>

      <section class="bloque">
        <h2>💡 Luz, gas, agua y desgaste</h2>
        <p class="ayuda">El horno, la batidora y la nevera gastan, y con el uso se estropean. Elige cómo calcularlo:</p>
        <div class="opciones">
          <label class="opcion"><input type="radio" name="modoGastos" value="porcentaje" ${a.modoGastos !== 'mensual' ? 'checked' : ''}>
            <span><strong>Un porcentaje</strong><small>Recomendado: lo más fácil, no hace falta mirar facturas</small></span></label>
          <label class="opcion"><input type="radio" name="modoGastos" value="mensual" ${a.modoGastos === 'mensual' ? 'checked' : ''}>
            <span><strong>Mis gastos del mes</strong><small>Si sabes cuánto sube la factura por hacer tartas</small></span></label>
        </div>
        <div id="gastos-porcentaje">
          <label class="campo"><span>Porcentaje sobre ingredientes y materiales</span>
            <span class="con-sufijo"><input name="gastosPct" inputmode="decimal" value="${numero(a.gastosPct, 2)}" autocomplete="off"><span>%</span></span></label>
          <p class="ayuda">Recomendado: <strong>10 %</strong>. Si los ingredientes cuestan 10 €, se suma 1 € por luz, gas y desgaste.</p>
        </div>
        <div id="gastos-mensual">
          <label class="campo"><span>¿Cuánto más pagas al mes por hacer tartas?</span>
            <span class="con-sufijo"><input name="gastosMensuales" inputmode="decimal" value="${numero(a.gastosMensuales, 2)}" autocomplete="off"><span>€ / mes</span></span></label>
          <p class="ayuda">Compara tus facturas de luz, gas y agua de cuando haces tartas con las de antes. Como referencia, un horno eléctrico encendido una hora suele gastar alrededor de 0,30-0,60 €.</p>
          <label class="campo"><span>¿Cuántas tartas vendes al mes, más o menos?</span>
            <input name="tartasMes" inputmode="decimal" value="${a.tartasMes > 0 ? numero(a.tartasMes) : ''}" placeholder="Ej.: 8" autocomplete="off"></label>
          <p class="ayuda">Los gastos del mes se reparten entre las tartas. Cuantas más vendas, menos le toca a cada una.</p>
        </div>
      </section>

      <section class="bloque">
        <h2>💶 Tu beneficio</h2>
        <label class="campo"><span>Beneficio sobre el coste</span>
          <span class="con-sufijo"><input name="margenPct" inputmode="decimal" value="${numero(a.margenPct, 2)}" autocomplete="off"><span>%</span></span></label>
        <p class="ayuda">Recomendado: <strong>30 %</strong> (como en el Excel del curso). Es lo que ganas <strong>además</strong> de cobrar tu trabajo: sirve para comprar moldes, cubrir una tarta que sale mal o ahorrar.</p>
        <label class="campo"><span>Redondear el precio</span>
          <select name="redondeo">
            <option value="auto" ${a.redondeo === 'auto' ? 'selected' : ''}>Automático (a 0,50 € si es barato, a 1 € si no)</option>
            <option value="0.5" ${String(a.redondeo) === '0.5' ? 'selected' : ''}>Hacia arriba, a 0,50 €</option>
            <option value="1" ${String(a.redondeo) === '1' ? 'selected' : ''}>Hacia arriba, a 1 €</option>
            <option value="0" ${String(a.redondeo) === '0' ? 'selected' : ''}>Sin redondear</option>
          </select></label>
      </section>

      <section class="bloque">
        <h2>🧾 Ejemplo con estos ajustes</h2>
        <p id="ejemplo" class="info"></p>
      </section>

      <section class="bloque">
        <h2>🏷️ Precios de los productos</h2>
        <label class="campo"><span>Avisar si un precio tiene más de</span>
          <span class="con-sufijo"><input name="diasAvisoPrecio" inputmode="numeric" value="${dias}" autocomplete="off"><span>días</span></span></label>
      </section>

      <p class="error-form" role="alert" hidden></p>
      <div class="botones fijos">
        <button type="submit" class="boton principal grande">Guardar ajustes</button>
        <button type="button" class="boton" id="recomendados">Volver a los recomendados</button>
      </div>
    </form>
    ${htmlCopiaEInstalar(guardados)}`;

  const form = cont.querySelector('#form-ajustes');

  function leer() {
    const n = (campo) => leerNumero(form.elements[campo].value);
    return {
      precioHora: n('precioHora'),
      modoGastos: form.elements.modoGastos.value,
      gastosPct: n('gastosPct'),
      gastosMensuales: form.elements.gastosMensuales.value.trim() ? n('gastosMensuales') : 0,
      tartasMes: form.elements.tartasMes.value.trim() ? n('tartasMes') : 0,
      margenPct: n('margenPct'),
      redondeo: form.elements.redondeo.value === 'auto' ? 'auto' : Number(form.elements.redondeo.value),
      diasAvisoPrecio: n('diasAvisoPrecio'),
    };
  }

  function actualizar() {
    const modo = form.elements.modoGastos.value;
    cont.querySelector('#gastos-porcentaje').hidden = modo !== 'porcentaje';
    cont.querySelector('#gastos-mensual').hidden = modo !== 'mensual';
    const v = leer();
    const valido = [v.precioHora, v.gastosPct, v.margenPct, v.gastosMensuales, v.tartasMes].every((x) => x !== null);
    const ej = cont.querySelector('#ejemplo');
    if (!valido) { ej.textContent = 'Revisa que todos los números estén bien escritos.'; return; }
    const p = calcularPrecio({ minutos: 120, raciones: 10 }, { costeIngredientes: 10, costeMateriales: 3, completa: true }, v);
    ej.innerHTML = `Una tarta con <strong>10 €</strong> de ingredientes, <strong>3 €</strong> de caja y base y <strong>2 horas</strong> de trabajo:<br>
      coste total ${euros(p.costeTotal)} → la vendes a <strong>${euros(p.precio)}</strong>.<br>
      Te llevas <strong>${euros(p.teLlevas)}</strong> (tu trabajo + beneficio).`;
  }

  form.addEventListener('input', actualizar);
  form.addEventListener('change', actualizar);

  cont.querySelector('#recomendados').addEventListener('click', async () => {
    const ok = await confirmar('¿Volver a poner los valores recomendados (12 €/hora, 10 % de gastos, 30 % de beneficio)?', { si: 'Sí, volver' });
    if (!ok) return;
    await almacen.guardarAjustes({ ...AJUSTES_PRECIO, diasAvisoPrecio: 90 });
    avisar('Valores recomendados puestos');
    vistaAjustes(cont);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = leer();
    if (!(v.precioHora >= 0) || v.precioHora === null) return mostrarError(form, 'Escribe cuánto cobras por hora, por ejemplo 12.');
    if (v.modoGastos === 'porcentaje' && v.gastosPct === null) return mostrarError(form, 'Escribe el porcentaje de gastos, por ejemplo 10.');
    if (v.modoGastos === 'mensual') {
      if (v.gastosMensuales === null) return mostrarError(form, 'Escribe cuánto más pagas al mes, por ejemplo 20.');
      if (!(v.tartasMes > 0)) return mostrarError(form, 'Escribe cuántas tartas vendes al mes (al menos 1).');
    }
    if (v.margenPct === null) return mostrarError(form, 'Escribe el beneficio, por ejemplo 30.');
    if (!(v.diasAvisoPrecio > 0)) return mostrarError(form, 'Escribe cada cuántos días avisar de los precios, por ejemplo 90.');
    mostrarError(form, '');
    try {
      await almacen.guardarAjustes(v);
    } catch (err) {
      return mostrarError(form, err.message);
    }
    avisar('Ajustes guardados. Todas las tartas se han recalculado.');
  });

  activarCopiaEInstalar(cont);
  actualizar();
  // Desde el recordatorio de Tartas: ir directamente a la copia.
  // (un instante después, porque app.js sube la página arriba al cambiar de pantalla)
  if (consulta.get('ir') === 'copia') setTimeout(() => cont.querySelector('#copia')?.scrollIntoView({ block: 'start' }), 50);
}
