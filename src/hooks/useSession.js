import { useState, useCallback } from 'react';
import db from '../services/db.js';

/**
 * Session CRUD hook — manages study sessions.
 *
 * Constraint: only one session can be 'active' at a time.
 * Creating a new session automatically deactivates any currently active one.
 *
 * 3-month rule: `isStale(subject)` queries the [subject+updatedAt] compound index
 * to check if no session for that subject exists in the last 90 days.
 *
 * @returns {{ loading: boolean, error: string|null, create: Function,
 *   getActive: Function, updateStatus: Function, complete: Function,
 *   abandon: Function, getAll: Function, getById: Function, isStale: Function }}
 */
export default function useSession() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Create a new session. Deactivates any existing active session first.
   *
   * @param {string} subject - Study subject (e.g. PDF filename)
   * @param {object} [metadata={}] - Extra fields to store
   * @returns {Promise<number>} New session ID
   */
  const create = useCallback(async (subject, metadata = {}) => {
    setLoading(true);
    setError(null);
    try {
      // Ensure only one active session
      const active = await db.sessions
        .where('status')
        .equals('active')
        .toArray();

      await Promise.all(
        active.map((s) =>
          db.sessions.update(s.id, { status: 'abandoned', updatedAt: new Date() }),
        ),
      );

      const id = await db.sessions.add({
        subject,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...metadata,
      });

      setLoading(false);
      return id;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, []);

  /** Get the currently active session, if any. */
  const getActive = useCallback(async () => {
    return db.sessions.where('status').equals('active').first();
  }, []);

  /** Update session status. Updates `updatedAt` timestamp automatically. */
  const updateStatus = useCallback(async (id, status) => {
    await db.sessions.update(id, { status, updatedAt: new Date() });
  }, []);

  /** Mark a session as completed. */
  const complete = useCallback(
    async (id) => updateStatus(id, 'completed'),
    [updateStatus],
  );

  /** Mark a session as abandoned. */
  const abandon = useCallback(
    async (id) => updateStatus(id, 'abandoned'),
    [updateStatus],
  );

  /** List all sessions, newest first. */
  const getAll = useCallback(async () => {
    return db.sessions.orderBy('updatedAt').reverse().toArray();
  }, []);

  /** Get a single session by ID. */
  const getById = useCallback(async (id) => {
    return db.sessions.get(id);
  }, []);

  /**
   * Check if a subject is stale — no session in the last 90 days.
   * Uses the [subject+updatedAt] compound index.
   *
   * @param {string} subject
   * @returns {Promise<boolean>}
   */
  const isStale = useCallback(async (subject) => {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const recentCount = await db.sessions
      .where('[subject+updatedAt]')
      .between(
        [subject, ninetyDaysAgo],
        [subject, new Date()],
        true,
        true,
      )
      .count();

    return recentCount === 0;
  }, []);

  return {
    loading,
    error,
    create,
    getActive,
    updateStatus,
    complete,
    abandon,
    getAll,
    getById,
    isStale,
  };
}
