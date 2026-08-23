import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

interface DrawerShellProps {
  labelledBy: string
  closeLabel: string
  children: ReactNode
  onClosed: () => void
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6M20 6l-6 6 6 6" /></svg>
}

export function DrawerShell({ labelledBy, closeLabel, children, onClosed }: DrawerShellProps) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const frame = useRef<number | null>(null)
  const fallbackTimer = useRef<number | null>(null)
  const finished = useRef(false)

  const finishClose = useCallback(() => {
    if (finished.current) return
    finished.current = true
    onClosed()
  }, [onClosed])

  const requestClose = useCallback(() => {
    if (closing || finished.current) return
    setOpen(false)
    setClosing(true)
    fallbackTimer.current = window.setTimeout(finishClose, 420)
  }, [closing, finishClose])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    frame.current = window.requestAnimationFrame(() => setOpen(true))
    return () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current)
      if (fallbackTimer.current !== null) window.clearTimeout(fallbackTimer.current)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && requestClose()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [requestClose])

  const state = open && !closing ? 'open' : closing ? 'closing' : 'closed'
  return (
    <>
      <button className="drawer-scrim" data-state={state} type="button" aria-label={closeLabel} onClick={requestClose} />
      <aside
        className="day-drawer"
        data-state={state}
        aria-modal="true"
        role="dialog"
        aria-labelledby={labelledBy}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'transform' && closing) finishClose()
        }}
      >
        <header className="drawer-header"><button className="icon-button" type="button" onClick={requestClose} aria-label="关闭"><CloseIcon /></button></header>
        {children}
      </aside>
    </>
  )
}
