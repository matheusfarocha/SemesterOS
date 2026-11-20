import { useLayoutEffect, useRef, useState } from 'react'

/**
 * One highlight shared by a row of options; it slides to whichever child matches `selector`.
 * Returns a ref for the container and the style for the pill element.
 */
export function useSlidingPill(selector, dep) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    const measure = () => {
      const active = ref.current?.querySelector(selector)
      setPos(active ? { left: active.offsetLeft, width: active.offsetWidth } : null)
    }
    measure()
    const ro = new ResizeObserver(measure) // widths change with fonts loading and breakpoints
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [selector, dep])

  const style = pos ? { transform: `translateX(${pos.left}px)`, width: pos.width, opacity: 1 } : { opacity: 0 }
  return [ref, style]
}
