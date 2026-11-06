/** Plain-English text for database error codes the admin can hit. Unknown codes are shown as-is. */
const MESSAGES: Record<string, string> = {
  forbidden: "Your admin role doesn't allow this.",
  reason_required: 'Please give a reason (at least 5 characters).',
  order_not_found: 'Order not found.',
  cancel_not_allowed: 'This order is already closed.',
  dispatch_not_allowed: 'Partners can only be dispatched while the shop is handling the order.',
  already_assigned: 'A partner has already accepted this order. Tick “take it away from the current partner” to reassign.',
  user_not_found: 'Account not found.',
  cannot_change_own_role: "You can't change your own account.",
  nothing_to_settle: 'Nothing is outstanding.',
  amount_changed: 'The amount changed since the page loaded (new orders were delivered). Reload and count again.',
  reference_required: 'Enter the bank UTR or UPI reference (4–60 characters).',
  ticket_not_found: 'Ticket not found.',
  not_updated: 'Nothing was changed — you may not have permission, or the record no longer exists.',
  invalid_transition: 'That status change is not allowed.',
};

export function adminError(e: { message?: string; code?: string } | null | undefined) {
  const m = e?.message ?? 'unknown_error';
  if (m.includes('duplicate key')) return 'That value is already used — it must be unique.';
  if (m.includes('violates check constraint')) return 'One of the values is not valid.';
  return MESSAGES[m] ?? m;
}
