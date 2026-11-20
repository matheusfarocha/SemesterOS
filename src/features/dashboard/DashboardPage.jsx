import { useStore } from '@/store/store'
import { greeting } from '@/shared/lib/dates'
import { PageHeader } from '@/shared/ui/ui'
import RemindersWidget from '@/features/reminders/RemindersWidget'
import Calendar from './Calendar'
import ThisWeek from './ThisWeek'
import './dashboard.css'

export default function DashboardPage() {
  const { state } = useStore()
  return (
    <>
      <PageHeader title={`${greeting()}, ${state.user.name}.`} sub="Your semester, organized." />
      <div className="dash">
        <Calendar />
        <div className="side">
          <RemindersWidget />
          <ThisWeek />
        </div>
      </div>
    </>
  )
}
