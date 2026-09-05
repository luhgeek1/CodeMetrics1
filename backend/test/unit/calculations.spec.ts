import {
  offHours,
  recommendations,
  sizeStatistics,
} from '../../src/modules/analytics/analytics.calculations.js';
import { sizeBucket } from '../../src/modules/integration/aggregate-writer.js';
import { decodeCursor } from '../../src/common/validation.js';

describe('legacy metric definitions', () => {
  it('preserves histogram centers and the legacy median threshold', () => {
    const result = sizeStatistics([
      { bucket: 'ZERO_TEN', count: 2 },
      { bucket: 'ELEVEN_FIFTY', count: 2 },
      { bucket: 'HUNDRED_PLUS', count: 1 },
    ]);
    expect(result.histogram.map((bin) => bin.count)).toEqual([2, 2, 0, 1]);
    expect(result.statistics).toEqual({ mean: 39.2, median: 30.5 });
    expect(sizeStatistics([]).statistics).toEqual({ mean: null, median: null });
  });
  it.each([
    [0, 'ZERO_TEN'],
    [10, 'ZERO_TEN'],
    [11, 'ELEVEN_FIFTY'],
    [50, 'ELEVEN_FIFTY'],
    [51, 'FIFTY_ONE_HUNDRED'],
    [100, 'FIFTY_ONE_HUNDRED'],
    [101, 'HUNDRED_PLUS'],
  ])('assigns churn %s to %s', (churn, bucket) => {
    expect(sizeBucket(churn as number)).toBe(bucket);
  });
  it('uses UTC working hours 09:00 inclusive through 19:00 exclusive', () => {
    const hours = [8, 9, 18, 19].map((hour) => ({
      hour,
      commits: 1,
      share_pct: 25,
      lines_added: 0,
      lines_deleted: 0,
    }));
    expect(offHours(hours)).toBe(50);
    expect(offHours([])).toBe(0);
  });
  it('preserves recommendation thresholds and individual scope', () => {
    const histogram = [{ bucket: '100+', count: 3 }];
    const hours = [
      {
        hour: 22,
        commits: 10,
        share_pct: 100,
        lines_added: 0,
        lines_deleted: 0,
      },
    ];
    const authors = [
      { author_id: 'a', commits: 6, lines: 1, share_pct: 60 },
      { author_id: 'b', commits: 4, lines: 1, share_pct: 40 },
    ];
    expect(
      recommendations(10, histogram, hours, authors, [
        { path: 'src/a.ts', commits_touch: 2, churn: 3 },
      ]).map((row) => row.id),
    ).toEqual([
      'large-commits',
      'off-hours',
      'author-concentration',
      'hot-file',
    ]);
    expect(
      recommendations(10, histogram, hours, [], [], true).map((row) => row.id),
    ).toEqual(['off-hours']);
  });
  it('rejects malformed cursors before they reach a database query', () => {
    expect(() => decodeCursor('broken')).toThrow('Invalid cursor');
    expect(() => decodeCursor('2026-09-01T00:00:00Z|')).toThrow(
      'Invalid cursor',
    );
  });
});
