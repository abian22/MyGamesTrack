import { db, messaging } from "../firebase.js";

import { promises as fs } from "node:fs";

const rutaJuegos = new URL("../juegos.json", import.meta.url);

const parsePrice = (rawPrice) => {
  if (rawPrice == null) return null;
  if (typeof rawPrice === "number" && Number.isFinite(rawPrice)) return rawPrice;
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
const normalizeTitleForSearch = (title) => (title || "Sin título").toLowerCase().trim();

const buildNotificationId = (uid, gameId, newPrice) =>
  `${uid}_${gameId}_${newPrice.toFixed(2).replace(".", "_")}`;
// Estandariza el objeto juego para guardar siempre titulo y tituloLower.
const buildNormalizedGameData = (juego) => ({
  ...juego,
  titulo: juego.titulo || "Sin título",
  tituloLower: normalizeTitleForSearch(juego.titulo),
});
// Campos que determinan si hay cambio real del juego.
const hasCoreGameChanges = (existingGame, incomingGame) =>
  existingGame.precio !== incomingGame.precio ||
  existingGame.descuento !== incomingGame.descuento ||
  existingGame.imagen !== incomingGame.imagen;

// Comprueba si el juego está en favoritos.
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

const notifyPriceDrop = async ({
  gameId,
  gameTitle,
  gameImage,
  oldPrice,
  newPrice,
  discount,
}) => {
  const usersSnapshot = await db.collection("users").get();
  let notified = 0;
  let skippedDuplicate = 0;
  let skippedNoFavorite = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    if (!userHasGameInFavorites(userData, gameId, gameTitle)) {
      skippedNoFavorite += 1;
      continue;
    }

    const notificationId = buildNotificationId(userDoc.id, gameId, newPrice);
    const notificationRef = db.collection("notifications").doc(notificationId);
    const existingNotification = await notificationRef.get();

    if (existingNotification.exists) {
      skippedDuplicate += 1;
      continue;
    }

    const bodyText = `${gameTitle} bajó de ${oldPrice.toFixed(2)} EUR a ${newPrice.toFixed(2)} EUR`;

    await notificationRef.set({
      uid: userDoc.id,
      gameId,
      gameTitle,
      gameImage: gameImage || "",
      oldPrice,
      newPrice,
      discount: discount || "",
      type: "price_drop",
      leida: false,
      createdAt: new Date(),
    });

    const fcmTokens = Array.isArray(userData?.fcmTokens) ? userData.fcmTokens : [];
    if (!fcmTokens.length) continue;

    try {
      // Solo payload "notification": evita que Android muestre título + datos duplicados.
      await messaging.sendEachForMulticast({
        tokens: fcmTokens,
        notification: {
          title: "Bajada de precio",
          body: bodyText,
          imageUrl: gameImage || undefined,
        },
      });
    } catch (sendError) {
      console.error(`Error enviando FCM a ${userDoc.id}:`, sendError);
    }
    notified += 1;
  }

  console.log(
    `[Alerta] ${gameTitle}: enviadas=${notified}, duplicadas=${skippedDuplicate}, sin favorito=${skippedNoFavorite}`,
  );
};

const normalizeStoredTitleIfNeeded = async (ref, existingGame, incomingGame) => {
  const expectedTitleLower = normalizeTitleForSearch(incomingGame.titulo);
  if (existingGame.tituloLower === expectedTitleLower) return null;

  await ref.update({
    titulo: incomingGame.titulo || "Sin título",
    tituloLower: expectedTitleLower,
  });
  return "normalizado_tituloLower";
};

const processExistingGame = async (ref, id, existingGame, incomingGame) => {
  // Si no cambió precio/descuento/imagen, solo normaliza tituloLower si falta.
  if (!hasCoreGameChanges(existingGame, incomingGame)) {
    const normalizeStatus = await normalizeStoredTitleIfNeeded(ref, existingGame, incomingGame);
    return normalizeStatus || "sin cambios";
  }

  const precioAnterior = parsePrice(existingGame.precio);
  const precioActual = parsePrice(incomingGame.precio);
  const hasRealPriceDrop =
    precioAnterior !== null && precioActual !== null && precioActual < precioAnterior;

  await ref.update({
    titulo: incomingGame.titulo || "Sin título",
    tituloLower: normalizeTitleForSearch(incomingGame.titulo),
    precio: incomingGame.precio,
    precioAnterior: existingGame.precio,
    descuento: incomingGame.descuento,
    imagen: incomingGame.imagen,
  });

  // La alerta la envía priceDropListener al detectar el cambio en Firestore.
  return hasRealPriceDrop ? "bajada_detectada" : "actualizado";
};

const processGame = async (juego) => {
  // Encapsula flujo crear/actualizar por juego y devuelve estado para métricas.
  const id = normalizeGameId(juego.titulo);
  if (!id) {
    return { titulo: juego.titulo || "Sin título", status: "error: id inválido" };
  }

  const ref = db.collection("games").doc(id);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    await ref.set(buildNormalizedGameData(juego));
    return { titulo: juego.titulo, status: "creado" };
  }

  const status = await processExistingGame(ref, id, snapshot.data(), juego);
  return { titulo: juego.titulo, status };
};

const getAllUsers = async (req, res) => {
  const querySnapshot = await db.collection("users").get();
  const users = querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  console.log(users);
  res.send();
};
const saveAllGames = async (req, res) => {
  try {
    // Lee snapshot scrapeado y sincroniza cada juego en Firestore.
    const datosJSON = await fs.readFile(rutaJuegos, "utf8");
    const juegos = JSON.parse(datosJSON);
    console.log("Juegos leídos desde archivo:", juegos.length);

    if (!Array.isArray(juegos) || juegos.length === 0) {
      console.log("No hay juegos para guardar");
      if (res) return res.status(400).json({ error: "No hay juegos para guardar" });
      return;
    }

    const resultados = [];
    for (const juego of juegos) {
      resultados.push(await processGame(juego));
    }

    console.log(`   - Creados: ${resultados.filter(r => r.status === "creado").length}`);
    console.log(`   - Actualizados: ${resultados.filter(r => r.status === "actualizado").length}`);
    console.log(`   - Bajadas de precio: ${resultados.filter(r => r.status === "bajada_detectada").length}`);
    console.log(`   - Sin cambios: ${resultados.filter(r => r.status === "sin cambios").length}`);
    
    if (res) {
      res.status(200).json({ resultados });
    }
  } catch (error) {
    console.error("Error guardando juegos:", error);
    if (res) res.status(500).json({ error: "Error al guardar juegos" });
  }
};

export { getAllUsers, saveAllGames, notifyPriceDrop, parsePrice };
