import { useState, useCallback } from 'react';
import db from '../services/db.js';

/**
 * Section management hook.
 *
 * Sections belong to a session and have sequential `order` values.
 * Each section tracks its own status ('pending' | 'completed') and duration.
 *
 * @returns {{ loading: boolean, error: string|null, createSections: Function,
 *   getBySession: Function, getById: Function, updateStatus: Function,
 *   updateDuration: Function }}
 */
export default function useSections() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Create multiple sections for a session. Order is auto-assigned sequentially
   * starting after the highest existing order for that session.
   *
   * @param {number} sessionId
   * @param {{ title: string, content?: string }[]} entries
   * @returns {Promise<number[]>} Array of new section IDs
   */
  const createSections = useCallback(async (sessionId, entries) => {
    setLoading(true);
    setError(null);
    try {
      // Determine starting order
      const existing = await db.sections
        .where('sessionId')
        .equals(sessionId)
        .toArray();

      const maxOrder = existing.reduce(
        (max, s) => Math.max(max, s.order || 0),
        0,
      );

      const sections = entries.map((entry, i) => ({
        sessionId,
        title: entry.title,
        status: 'pending',
        order: maxOrder + i + 1,
        duration: 0,
      }));

      const ids = await db.sections.bulkAdd(sections, { allKeys: true });
      setLoading(false);
      return ids;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, []);

  /**
   * Get all sections for a session, sorted by order.
   *
   * @param {number} sessionId
   * @returns {Promise<Array>}
   */
  const getBySession = useCallback(async (sessionId) => {
    return db.sections
      .where('sessionId')
      .equals(sessionId)
      .sortBy('order');
  }, []);

  /** Get a single section by ID. */
  const getById = useCallback(async (id) => {
    return db.sections.get(id);
  }, []);

  /**
   * Update section status.
   *
   * @param {number} id
   * @param {'pending'|'completed'} status
   */
  const updateStatus = useCallback(async (id, status) => {
    await db.sections.update(id, { status });
  }, []);

  /**
   * Write elapsed study time (in seconds) to a section.
   *
   * @param {number} id
   * @param {number} duration - Elapsed seconds
   */
  const updateDuration = useCallback(async (id, duration) => {
    await db.sections.update(id, { duration });
  }, []);

  return {
    loading,
    error,
    createSections,
    getBySession,
    getById,
    updateStatus,
    updateDuration,
  };
}
