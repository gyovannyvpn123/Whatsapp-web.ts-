/**
 * Constante pentru biblioteca WhatsApp Web API
 */

// Constante WhatsApp Web
export const WA_WEB_URL = 'wss://web.whatsapp.com/ws';
export const WA_VERSION = [2, 2348, 50];
export const WA_BROWSER = ['WhatsApp Web API', 'Chrome', '120.0.0.0'];
export const WA_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Magic bytes și token-uri pentru protocolul binar
export const WA_MAGIC = Buffer.from([0x57, 0x41]); // "WA"
export const WA_PREFIX_INFO = Buffer.from([6, 0, 0, 0]); // info server-client
export const WA_PREFIX_BINARY = Buffer.from([6, 1, 0, 0]); // binary server-client

// Token-uri pentru protocol binar
export const SINGLE_BYTE_TOKENS = [
  null, null, null, '200', '400', '404', '500', '501', '502', 'action', 'add',
  'after', 'archive', 'author', 'available', 'battery', 'before', 'body',
  'broadcast', 'chat', 'clear', 'code', 'composing', 'contacts', 'count',
  'create', 'debug', 'delete', 'demote', 'duplicate', 'encoding', 'error',
  'false', 'filehash', 'from', 'g.us', 'group', 'groups', 'height', 'id',
  'image', 'in', 'index', 'invis', 'item', 'jid', 'kind', 'last', 'leave',
  'live', 'log', 'media', 'message', 'mimetype', 'missing', 'modify', 'name',
  'notification', 'notify', 'out', 'owner', 'participant', 'paused',
  'picture', 'played', 'presence', 'preview', 'promote', 'query', 'raw',
  'read', 'receipt', 'received', 'recipient', 'recording', 'relay',
  'remove', 'response', 'resume', 'retry', 's.whatsapp.net', 'seconds',
  'set', 'size', 'status', 'subject', 'subscribe', 'success', 't', 'text',
  'true', 'type', 'unarchive', 'unavailable', 'url', 'user', 'value',
  'web', 'width', 'mute', 'read_only', 'admin', 'creator', 'short',
  'update', 'powersave', 'checksum', 'epoch', 'block', 'previous',
  'c.us', '420', 'private', 'notice', 'video', 'revoke'
];

// Enum pentru stările conexiunii
export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  AUTHENTICATED = 'AUTHENTICATED',
  READY = 'READY',
  TIMEOUT = 'TIMEOUT'
}