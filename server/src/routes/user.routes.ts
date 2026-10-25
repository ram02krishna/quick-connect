import { Router } from "express";
import { z } from "zod";
import * as userController from "../controllers/user.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { cloudinaryUrl } from "../utils/validators.js";

const router = Router();

// Zod schema for profile updates
const updateMeSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").max(50, "Name must be 50 characters or less").optional(),
  bio: z.string().trim().max(120, "Bio must be 120 characters or less").nullable().optional(),
  avatarUrl: cloudinaryUrl.nullable().optional().or(z.literal("")),
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be 30 characters or less")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
    .optional(),
});

// All user routes require a logged-in user
router.use(authenticate);

router.get("/me", userController.getMe);
router.patch("/me", validate(updateMeSchema), userController.updateMe);
router.get("/search", userController.searchUsers);
export default router;
