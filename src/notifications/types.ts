/* Notification vocabulary, kept free of page imports so the platform docs registry can read it in Node. */
export const NTYPES = ['Approvals', 'Tasks', 'Signatures', 'Follow-ups', 'Payments', 'Leave', 'Exit', 'System'] as const
export type NType = (typeof NTYPES)[number]
export const CHANNELS = [['app', 'In-app'], ['email', 'Email digest'], ['whatsapp', 'WhatsApp digest']] as const
export type Channel = (typeof CHANNELS)[number][0]
