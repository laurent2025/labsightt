import { describe, it, expect, vi } from 'vitest';
import { ensureSupabaseProfile } from './supabase.js';

describe('ensureSupabaseProfile', () => {
  it('creates a profile when the record is missing for a valid auth user', async () => {
    const row = {
      id: 'user-123',
      email: 'laurent@example.com',
      username: 'laurent_user_123',
      display_name: 'Laurent Example'
    };
    // The real client chains `.upsert(...).select(...).single()`.
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const upsert = vi.fn(() => ({
      select: vi.fn(() => ({ single }))
    }));

    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        }))
      })),
      upsert
    }));

    const profile = await ensureSupabaseProfile({ from }, {
      id: 'user-123',
      email: 'laurent@example.com',
      user_metadata: { display_name: 'Laurent Example' }
    });

    expect(profile).toMatchObject(row);
    expect(upsert).toHaveBeenCalled();
  });
});
