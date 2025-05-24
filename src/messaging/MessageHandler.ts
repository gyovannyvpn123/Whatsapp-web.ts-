/**
 * Handler pentru mesaje WhatsApp
 */

import * as crypto from 'crypto';
import { MessageType } from '../types';

export class MessageHandler {
  private client: any;
  
  constructor(client: any) {
    this.client = client;
  }
  
  /**
   * Trimitere mesaj text
   * @param {string} to Destinatar
   * @param {string} text Text
   * @param {Object} options Opțiuni
   * @returns {Promise<Object>} Mesajul trimis
   */
  public async sendText(to: string, text: string, options: any = {}): Promise<any> {
    // Formatare JID
    const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    
    // Generare ID mesaj
    const messageId = options.id || crypto.randomBytes(8).toString('hex').toUpperCase();
    
    // Creare nod de mesaj
    const node = {
      id: this.client.protocolManager._generateMessageTag(),
      type: 'action',
      data: {
        type: 'set',
        xmlns: 'w:m',
        to: jid,
        id: messageId,
        content: [
          {
            type: 'text',
            text
          }
        ]
      }
    };
    
    // Adăugare răspuns la mesaj dacă este specificat
    if (options.quoted) {
      node.data.content[0].quoted = {
        id: options.quoted.id,
        fromMe: options.quoted.fromMe,
        participant: options.quoted.participant
      };
    }
    
    // Adăugare mențiuni
    if (options.mentions && options.mentions.length > 0) {
      node.data.content[0].mentions = options.mentions;
    }
    
    try {
      // Trimitere mesaj
      const response = await this.client.protocolManager.sendBinary(node);
      
      // Creare obiect mesaj
      const message = {
        id: messageId,
        type: MessageType.TEXT,
        to: jid,
        from: this.client.user.id,
        fromMe: true,
        body: text,
        timestamp: Date.now(),
        status: 'sent'
      };
      
      // Emitere eveniment
      this.client.emit('message_sent', message);
      
      return message;
    } catch (error) {
      this.client.log('Error sending text message:', error);
      throw new Error(`Failed to send text message: ${error.message}`);
    }
  }
  
  /**
   * Procesare mesaj primit
   * @param {Object} message Mesajul primit
   */
  public handleIncomingMessage(message: any): void {
    // Formatare mesaj
    const formattedMessage = this._formatMessage(message);
    
    // Adăugare în store
    if (formattedMessage.id) {
      const chatId = formattedMessage.chatJid || formattedMessage.from;
      
      if (!this.client.store.messages.has(chatId)) {
        this.client.store.messages.set(chatId, new Map());
      }
      
      this.client.store.messages.get(chatId).set(formattedMessage.id, formattedMessage);
    }
    
    // Emitere eveniment
    this.client.emit('message', formattedMessage);
    
    // Emitere eveniment specific tipului
    if (formattedMessage.type) {
      this.client.emit(`message_${formattedMessage.type}`, formattedMessage);
    }
  }
  
  /**
   * Formatare mesaj
   * @param {Object} message Mesajul de formatat
   * @returns {Object} Mesajul formatat
   * @private
   */
  private _formatMessage(message: any): any {
    // Determinare tip mesaj
    let type = message.type || MessageType.TEXT;
    let content = {};
    
    // Extragere conținut în funcție de tip
    if (message.content) {
      if (typeof message.content === 'string') {
        content = { text: message.content };
        type = MessageType.TEXT;
      } else if (message.content.text) {
        content = { text: message.content.text };
        type = MessageType.TEXT;
      } else if (message.content.image) {
        content = message.content.image;
        type = MessageType.IMAGE;
      } else if (message.content.video) {
        content = message.content.video;
        type = MessageType.VIDEO;
      } else if (message.content.audio) {
        content = message.content.audio;
        type = MessageType.AUDIO;
      } else if (message.content.document) {
        content = message.content.document;
        type = MessageType.DOCUMENT;
      } else if (message.content.location) {
        content = message.content.location;
        type = MessageType.LOCATION;
      } else if (message.content.contact) {
        content = message.content.contact;
        type = MessageType.CONTACT;
      } else if (message.content.buttons) {
        content = message.content.buttons;
        type = MessageType.BUTTON;
      } else if (message.content.list) {
        content = message.content.list;
        type = MessageType.LIST;
      }
    }
    
    // Formatare mesaj basic
    const formattedMessage = {
      id: message.id,
      type,
      from: message.from,
      fromMe: message.fromMe || message.from === this.client.user?.id,
      to: message.to,
      chatJid: message.chatJid || (message.fromMe ? message.to : message.from),
      timestamp: message.timestamp || Date.now(),
      status: message.status || 'received',
      ...content
    };
    
    return formattedMessage;
  }
}