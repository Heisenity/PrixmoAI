import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodType } from 'zod';

export const validate = (schema: ZodType) => 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Validate the body against the schema
      // .parse() will throw an error if validation fails
      await schema.parseAsync(req.body);
      
      next();
    } catch (error) {
      // 2. Catch Zod errors and format them
      if (error instanceof ZodError) {
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
