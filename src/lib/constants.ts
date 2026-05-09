export const REQUEST_STATUSES = [
  'new',
  'ai_processing',
  'routed',
  'accepted',
  'in_progress',
  'completed',
  'requires_manual_review',
] as const

export const REQUEST_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

export const REQUEST_CATEGORIES = [
  'electrical',
  'plumbing',
  'hvac',
  'structural',
  'windows_doors',
  'finishing',
  'appliances',
  'other',
] as const
