import { Router } from "express";
import { checkAuth } from "../middlewares/auth.js";
import { getAllUsers, saveAllGames } from "../controllers/userController.js";
import { signUp, login } from "../controllers/authController.js";

const router = Router();

// Obtener todos los usuarios
router.get('/', checkAuth, getAllUsers);
router.post("/games/save", checkAuth, saveAllGames);
router.post("/signup", signUp);
router.post("/login", login);

export default router;
