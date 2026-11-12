// Service worker: permite que la app se instale y funcione sin internet.
// - Al instalarse, guarda todos los archivos de la app (ARCHIVOS).
// - Después, "primero la red": si hay conexión usa la versión nueva y
//   actualiza la copia; si no hay conexión, usa la copia guardada.
// IMPORTANTE: al añadir un archivo nuevo a la app, añádelo también aquí
// y sube el número de VERSION.
const VERSION = 'v5';
const CACHE = `tartas-${VERSION}`;

const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/estilos.css',
  './datos/datos-iniciales.json',
  './iconos/icono.svg',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/icono-maskable-512.png',
  './iconos/apple-touch-icon.png',
  './js/app.js',
  './js/almacen.js',
  './js/calculos.js',
  './js/copia.js',
  './js/formato.js',
  './js/unidades.js',
  './js/vistas/ajustes.js',
  './js/vistas/comun.js',
  './js/vistas/copia-ui.js',
  './js/vistas/producto-editar.js',
  './js/vistas/productos.js',
  './js/vistas/proveedores.js',
  './js/vistas/receta-editar.js',
  './js/vistas/receta-ficha.js',
  './js/vistas/recetas.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // Borra las copias de versiones anteriores.
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('tartas-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const pet = evento.request;
  if (pet.method !== 'GET' || new URL(pet.url).origin !== self.location.origin) return;
  evento.respondWith(
    fetch(pet)
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(pet, copia));
        }
        return resp;
      })
      .catch(() => caches.match(pet, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
