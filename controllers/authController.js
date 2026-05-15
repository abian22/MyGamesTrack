import { auth, db } from "../firebase.js";
import User from "../models/User.js";

const USERS_COLLECTION = "users";

export const signUp = async (req, res) => {
  const { email, password, name } = req.body;

  try {
    // Crea usuario en Firebase Auth.
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
    });

    // Perfil base en Firestore.
    const newUser = new User({
      uid: userRecord.uid,
      name,
      email,
    });

    await db.collection(USERS_COLLECTION).doc(newUser.uid).set({ ...newUser });

    // Token de sesión para el cliente.
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
    const { idToken } = req.body;
    const decodedToken = await auth.verifyIdToken(idToken);

    // Si viene de Auth pero no tiene perfil, se inicializa
    const userDoc = await db.collection(USERS_COLLECTION).doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      await db.collection(USERS_COLLECTION).doc(decodedToken.uid).set({
        email: decodedToken.email,
        rol: "user",
        favGames: [],
        createdAt: new Date(),
      });
    }

    res.status(200).json({ uid: decodedToken.uid, email: decodedToken.email });
  } catch (error) {
    console.error("Login error:", error);
    res.status(401).send("Invalid token");
  }
};
