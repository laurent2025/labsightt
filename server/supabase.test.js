import { describe, it, expect, vi } from 'vitest';
import { ensureSupabaseProfile, saveSupabaseDetections } from './supabase.js';

/**
 * Builds a stand-in Supabase client whose `detections` insert rejects the named
 * columns, so a schema that is behind (or whose PostgREST cache has not
 * reloaded since a migration) can be exercised without touching a database.
 */
function clientThatRejects(columns) {
  const attempts = [];
  return {
    attempts,
    from: () => ({
      insert: (payload) => ({
        select: async () => {
          attempts.push(payload);
          for (const [column, code] of Object.entries(columns)) {
            if (column in payload[0]) {
              return { data: null, error: { code, message: `column detections.${column} does not exist` } };
            }
          }
          return { data: payload, error: null };
        }
      })
    })
  };
}

const FINDINGS = [
  { class: 'Ascaris lumbricoides', confidence: 0.92, x: 120, y: 80, width: 40, height: 35 },
  {
    class: 'Hookworm egg',
    confidence: 0.87,
    x: 200,
    y: 150,
    width: 25,
    height: 20,
    reclassifiedFrom: 'Ascaris lumbricoides'
  }
];

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

describe('saveSupabaseDetections', () => {
  it('stores findings with their image ref and morphology correction', async () => {
    const client = clientThatRejects({});

    const saved = await saveSupabaseDetections(client, 'ana_1', FINDINGS, 'primary');

    expect(saved).toHaveLength(2);
    expect(client.attempts).toHaveLength(1);
    expect(saved[0]).toMatchObject({ analysis_id: 'ana_1', image_ref: 'primary', reclassified_from: null });
    expect(saved[1]).toMatchObject({
      class_name: 'Hookworm egg',
      image_ref: 'primary',
      reclassified_from: 'Ascaris lumbricoides'
    });
  });

  it('retries without columns a Postgres schema is missing, keeping every finding', async () => {
    const client = clientThatRejects({ image_ref: '42703', reclassified_from: '42703' });

    const saved = await saveSupabaseDetections(client, 'ana_1', FINDINGS, 'primary');

    expect(saved).toHaveLength(2);
    expect(client.attempts).toHaveLength(3);
    const finalKeys = Object.keys(client.attempts.at(-1)[0]);
    expect(finalKeys).not.toContain('image_ref');
    expect(finalKeys).not.toContain('reclassified_from');
    expect(finalKeys).toContain('class_name');
  });

  it('drops only the column an unreloaded PostgREST cache does not know (PGRST204)', async () => {
    const client = clientThatRejects({ reclassified_from: 'PGRST204' });

    const saved = await saveSupabaseDetections(client, 'ana_1', FINDINGS, 'primary');

    expect(saved).toHaveLength(2);
    expect(client.attempts).toHaveLength(2);
    // image_ref is valid on this schema, so it must survive the retry.
    expect(Object.keys(client.attempts.at(-1)[0])).toContain('image_ref');
    expect(Object.keys(client.attempts.at(-1)[0])).not.toContain('reclassified_from');
  });

  it('propagates a non-column failure immediately instead of retrying', async () => {
    const client = clientThatRejects({ note: '42501' });

    await expect(saveSupabaseDetections(client, 'ana_1', FINDINGS, 'primary'))
      .rejects.toMatchObject({ code: '42501' });
    expect(client.attempts).toHaveLength(1);
  });
});
