import puppeteer from "puppeteer";
import Game from "../models/Game.js";

// recorre todas las páginas hasta que no haya "Siguiente".
const urlBusqueda =
  "https://www.nintendo.com/es-es/Buscar/Buscar-299117.html?f=147394-5-82";
const RESULTS_SELECTOR = "li.searchresult_row";
const NEXT_WAIT_MS = 2500;
const SCROLL_WAIT_MS = 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

//Lee la página actual.
const readCurrentPageGames = async (pagina) =>
  pagina.evaluate(() => {
    return Array.from(document.querySelectorAll("li.searchresult_row")).map((fila) => {
      const imagen = fila.querySelector("img")?.src || "";
      const titulo = fila.querySelector(".page-title-text, h3, h2")?.innerText?.trim() || "";
      const precio = fila.querySelector(".original-price, .price")?.innerText?.trim() || "";
      const descuento = fila.querySelector(".discount, .sale-price")?.innerText?.trim() || "";
      return { titulo, imagen, precio, descuento };
    });
  });

//Busca el botón/enlace "Siguiente"; si no existe o está deshabilitado, termina el bucle.
const goToNextPage = async (pagina) =>
  pagina.evaluate(() => {
    const siguiente = Array.from(document.querySelectorAll("button, a")).find(
      (el) => el.textContent?.trim() === "Siguiente",
    );
    if (!siguiente) return "no_boton";
    if (
      siguiente.disabled ||
      siguiente.getAttribute("aria-disabled") === "true" ||
      siguiente.className?.toLowerCase().includes("disabled")
    ) return "disabled";
    siguiente.click();
    return "ok";
  });

async function extraerJuegos() {
  const navegador = await puppeteer.launch({ headless: true });
  const pagina = await navegador.newPage();
  await pagina.goto(urlBusqueda, { waitUntil: "networkidle2" });

  // Elimina duplicados entre páginas.
  const juegosUnicos = new Set();
  let numPagina = 1;

  while (true) {
    await pagina.waitForSelector(RESULTS_SELECTOR, { timeout: 8000 }).catch(() => {});

    const juegos = await readCurrentPageGames(pagina);

    console.log(`Página ${numPagina}: ${juegos.length} juegos | Total: ${juegosUnicos.size}`);

    if (juegos.length === 0 && numPagina === 1) {
      console.error(
        `[SCRAPER] El selector raíz "${RESULTS_SELECTOR}" no devolvió resultados en la página 1. Posible cambio en el HTML de Nintendo.`,
      );
    }

    const sinTitulo = juegos.filter((j) => !j.titulo || j.titulo === "Sin título").length;
    const sinPrecio = juegos.filter((j) => !j.precio).length;
    if (juegos.length > 0 && sinTitulo / juegos.length > 0.2) {
      console.error(
        `[SCRAPER] ${sinTitulo}/${juegos.length} juegos sin título en página ${numPagina}. Revisar selector ".page-title-text, h3, h2".`,
      );
    }
    if (juegos.length > 0 && sinPrecio / juegos.length > 0.2) {
      console.error(
        `[SCRAPER] ${sinPrecio}/${juegos.length} juegos sin precio en página ${numPagina}. Revisar selector ".original-price, .price".`,
      );
    }

    for (const juego of juegos) {
      const clave = JSON.stringify(juego);
      if (!juegosUnicos.has(clave)) juegosUnicos.add(clave);
    }

    numPagina++;

    // Scroll para que carguen elementos antes de pasar de página.
    await pagina.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(SCROLL_WAIT_MS);

    const haySiguiente = await goToNextPage(pagina);

    if (haySiguiente === "no_boton" && numPagina === 2) {
      console.error(
        `[SCRAPER] No se encontró el botón "Siguiente" tras la primera página. Posible cambio en la paginación de Nintendo.`,
      );
    } else {
      console.log(`Botón siguiente: ${haySiguiente}`);
    }

    if (haySiguiente !== "ok") break;
    // Espera a que la siguiente página pinte resultados antes del siguiente ciclo.
    await sleep(NEXT_WAIT_MS);
  }

  await navegador.close();

  // Instancia Game para que cada ítem lleve tituloLower y metadatos coherentes con el modelo.
  const resultado = [...juegosUnicos].map((j) => new Game(JSON.parse(j)));
  console.log("\nTotal juegos únicos:", resultado.length);

  try {
    const fs = await import("node:fs");
    // Salida que consume saveAllGames (Firebase) en el flujo de actualización diaria.
    await fs.promises.writeFile("./juegos.json", JSON.stringify(resultado, null, 2), "utf8");
    console.log(`Guardado ${resultado.length} juegos en juegos.json`);
  } catch (err) {
    console.error("Error guardando JSON:", err);
  }
}

export { extraerJuegos };