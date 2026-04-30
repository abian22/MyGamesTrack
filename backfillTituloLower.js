import { db } from "./firebase.js";

const BATCH_LIMIT = 500;

const normalizeTitleForSearch = (title) => (title || "Sin título").toLowerCase().trim();

async function backfillTituloLower() {
  console.log("Iniciando backfill de tituloLower...");

  const snapshot = await db.collection("games").get();
  console.log(`Documentos encontrados en games: ${snapshot.size}`);

  let batch = db.batch();
  let pendingInBatch = 0;
  let scanned = 0;
  let updated = 0;

  for (const doc of snapshot.docs) {
    scanned += 1;
    const data = doc.data();
    const expectedTitulo = data.titulo || "Sin título";
    const expectedTituloLower = normalizeTitleForSearch(expectedTitulo);

    if (data.tituloLower !== expectedTituloLower || data.titulo !== expectedTitulo) {
      batch.update(doc.ref, {
        titulo: expectedTitulo,
        tituloLower: expectedTituloLower,
      });
      pendingInBatch += 1;
      updated += 1;
    }

    if (pendingInBatch === BATCH_LIMIT) {
      await batch.commit();
      console.log(`Batch aplicado: ${updated} actualizados hasta ahora...`);
      batch = db.batch();
      pendingInBatch = 0;
    }
  }

  if (pendingInBatch > 0) {
    await batch.commit();
  }

  console.log("Backfill completado.");
  console.log(`Escaneados: ${scanned}`);
  console.log(`Actualizados: ${updated}`);
}

try {
  await backfillTituloLower();
} catch (error) {
  console.error("Error en backfillTituloLower:", error);
  process.exitCode = 1;
}

process.exit();
