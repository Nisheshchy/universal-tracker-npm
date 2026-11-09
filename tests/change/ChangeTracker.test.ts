import { describe, it, expect, beforeEach } from 'vitest';
import {
  ChangeTracker,
  ObjectComparator,
  SnapshotManager,
  ChangeHistory,
} from '../../src/index.js';

describe('Change Tracker Module', () => {
  describe('ObjectComparator', () => {
    const comparator = new ObjectComparator();

    it('should detect added, updated, and deleted properties in flat objects', () => {
      const before = { a: 1, b: 2 };
      const after = { b: 20, c: 3 };

      const diffs = comparator.compare(before, after);

      expect(diffs).toHaveLength(3);

      const added = diffs.find((d) => d.changeType === 'added');
      const updated = diffs.find((d) => d.changeType === 'updated');
      const deleted = diffs.find((d) => d.changeType === 'deleted');

      expect(added).toEqual({
        property: 'c',
        path: 'c',
        before: undefined,
        after: 3,
        changeType: 'added',
      });

      expect(updated).toEqual({
        property: 'b',
        path: 'b',
        before: 2,
        after: 20,
        changeType: 'updated',
      });

      expect(deleted).toEqual({
        property: 'a',
        path: 'a',
        before: 1,
        after: undefined,
        changeType: 'deleted',
      });
    });

    it('should detect nested property changes', () => {
      const before = {
        user: {
          profile: {
            name: 'Nishesh',
            theme: 'dark',
          },
        },
      };
      const after = {
        user: {
          profile: {
            name: 'Nishesh',
            theme: 'light',
          },
        },
      };

      const diffs = comparator.compare(before, after);
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        property: 'theme',
        path: 'user.profile.theme',
        before: 'dark',
        after: 'light',
        changeType: 'updated',
      });
    });

    it('should detect array modifications', () => {
      const before = { tags: ['node', 'ts'] };
      const after = { tags: ['node', 'typescript', 'vitest'] };

      const diffs = comparator.compare(before, after);
      expect(diffs).toHaveLength(2);

      const updated = diffs.find((d) => d.changeType === 'updated');
      const added = diffs.find((d) => d.changeType === 'added');

      expect(updated?.path).toBe('tags[1]');
      expect(updated?.before).toBe('ts');
      expect(updated?.after).toBe('typescript');

      expect(added?.path).toBe('tags[2]');
      expect(added?.after).toBe('vitest');
    });

    it('should respect ignored properties', () => {
      const before = { id: 1, name: 'Alice', updatedAt: 100 };
      const after = { id: 1, name: 'Bob', updatedAt: 200 };

      const diffs = comparator.compare(before, after, {
        ignoredProperties: ['updatedAt'],
      });

      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.property).toBe('name');
    });
  });

  describe('SnapshotManager', () => {
    let snapshots: SnapshotManager;

    beforeEach(() => {
      snapshots = new SnapshotManager(10);
    });

    it('should take deep-cloned snapshot and retrieve it', () => {
      const original = { counter: 1, nested: { value: 'test' } };
      snapshots.snapshot('my-entity', original);

      // Mutate original
      original.counter = 99;
      original.nested.value = 'mutated';

      const entry = snapshots.get('my-entity');
      expect(entry).toBeDefined();
      expect((entry?.data as typeof original).counter).toBe(1);
      expect((entry?.data as typeof original).nested.value).toBe('test');
    });

    it('should evict oldest when maxSnapshots reached', () => {
      const smallManager = new SnapshotManager(2);
      smallManager.snapshot('e1', { val: 1 });
      smallManager.snapshot('e2', { val: 2 });
      smallManager.snapshot('e3', { val: 3 });

      expect(smallManager.has('e1')).toBe(false);
      expect(smallManager.has('e2')).toBe(true);
      expect(smallManager.has('e3')).toBe(true);
    });
  });

  describe('ChangeHistory', () => {
    it('should record and query history', () => {
      const history = new ChangeHistory(5);
      history.add('1', 'user', [{ property: 'name', path: 'name', before: 'A', after: 'B', changeType: 'updated' }]);
      history.add('2', 'user', [{ property: 'role', path: 'role', before: 'user', after: 'admin', changeType: 'updated' }]);

      const entries = history.get('user');
      expect(entries).toHaveLength(2);
      expect(entries[0]?.diffs[0]?.property).toBe('role'); // newest first
    });
  });

  describe('ChangeTracker workflow', () => {
    it('should track changes across multiple updates', () => {
      const tracker = new ChangeTracker();

      // First call creates initial snapshot
      const initialDiffs = tracker.track('user', { name: 'Nishesh', role: 'developer' });
      expect(initialDiffs).toHaveLength(0);

      // Second call detects change
      const updateDiffs = tracker.track('user', { name: 'Nishesh', role: 'lead' });
      expect(updateDiffs).toHaveLength(1);
      expect(updateDiffs[0]?.property).toBe('role');
      expect(updateDiffs[0]?.before).toBe('developer');
      expect(updateDiffs[0]?.after).toBe('lead');

      // History should be populated
      const history = tracker.history('user');
      expect(history).toHaveLength(1);
      expect(history[0]?.diffs[0]?.property).toBe('role');
    });
  });
});

