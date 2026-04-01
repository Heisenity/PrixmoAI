"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const zod_1 = require("zod");
const humanizeField = (path) => path
    .replace(/([A-Z])/g, ' $1')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const formatValidationIssue = (issue) => {
    const field = issue.path.join('.');
    const readableField = field ? humanizeField(field) : 'this field';
    if (issue.message === 'Required') {
        return `Please fill in ${readableField}.`;
    }
    if (issue.code === 'too_small' && issue.message.includes('expected string')) {
        return `Please fill in ${readableField}.`;
    }
    if (issue.code === 'invalid_type') {
        return `Please fill in ${readableField}.`;
    }
    return issue.message;
};
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
            const errors = error.issues.map((err) => ({
                field: err.path.join('.'),
                message: formatValidationIssue(err),
            }));
            return res.status(400).json({
                status: 'fail',
                message: errors[0]?.message || 'Please review the form and try again.',
                errors,
            });
        }
        // 3. Fallback for unexpected errors
        return res.status(500).json({ message: 'Internal server error' });
    }
};
exports.validate = validate;
