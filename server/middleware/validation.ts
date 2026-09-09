import { Request, Response, NextFunction } from 'express';

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'email';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  enum?: any[];
}

export function validateBody(rules: ValidationRule[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: string[] = [];
    const body = req.body || {};

    for (const rule of rules) {
      const val = body[rule.field];

      if (rule.required && (val === undefined || val === null || val === '')) {
        errors.push(`Field '${rule.field}' is required.`);
        continue;
      }

      if (val !== undefined && val !== null && val !== '') {
        if (rule.type === 'string' && typeof val !== 'string') {
          errors.push(`Field '${rule.field}' must be a string.`);
        } else if (rule.type === 'number' && typeof val !== 'number') {
          errors.push(`Field '${rule.field}' must be a number.`);
        } else if (rule.type === 'boolean' && typeof val !== 'boolean') {
          errors.push(`Field '${rule.field}' must be a boolean.`);
        } else if (rule.type === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(String(val))) {
            errors.push(`Field '${rule.field}' must be a valid email address.`);
          }
        }

        if (rule.minLength && typeof val === 'string' && val.length < rule.minLength) {
          errors.push(`Field '${rule.field}' must be at least ${rule.minLength} characters.`);
        }
        if (rule.maxLength && typeof val === 'string' && val.length > rule.maxLength) {
          errors.push(`Field '${rule.field}' cannot exceed ${rule.maxLength} characters.`);
        }
        if (rule.enum && !rule.enum.includes(val)) {
          errors.push(`Field '${rule.field}' must be one of: ${rule.enum.join(', ')}.`);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters.',
          details: errors,
        },
      });
    }

    next();
  };
}
