import app from './app.js';
import { saveAllGames } from './controllers/userController.js';

const PORT = 4000;

console.log('🚀 Iniciando servidor...');
saveAllGames();

const INTERVALO_8_HORAS = 8 * 60 * 60 * 1000;
setInterval(saveAllGames, INTERVALO_8_HORAS);
console.log('⏰ Guardado automático programado cada 8 horas');

app.listen(PORT);
console.log(`✅ Servidor escuchando en el puerto ${PORT}`);
