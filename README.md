# MyGamesTrack — Backend

Servidor **Node.js** que combina tres responsabilidades en un mismo proceso:

1. **API REST** (Express) — autenticación y sincronización del catálogo con Firestore.
2. **Scraping programado** (Puppeteer) — extracción diaria de la Nintendo eShop.
3. **Listener en tiempo real** (Firestore `onSnapshot`) — alertas de bajada de precio y FCM.

No es una API de catálogo completa: **no existe** un endpoint para listar juegos. El catálogo vive en la colección `games` de Firestore; la app móvil lo consulta habitualmente con el **SDK de Firebase en el cliente** (fuera de este repositorio).

## Características

- Scraping de la eShop con **Puppeteer** (Chromium headless, contenido dinámico).
- Actualización automática programada a las **18:00** (`index.js`; zona `Europa/España`).
- Sincronización `juegos.json` → colección **`games`** en Firestore.
- Listener **`onSnapshot`** sobre `games` como **único disparador** de notificaciones de precio.
- Push **FCM** y bandeja en colección **`notifications`**.
- Auth con **Firebase Admin** (`/signup`, `/login`, middleware `Bearer`).

## Arquitectura

```
                    ┌─────────────────────────────┐
                    │   Node.js (index.js)        │
                    │   Express :4000             │
                    │   + scheduler 18:00         │
                    │   + priceDropListener       │
                    └─────────────┬───────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
  Firebase Admin            Firestore                 Puppeteer
  (Auth, FCM)          games / users /          → Nintendo eShop
                       notifications

App móvil (Flutter) ──REST──► Express     (signup, login, games/save)
App móvil (Flutter) ──SDK──► Firestore    (lectura de catálogo, favoritos, etc.)
```

| Componente | Quién lo usa |
|------------|----------------|
| `POST /signup`, `POST /login` | Cliente vía REST |
| `POST /games/save` | Cliente vía REST (requiere `juegos.json` previo) |
| Scrape diario | Solo el proceso Node (no hay ruta HTTP) |
| Alertas de precio | Listener interno al cambiar `games` |

## Requisitos

- **Node.js** 18+ (recomendado LTS)
- Proyecto **Firebase**: Authentication, Cloud Firestore, Cloud Messaging (FCM)
- Cuenta de servicio (JSON) con permisos de administrador

## Instalación

```bash
git clone <url-del-repositorio>
cd MyGamesTrack
npm install
```

### Credenciales de Firebase

**Opción A — Archivo local**

1. Descarga la clave JSON de la cuenta de servicio en Firebase Console.
2. Guárdala como `firebase.json` en la raíz (está en `.gitignore`).

**Opción B — Variable de entorno**

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

`firebase.js` usa primero la variable de entorno; si no existe, lee `firebase.json`.

## Uso

```bash
npm run dev    # desarrollo (nodemon)
npm start      # producción
```

Al arrancar:

1. Se programa el scrape + `saveAllGames()` para las 18:00.
2. Se activa `startGamesPriceListener()`.
3. Express escucha en el **puerto 4000**.

> Una sola instancia del proceso. Puerto ocupado → error `EADDRINUSE`.

```bash
npm run backfill:titulolower   # rellena tituloLower en games antiguos
```

## API REST

Base: `http://localhost:4000`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/signup` | No | Crea usuario en Firebase Auth + perfil en Firestore. Responde `{ "token": "<customToken>" }`. El cliente debe canjearlo con `signInWithCustomToken()` para obtener el ID Token. |
| `POST` | `/login` | No | Body: `{ "idToken": "..." }`. Verifica el token; crea perfil en Firestore si no existe. Responde `{ "uid", "email" }` (no devuelve token). |
| `POST` | `/games/save` | Sí | Lee `juegos.json` y sincroniza `games`. Responde `{ "resultados": [...] }` o error 400/500. |
| `GET` | `/` | Sí | Consulta `users` en Firestore; la respuesta HTTP está **vacía** (`res.send()` sin cuerpo). Uso interno / incompleto. |

**No expuesto por HTTP:** listar juegos, ejecutar scrape, disparar notificaciones manualmente.

### Autenticación (rutas protegidas)

```http
Authorization: Bearer <Firebase_ID_Token>
```

`checkAuth` valida con `auth.verifyIdToken()`.

### Ejemplo: guardar catálogo

Requiere `juegos.json` generado antes (scrape automático o ejecución previa de `extraerJuegos`).

```http
POST /games/save
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json
```

## Flujos principales

### 1. Actualización diaria

1. `extraerJuegos()` — Puppeteer → `juegos.json`
2. `saveAllGames()` — sincroniza Firestore (sin `req`/`res` cuando lo llama el scheduler)
3. Cambios en `games` → el listener evalúa bajadas de precio

Configuración en `index.js`:

```js
const HORA_EJECUCION = 18;
const MINUTO_EJECUCION = 0;
const TIMEZONE = "Europa/España";
```

> Node.js espera un identificador **IANA** (por ejemplo `Europe/Madrid`). Con `Europa/España`, `toLocaleString({ timeZone })` puede lanzar error y afectar al cálculo del scheduler al arrancar.

### 2. Alertas de precio (tiempo real)

`priceDropListener.js` escucha `games`. En un `modified`, si el precio **baja** respecto al último valor visto en memoria:

1. Usuarios con el juego en `favGames` o `favorites`
2. Documento en `notifications` (ID único: usuario + juego + precio)
3. Push FCM a `fcmTokens` (si existen)

No notifica en `added` ni si el precio sube o se mantiene.

## Modelo de datos (Firestore)

### `games/{gameId}`

| Campo | Descripción |
|-------|-------------|
| `titulo`, `tituloLower` | Título y versión en minúsculas |
| `precio`, `precioAnterior` | Precio actual y anterior (texto del scrape) |
| `imagen`, `descuento` | Imagen y oferta |
| `createdAt` | Creación del documento (no se actualiza en cada sync) |

`gameId` = título normalizado (`normalizeGameId`).

### `users/{uid}`

`email`, `name`, `rol`, `favGames`, `fcmTokens`, `createdAt`, …

### `notifications/{notificationId}`

`uid`, `gameId`, `gameTitle`, `oldPrice`, `newPrice`, `type: "price_drop"`, `leida`, `createdAt`, …

## Estructura del proyecto

```
MyGamesTrack/
├── index.js                 # Scheduler + listener + app.listen(4000)
├── app.js                   # Express (morgan, json, rutas)
├── firebase.js              # firebase-admin
├── routes/index.js
├── middlewares/auth.js
├── controllers/
│   ├── authController.js
│   ├── userController.js    # saveAllGames, notifyPriceDrop
│   ├── scrappingGames.js
│   └── priceDropListener.js
├── models/Game.js, User.js
├── juegos.json              # generado por el scrape
└── backfillTituloLower.js
```

## Dependencias

| Paquete | Uso en este repo |
|---------|------------------|
| `express` | API HTTP |
| `firebase-admin` | Auth, Firestore, FCM |
| `puppeteer` | Scraping |
| `morgan` | Logs de peticiones |
| `dotenv` | Carga de `.env` |

El paquete `firebase` (cliente) figura en `package.json` pero **no se importa** en el código del backend; solo se usa `firebase-admin`.

## Consideraciones

- **API limitada:** cuatro rutas; el catálogo no se sirve por REST.
- **Scraping:** dependiente del HTML de Nintendo; logs `[SCRAPER]` si fallan selectores o resultados vacíos.
- **Proceso siempre activo:** sin el servidor en marcha no hay scheduler ni listener.
- **Puppeteer:** requiere Chromium; en Linux puede hacer falta instalar dependencias del sistema.
- **Uso de Nintendo:** respeta términos y límites razonables (una ejecución diaria programada).

## Licencia

ISC
