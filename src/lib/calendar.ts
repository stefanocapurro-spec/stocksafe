/**
 * Gestione calendario e promemoria
 * – Export .ics (compatibile Apple Calendar, Google Calendar, Outlook)
 * – Web Push Notifications (se permesso concesso)
 */

export interface ReminderItem {
  id: string
  itemName: string
  expiryDate: string   // ISO date YYYY-MM-DD
  remindDate: string   // 1° del mese precedente
}

// ── Formato ICS ─────────────────────────────────────────────────────────────

function toICSDate(isoDate: string): string {
  return isoDate.replace(/-/g, '')
}

function escapeICS(s: string): string {
  return s.replace(/[,;\\]/g, c => `\\${c}`).replace(/\n/g, '\\n')
}

export function generateICS(items: ReminderItem[]): string {
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}@stocksafe`
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  const events = items.map(item => {
    const remindStr = toICSDate(item.remindDate)
    const expiryStr = toICSDate(item.expiryDate)

    return [
      'BEGIN:VEVENT',
      `UID:${uid()}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${remindStr}`,
      `DTEND;VALUE=DATE:${remindStr}`,
      `SUMMARY:⚠️ Scadenza: ${escapeICS(item.itemName)}`,
      `DESCRIPTION:${escapeICS(item.itemName)} scade il ${item.expiryDate}. Verifica la scorta.`,
      `CATEGORIES:StockSafe\\,Scadenze`,
      `TRANSP:TRANSPARENT`,
      `BEGIN:VALARM`,
      `TRIGGER:-PT0S`,
      `ACTION:DISPLAY`,
      `DESCRIPTION:Promemoria scadenza StockSafe`,
      `END:VALARM`,
      `END:VEVENT`,
    ].join('\r\n')
  })

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StockSafe//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:StockSafe Scadenze',
    'X-WR-TIMEZONE:Europe/Rome',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadICS(items: ReminderItem[], filename = 'stocksafe-scadenze.ics') {
  const ics = generateICS(items)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Calcolo remind_date ─────────────────────────────────────────────────────

export function calcRemindDate(expiryDate: string): string {
  const d = new Date(expiryDate)
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 10)
}

// ── Web Notifications ───────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

export function scheduleLocalNotification(item: ReminderItem) {
  if (Notification.permission !== 'granted') return

  const remindDate = new Date(item.remindDate)
  const now = new Date()
  const msUntil = remindDate.getTime() - now.getTime()

  if (msUntil > 0 && msUntil < 7 * 24 * 60 * 60 * 1000) {
    // Solo se la scadenza è entro 7 giorni (limite ragionevole per setTimeout)
    setTimeout(() => {
      new Notification('⚠️ StockSafe – Scadenza', {
        body: `${item.itemName} scade il ${item.expiryDate}`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: `reminder-${item.id}`,
      })
    }, msUntil)
  }
}

// ── Articoli in scadenza questo mese ───────────────────────────────────────

export function getExpiringThisMonth(items: { id: string; name: string; expiryDate: string }[]): ReminderItem[] {
  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()

  return items
    .filter(i => {
      if (!i.expiryDate) return false
      const expiry = new Date(i.expiryDate)
      return expiry.getFullYear() === thisYear && expiry.getMonth() === thisMonth
    })
    .map(i => ({
      id: i.id,
      itemName: i.name,
      expiryDate: i.expiryDate,
      remindDate: calcRemindDate(i.expiryDate),
    }))
}
