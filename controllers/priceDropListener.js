import { db } from "../firebase.js";
import { notifyPriceDrop, parsePrice } from "./userController.js";

/**
 * Detecta bajadas de precio en cuanto cambia un documento en `games`
 * (scrape, consola Firebase, etc.). Único disparador de notificaciones.
 */
export function startGamesPriceListener() {
  const lastPriceByGame = new Map();

  db.collection("games").onSnapshot(
    async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const gameId = change.doc.id;
        const data = change.doc.data();
        const currentPrice = parsePrice(data.precio);

        if (change.type === "removed") {
          lastPriceByGame.delete(gameId);
          continue;
        }

        if (change.type === "added") {
          lastPriceByGame.set(gameId, currentPrice);
          continue;
        }

        const previousPrice = lastPriceByGame.get(gameId);
        lastPriceByGame.set(gameId, currentPrice);

        if (
          previousPrice == null ||
          currentPrice == null ||
          currentPrice >= previousPrice
        ) {
          continue;
        }

        await notifyPriceDrop({
          gameId,
          gameTitle: data.titulo || "Juego",
          gameImage: data.imagen || "",
          oldPrice: previousPrice,
          newPrice: currentPrice,
          discount: data.descuento || "",
        });
      }
    },
    (error) => console.error("Error en listener de precios:", error),
  );

  console.log("👂 Detección de bajadas de precio activa (tiempo real)");
}
