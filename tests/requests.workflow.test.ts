import { describe, it, expect } from 'vitest';
import {
  applyRequestAction,
  RequestWorkflowError,
  type RequestActorCaps,
} from '../src/common/requestWorkflow';

/** Build a capability set, defaulting every power to false. */
const caps = (o: Partial<RequestActorCaps> = {}): RequestActorCaps => ({
  canManage: false,
  canActOps: false,
  canActAdmin: false,
  ...o,
});

describe('request workflow state machine (applyRequestAction)', () => {
  describe('manager stage (Submitted)', () => {
    const submitted = { status: 'Submitted' as const, routedTo: [] };

    it('resolves', () => {
      expect(applyRequestAction(submitted, 'resolve', caps({ canManage: true }))).toEqual({
        status: 'Resolved',
        routedTo: [],
        stage: 'manager',
      });
    });

    it('rejects', () => {
      expect(applyRequestAction(submitted, 'reject', caps({ canManage: true }))).toEqual({
        status: 'Rejected',
        routedTo: [],
        stage: 'manager',
      });
    });

    it('forwards only to operations (never straight to admin or both)', () => {
      expect(applyRequestAction(submitted, 'forward_operations', caps({ canManage: true })).routedTo).toEqual(['Operations']);
      expect(() => applyRequestAction(submitted, 'forward_admin', caps({ canManage: true }))).toThrow();
      expect(() => applyRequestAction(submitted, 'forward_both', caps({ canManage: true }))).toThrow();
    });

    it('blocks a non-manager (forbidden)', () => {
      expect(() => applyRequestAction(submitted, 'resolve', caps())).toThrow(/manager/i);
      try {
        applyRequestAction(submitted, 'resolve', caps());
      } catch (e) {
        expect(e).toBeInstanceOf(RequestWorkflowError);
        expect((e as RequestWorkflowError).kind).toBe('forbidden');
      }
    });
  });

  describe('handler stage (Forwarded)', () => {
    it('operations resolves / rejects from its queue', () => {
      const r = applyRequestAction({ status: 'Forwarded', routedTo: ['Operations'] }, 'resolve', caps({ canActOps: true }));
      expect(r.status).toBe('Resolved');
      expect(r.stage).toBe('operations');
      expect(applyRequestAction({ status: 'Forwarded', routedTo: ['Operations'] }, 'reject', caps({ canActOps: true })).status).toBe('Rejected');
    });

    it('admin resolves from its queue', () => {
      const r = applyRequestAction({ status: 'Forwarded', routedTo: ['Admin'] }, 'resolve', caps({ canActAdmin: true }));
      expect(r.status).toBe('Resolved');
      expect(r.stage).toBe('admin');
    });

    it('operations may re-forward to admin', () => {
      expect(applyRequestAction({ status: 'Forwarded', routedTo: ['Operations'] }, 'forward_admin', caps({ canActOps: true }))).toEqual({
        status: 'Forwarded',
        routedTo: ['Admin'],
        stage: 'operations',
      });
    });

    it('admin may NOT re-forward to admin', () => {
      expect(() => applyRequestAction({ status: 'Forwarded', routedTo: ['Admin'] }, 'forward_admin', caps({ canActAdmin: true }))).toThrow(/Operations/i);
    });

    it('blocks someone not in the current queue', () => {
      expect(() => applyRequestAction({ status: 'Forwarded', routedTo: ['Admin'] }, 'resolve', caps({ canActOps: true }))).toThrow(/queue/i);
    });

    it('rejects manager-only forward actions at the handler stage', () => {
      expect(() => applyRequestAction({ status: 'Forwarded', routedTo: ['Operations'] }, 'forward_both', caps({ canActOps: true }))).toThrow();
    });
  });

  describe('terminal states', () => {
    it('cannot act on a closed request (conflict)', () => {
      for (const status of ['Resolved', 'Rejected'] as const) {
        expect(() =>
          applyRequestAction({ status, routedTo: [] }, 'resolve', caps({ canManage: true, canActAdmin: true, canActOps: true })),
        ).toThrow(/closed/i);
        try {
          applyRequestAction({ status, routedTo: [] }, 'resolve', caps({ canManage: true }));
        } catch (e) {
          expect((e as RequestWorkflowError).kind).toBe('conflict');
        }
      }
    });
  });
});
