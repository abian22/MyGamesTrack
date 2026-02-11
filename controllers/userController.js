import { db } from "../firebase.js";

// "fs" permite leer/escribir archivos del sistema. "promises" usa async/await en lugar de callbacks
import { promises as fs } from "fs";

const rutaJuegos = new URL("../juegos.json", import.meta.url);

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
      const id = juego.titulo
        ? juego.titulo.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "")
        : null;

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
          resultados.push({ titulo: juego.titulo, status: "sin cambios" });
        } else {
          // ♻️ ACTUALIZAR SOLO CAMPOS ESPECÍFICOS
          // Usa update() en lugar de set() para no perder otros datos del documento
          // Si alguien agregó datos manualmente en Firebase, se conservan
          await ref.update({
            precio: juego.precio,
            descuento: juego.descuento,
            imagen: juego.imagen
          });
          resultados.push({ titulo: juego.titulo, status: "actualizado" });
        }
      } else {
        // Si el juego no existe aún, lo creamos en Firebase
        await ref.set(juego);
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

saveAllGames(); 

export { getAllUsers, saveAllGames };
