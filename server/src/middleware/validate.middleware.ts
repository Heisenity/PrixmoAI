import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodIssue, ZodType } from 'zod';

const humanizeField = (path: string) =>
  path
    .replace(/([A-Z])/g, ' $1')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const formatValidationIssue = (issue: ZodIssue) => {
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

export const validate = (schema: ZodType) => 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const target =
        req.method === 'GET' || req.method === 'HEAD' ? req.query : req.body;

      await schema.parseAsync(target);
      
      next();
    } catch (error) {
      // 2. Catch Zod errors and format them
      if (error instanceof ZodError) {
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
