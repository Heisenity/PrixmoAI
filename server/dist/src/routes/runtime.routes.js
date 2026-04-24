"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const runtime_controller_1 = require("../controllers/runtime.controller");
const router = (0, express_1.Router)();
router.get('/jobs/:id', auth_middleware_1.authMiddleware, runtime_controller_1.getJobRuntime);
router.post('/jobs/:id/cancel', auth_middleware_1.authMiddleware, runtime_controller_1.cancelJobRuntime);
exports.default = router;
