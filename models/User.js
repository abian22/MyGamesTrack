class User {
  constructor({ uid, name, email, rol = "user", favGames = [] }) {
    this.uid = uid;           
    this.name = name;
    this.email = email;
    this.rol = rol;           
    this.favGames = favGames; 
    this.createdAt = new Date();
  }
}

export default User;
