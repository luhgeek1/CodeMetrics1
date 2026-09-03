import {
  CommitSizeStats,
  HourHeatmapPointOut,
  InsightRecommendation,
  SizeBucketPoint,
  TopAuthorRowOut,
} from '../../generated/graphql.js';
import { HotFileRow, SizeRow } from './analytics.repository.js';

export const BUCKETS = [
  { key: 'ZERO_TEN', label: '0-10', center: 5 },
  { key: 'ELEVEN_FIFTY', label: '11-50', center: 30.5 },
  { key: 'FIFTY_ONE_HUNDRED', label: '51-100', center: 75.5 },
  { key: 'HUNDRED_PLUS', label: '100+', center: 125 },
] as const;
export function round(value: number, precision = 2) {
  return Number(value.toFixed(precision));
}
export function percent(value: number, total: number) {
  return total ? round((value / total) * 100) : 0;
}

export function sizeStatistics(rows: SizeRow[]): {
  histogram: SizeBucketPoint[];
  statistics: CommitSizeStats;
} {
  const bins = BUCKETS.map((bucket) => ({
    ...bucket,
    count: rows.find((row) => row.bucket === bucket.key)?.count ?? 0,
  }));
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  let cumulative = 0;
  let median: number | null = null;
  for (const bin of bins) {
    cumulative += bin.count;
    if (total && cumulative >= (total + 1) / 2) {
      median = bin.center;
      break;
    }
  }
  return {
    histogram: bins.map((bin) => ({ bucket: bin.label, count: bin.count })),
    statistics: {
      mean: total
        ? bins.reduce((sum, bin) => sum + bin.center * bin.count, 0) / total
        : null,
      median,
    },
  };
}

export function offHours(hours: HourHeatmapPointOut[]) {
  const total = hours.reduce((sum, hour) => sum + hour.commits, 0);
  return percent(
    hours
      .filter((hour) => hour.hour < 9 || hour.hour >= 19)
      .reduce((sum, hour) => sum + hour.commits, 0),
    total,
  );
}

export function recommendations(
  commits: number,
  histogram: SizeBucketPoint[],
  hours: HourHeatmapPointOut[],
  authors: TopAuthorRowOut[],
  files: HotFileRow[],
  individual = false,
): InsightRecommendation[] {
  const result: InsightRecommendation[] = [];
  const large = histogram.find((bin) => bin.bucket === '100+')?.count ?? 0;
  if (!individual && commits >= 5 && large / commits >= 0.2)
    result.push({
      id: 'large-commits',
      title: 'Слишком крупные коммиты',
      description: `${round(Math.min(large / commits, 1) * 100, 1)}% коммитов попадает в бакет 100+. Попробуйте дробить изменения.`,
      severity: 'warning',
    });
  const off = offHours(hours);
  if (hours.reduce((sum, row) => sum + row.commits, 0) >= 10 && off >= 40)
    result.push({
      id: 'off-hours',
      title: 'Высокая активность вне рабочего времени',
      description: `${off}% коммитов выполняется в нерабочие часы. Проверьте распределение нагрузки.`,
      severity: individual ? 'info' : 'warning',
    });
  if (!individual && authors.length >= 2 && (authors[0]?.share_pct ?? 0) >= 50)
    result.push({
      id: 'author-concentration',
      title: 'Коммиты сконцентрированы у одного разработчика',
      description: `Топ-автор делает ${round(authors[0]!.share_pct, 1)}% коммитов. Подумайте над перераспределением задач.`,
      severity: 'info',
    });
  const file = files[0];
  if (file)
    result.push({
      id: 'hot-file',
      title: 'Файл с высоким churn',
      description: `Файл "${file.path}" менялся ${file.commits_touch} раз и набрал churn ${file.churn}. Рассмотрите рефакторинг.`,
      severity: 'info',
    });
  return result;
}
