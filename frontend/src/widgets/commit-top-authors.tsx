"use client"

import * as React from "react"

import { ExclamationTriangleIcon } from "@radix-ui/react-icons"

import {
  CommitTopAuthorsChart,
  type CommitTimeRange,
  type TimeRangeOption,
} from "@/entities/commit-analytics"
import { useMetricsSummary } from "@/entities/metrics"
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

type CommitTopAuthorsWidgetProps = {
  projectId: number | null
  className?: string
}

const rangeOptions: TimeRangeOption[] = metricsRangeOptions

const cardBaseClass =
  "h-full rounded-3xl border-border/30 bg-card/80 shadow-[0_10px_50px_-26px_rgba(64,217,108,0.35)] backdrop-blur"

const DEFAULT_RANGE: CommitTimeRange =
  rangeOptions[0]?.value ?? "1y"

export function CommitTopAuthorsWidget({
  projectId,
  className,
}: CommitTopAuthorsWidgetProps) {
  const [range, setRange] = React.useState<CommitTimeRange>(DEFAULT_RANGE)

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

  const authorsData = React.useMemo(() => {
    if (!data) return []
    return data.topAuthors
      .map((author) => ({
        author: author.name || author.email || author.id,
        commits: author.commits,
      }))
      .filter((item) => item.commits > 0)
      .sort((a, b) => b.commits - a.commits)
  }, [data])

  const rangeLabel =
    rangeOptions.find((option) => option.value === range)?.label ?? ""

  if (isLoading && !data) {
    return <CommitTopAuthorsSkeleton className={className} />
  }

  if (isError) {
    return (
      <CommitTopAuthorsErrorState
        className={className}
        onRetry={refetch}
      />
    )
  }

  if (!authorsData.length) {
    return (
      <CommitTopAuthorsEmptyState className={className} />
    )
  }

  return (
    <div className={className}>
      <CommitTopAuthorsChart
        data={authorsData}
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

function CommitTopAuthorsSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn(cardBaseClass, className)}>
      <CardHeader className="pb-0">
        <CardTitle className="text-lg font-semibold text-foreground">
          Top contributors (by commits)
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground/80">
          Загружаем данные…
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pb-6 pt-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-4 w-40 rounded-md bg-muted/40" />
            <Skeleton className="h-3 w-16 rounded-md bg-muted/30" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function CommitTopAuthorsEmptyState({ className }: { className?: string }) {
  return (
    <Card className={cn(cardBaseClass, className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-foreground">
          Top contributors (by commits)
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-6 pt-2 text-sm text-muted-foreground/80">
        Недостаточно данных для отображения авторов за выбранный период.
      </CardContent>
    </Card>
  )
}

function CommitTopAuthorsErrorState({
  onRetry,
  className,
}: {
  onRetry: () => void
  className?: string
}) {
  return (
    <Card className={cn(
      cardBaseClass,
      "border-destructive/40 bg-destructive/10",
      className,
    )}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-destructive">
          <ExclamationTriangleIcon className="h-4 w-4" />
          Не удалось загрузить авторов
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
