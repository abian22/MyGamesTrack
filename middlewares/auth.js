import { auth } from "../firebase.js";

export const checkAuth = async (req, res, next) => {
  try {
    // Espera header: Authorization: Bearer <idToken>
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).send("No token provided");
    }

    // Valida firma/expiración del token en Firebase Auth.
    const decodedToken = await auth.verifyIdToken(token);

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || "",
      rol: decodedToken.role || "user",
    };
    next();
  } catch (error) {
    console.error(error);
    res.status(401).send("Unauthorized");
  }
};
