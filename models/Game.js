class Game {
  constructor({ titulo, imagen, precio, descuento }) {
    this.titulo = titulo || "Sin título";
    this.imagen = imagen || "";
    this.precio = precio || "";
    this.descuento = descuento || "";
    this.createdAt = new Date();
    this.isActive = true; 
  }
}

export default Game;
