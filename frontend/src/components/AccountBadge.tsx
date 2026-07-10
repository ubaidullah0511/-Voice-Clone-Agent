import { UserButton } from '@clerk/react'
import type { Account } from '../api'

interface Props {
  account: Account | null
}

export default function AccountBadge({ account }: Props) {
  if (!account) return null

  const creditsLabel = account.unlimited
    ? '∞'
    : `${Math.max(account.credits_remaining - account.credits_reserved, 0)} / ${account.credits_total}`

  return (
    <div className="account-badge">
      <span className="badge-pill">{account.plan}</span>
      <span className="badge-pill badge-pill-accent mono">{creditsLabel}</span>
      <UserButton />
    </div>
  )
}
