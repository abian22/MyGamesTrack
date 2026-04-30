import app from './app.js';
import { saveAllGames } from './controllers/userController.js';
import { extraerJuegos } from './controllers/scrappingGames.js';
import { startGamesPriceListener } from './controllers/priceDropListener.js';

const PORT = 4000;
const HORA_EJECUCION = 18;
const MINUTO_EJECUCION = 0;
const TIMEZONE = "Europe/Madrid";

console.log('🚀 Iniciando servidor...');

async function actualizarJuegos() {
   await extraerJuegos(); // ← espera a que termine el scraping
   await saveAllGames();  // ← luego guarda en Firebase
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

app.listen(PORT);
console.log(`✅ Servidor escuchando en el puerto ${PORT}`);