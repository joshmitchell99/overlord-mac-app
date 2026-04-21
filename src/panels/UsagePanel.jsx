import React from 'react'
import TodayMetricsCards from './Usage/TodayMetricsCards'
import TopAppsChart from './Usage/TopAppsChart'
import UsageHeatmap from './Usage/UsageHeatmap'
import OverlordKnowledge from './Usage/OverlordKnowledge'
import ActivityTimeline from './Usage/ActivityTimeline'
import ActivityLog from './Usage/ActivityLog'

export default function UsagePanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
      <TodayMetricsCards />
      <TopAppsChart />
      <UsageHeatmap />
      <OverlordKnowledge />
      <ActivityTimeline />
      <ActivityLog />
    </div>
  )
}
