import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { RequestStatusHistory } from '@/types'
import { RequestStatusBadge } from './RequestStatusBadge'
import type { RequestStatus } from '@/types'

interface StatusHistoryProps {
  history: RequestStatusHistory[]
}

export function StatusHistory({ history }: StatusHistoryProps) {
  const sorted = [...history].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">История статусов пуста</p>
    )
  }

  return (
    <ol className="relative border-l border-gray-200 space-y-4 ml-3">
      {sorted.map((entry) => (
        <li key={entry.id} className="ml-4">
          <div className="absolute w-2.5 h-2.5 bg-gray-300 rounded-full -left-1.5 mt-1" />
          <time className="text-xs text-gray-400">
            {format(new Date(entry.created_at), 'd MMM yyyy, HH:mm', { locale: ru })}
          </time>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {entry.old_status && (
              <>
                <RequestStatusBadge status={entry.old_status as RequestStatus} />
                <span className="text-gray-400 text-xs">→</span>
              </>
            )}
            <RequestStatusBadge status={entry.new_status as RequestStatus} />
          </div>
          {entry.changed_by && (
            <p className="text-xs text-gray-400 mt-0.5">{entry.changed_by}</p>
          )}
          {entry.reason && (
            <p className="text-xs text-gray-500 mt-0.5 italic">{entry.reason}</p>
          )}
        </li>
      ))}
    </ol>
  )
}
