class Game {
  constructor({ titulo, imagen, precio, descuento, precioAnterior = "" }) {
    this.titulo = titulo || "Sin título";
    this.tituloLower = this.titulo.toLowerCase();
    this.imagen = imagen || "";
    this.precioAnterior = precioAnterior;
    this.precio = precio || "";
    this.descuento = descuento || "";
    this.createdAt = new Date();
  }

  getCurrentPrice() {
    return this.precio;
  }
}

export default Game;