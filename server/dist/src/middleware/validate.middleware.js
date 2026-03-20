"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const zod_1 = require("zod");
const validate = (schema) => async (req, res, next) => {
    try {
        // 1. Validate the body against the schema
        // .parse() will throw an error if validation fails
        await schema.parseAsync(req.body);
        next();
    }
    catch (error) {
        // 2. Catch Zod errors and format them
        if (error instanceof zod_1.ZodError) {
            return res.status(400).json({
                status: 'fail',
                errors: error.issues.map((err) => ({
                    field: err.path.join('.'),
                    message: err.message,
                })),
            });
        }
        // 3. Fallback for unexpected errors
        return res.status(500).json({ message: 'Internal server error' });
    }
};
exports.validate = validate;
