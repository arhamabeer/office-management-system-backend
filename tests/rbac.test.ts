import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { authorize, type RbacRule } from '../src/middleware/rbac';
import type { AuthUser } from '../src/middleware/auth';

function evaluate(rule: RbacRule, user?: AuthUser): Promise<unknown> {
  return new Promise((resolve) => {
    const req = { user } as unknown as Request;
    authorize(rule)(req, {} as Response, (err?: unknown) => resolve(err));
  });
}

const user = (accountType: 'Owner' | 'Employee', orgRole: 'Admin' | 'Manager' | 'Lead' | 'Member'): AuthUser => ({
  id: 'x',
  email: 'x@y.io',
  accountType,
  orgRole,
});

describe('RBAC authorize() — two-dimension gating', () => {
  it('rejects unauthenticated requests', async () => {
    expect(await evaluate({ minOrgRole: 'Member' }, undefined)).toBeTruthy();
  });

  it('Owner (any org role) passes ownerOnly', async () => {
    expect(await evaluate({ ownerOnly: true }, user('Owner', 'Member'))).toBeUndefined();
  });

  it('Employee+Admin fails ownerOnly', async () => {
    expect(await evaluate({ ownerOnly: true }, user('Employee', 'Admin'))).toBeTruthy();
  });

  it('Employee+Admin passes minOrgRole Admin', async () => {
    expect(await evaluate({ minOrgRole: 'Admin' }, user('Employee', 'Admin'))).toBeUndefined();
  });

  it('Employee+Member fails minOrgRole Admin', async () => {
    expect(await evaluate({ minOrgRole: 'Admin' }, user('Employee', 'Member'))).toBeTruthy();
  });

  it('Owner outranks org role (Owner+Member passes minOrgRole Admin)', async () => {
    expect(await evaluate({ minOrgRole: 'Admin' }, user('Owner', 'Member'))).toBeUndefined();
  });

  it('Employee+Manager passes minOrgRole Lead', async () => {
    expect(await evaluate({ minOrgRole: 'Lead' }, user('Employee', 'Manager'))).toBeUndefined();
  });
});
