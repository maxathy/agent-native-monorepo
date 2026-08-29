import { describe, it, expect } from 'vitest';
import { assertAxesSatisfy, AxisRequirementError, describeAxes, detectAxes } from './axes.js';
import type { Grader } from './types.js';

const grader = (name: string, requires?: Grader['requires']): Grader<never> => ({
  name,
  kind: 'code',
  ...(requires ? { requires } : {}),
  grade: async () => ({ value: 1, label: 'pass' }),
});

describe('detectAxes', () => {
  it('reads the stub model axis when no key is present', () => {
    expect(detectAxes({}).model).toBe('stub');
  });

  it('treats an empty key as absent', () => {
    // Turbo's strict env mode does not unset a variable it strips, it never
    // sets it; a shell that exports an empty one is the other half of the same
    // trap, and both must read as `stub` rather than `live`.
    expect(detectAxes({ GOOGLE_API_KEY: '' }).model).toBe('stub');
  });

  it('reads the live model axis when a key is present', () => {
    expect(detectAxes({ GOOGLE_API_KEY: 'k' }).model).toBe('live');
  });

  it('needs both stores before it calls the memory axis live', () => {
    expect(detectAxes({ DATABASE_URL: 'postgres://x' }).memory).toBe('unconfigured');
    expect(detectAxes({ NEO4J_URI: 'bolt://x' }).memory).toBe('unconfigured');
    expect(detectAxes({ DATABASE_URL: 'postgres://x', NEO4J_URI: 'bolt://x' }).memory).toBe('live');
  });

  it('describes both axes in one line', () => {
    expect(describeAxes({ model: 'live', memory: 'unconfigured' })).toBe(
      'model=live memory=unconfigured',
    );
  });
});

describe('assertAxesSatisfy', () => {
  const live = { model: 'live', memory: 'live' } as const;
  const unconfigured = { model: 'stub', memory: 'unconfigured' } as const;

  it('passes a grader with no requirements on any axis', () => {
    expect(() => assertAxesSatisfy([grader('plain')], unconfigured)).not.toThrow();
  });

  it('refuses rather than grading the no-op writers', () => {
    expect(() =>
      assertAxesSatisfy([grader('episodic_row_written', { memory: 'live' })], unconfigured),
    ).toThrow(AxisRequirementError);
  });

  it('reports every unmet requirement, not the first', () => {
    try {
      assertAxesSatisfy(
        [
          grader('episodic_row_written', { memory: 'live' }),
          grader('answer_is_grounded', { model: 'live' }),
        ],
        unconfigured,
      );
      expect.unreachable('should have refused');
    } catch (error) {
      expect(error).toBeInstanceOf(AxisRequirementError);
      expect((error as AxisRequirementError).problems).toHaveLength(2);
      expect((error as AxisRequirementError).message).toContain('episodic_row_written');
      expect((error as AxisRequirementError).message).toContain('answer_is_grounded');
    }
  });

  it('lets everything through once both axes are live', () => {
    expect(() =>
      assertAxesSatisfy([grader('a', { memory: 'live' }), grader('b', { model: 'live' })], live),
    ).not.toThrow();
  });
});
