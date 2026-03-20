"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validate_middleware_1 = require("../middleware/validate.middleware");
const user_schema_1 = require("../schemas/user.schema");
const router = (0, express_1.Router)();
router.post('/register', (0, validate_middleware_1.validate)(user_schema_1.createUserSchema), // Middleware runs first
(req, res) => {
    // If we reach here, req.body is 100% valid
    res.status(201).json({ message: "User registered successfully" });
});
