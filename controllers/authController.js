import { auth, db } from "../firebase.js";

export const signUp = async (req, res) => {
  const { email, password, name } = req.body;

  try {
    // Crear usuario en Firebase
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name
    });

    // Crear documento en Firestore
    await db.collection("users").doc(userRecord.uid).set({
      name,
      email,
      rol: "user",      
      favGames: [],      
      createdAt: new Date()
    });

    //Crear custom token 
    const customToken = await auth.createCustomToken(userRecord.uid);
    res.status(201).json({ token: customToken });
  } catch (error) {
    console.error("SignUp error:", error);
    res.status(500).send("Cannot create user");
  }
};

// Login en Firebase
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