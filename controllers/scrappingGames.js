import puppeteer from "puppeteer";
import Game from "./models/Game.js"; // importa el modelo

const urlBusqueda =
  "https://www.nintendo.com/es-es/Buscar/Buscar-299117.html?f=147394-5-10-72-6955-119600";

async function extraerJuegos() {
  const navegador = await puppeteer.launch({ headless: false });
  const pagina = await navegador.newPage();
  await pagina.goto(urlBusqueda);

  const juegosUnicos = new Set();
  let numPagina = 1;

  while (true) {
    const juegos = await pagina.evaluate(() => {
      //Extraemos imagen, titulo, precio y descuento del HTML de la web
      return Array.from(document.querySelectorAll("li.searchresult_row")).map(
        (fila) => {
          const imagen = fila.querySelector("img")?.src || "";
          const titulo =
            fila.querySelector(".page-title-text, h3, h2")?.innerText?.trim() ||
            "";
          const precio =
            fila.querySelector(".original-price, .price")?.innerText?.trim() ||
            "";
          const descuento =
            fila.querySelector(".discount, .sale-price")?.innerText?.trim() ||
            "";
          return { titulo, imagen, precio, descuento };
        }
      );
    });

    console.log(`Página ${numPagina}: ${juegos.length} juegos`);

    // Añadimos cada juego al Set, evitando duplicados
    for (const juego of juegos) {
      const clave = JSON.stringify(juego);
      if (!juegosUnicos.has(clave)) juegosUnicos.add(clave);
    }

    numPagina++;

    // Botón "Siguiente"
    const haySiguiente = await pagina.evaluate(() => {
      const siguiente = Array.from(document.querySelectorAll("button, a")).find(
        (el) => el.textContent?.trim() === "Siguiente"
      );
      if (
        !siguiente ||
        siguiente.disabled ||
        siguiente.getAttribute("aria-disabled") === "true" ||
        siguiente.className?.toLowerCase().includes("disabled")
      )
        return false;
      siguiente.click();
      return true;
    });

    if (!haySiguiente) break;
    await new Promise((r) => setTimeout(r, 1500));
  }

  await navegador.close();

  //Los datos extraídos se convierten en JSON y se guardan
  const resultado = [...juegosUnicos].map((j) => {
    const juegoObj = JSON.parse(j);
    return new Game(juegoObj);
  });

  console.log("\nTotal juegos únicos:", resultado.length);

  try {
    const fs = await import("node:fs");
    const ruta = "./juegos.json";
    await fs.promises.writeFile(
      ruta,
      JSON.stringify(resultado, null, 2),
      "utf8"
    );
    console.log(`Guardado ${resultado.length} juegos en ${ruta}`);
  } catch (err) {
    console.error("Error guardando JSON:", err);
  }
}

export { extraerJuegos };
