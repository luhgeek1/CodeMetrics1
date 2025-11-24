"use client"

import * as React from "react"

import { useMetricsSummary } from "@/entities/metrics"
import {
  CommitHourlyHeatmapChart,
  type CommitTimeRange,
  type ContributionActivityDatum,
  type TimeRangeOption,
} from "@/entities/commit-analytics"
import { Button } from "@/shared/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card"
import { Skeleton } from "@/shared/components/ui/skeleton"
import {
  getMetricsRangeBounds,
  metricsRangeOptions,
} from "@/shared/lib/metrics-range"
import { cn } from "@/shared/lib/utils"
import { ExclamationTriangleIcon } from "@radix-ui/react-icons"

const rangeOptions: TimeRangeOption[] = metricsRangeOptions

const cardBaseClass =
  "h-full rounded-3xl border-border/30 bg-card/80 shadow-[0_10px_50px_-26px_rgba(34,197,94,0.25)] backdrop-blur"

const DEFAULT_RANGE: CommitTimeRange =
  rangeOptions[0]?.value ?? "1y"

type CommitHourlyHeatmapWidgetProps = {
  projectId: number | null
  className?: string
}

export function CommitHourlyHeatmapWidget({
  projectId,
  className,
}: CommitHourlyHeatmapWidgetProps) {
  const [range, setRange] =
    React.useState<CommitTimeRange>(DEFAULT_RANGE)

  const { since, until } = React.useMemo(
    () => getMetricsRangeBounds(range),
    [range],
  )

  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useMetricsSummary({
    since,
    until,
    projectId,
  })

  const heatmapData = React.useMemo<ContributionActivityDatum[]>(() => {
    if (!data) return []

    const daily = data.series.daily
    const map = new Map(daily.map((item) => [item.date, item.count]))

    const result: ContributionActivityDatum[] = []
    const cursor = new Date(since)
    const end = new Date(until)

    while (cursor <= end) {
      const iso = cursor.toISOString().slice(0, 10)
      result.push({
        date: iso,
        commits: map.get(iso) ?? 0,
      })
      cursor.setDate(cursor.getDate() + 1)
    }

    return result
  }, [data, since, until])

  const rangeLabel =
    rangeOptions.find((option) => option.value === range)?.label ?? ""

  if (isLoading && !data) {
    return <CommitHourlyHeatmapSkeleton className={className} />
  }

  if (isError) {
    return (
      <CommitHourlyHeatmapErrorState
        className={className}
        onRetry={refetch}
      />
    )
  }

  if (!heatmapData.length) {
    return <CommitHourlyHeatmapEmptyState className={className} />
  }

  return (
    <div className={className}>
      <CommitHourlyHeatmapChart
        data={heatmapData}
        range={range}
        rangeLabel={rangeLabel}
        onRangeChange={setRange}
        rangeOptions={rangeOptions}
      />
      {isFetching ? (
        <div className="mt-3 text-xs text-muted-foreground/70">
          Обновляем данные…
        </div>
      ) : null}
    </div>
  )
}

function CommitHourlyHeatmapSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn(cardBaseClass, className)}>
      <CardHeader className="pb-0">
        <CardTitle className="text-lg font-semibold text-foreground">
          Commit calendar
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground/80">
          Загружаем данные…
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-6 pt-4">
        <Skeleton className="h-[260px] w-full rounded-2xl bg-muted/30" />
      </CardContent>
    </Card>
  )
}

function CommitHourlyHeatmapEmptyState({ className }: { className?: string }) {
  return (
    <Card className={cn(cardBaseClass, className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-foreground">
          Commit calendar
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground/80">
          Нет данных за выбранный период.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

function CommitHourlyHeatmapErrorState({
  onRetry,
  className,
}: {
  onRetry: () => void
  className?: string
}) {
  return (
    <Card
      className={cn(
        cardBaseClass,
        "border-destructive/40 bg-destructive/10",
        className,
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-destructive">
          <ExclamationTriangleIcon className="h-4 w-4" />
          Не удалось загрузить календарь
        </CardTitle>
        <CardDescription className="text-sm text-destructive/80">
          Попробуйте повторить попытку позже.
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-5">
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/20"
        >
          Повторить попытку
        </Button>
      </CardContent>
    </Card>
  )
}
