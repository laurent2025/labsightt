import { describe, it, expect, vi } from 'vitest';
import { ensureSupabaseProfile } from './supabase.js';

describe('ensureSupabaseProfile', () => {
  it('creates a profile when the record is missing for a valid auth user', async () => {
    const insert = vi.fn().mockResolvedValue({
      data: [{
        id: 'user-123',
        email: 'laurent@example.com',
        username: 'laurent_user_123',
        display_name: 'Laurent Example'
      }],
      error: null
    });

    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        }))
      })),
      upsert: insert
    }));

    const profile = await ensureSupabaseProfile({ from }, {
      id: 'user-123',
      email: 'laurent@example.com',
      user_metadata: { display_name: 'Laurent Example' }
    });

    expect(profile).toMatchObject({
      id: 'user-123',
      email: 'laurent@example.com',
      username: 'laurent_user_123',
      display_name: 'Laurent Example'
    });
    expect(insert).toHaveBeenCalled();
  });
});
