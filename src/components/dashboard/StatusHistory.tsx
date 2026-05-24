import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { RequestStatusHistory } from '@/types'
import { RequestStatusBadge } from './RequestStatusBadge'
import type { RequestStatus } from '@/types'

const STATUS_DOT: Record<string, string> = {
  new: 'bg-gray-400',
  ai_processing: 'bg-blue-500',
  routed: 'bg-yellow-500',
  accepted: 'bg-orange-500',
  in_progress: 'bg-purple-500',
  completed: 'bg-green-500',
  requires_manual_review: 'bg-red-500',
}

interface StatusHistoryProps {
  history: RequestStatusHistory[]
}

export function StatusHistory({ history }: StatusHistoryProps) {
  const sorted = [...history].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-zinc-400 italic">История статусов пуста</p>
    )
  }

  return (
    <ol className="relative border-l border-zinc-200 space-y-4 ml-3">
      {sorted.map((entry) => (
        <li key={entry.id} className="ml-4">
          <div className={`absolute w-2.5 h-2.5 rounded-full -left-1.5 mt-1 ${STATUS_DOT[entry.new_status] ?? 'bg-zinc-300'}`} />
          <time className="text-xs text-zinc-400">
            {format(new Date(entry.created_at), 'd MMM yyyy, HH:mm', { locale: ru })}
          </time>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {entry.old_status && (
              <>
                <RequestStatusBadge status={entry.old_status as RequestStatus} />
                <span className="text-zinc-400 text-xs">→</span>
              </>
            )}
            <RequestStatusBadge status={entry.new_status as RequestStatus} />
          </div>
          {entry.changed_by && (
            <p className="text-xs text-zinc-400 mt-0.5">{entry.changed_by}</p>
          )}
          {entry.reason && (
            <p className="text-xs text-zinc-500 mt-0.5 italic">{entry.reason}</p>
          )}
        </li>
      ))}
    </ol>
  )
}
