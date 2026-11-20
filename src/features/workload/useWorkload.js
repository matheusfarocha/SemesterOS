import { useMemo } from 'react'
import { useStore } from '@/store/store'
import { buildWorkload } from './workload.service'

export function useWorkload() {
  const { state } = useStore()
  return useMemo(() => buildWorkload(state), [state.courses, state.assessments])
}
