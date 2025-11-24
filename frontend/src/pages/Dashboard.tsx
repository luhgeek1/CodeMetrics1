import * as React from "react"
import type { CSSProperties } from "react"

import { ExclamationTriangleIcon } from "@radix-ui/react-icons"
import { GitBranch } from "lucide-react"

import { useProjectCardsList } from "@/entities/project"
import { useMetricsSummary } from "@/entities/metrics"
import { AppSidebar } from "@/shared/components/app-sidebar"
import { SiteHeader } from "@/shared/components/site-header"
import {
  SectionCards,
  type SectionCard,
} from "@/shared/components/section-cards"
import { Button } from "@/shared/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card"
import { Skeleton } from "@/shared/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select"
import {
  SidebarInset,
  SidebarProvider,
} from "@/shared/components/ui/sidebar"
import { getMetricsRangeBounds } from "@/shared/lib/metrics-range"
import { CommitActivityWidget } from "@/widgets/commit-activity"
import { CommitHourlyHeatmapWidget } from "@/widgets/commit-hourly-heatmap"
import { CommitTopAuthorsWidget } from "@/widgets/commit-top-authors"

const KPI_RANGE = "1y" as const

const numberFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
})

const averageFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
})

const percentFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
})

const periodFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
})

export default function DashboardPage() {
  const { data: projects, isLoading: isProjectsLoading } =
    useProjectCardsList()

  const [selectedProjectId, setSelectedProjectId] = React.useState<
    number | null
  >(null)

  const projectSelectValue =
    selectedProjectId !== null ? String(selectedProjectId) : "all"

  const { since: kpiSince, until: kpiUntil } =
    React.useMemo(() => getMetricsRangeBounds(KPI_RANGE), [])

  const {
    data: summary,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    refetch: refetchSummary,
  } = useMetricsSummary({
    since: kpiSince,
    until: kpiUntil,
    projectId: selectedProjectId,
  })

  const periodLabel = React.useMemo(() => {
    const start = periodFormatter.format(kpiSince)
    const end = periodFormatter.format(kpiUntil)
    return `${start} — ${end}`
  }, [kpiSince, kpiUntil])

  const kpiCards = React.useMemo<SectionCard[]>(() => {
    if (!summary) return []

    const { kpi } = summary
    const shortPctRaw = kpi.messageQuality.shortPercentage
    const shortPct =
      shortPctRaw > 1 ? shortPctRaw : shortPctRaw * 100

    return [
      {
        id: "commits-total",
        label: "Total commits",
        value: numberFormatter.format(kpi.commits),
        secondary: `Период: ${periodLabel}`,
      },
      {
        id: "active-developers",
        label: "Unique developers",
        value: numberFormatter.format(kpi.activeDevelopers),
      },
      {
        id: "active-repositories",
        label: "Active repositories",
        value: numberFormatter.format(kpi.activeRepositories),
      },
      {
        id: "commit-size",
        label: "Avg / Median Commit Size",
        value: `${averageFormatter.format(kpi.avgCommitSize.mean)} / ${averageFormatter.format(kpi.avgCommitSize.median)}`,
      },
      {
        id: "short-messages-share",
        label: "Short Msg %",
        value: `${percentFormatter.format(shortPct)}%`,
        secondary: `Avg length: ${averageFormatter.format(kpi.messageQuality.avgLength)} символов`,
      },
    ]
  }, [summary, periodLabel])

  const renderKpiSection = () => {
    if (isSummaryLoading && !summary) {
      return <DashboardKpiSkeleton />
    }

    if (isSummaryError) {
      return (
        <DashboardKpiError onRetry={refetchSummary} />
      )
    }

    if (!summary || !kpiCards.length) {
      return <DashboardKpiEmpty />
    }

    return <SectionCards cards={kpiCards} />
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 14 * 1.1)",
        } as CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader
          title="Dashboard"
          description="Фильтры применяются ко всем виджетам на странице"
          filters={
            <Select
              value={projectSelectValue}
              onValueChange={(value) => {
                if (value === "all") {
                  setSelectedProjectId(null)
                } else {
                  setSelectedProjectId(Number(value))
                }
              }}
            >
              <SelectTrigger className="h-10 min-w-[200px] justify-start gap-2 rounded-full border-border/20 bg-muted/40 px-4 text-sm font-medium text-foreground/90 shadow-sm backdrop-blur hover:bg-muted/60 focus-visible:ring-0 focus-visible:ring-offset-0">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <SelectValue
                  placeholder={
                    isProjectsLoading ? "Загрузка..." : "Все проекты"
                  }
                />
              </SelectTrigger>
              <SelectContent
                align="end"
                className="rounded-xl bg-popover/95 backdrop-blur"
              >
                <SelectItem value="all" className="rounded-lg text-sm">
                  Все проекты
                </SelectItem>
                <SelectSeparator />
                {isProjectsLoading ? (
                  <SelectItem value="loading" disabled className="rounded-lg text-sm">
                    Загрузка проектов…
                  </SelectItem>
                ) : projects && projects.length > 0 ? (
                  projects.map((project) => (
                    <SelectItem
                      key={project.id}
                      value={String(project.id)}
                      className="rounded-lg text-sm"
                    >
                      {project.title}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="empty" disabled className="rounded-lg text-sm">
                    Проекты недоступны
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          }
        />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              {renderKpiSection()}
              <div className="flex flex-col gap-6 px-4 lg:px-6">
                <CommitActivityWidget projectId={selectedProjectId} />
                <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] xl:grid-cols-2">
                  <CommitTopAuthorsWidget projectId={selectedProjectId} />
                  <CommitHourlyHeatmapWidget projectId={selectedProjectId} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function DashboardKpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 px-4 lg:px-6 @lg/main:grid-cols-2 @2xl/main:grid-cols-3 @4xl/main:grid-cols-4 @5xl/main:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Card
          key={index}
          className="rounded-3xl border-border/30 bg-card/80 p-5 shadow-[0_10px_40px_-24px_rgba(112,118,255,0.45)] backdrop-blur"
        >
          <div className="flex h-full flex-col gap-4">
            <Skeleton className="h-4 w-32 rounded-full bg-muted/40" />
            <Skeleton className="h-8 w-2/3 rounded-lg bg-muted/30" />
            <Skeleton className="h-4 w-24 rounded-full bg-muted/30" />
          </div>
        </Card>
      ))}
    </div>
  )
}

function DashboardKpiError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mx-4 rounded-3xl border-destructive/40 bg-destructive/10 px-6 py-5 text-sm text-destructive shadow-[0_20px_60px_-40px_rgba(220,38,38,0.35)] backdrop-blur lg:mx-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 font-medium">
          <ExclamationTriangleIcon className="h-4 w-4" />
          Не удалось загрузить показатели
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/15"
        >
          Повторить попытку
        </Button>
      </div>
    </Card>
  )
}

function DashboardKpiEmpty() {
  return (
    <Card className="mx-4 rounded-3xl border-dashed border-border/40 bg-card/60 px-6 py-5 text-sm text-muted-foreground lg:mx-6">
      <div className="flex flex-col gap-1">
        <CardHeader className="p-0">
          <CardTitle className="text-base font-semibold text-foreground">
            Нет данных для отображения
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground/80">
            Попробуйте выбрать другой проект или период.
          </CardDescription>
        </CardHeader>
      </div>
    </Card>
  )
}
