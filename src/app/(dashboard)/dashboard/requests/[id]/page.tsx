import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { RequestStatusBadge } from '@/components/dashboard/RequestStatusBadge'
import { CategoryBadge } from '@/components/dashboard/CategoryBadge'
import { PriorityBadge } from '@/components/dashboard/PriorityBadge'
import { StatusHistory } from '@/components/dashboard/StatusHistory'
import { RequestActions } from '@/components/dashboard/RequestActions'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { ChevronRight, Building2, User, Phone, Calendar, Bot, Wrench } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { RequestStatus, RequestCategory, RequestPriority } from '@/types'
import type { Json, Database } from '@/types/database.types'
import type { PostgrestError } from '@supabase/supabase-js'

interface PageProps {
  params: Promise<{ id: string }>
}

type AiRawResponse = {
  category?: string
  priority?: string
  confidence?: number
  reasoning?: string
  [key: string]: string | number | boolean | null | undefined
}

function isAiRawResponse(val: Json | null): val is AiRawResponse {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) return false
  const obj = val as Record<string, Json | undefined>
  for (const key of Object.keys(obj)) {
    const v = obj[key]
    if (v !== null && v !== undefined && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
      return false
    }
  }
  return true
}

type RequestRow = Database['public']['Tables']['requests']['Row']
type ApartmentRow = Database['public']['Tables']['apartments']['Row']
type ComplexRow = Database['public']['Tables']['residential_complexes']['Row']
type ContractorRow = Database['public']['Tables']['contractors']['Row']
type RequestPhotoRow = Database['public']['Tables']['request_photos']['Row']
type RequestStatusHistoryRow = Database['public']['Tables']['request_status_history']['Row']

type RequestDetail = RequestRow & {
  apartments: (ApartmentRow & { residential_complexes: ComplexRow | null }) | null
  contractors: ContractorRow | null
  request_photos: RequestPhotoRow[]
  request_status_history: RequestStatusHistoryRow[]
}

function isOverdue(deadline: string | null, status: RequestStatus): boolean {
  if (!deadline || status === 'completed') return false
  return new Date(deadline) < new Date()
}

export default async function RequestDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createServerClient()

  const { data: req } = await supabase
    .from('requests')
    .select(
      `id, apartment_id, description, status, priority, category,
       ai_confidence, ai_raw_response, contractor_id, deadline,
       telegram_message_id, requires_manual_review, created_at, updated_at,
       apartments(id, complex_id, building, number, owner_name, owner_phone,
         owner_telegram_chat_id, warranty_expires_at, created_at, updated_at,
         residential_complexes(id, name, address, created_at, updated_at)),
       contractors(id, name, telegram_channel_id, categories, phone, is_active, created_at, updated_at),
       request_photos(id, request_id, storage_path, created_at),
       request_status_history(id, request_id, old_status, new_status, changed_by, reason, created_at)`
    )
    .eq('id', id)
    .maybeSingle() as { data: RequestDetail | null; error: PostgrestError | null }

  if (!req) {
    notFound()
  }

  const apt = req.apartments
  const contractor = req.contractors
  const photos = req.request_photos ?? []
  const history = req.request_status_history ?? []

  const overdue = isOverdue(req.deadline, req.status as RequestStatus)
  const aiRaw = isAiRawResponse(req.ai_raw_response) ? req.ai_raw_response : null
  const confidence = req.ai_confidence

  return (
    <div className="p-6 space-y-5">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm text-zinc-400">
        <Link href="/dashboard" className="hover:text-zinc-600 transition-colors">Заявки</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-zinc-700 font-medium">#{req.id.slice(0, 8)}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-zinc-900">Заявка #{req.id.slice(0, 8)}</h1>
            <RequestStatusBadge status={req.status as RequestStatus} />
            <PriorityBadge priority={req.priority as RequestPriority} />
            {req.requires_manual_review && (
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-red-50 text-red-600 border border-red-100">
                Требует проверки
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Создана {format(new Date(req.created_at), 'd MMMM yyyy, HH:mm', { locale: ru })}
          </p>
        </div>

        <RequestActions
          requestId={req.id}
          currentStatus={req.status as RequestStatus}
          requiresManualReview={req.requires_manual_review}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Описание проблемы</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-zinc-700 whitespace-pre-wrap leading-relaxed">{req.description}</p>
            </CardContent>
          </Card>

          {/* AI Classification */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-violet-500" />
                <CardTitle className="text-base">AI-классификация</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Категория</p>
                  <CategoryBadge category={req.category as RequestCategory | null} />
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Приоритет</p>
                  <PriorityBadge priority={req.priority as RequestPriority} />
                </div>
                {confidence !== null && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Уверенность</p>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-zinc-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            confidence >= 0.8 ? 'bg-green-500' :
                            confidence >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.round(confidence * 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-zinc-700">
                        {Math.round(confidence * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
              {aiRaw?.reasoning && (
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Обоснование AI</p>
                  <p className="text-sm text-zinc-600 bg-zinc-50 rounded-xl p-3 italic">
                    {String(aiRaw.reasoning)}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contractor */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-zinc-400" />
                <CardTitle className="text-base">Подрядчик</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {contractor ? (
                <div className="space-y-2">
                  <p className="font-medium text-zinc-900">{contractor.name}</p>
                  {contractor.phone && (
                    <p className="text-sm text-zinc-600 flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {contractor.phone}
                    </p>
                  )}
                  {contractor.categories.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mt-2">
                      {contractor.categories.map((cat) => (
                        <CategoryBadge key={cat} category={cat as RequestCategory} />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-zinc-400 italic">Подрядчик не назначен</p>
              )}
            </CardContent>
          </Card>

          {/* Photos */}
          {photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Фото заявки</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {photos.map((photo) => (
                    <div key={photo.id} className="aspect-square rounded-xl bg-zinc-100 overflow-hidden border border-zinc-200">
                      <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">
                        Фото {photo.id.slice(0, 6)}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Status & deadline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Статус и сроки</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-zinc-500 mb-1">Текущий статус</p>
                <RequestStatusBadge status={req.status as RequestStatus} />
              </div>
              <Separator />
              <div>
                <p className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Дедлайн
                </p>
                {req.deadline ? (
                  <p className={`text-sm font-medium ${overdue ? 'text-red-600' : 'text-zinc-900'}`}>
                    {format(new Date(req.deadline), 'd MMMM yyyy, HH:mm', { locale: ru })}
                    {overdue && (
                      <span className="block text-xs font-normal text-red-500 mt-0.5">Просрочено!</span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-zinc-400">Не установлен</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Apartment info */}
          {apt && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-zinc-400" />
                  <CardTitle className="text-base">Квартира</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {apt.residential_complexes && (
                  <div>
                    <p className="text-xs text-zinc-500">ЖК</p>
                    <p className="text-sm font-medium text-zinc-900">{apt.residential_complexes.name}</p>
                    <p className="text-xs text-zinc-400">{apt.residential_complexes.address}</p>
                  </div>
                )}
                <div className="flex gap-4">
                  <div>
                    <p className="text-xs text-zinc-500">Корпус</p>
                    <p className="text-sm font-medium text-zinc-900">{apt.building}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Квартира</p>
                    <p className="text-sm font-medium text-zinc-900">{apt.number}</p>
                  </div>
                </div>
                {apt.owner_name && (
                  <div>
                    <p className="text-xs text-zinc-500 flex items-center gap-1">
                      <User className="h-3 w-3" /> Владелец
                    </p>
                    <p className="text-sm text-zinc-900">{apt.owner_name}</p>
                  </div>
                )}
                {apt.owner_phone && (
                  <div>
                    <p className="text-xs text-zinc-500">Телефон</p>
                    <p className="text-sm text-zinc-900">{apt.owner_phone}</p>
                  </div>
                )}
                {apt.warranty_expires_at && (
                  <div>
                    <p className="text-xs text-zinc-500">Гарантия до</p>
                    <p className="text-sm text-zinc-900">
                      {format(new Date(apt.warranty_expires_at), 'd MMMM yyyy', { locale: ru })}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Status history */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">История статусов</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusHistory history={history} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
