export type ContentScoreInput = {
  violence: number
  language: number
  sexNudity: number
  scariness: number
  isUnrated: boolean
  isNC17: boolean
}

export type ModeThresholds = {
  maxViolence: number
  maxLanguage: number
  maxSexNudity: number
  maxScariness: number
  allowUnrated: boolean
  allowNC17: boolean
}

export type OverrideInput = { decision: 'APPROVED' | 'REJECTED' } | null

export type FilterReason = 'override_approved' | 'override_rejected' | 'passes' | 'fails_category' | 'unscored'

export function evaluateTitle(
  score: ContentScoreInput | null,
  thresholds: ModeThresholds,
  override: OverrideInput
): FilterReason {
  if (override?.decision === 'APPROVED') return 'override_approved'
  if (override?.decision === 'REJECTED') return 'override_rejected'
  if (!score) return 'unscored'
  if (score.isNC17 && !thresholds.allowNC17) return 'fails_category'
  if (score.isUnrated && !thresholds.allowUnrated) return 'fails_category'

  const withinThresholds =
    score.violence <= thresholds.maxViolence &&
    score.language <= thresholds.maxLanguage &&
    score.sexNudity <= thresholds.maxSexNudity &&
    score.scariness <= thresholds.maxScariness

  return withinThresholds ? 'passes' : 'fails_category'
}

export function isVisibleInMode(reason: FilterReason, mode: 'FAMILY' | 'ADULT'): boolean {
  if (reason === 'override_rejected' || reason === 'fails_category') return false
  if (reason === 'override_approved' || reason === 'passes') return true
  return mode === 'ADULT' // reason === 'unscored'
}
