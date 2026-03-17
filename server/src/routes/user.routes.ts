import { Router } from 'express';
import { validate } from '../middleware/validate.middleware';
import { createUserSchema } from '../schemas/user.schema';

const router = Router();

router.post(
  '/register', 
  validate(createUserSchema), // Middleware runs first
  (req, res) => {
    // If we reach here, req.body is 100% valid
    res.status(201).json({ message: "User registered successfully" });
  }
);