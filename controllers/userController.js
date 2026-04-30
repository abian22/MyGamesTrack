import { db, messaging } from "../firebase.js";

// "fs" permite leer/escribir archivos del sistema. "promises" usa async/await en lugar de callbacks
import { promises as fs } from "node:fs";

const rutaJuegos = new URL("../juegos.json", import.meta.url);

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
const normalizeTitleForSearch = (title) => (title || "Sin título").toLowerCase().trim();

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

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    if (!userHasGameInFavorites(userData, gameId, gameTitle)) continue;

    const notificationId = `${userDoc.id}_${gameId}_${newPrice.toFixed(2)}`;
    const notificationRef = db.collection("notifications").doc(notificationId);
    const existingNotification = await notificationRef.get();

    if (existingNotification.exists) {
      continue;
    }

    const notificationPayload = {
      uid: userDoc.id,
      gameId,
      gameTitle,
      gameImage: gameImage || "",
      oldPrice,
      newPrice,
      discount: discount || "",
      type: "price_drop",
      read: false,
      createdAt: new Date(),
    };

    await notificationRef.set(notificationPayload);

    const fcmTokens = Array.isArray(userData?.fcmTokens) ? userData.fcmTokens : [];
    if (!fcmTokens.length) continue;

    try {
      await messaging.sendEachForMulticast({
        tokens: fcmTokens,
        notification: {
          title: "Bajada de precio",
          body: `${gameTitle} bajó de ${oldPrice.toFixed(2)}€ a ${newPrice.toFixed(2)}€`,
          imageUrl: gameImage || undefined,
        },
        data: {
          type: "price_drop",
          gameId,
          gameTitle,
          gameImage: gameImage || "",
          oldPrice: oldPrice.toFixed(2),
          newPrice: newPrice.toFixed(2),
        },
      });
    } catch (sendError) {
      console.error(`Error enviando FCM a ${userDoc.id}:`, sendError);
    }
  }
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
    const datosJSON = await fs.readFile(rutaJuegos, "utf8");
    
    const juegos = JSON.parse(datosJSON);
    console.log("Juegos leídos desde archivo:", juegos.length);

    // 4️⃣ VALIDAR QUE HAYA JUEGOS
    if (!Array.isArray(juegos) || juegos.length === 0) {
      console.log("No hay juegos para guardar");
      if (res) return res.status(400).json({ error: "No hay juegos para guardar" });
      return;
    }

    const resultados = [];

    // 5️⃣ PROCESAR CADA JUEGO
    for (const juego of juegos) {
      // 🔑 GENERAR ID ÚNICO PARA FIREBASE
      // Firebase necesita un ID para cada documento. Usamos el título pero:
      // - Eliminamos espacios: "Mario Kart" → "Mario_Kart"
      // - Eliminamos caracteres especiales: "Zelda™" → "Zelda"
      // - Solo permite: letras, números, guiones y guiones bajos
      // Resultado: ID único, válido y fácil de identificar
      const id = normalizeGameId(juego.titulo);

      // Si el ID está vacío, saltamos este juego
      if (!id) {
        resultados.push({ titulo: juego.titulo || "Sin título", status: "error: id inválido" });
        continue;
      }

      // 📍 OBTENER REFERENCIA AL DOCUMENTO EN FIREBASE
      // db.collection("games").doc(id) apunta al juego con ese ID
      // Si existe, lo actualiza. Si no existe, lo crea.
      const ref = db.collection("games").doc(id);
      const snapshot = await ref.get();

      // 6️⃣ VERIFICAR SI EL JUEGO YA EXISTE
      if (snapshot.exists) {
        const datosExistentes = snapshot.data();
        
        // ✔️ COMPARAR SI LOS DATOS SON IGUALES
        // Si nada ha cambiado (precio, descuento, imagen), no guardamos
        if (
          datosExistentes.precio === juego.precio &&
          datosExistentes.descuento === juego.descuento &&
          datosExistentes.imagen === juego.imagen
        ) {
          const tituloLowerEsperado = normalizeTitleForSearch(juego.titulo);
          if (datosExistentes.tituloLower !== tituloLowerEsperado) {
            await ref.update({
              titulo: juego.titulo || "Sin título",
              tituloLower: tituloLowerEsperado,
            });
            resultados.push({ titulo: juego.titulo, status: "normalizado_tituloLower" });
            continue;
          }
          resultados.push({ titulo: juego.titulo, status: "sin cambios" });
        } else {
          const precioAnterior = parsePrice(datosExistentes.precio);
          const precioActual = parsePrice(juego.precio);
          const hayBajadaReal =
            precioAnterior !== null &&
            precioActual !== null &&
            precioActual < precioAnterior;

          // ♻️ ACTUALIZAR SOLO CAMPOS ESPECÍFICOS
          // Usa update() en lugar de set() para no perder otros datos del documento
          // Si alguien agregó datos manualmente en Firebase, se conservan
          await ref.update({
            titulo: juego.titulo || "Sin título",
            tituloLower: normalizeTitleForSearch(juego.titulo),
            precio: juego.precio,
            precioAnterior: datosExistentes.precio,
            descuento: juego.descuento,
            imagen: juego.imagen
          });

          if (hayBajadaReal) {
            await notifyPriceDrop({
              gameId: id,
              gameTitle: juego.titulo,
              gameImage: juego.imagen || "",
              oldPrice: precioAnterior,
              newPrice: precioActual,
              discount: juego.descuento,
            });
            resultados.push({ titulo: juego.titulo, status: "actualizado_y_notificado" });
            continue;
          }
          resultados.push({ titulo: juego.titulo, status: "actualizado" });
        }
      } else {
        // Si el juego no existe aún, lo creamos en Firebase
        await ref.set({
          ...juego,
          titulo: juego.titulo || "Sin título",
          tituloLower: normalizeTitleForSearch(juego.titulo),
        });
        resultados.push({ titulo: juego.titulo, status: "creado" });
      }
    }

   
    console.log(`   - Creados: ${resultados.filter(r => r.status === "creado").length}`);
    console.log(`   - Actualizados: ${resultados.filter(r => r.status === "actualizado").length}`);
    console.log(`   - Sin cambios: ${resultados.filter(r => r.status === "sin cambios").length}`);
    
    if (res) {
      res.status(200).json({ resultados });
    }
  } catch (error) {
    console.error("Error guardando juegos:", error);
    if (res) res.status(500).json({ error: "Error al guardar juegos" });
  }
};

export { getAllUsers, saveAllGames };
