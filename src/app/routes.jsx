import { Navigate } from 'react-router-dom'
import { CalendarDays, Layers, Upload, Bell, Sparkles } from 'lucide-react'
import DashboardPage from '@/features/dashboard/DashboardPage'
import CoursesPage from '@/features/courses/CoursesPage'
import SyllabusPage from '@/features/syllabus/SyllabusPage'
import RemindersPage from '@/features/reminders/RemindersPage'
import AssistantPage from '@/features/assistant/AssistantPage'

// One entry per page. Order = nav order. `nav: false` = routable but not in the top nav.
export const ROUTES = [
  { path: '/', label: 'Calendar', icon: CalendarDays, element: <DashboardPage /> },
  { path: '/courses', label: 'Courses', icon: Layers, element: <CoursesPage /> },
  { path: '/syllabus', label: 'Syllabus', icon: Upload, element: <SyllabusPage />, nav: false },
  { path: '/grades', element: <Navigate to="/courses" replace />, nav: false }, // grades + what-ifs live in Courses > Grades
  { path: '/simulator', element: <Navigate to="/courses" replace />, nav: false },
  { path: '/reminders', label: 'Reminders', icon: Bell, element: <RemindersPage />, nav: false }, // opened via "View all" on the dashboard Reminders card
  { path: '/assistant', label: 'Assistant', icon: Sparkles, element: <AssistantPage /> },
]
