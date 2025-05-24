/**
 * @ourorg/whatsapp-core
 * Biblioteca reală și completă pentru WhatsApp Web API
 */

import { WAConnection } from './WAConnection';
import { ConnectionState } from './constants';
import { MessageType } from './types';

export {
  WAConnection,
  ConnectionState,
  MessageType
};

// Export default WhatsApp class for convenience
export default WAConnection;