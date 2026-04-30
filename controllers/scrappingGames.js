import puppeteer from "puppeteer";
import Game from "../models/Game.js";

const urlBusqueda =
  "https://www.nintendo.com/es-es/Buscar/Buscar-299117.html?f=147394-5-82";

async function extraerJuegos() {
  const navegador = await puppeteer.launch({ headless: true });
  const pagina = await navegador.newPage();
  await pagina.goto(urlBusqueda, { waitUntil: "networkidle2" });

  const juegosUnicos = new Set();
  let numPagina = 1;

  while (true) {
    await pagina.waitForSelector("li.searchresult_row", { timeout: 8000 }).catch(() => {});

    const juegos = await pagina.evaluate(() => {
      return Array.from(document.querySelectorAll("li.searchresult_row")).map(
        (fila) => {
          const imagen = fila.querySelector("img")?.src || "";
          const titulo =
            fila.querySelector(".page-title-text, h3, h2")?.innerText?.trim() || "";
          const precio =
            fila.querySelector(".original-price, .price")?.innerText?.trim() || "";
          const descuento =
            fila.querySelector(".discount, .sale-price")?.innerText?.trim() || "";
          return { titulo, imagen, precio, descuento };
        },
      );
    });

    console.log(`Página ${numPagina}: ${juegos.length} juegos | Total: ${juegosUnicos.size}`);

    for (const juego of juegos) {
      const clave = JSON.stringify(juego);
      if (!juegosUnicos.has(clave)) juegosUnicos.add(clave);
    }

    numPagina++;

    await pagina.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((r) => setTimeout(r, 1000));

    const haySiguiente = await pagina.evaluate(() => {
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

    console.log(`Botón siguiente: ${haySiguiente}`);

    if (haySiguiente !== "ok") break;
    await new Promise((r) => setTimeout(r, 2500));
  }

  await navegador.close();

  const resultado = [...juegosUnicos].map((j) => new Game(JSON.parse(j)));
  console.log("\nTotal juegos únicos:", resultado.length);

  try {
    const fs = await import("node:fs");
    await fs.promises.writeFile("./juegos.json", JSON.stringify(resultado, null, 2), "utf8");
    console.log(`Guardado ${resultado.length} juegos en juegos.json`);
  } catch (err) {
    console.error("Error guardando JSON:", err);
  }
}

export { extraerJuegos };