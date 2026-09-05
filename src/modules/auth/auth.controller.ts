import type { Request, Response } from 'express';
import type { AuthedRequest } from '../../middleware/auth.js';
import * as authService from './auth.service.js';

export async function register(req: Request, res: Response): Promise<void> {
  const customer = await authService.registerCustomer(req.body);
  res.status(201).json({ message: 'Registration successful', customer });
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.loginCustomer(req.body);
  res.json({
    message: 'Login successful',
    token: result.token,
    tokenType: 'Bearer',
    customer: result.customer,
  });
}

export async function me(req: Request, res: Response): Promise<void> {
  const customer = await authService.getCustomerProfile((req as AuthedRequest).customer.id);
  res.json({ customer });
}