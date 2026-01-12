import { auth, db } from "../firebase.js";

export const signUp = async (req, res) => {
  const { email, password, name } = req.body;

  try {
    // 1️⃣ Crear usuario en Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name
    });

    // 2️⃣ Crear documento en Firestore con campos adicionales
    await db.collection("users").doc(userRecord.uid).set({
      name,
      email,
      rol: "user",      
      favGames: [],      
      createdAt: new Date()
    });

    // 3️⃣ Crear custom token para frontend
    const customToken = await auth.createCustomToken(userRecord.uid);
    res.status(201).json({ token: customToken });
  } catch (error) {
    console.error("SignUp error:", error);
    res.status(500).send("Cannot create user");
  }
};

// El login en Firebase se hace en frontend, aquí solo validamos el token recibido
export const login = async (req, res) => {
  try {
    const { idToken } = req.body; // token recibido desde frontend
    const decodedToken = await auth.verifyIdToken(idToken);

    // Crear documento Firestore si no existe
    const userDoc = await db.collection("users").doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      await db.collection("users").doc(decodedToken.uid).set({
        email: decodedToken.email,
        rol: "user",
        favGames: [],
        createdAt: new Date()
      });
    }

    res.status(200).json({ uid: decodedToken.uid, email: decodedToken.email });
  } catch (error) {
    console.error("Login error:", error);
    res.status(401).send("Invalid token");
  }
};