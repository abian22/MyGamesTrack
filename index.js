import app from './app.js';
import { saveAllGames } from './controllers/userController.js';
import { extraerJuegos } from './controllers/scrappingGames.js';
import { startGamesPriceListener } from './controllers/priceDropListener.js';
const PORT = 4000;
const HORA_EJECUCION = 18;
const MINUTO_EJECUCION = 0;
const TIMEZONE = "Europa/España";

console.log('🚀 Iniciando servidor...');

async function actualizarJuegos() {
   // Flujo principal: scrapea web y persiste cambios en Firestore.
   await extraerJuegos(); 
   await saveAllGames();  
 }

function msHastaSiguienteEjecucion() {
  const ahoraZona = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
  const proxima = new Date(ahoraZona);
  proxima.setHours(HORA_EJECUCION, MINUTO_EJECUCION, 0, 0);

  if (proxima <= ahoraZona) {
    proxima.setDate(proxima.getDate() + 1);
  }

  return proxima.getTime() - ahoraZona.getTime();
}

function programarActualizacionDiaria() {
  // Reprograma la siguiente ejecución cada vez que termina (sin cron externo).
  const esperaMs = msHastaSiguienteEjecucion();
  const horasRestantes = (esperaMs / (1000 * 60 * 60)).toFixed(2);
  console.log(`⏰ Próxima actualización automática en ${horasRestantes}h (18:00 ${TIMEZONE}).`);

  setTimeout(async () => {
    try {
      await actualizarJuegos();
      console.log('✅ Actualización diaria completada');
    } catch (err) {
      console.error('Error en actualización diaria:', err);
    } finally {
      programarActualizacionDiaria();
    }
  }, esperaMs);
}

programarActualizacionDiaria();
startGamesPriceListener();

const server = app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en el puerto ${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `El puerto ${PORT} ya está en uso. Cierra la otra instancia (Ctrl+C) o mata el proceso que lo ocupa.`,
    );
    process.exit(1);
  }
  throw err;
});