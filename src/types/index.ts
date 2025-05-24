/**
 * Tipuri de date pentru biblioteca WhatsApp Web API
 */

// Enum pentru tipurile de mesaje
export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  STICKER = 'sticker',
  CONTACT = 'contact',
  LOCATION = 'location',
  BUTTON = 'button',
  LIST = 'list',
  TEMPLATE = 'template',
  GROUP_INVITE = 'groupInvite',
  VIEW_ONCE = 'viewOnce',
  POLL = 'poll',
  REACTION = 'reaction'
}

// Tipuri pentru mesaje
export interface Message {
  id: string;
  type: MessageType;
  from: string;
  to: string;
  fromMe: boolean;
  timestamp: number;
  content?: any;
  text?: string;
  caption?: string;
  url?: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
}

// Tipuri pentru sesiuni
export interface Session {
  clientId: string;
  serverToken: string;
  clientToken: string;
  encKey: any;
  macKey: any;
  me: {
    id: string;
    name: string;
    phone: string;
  };
}

// Tipuri pentru opțiuni de configurare
export interface WhatsAppOptions {
  debug?: boolean;
  maxReconnects?: number;
  reconnectDelay?: number;
  autoReconnect?: boolean;
  qrMaxRetries?: number;
  qrTimeout?: number;
  wsUrl?: string;
  userAgent?: string;
  proxy?: string;
  authMethod?: 'qr' | 'pairing-code';
}

// Tipuri pentru grupuri
export interface Group {
  id: string;
  name: string;
  creator: string;
  creation: number;
  participants: GroupParticipant[];
  description?: string;
  announce?: boolean;
  restrict?: boolean;
}

export interface GroupParticipant {
  jid: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}