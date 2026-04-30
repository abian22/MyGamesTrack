import { db, messaging } from "../firebase.js";

const parsePrice = (rawPrice) => {
  if (typeof rawPrice !== "string") return null;
  const cleaned = rawPrice
    .replaceAll(/\s/g, "")
    .replaceAll("EUR", "")
    .replaceAll("€", "")
    .replaceAll(".", "")
    .replaceAll(",", ".");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeGameId = (title) =>
  title ? title.replaceAll(/\s+/g, "_").replaceAll(/[^a-zA-Z0-9_-]/g, "") : null;

const userHasGameInFavorites = (userData, gameId, gameTitle) => {
  const favorites =
    (Array.isArray(userData?.favGames) && userData.favGames) ||
    (Array.isArray(userData?.favorites) && userData.favorites) ||
    [];

  return favorites.some((item) => {
    if (typeof item === "string") {
      return item === gameId || item === gameTitle;
    }
    if (item && typeof item === "object") {
      const candidateId =
        item.id || item.gameId || (item.titulo ? normalizeGameId(item.titulo) : null);
      const candidateTitle = item.title || item.titulo;
      return candidateId === gameId || candidateTitle === gameTitle;
    }
    return false;
  });
};

const notifyUsersForRealtimeDrop = async ({
  gameId,
  gameTitle,
  gameImage,
  oldPrice,
  newPrice,
  discount,
}) => {
  const usersSnapshot = await db.collection("users").get();
  let matchedUsers = 0;
  let notificationsCreated = 0;
  let pushAttempts = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    if (!userHasGameInFavorites(userData, gameId, gameTitle)) continue;
    matchedUsers += 1;

    const notificationId = `${userDoc.id}_${gameId}_${newPrice.toFixed(2)}_realtime`;
    const notificationRef = db.collection("notifications").doc(notificationId);
    const existingNotification = await notificationRef.get();
    if (existingNotification.exists) {
      console.log(`[Realtime] Notificación ya existente para ${userDoc.id} (${gameTitle})`);
      continue;
    }

    await notificationRef.set({
      uid: userDoc.id,
      gameId,
      gameTitle,
      gameImage: gameImage || "",
      oldPrice,
      newPrice,
      discount: discount || "",
      type: "price_drop",
      source: "realtime_listener",
      read: false,
      createdAt: new Date(),
    });
    notificationsCreated += 1;

    const fcmTokens = Array.isArray(userData?.fcmTokens) ? userData.fcmTokens : [];
    if (!fcmTokens.length) {
      console.log(`[Realtime] Usuario ${userDoc.id} sin fcmTokens`);
      continue;
    }

    try {
      pushAttempts += 1;
      const response = await messaging.sendEachForMulticast({
        tokens: fcmTokens,
        notification: {
          title: "Bajada de precio",
          body: `${gameTitle} bajó de ${oldPrice.toFixed(2)}€ a ${newPrice.toFixed(2)}€`,
          imageUrl: gameImage || undefined,
        },
        data: {
          type: "price_drop",
          source: "realtime_listener",
          gameId,
          gameTitle,
          gameImage: gameImage || "",
          oldPrice: oldPrice.toFixed(2),
          newPrice: newPrice.toFixed(2),
        },
      });
      console.log(
        `[Realtime] FCM ${userDoc.id}: ok=${response.successCount}, fail=${response.failureCount}, tokens=${fcmTokens.length}`,
      );
    } catch (error) {
      console.error(`Error enviando FCM realtime a ${userDoc.id}:`, error);
    }
  }

  console.log(
    `[Realtime] Resumen ${gameTitle}: usuariosCoinciden=${matchedUsers}, notifsCreadas=${notificationsCreated}, enviosIntentados=${pushAttempts}`,
  );
};

const startGamesPriceListener = () => {
  const lastSeenPriceByGame = new Map();

  db.collection("games").onSnapshot(
    async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const gameData = change.doc.data();
        const gameId = change.doc.id;
        const gameTitle = gameData.titulo || "Juego sin título";
        const currentPrice = parsePrice(gameData.precio);

        if (change.type === "removed") {
          lastSeenPriceByGame.delete(gameId);
          continue;
        }

        if (change.type === "added") {
          lastSeenPriceByGame.set(gameId, currentPrice);
          continue;
        }

        const previousPrice = lastSeenPriceByGame.get(gameId);
        lastSeenPriceByGame.set(gameId, currentPrice);

        if (
          change.type === "modified" &&
          previousPrice !== null &&
          previousPrice !== undefined &&
          currentPrice !== null &&
          currentPrice < previousPrice
        ) {
          await notifyUsersForRealtimeDrop({
            gameId,
            gameTitle,
            gameImage: gameData.imagen || "",
            oldPrice: previousPrice,
            newPrice: currentPrice,
            discount: gameData.descuento || "",
          });
          console.log(
            `[Realtime] Bajada detectada en ${gameTitle}: ${previousPrice} -> ${currentPrice}`,
          );
        }
      }
    },
    (error) => {
      console.error("Error en listener realtime de games:", error);
    },
  );

  console.log("👂 Listener realtime de bajadas de precio iniciado");
};

export { startGamesPriceListener };
