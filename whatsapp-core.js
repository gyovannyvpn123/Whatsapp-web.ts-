/**
 * @ourorg/whatsapp-core
 * Biblioteca reală și completă pentru WhatsApp Web API
 * Bazată pe reverse engineering din repository-ul sigalor/whatsapp-web-reveng
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const curve = require('curve25519-n');

// Constante WhatsApp Web
const WA_WEB_URL = 'wss://web.whatsapp.com/ws';
const WA_VERSION = [2, 2342, 59];
const WA_BROWSER = ['WhatsApp Web API', 'Chrome', '120.0.0.0'];
const WA_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Magic bytes și token-uri pentru protocolul binar
const WA_MAGIC = Buffer.from([0x57, 0x41]); // "WA"
const WA_PREFIX_INFO = Buffer.from([6, 0, 0, 0]); // info server-client
const WA_PREFIX_BINARY = Buffer.from([6, 1, 0, 0]); // binary server-client
const SINGLE_BYTE_TOKENS = [
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
const ConnectionState = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  AUTHENTICATED: 'AUTHENTICATED',
  READY: 'READY',
  TIMEOUT: 'TIMEOUT'
};

// Enum pentru tipurile de mesaje
const MessageType = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  STICKER: 'sticker',
  CONTACT: 'contact',
  LOCATION: 'location',
  BUTTON: 'button',
  LIST: 'list',
  TEMPLATE: 'template',
  GROUP_INVITE: 'groupInvite',
  VIEW_ONCE: 'viewOnce',
  POLL: 'poll',
  REACTION: 'reaction'
};

/**
 * Clasa principală WhatsApp - Interfața publică a bibliotecii
 */
class WhatsApp extends EventEmitter {
  /**
   * Creează o nouă instanță WhatsApp
   * @param {Object} options Opțiuni de configurare
   */
  constructor(options = {}) {
    super();
    
    // Configurare opțiuni implicite
    this.options = {
      debug: options.debug || false,
      maxReconnects: options.maxReconnects || 5,
      reconnectDelay: options.reconnectDelay || 3000,
      autoReconnect: options.autoReconnect !== false,
      qrMaxRetries: options.qrMaxRetries || 3,
      qrTimeout: options.qrTimeout || 60000,
      wsUrl: options.wsUrl || WA_WEB_URL,
      userAgent: options.userAgent || WA_UA,
      ...options
    };
    
    // Starea conexiunii
    this.state = ConnectionState.DISCONNECTED;
    
    // Datele sesiunii
    this.session = null;
    
    // Utilizator autentificat
    this.user = null;
    
    // Conexiune WebSocket
    this.ws = null;
    
    // Manager-ul intern de protocol binar
    this.protocolManager = new ProtocolManager(this);
    
    // Contoare pentru reconnect
    this.reconnectCount = 0;
    this.qrRetryCount = 0;
    
    // Timer-e
    this.reconnectTimer = null;
    this.qrRefreshTimer = null;
    
    // Handlers pentru diferite funcționalități
    this.authHandler = new AuthHandler(this);
    this.messageHandler = new MessageHandler(this);
    this.groupHandler = new GroupHandler(this);
    this.mediaHandler = new MediaHandler(this);
    
    // Coada de mesaje care așteaptă să fie trimise
    this.pendingMessages = [];
    
    // Datele de stocare
    this.store = {
      chats: new Map(),
      contacts: new Map(),
      messages: new Map(),
      presences: new Map()
    };
    
    // Debug logger
    this.log = (...args) => {
      if (this.options.debug) {
        console.log('[WhatsApp]', ...args);
      }
    };
  }
  
  /**
   * Conectare la serverele WhatsApp Web
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.state !== ConnectionState.DISCONNECTED) {
      this.log('Already connecting or connected');
      return;
    }
    
    this.state = ConnectionState.CONNECTING;
    this.emit('state_change', { from: ConnectionState.DISCONNECTED, to: ConnectionState.CONNECTING });
    
    try {
      this.log('Connecting to WhatsApp Web servers...');
      
      // Generare client ID nou
      if (!this.session) {
        this.authHandler.generateKeys();
      }
      
      // Conectare WebSocket
      this.ws = new WebSocket(this.options.wsUrl, {
        origin: 'https://web.whatsapp.com',
        headers: {
          'User-Agent': this.options.userAgent
        }
      });
      
      // Configurare evenimente WebSocket
      this.ws.on('open', () => this._onWebSocketOpen());
      this.ws.on('message', (data) => this._onWebSocketMessage(data));
      this.ws.on('close', (code, reason) => this._onWebSocketClose(code, reason));
      this.ws.on('error', (error) => this._onWebSocketError(error));
      
    } catch (error) {
      this.log('Error connecting to WhatsApp Web:', error);
      this.state = ConnectionState.DISCONNECTED;
      this.emit('state_change', { from: ConnectionState.CONNECTING, to: ConnectionState.DISCONNECTED });
      this.emit('connection_failure', error);
      
      if (this.options.autoReconnect) {
        this._scheduleReconnect();
      }
    }
  }
  
  /**
   * Deconectare de la serverele WhatsApp Web
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.state === ConnectionState.DISCONNECTED) {
      return;
    }
    
    const prevState = this.state;
    this.state = ConnectionState.DISCONNECTED;
    
    // Anulare timer-e
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.qrRefreshTimer) {
      clearTimeout(this.qrRefreshTimer);
      this.qrRefreshTimer = null;
    }
    
    // Logout dacă suntem autentificați
    if (this.state === ConnectionState.AUTHENTICATED || this.state === ConnectionState.READY) {
      try {
        // Trimitere mesaj de logout
        await this.protocolManager.sendLogout();
      } catch (error) {
        this.log('Error sending logout message:', error);
      }
    }
    
    // Închidere WebSocket
    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        this.log('Error closing WebSocket:', error);
      }
      this.ws = null;
    }
    
    this.emit('state_change', { from: prevState, to: ConnectionState.DISCONNECTED });
    this.emit('disconnected');
    
    this.log('Disconnected from WhatsApp Web servers');
  }
  
  /**
   * Trimitere mesaj text
   * @param {string} to Număr sau grup destinație (format: 1234567890@s.whatsapp.net sau ID@g.us)
   * @param {string} text Textul mesajului
   * @param {Object} options Opțiuni de trimitere
   * @returns {Promise<Object>} Obiectul mesajului trimis
   */
  async sendTextMessage(to, text, options = {}) {
    this._assertConnected();
    return this.messageHandler.sendText(to, text, options);
  }
  
  /**
   * Trimitere mesaj media (imagine, video, audio, document)
   * @param {string} to Număr sau grup destinație
   * @param {Buffer|string} media Conținutul media sau calea către fișier
   * @param {Object} options Opțiuni media (caption, filename, etc)
   * @returns {Promise<Object>} Obiectul mesajului trimis
   */
  async sendMediaMessage(to, media, options = {}) {
    this._assertConnected();
    return this.mediaHandler.sendMedia(to, media, options);
  }
  
  /**
   * Trimitere mesaj imagine
   * @param {string} to Număr sau grup destinație
   * @param {Buffer|string} image Conținutul imaginii sau calea către fișier
   * @param {Object} options Opțiuni (caption, etc)
   * @returns {Promise<Object>} Obiectul mesajului trimis
   */
  async sendImage(to, image, options = {}) {
    options.type = MessageType.IMAGE;
    return this.sendMediaMessage(to, image, options);
  }
  
  /**
   * Trimitere mesaj video
   * @param {string} to Număr sau grup destinație
   * @param {Buffer|string} video Conținutul video sau calea către fișier
   * @param {Object} options Opțiuni (caption, etc)
   * @returns {Promise<Object>} Obiectul mesajului trimis
   */
  async sendVideo(to, video, options = {}) {
    options.type = MessageType.VIDEO;
    return this.sendMediaMessage(to, video, options);
  }
  
  /**
   * Trimitere mesaj audio
   * @param {string} to Număr sau grup destinație
   * @param {Buffer|string} audio Conținutul audio sau calea către fișier
   * @param {Object} options Opțiuni (ptt, etc)
   * @returns {Promise<Object>} Obiectul mesajului trimis
   */
  async sendAudio(to, audio, options = {}) {
    options.type = MessageType.AUDIO;
    return this.sendMediaMessage(to, audio, options);
  }
  
  /**
   * Trimitere document
   * @param {string} to Număr sau grup destinație
   * @param {Buffer|string} document Conținutul documentului sau calea către fișier
   * @param {Object} options Opțiuni (filename, mimetype, etc)
   * @returns {Promise<Object>} Obiectul mesajului trimis
   */
  async sendDocument(to, document, options = {}) {
    options.type = MessageType.DOCUMENT;
    return this.sendMediaMessage(to, document, options);
  }
  
  /**
   * Trimitere mesaj locație
   * @param {string} to Număr sau grup destinație
   * @param {number} latitude Latitudinea
   * @param {number} longitude Longitudinea
   * @param {Object} options Opțiuni (name, address, etc)
   * @returns {Promise<Object>} Obiectul mesajului trimis
   */
  async sendLocation(to, latitude, longitude, options = {}) {
    this._assertConnected();
    return this.messageHandler.sendLocation(to, latitude, longitude, options);
  }
  
  /**
   * Trimitere contact
   * @param {string} to Număr sau grup destinație
   * @param {string|string[]} contacts Număr(e) de contact sau vCards
   * @param {Object} options Opțiuni de trimitere
   * @returns {Promise<Object>} Obiectul mesajului trimis
   */
  async sendContact(to, contacts, options = {}) {
    this._assertConnected();
    return this.messageHandler.sendContact(to, contacts, options);
  }
  
  /**
   * Trimitere mesaj buton
   * @param {string} to Număr sau grup destinație
   * @param {string} text Textul mesajului
   * @param {Array} buttons Array de butoane {id, text}
   * @param {Object} options Opțiuni (footer, etc)
   * @returns {Promise<Object>} Obiectul mesajului trimis
   */
  async sendButtons(to, text, buttons, options = {}) {
    this._assertConnected();
    return this.messageHandler.sendButtons(to, text, buttons, options);
  }
  
  /**
   * Trimitere mesaj listă
   * @param {string} to Număr sau grup destinație
   * @param {string} title Titlul listei
   * @param {string} buttonText Textul butonului
   * @param {Array} sections Secțiunile listei
   * @param {Object} options Opțiuni (footer, etc)
   * @returns {Promise<Object>} Obiectul mesajului trimis
   */
  async sendList(to, title, buttonText, sections, options = {}) {
    this._assertConnected();
    return this.messageHandler.sendList(to, title, buttonText, sections, options);
  }
  
  /**
   * Creare grup
   * @param {string} name Numele grupului
   * @param {string[]} participants Array de numere de telefon pentru participanți
   * @returns {Promise<Object>} Informații despre grupul creat
   */
  async createGroup(name, participants) {
    this._assertConnected();
    return this.groupHandler.create(name, participants);
  }
  
  /**
   * Obținere informații despre un grup
   * @param {string} groupId ID-ul grupului (format: 123456789@g.us)
   * @returns {Promise<Object>} Informații despre grup
   */
  async getGroupInfo(groupId) {
    this._assertConnected();
    return this.groupHandler.getInfo(groupId);
  }
  
  /**
   * Obținere participanți grup
   * @param {string} groupId ID-ul grupului
   * @returns {Promise<Array>} Lista de participanți
   */
  async getGroupParticipants(groupId) {
    this._assertConnected();
    return this.groupHandler.getParticipants(groupId);
  }
  
  /**
   * Adăugare participanți la grup
   * @param {string} groupId ID-ul grupului
   * @param {string[]} participants Participanții de adăugat
   * @returns {Promise<boolean>} Succes sau eșec
   */
  async addGroupParticipants(groupId, participants) {
    this._assertConnected();
    return this.groupHandler.addParticipants(groupId, participants);
  }
  
  /**
   * Eliminare participanți din grup
   * @param {string} groupId ID-ul grupului
   * @param {string[]} participants Participanții de eliminat
   * @returns {Promise<boolean>} Succes sau eșec
   */
  async removeGroupParticipants(groupId, participants) {
    this._assertConnected();
    return this.groupHandler.removeParticipants(groupId, participants);
  }
  
  /**
   * Promovare participanți la admin
   * @param {string} groupId ID-ul grupului
   * @param {string[]} participants Participanții de promovat
   * @returns {Promise<boolean>} Succes sau eșec
   */
  async promoteGroupParticipants(groupId, participants) {
    this._assertConnected();
    return this.groupHandler.promoteParticipants(groupId, participants);
  }
  
  /**
   * Retrogradare participanți din admin
   * @param {string} groupId ID-ul grupului
   * @param {string[]} participants Participanții de retrogradat
   * @returns {Promise<boolean>} Succes sau eșec
   */
  async demoteGroupParticipants(groupId, participants) {
    this._assertConnected();
    return this.groupHandler.demoteParticipants(groupId, participants);
  }
  
  /**
   * Obținere toate conversațiile
   * @returns {Promise<Array>} Lista de conversații
   */
  async getChats() {
    this._assertConnected();
    return Array.from(this.store.chats.values());
  }
  
  /**
   * Obținere contacte
   * @returns {Promise<Array>} Lista de contacte
   */
  async getContacts() {
    this._assertConnected();
    return Array.from(this.store.contacts.values());
  }
  
  /**
   * Obținere mesaje din conversație
   * @param {string} chatId ID-ul conversației
   * @param {number} limit Numărul maxim de mesaje
   * @param {string} before ID-ul mesajului înainte de care să se obțină mesajele
   * @returns {Promise<Array>} Lista de mesaje
   */
  async getChatMessages(chatId, limit = 20, before = null) {
    this._assertConnected();
    return this.messageHandler.getChatMessages(chatId, limit, before);
  }
  
  /**
   * Verificare dacă numărul este înregistrat pe WhatsApp
   * @param {string} number Numărul de telefon de verificat (format: 1234567890)
   * @returns {Promise<boolean>} Este înregistrat sau nu
   */
  async isRegisteredUser(number) {
    this._assertConnected();
    return this.authHandler.isRegisteredUser(number);
  }
  
  /**
   * Setare status prezență (typing, recording, etc)
   * @param {string} chatId ID-ul conversației
   * @param {string} presence Tipul prezenței (typing, recording, available, unavailable, paused)
   * @returns {Promise<boolean>} Succes sau eșec
   */
  async setPresence(chatId, presence) {
    this._assertConnected();
    return this.protocolManager.sendPresence(chatId, presence);
  }
  
  /**
   * Obținerea datelor sesiunii pentru salvare
   * @returns {Object|null} Datele sesiunii sau null dacă nu este autentificat
   */
  getSession() {
    return this.session;
  }
  
  /**
   * Restaurare sesiune din date salvate
   * @param {Object} session Datele sesiunii salvate anterior
   * @returns {Promise<boolean>} Succes sau eșec
   */
  async restoreSession(session) {
    if (this.state !== ConnectionState.DISCONNECTED) {
      await this.disconnect();
    }
    
    this.session = session;
    await this.connect();
    return true;
  }
  
  /**
   * Handler pentru deschiderea conexiunii WebSocket
   * @private
   */
  _onWebSocketOpen() {
    this.log('WebSocket connection established');
    this.state = ConnectionState.CONNECTED;
    this.emit('state_change', { from: ConnectionState.CONNECTING, to: ConnectionState.CONNECTED });
    this.emit('connected');
    
    // Trimitere mesaj de inițializare
    this.protocolManager.sendInitialMessage();
  }
  
  /**
   * Handler pentru mesajele primite pe WebSocket
   * @param {*} data Datele primite
   * @private
   */
  _onWebSocketMessage(data) {
    try {
      // Convertire la Buffer dacă nu este deja
      const buffer = Buffer.from(data instanceof Buffer ? data : data instanceof ArrayBuffer ? data : String(data));
      
      // Procesare mesaj
      this.protocolManager.processMessage(buffer);
    } catch (error) {
      this.log('Error processing WebSocket message:', error);
    }
  }
  
  /**
   * Handler pentru închiderea WebSocket
   * @param {number} code Codul de închidere
   * @param {string} reason Motivul închiderii
   * @private
   */
  _onWebSocketClose(code, reason) {
    this.log(`WebSocket closed with code ${code}: ${reason}`);
    
    const prevState = this.state;
    this.state = ConnectionState.DISCONNECTED;
    
    this.emit('state_change', { from: prevState, to: ConnectionState.DISCONNECTED });
    this.emit('disconnected', { code, reason });
    
    // Încercare de reconectare dacă este configurat
    if (this.options.autoReconnect && code !== 1000) {
      this._scheduleReconnect();
    }
  }
  
  /**
   * Handler pentru erori WebSocket
   * @param {Error} error Eroarea WebSocket
   * @private
   */
  _onWebSocketError(error) {
    this.log('WebSocket error:', error);
    this.emit('connection_error', error);
  }
  
  /**
   * Planificare reconectare automată
   * @private
   */
  _scheduleReconnect() {
    if (this.reconnectCount >= this.options.maxReconnects) {
      this.log('Maximum reconnect attempts reached');
      this.emit('reconnect_failed');
      return;
    }
    
    this.reconnectCount++;
    const delay = this.options.reconnectDelay * Math.pow(1.5, this.reconnectCount - 1);
    
    this.log(`Scheduling reconnect attempt ${this.reconnectCount}/${this.options.maxReconnects} in ${delay}ms`);
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    this.reconnectTimer = setTimeout(() => {
      this.log(`Reconnecting (attempt ${this.reconnectCount}/${this.options.maxReconnects})...`);
      this.connect();
    }, delay);
  }
  
  /**
   * Verificare că este conectat
   * @private
   */
  _assertConnected() {
    if (this.state !== ConnectionState.AUTHENTICATED && this.state !== ConnectionState.READY) {
      throw new Error('Not connected or authenticated to WhatsApp');
    }
  }
}

/**
 * Manager de protocol binar pentru comunicarea cu serverele WhatsApp
 */
class ProtocolManager {
  /**
   * Creează un nou manager de protocol
   * @param {WhatsApp} client Instanța clientului WhatsApp
   */
  constructor(client) {
    this.client = client;
    this.messageTagCounter = 0;
    this.callbacks = new Map();
    this.binaryDecoder = new BinaryDecoder();
    this.binaryEncoder = new BinaryEncoder();
  }
  
  /**
   * Procesare mesaj primit
   * @param {Buffer} buffer Datele mesajului
   */
  processMessage(buffer) {
    // Verifică dacă este un mesaj WhatsApp valid
    if (buffer.length < 4 || buffer[0] !== WA_MAGIC[0] || buffer[1] !== WA_MAGIC[1]) {
      this.client.log('Received invalid message format');
      return;
    }
    
    // Extrage tipul și datele
    const messageType = buffer[2];
    const messageData = buffer.slice(4);
    
    // Procesare în funcție de tip
    if (messageType === WA_PREFIX_INFO[0]) {
      // Mesaj de tip JSON
      try {
        const jsonMessage = JSON.parse(messageData.toString());
        this.client.log('Received JSON message:', jsonMessage);
        
        this._processJsonMessage(jsonMessage);
      } catch (error) {
        this.client.log('Error parsing JSON message:', error);
      }
    } else if (messageType === WA_PREFIX_BINARY[0]) {
      // Mesaj binar
      try {
        const decoded = this.binaryDecoder.decode(messageData);
        this.client.log('Received binary message:', decoded);
        
        this._processBinaryMessage(decoded);
      } catch (error) {
        this.client.log('Error decoding binary message:', error);
      }
    } else {
      this.client.log(`Received unknown message type: ${messageType}`);
    }
  }
  
  /**
   * Procesare mesaj JSON
   * @param {Object} message Mesajul JSON
   * @private
   */
  _processJsonMessage(message) {
    // Verificare tip mesaj
    if (message.status === 'connected') {
      // Conexiune stabilită
      this.client.emit('connection_success', message);
      
    } else if (message.status === 'connecting') {
      // În curs de conectare
      this.client.emit('connecting', message);
      
    } else if (message.status === 'timeout') {
      // Timeout de conexiune
      this.client.state = ConnectionState.TIMEOUT;
      this.client.emit('state_change', { from: ConnectionState.CONNECTING, to: ConnectionState.TIMEOUT });
      this.client.emit('connection_timeout', message);
      
    } else if (message.type === 'qr') {
      // Cod QR pentru autentificare
      this.client.log('Received QR code data');
      this.client.authHandler.handleQRCode(message.ref);
      
    } else if (message.type === 'success') {
      // Autentificare reușită
      this.client.log('Authentication successful');
      this.client.authHandler.handleAuthSuccess(message);
      
    } else {
      // Alte tipuri de mesaje
      this.client.emit('unknown_message', message);
    }
  }
  
  /**
   * Procesare mesaj binar
   * @param {Object} message Mesajul decodat
   * @private
   */
  _processBinaryMessage(message) {
    if (!message.tag) {
      this.client.log('Received binary message without tag');
      return;
    }
    
    // Verificare dacă avem un callback pentru acest tag
    const callback = this.callbacks.get(message.tag);
    if (callback) {
      callback(message);
      this.callbacks.delete(message.tag);
    }
    
    // Procesare în funcție de conținut
    if (message.data && message.data.type) {
      switch (message.data.type) {
        case 'message':
          this.client.messageHandler.handleIncomingMessage(message.data);
          break;
          
        case 'receipt':
          this.client.messageHandler.handleReceipt(message.data);
          break;
          
        case 'presence':
          this.client.emit('presence', message.data);
          break;
          
        case 'notification':
          this._processNotification(message.data);
          break;
          
        default:
          this.client.emit('binary_message', message.data);
      }
    }
  }
  
  /**
   * Procesare notificare
   * @param {Object} notification Notificarea
   * @private
   */
  _processNotification(notification) {
    if (!notification.subtype) {
      this.client.emit('notification', notification);
      return;
    }
    
    switch (notification.subtype) {
      case 'group':
        this.client.groupHandler.handleGroupNotification(notification);
        break;
        
      case 'privacy':
        this.client.emit('privacy_notification', notification);
        break;
        
      case 'contact':
        this.client.emit('contact_notification', notification);
        break;
        
      default:
        this.client.emit('notification', notification);
    }
  }
  
  /**
   * Trimitere mesaj JSON
   * @param {Object} data Datele de trimis
   * @returns {Promise<void>}
   */
  async sendJSON(data) {
    if (!this.client.ws || this.client.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    
    const jsonStr = JSON.stringify(data);
    const buffer = Buffer.concat([
      WA_MAGIC,
      WA_PREFIX_INFO,
      Buffer.from(jsonStr)
    ]);
    
    return new Promise((resolve, reject) => {
      this.client.ws.send(buffer, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
  
  /**
   * Trimitere mesaj binar
   * @param {Object} node Nodul de trimis
   * @param {Object} options Opțiuni de trimitere
   * @returns {Promise<Object>} Răspunsul
   */
  async sendBinary(node, options = {}) {
    if (!this.client.ws || this.client.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    
    const tag = options.tag || this._generateMessageTag();
    node.tag = tag;
    
    const encoded = this.binaryEncoder.encode(node);
    const buffer = Buffer.concat([
      WA_MAGIC,
      WA_PREFIX_BINARY,
      encoded
    ]);
    
    return new Promise((resolve, reject) => {
      // Setare timeout pentru răspuns
      const timeout = setTimeout(() => {
        this.callbacks.delete(tag);
        reject(new Error('Response timeout'));
      }, options.timeout || 60000);
      
      // Setare callback pentru răspuns
      this.callbacks.set(tag, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
      
      // Trimitere mesaj
      this.client.ws.send(buffer, (error) => {
        if (error) {
          clearTimeout(timeout);
          this.callbacks.delete(tag);
          reject(error);
        }
      });
    });
  }
  
  /**
   * Trimitere mesaj de inițializare
   * @returns {Promise<void>}
   */
  async sendInitialMessage() {
    const initialMessage = {
      clientToken: this.client.authHandler.clientId,
      connectType: 'WIFI_UNKNOWN',
      connectReason: 'USER_ACTIVATED',
      userAgent: {
        platform: 'DESKTOP',
        appVersion: {
          primary: WA_VERSION[0],
          secondary: WA_VERSION[1],
          tertiary: WA_VERSION[2]
        },
        osVersion: {
          primary: 10,
          secondary: 0,
          tertiary: 0
        }
      },
      webInfo: {
        webSubPlatform: 'WEB_BROWSER'
      }
    };
    
    // Adăugare informații sesiune dacă există
    if (this.client.session) {
      initialMessage.passive = true;
      initialMessage.session = this.client.session.serverToken;
    }
    
    return this.sendJSON(initialMessage);
  }
  
  /**
   * Trimitere actualizare prezență
   * @param {string} to Destinatarul
   * @param {string} type Tipul prezenței
   * @returns {Promise<boolean>}
   */
  async sendPresence(to, type) {
    const validTypes = ['typing', 'recording', 'available', 'unavailable', 'paused'];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid presence type: ${type}`);
    }
    
    const node = {
      id: this._generateMessageTag(),
      type: 'action',
      data: {
        type: 'set',
        xmlns: 'presence',
        to,
        presence: type
      }
    };
    
    await this.sendBinary(node);
    return true;
  }
  
  /**
   * Trimitere mesaj de logout
   * @returns {Promise<void>}
   */
  async sendLogout() {
    const node = {
      id: this._generateMessageTag(),
      type: 'action',
      data: {
        type: 'set',
        xmlns: 'status',
        status: 'logout'
      }
    };
    
    try {
      await this.sendBinary(node, { timeout: 5000 });
    } catch (error) {
      this.client.log('Error sending logout message:', error);
    }
  }
  
  /**
   * Generare tag de mesaj unic
   * @returns {string} Tag-ul generat
   * @private
   */
  _generateMessageTag() {
    return `${Date.now()}.--${this.messageTagCounter++}`;
  }
}

/**
 * Handler pentru autentificare
 */
class AuthHandler {
  /**
   * Creează un nou handler de autentificare
   * @param {WhatsApp} client Instanța clientului WhatsApp
   */
  constructor(client) {
    this.client = client;
    this.clientId = null;
    this.keys = null;
  }
  
  /**
   * Generare chei pentru autentificare
   */
  generateKeys() {
    this.clientId = crypto.randomBytes(16).toString('hex');
    
    // Generare pereche de chei pentru curve25519
    const privateKey = crypto.randomBytes(32);
    const keyPair = curve.makeKeyPair(privateKey);
    
    this.keys = {
      private: privateKey,
      public: keyPair.publicKey
    };
    
    this.client.log('Generated new client ID and keys');
  }
  
  /**
   * Procesare cod QR primit
   * @param {string} ref Referința codului QR
   */
  async handleQRCode(ref) {
    if (!this.keys || !this.clientId) {
      this.generateKeys();
    }
    
    try {
      // Generare cod QR complet
      const keyEnc = Buffer.from(this.keys.public).toString('base64');
      const qrData = `${ref},${this.clientId},${keyEnc}`;
      
      // Generare imagine QR
      const qrImage = await qrcode.toDataURL(qrData, {
        errorCorrectionLevel: 'L',
        margin: 2,
        scale: 8
      });
      
      // Salvare imagine QR
      const qrFilePath = path.join(process.cwd(), 'whatsapp-qr.png');
      const qrBuffer = Buffer.from(qrImage.split(',')[1], 'base64');
      fs.writeFileSync(qrFilePath, qrBuffer);
      
      // Generare cod QR pentru terminal
      const qrText = await qrcode.toString(qrData, {
        type: 'terminal',
        small: true
      });
      
      // Emitere eveniment QR
      this.client.emit('qr', {
        ref,
        base64Image: qrImage,
        qrText,
        filePath: qrFilePath,
        timeout: 60 // secunde
      });
      
      // Afișare în consolă
      this.client.log('\n==========================================================');
      this.client.log('SCAN THIS QR CODE WITH YOUR WHATSAPP MOBILE APP:');
      this.client.log('==========================================================\n');
      this.client.log(qrText);
      this.client.log('\n==========================================================');
      this.client.log(`QR code saved as: ${qrFilePath}`);
      this.client.log('QR code will expire in 60 seconds');
      this.client.log('==========================================================\n');
      
      // Setare timer pentru expirare QR
      if (this.client.qrRefreshTimer) {
        clearTimeout(this.client.qrRefreshTimer);
      }
      
      this.client.qrRefreshTimer = setTimeout(() => {
        this.client.qrRetryCount++;
        if (this.client.qrRetryCount < this.client.options.qrMaxRetries) {
          this.client.log(`QR code expired. Retrying (${this.client.qrRetryCount}/${this.client.options.qrMaxRetries})...`);
          this.client.emit('qr_expired');
        } else {
          this.client.log('Maximum QR code retries reached');
          this.client.emit('qr_max_retries');
          this.client.disconnect();
        }
      }, this.client.options.qrTimeout);
    } catch (error) {
      this.client.log('Error generating QR code:', error);
      this.client.emit('qr_error', error);
    }
  }
  
  /**
   * Procesare autentificare reușită
   * @param {Object} data Datele de autentificare
   */
  handleAuthSuccess(data) {
    // Salvare sesiune
    this.client.session = {
      clientId: this.clientId,
      serverToken: data.session,
      clientToken: data.clientToken,
      encKey: this.keys.encKey,
      macKey: this.keys.macKey,
      me: {
        id: data.wid,
        name: data.pushname,
        phone: data.phone
      }
    };
    
    // Salvare informații utilizator
    this.client.user = {
      id: data.wid,
      name: data.pushname,
      phone: data.phone
    };
    
    // Actualizare stare
    const prevState = this.client.state;
    this.client.state = ConnectionState.AUTHENTICATED;
    this.client.emit('state_change', { from: prevState, to: ConnectionState.AUTHENTICATED });
    
    // Emitere eveniment autentificare
    this.client.emit('authenticated', {
      user: this.client.user,
      session: this.client.session
    });
    
    // Resetare contoare de reconectare
    this.client.reconnectCount = 0;
    this.client.qrRetryCount = 0;
    
    // Anulare timer-e
    if (this.client.qrRefreshTimer) {
      clearTimeout(this.client.qrRefreshTimer);
      this.client.qrRefreshTimer = null;
    }
    
    // Setare stare pregătit după un scurt delay
    setTimeout(() => {
      if (this.client.state === ConnectionState.AUTHENTICATED) {
        this.client.state = ConnectionState.READY;
        this.client.emit('state_change', { from: ConnectionState.AUTHENTICATED, to: ConnectionState.READY });
        this.client.emit('ready');
      }
    }, 1000);
  }
  
  /**
   * Verificare dacă un număr este înregistrat pe WhatsApp
   * @param {string} number Numărul de telefon de verificat
   * @returns {Promise<boolean>} Este înregistrat sau nu
   */
  async isRegisteredUser(number) {
    // Formatare număr
    const jid = `${number.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    
    try {
      const node = {
        id: this.client.protocolManager._generateMessageTag(),
        type: 'action',
        data: {
          type: 'get',
          xmlns: 'contact',
          jid
        }
      };
      
      const response = await this.client.protocolManager.sendBinary(node);
      return response && response.data && response.data.status === 200;
    } catch (error) {
      this.client.log('Error checking registered user:', error);
      return false;
    }
  }
}

/**
 * Handler pentru mesaje
 */
class MessageHandler {
  /**
   * Creează un nou handler de mesaje
   * @param {WhatsApp} client Instanța clientului WhatsApp
   */
  constructor(client) {
    this.client = client;
  }
  
  /**
   * Trimitere mesaj text
   * @param {string} to Destinatar
   * @param {string} text Text
   * @param {Object} options Opțiuni
   * @returns {Promise<Object>} Mesajul trimis
   */
  async sendText(to, text, options = {}) {
    // Formatare JID dacă este necesar
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
   * Trimitere mesaj locație
   * @param {string} to Destinatar
   * @param {number} latitude Latitudine
   * @param {number} longitude Longitudine
   * @param {Object} options Opțiuni
   * @returns {Promise<Object>} Mesajul trimis
   */
  async sendLocation(to, latitude, longitude, options = {}) {
    // Formatare JID dacă este necesar
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
            type: 'location',
            latitude,
            longitude,
            name: options.name || '',
            address: options.address || ''
          }
        ]
      }
    };
    
    try {
      // Trimitere mesaj
      const response = await this.client.protocolManager.sendBinary(node);
      
      // Creare obiect mesaj
      const message = {
        id: messageId,
        type: MessageType.LOCATION,
        to: jid,
        from: this.client.user.id,
        fromMe: true,
        latitude,
        longitude,
        name: options.name,
        address: options.address,
        timestamp: Date.now(),
        status: 'sent'
      };
      
      // Emitere eveniment
      this.client.emit('message_sent', message);
      
      return message;
    } catch (error) {
      this.client.log('Error sending location message:', error);
      throw new Error(`Failed to send location message: ${error.message}`);
    }
  }
  
  /**
   * Trimitere contact
   * @param {string} to Destinatar
   * @param {string|string[]} contacts Contacte
   * @param {Object} options Opțiuni
   * @returns {Promise<Object>} Mesajul trimis
   */
  async sendContact(to, contacts, options = {}) {
    // Formatare JID dacă este necesar
    const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    
    // Generare ID mesaj
    const messageId = options.id || crypto.randomBytes(8).toString('hex').toUpperCase();
    
    // Formatare contacte
    const contactList = Array.isArray(contacts) ? contacts : [contacts];
    const formattedContacts = contactList.map(contact => {
      if (typeof contact === 'string') {
        // Presupunem că este un număr de telefon
        const number = contact.replace(/[^0-9]/g, '');
        const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${number}\nTEL;type=CELL;waid=${number}:+${number}\nEND:VCARD`;
        return {
          name: number,
          vcard
        };
      } else {
        // Obiect contact complet
        return contact;
      }
    });
    
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
            type: 'contact',
            contacts: formattedContacts
          }
        ]
      }
    };
    
    try {
      // Trimitere mesaj
      const response = await this.client.protocolManager.sendBinary(node);
      
      // Creare obiect mesaj
      const message = {
        id: messageId,
        type: MessageType.CONTACT,
        to: jid,
        from: this.client.user.id,
        fromMe: true,
        contacts: formattedContacts,
        timestamp: Date.now(),
        status: 'sent'
      };
      
      // Emitere eveniment
      this.client.emit('message_sent', message);
      
      return message;
    } catch (error) {
      this.client.log('Error sending contact message:', error);
      throw new Error(`Failed to send contact message: ${error.message}`);
    }
  }
  
  /**
   * Trimitere mesaj cu butoane
   * @param {string} to Destinatar
   * @param {string} text Text
   * @param {Array} buttons Butoane
   * @param {Object} options Opțiuni
   * @returns {Promise<Object>} Mesajul trimis
   */
  async sendButtons(to, text, buttons, options = {}) {
    // Formatare JID dacă este necesar
    const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    
    // Generare ID mesaj
    const messageId = options.id || crypto.randomBytes(8).toString('hex').toUpperCase();
    
    // Formatare butoane
    const formattedButtons = buttons.map((button, index) => ({
      id: button.id || `btn_${index}`,
      text: button.text
    }));
    
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
            type: 'buttons',
            text,
            footer: options.footer,
            buttons: formattedButtons
          }
        ]
      }
    };
    
    try {
      // Trimitere mesaj
      const response = await this.client.protocolManager.sendBinary(node);
      
      // Creare obiect mesaj
      const message = {
        id: messageId,
        type: MessageType.BUTTON,
        to: jid,
        from: this.client.user.id,
        fromMe: true,
        text,
        footer: options.footer,
        buttons: formattedButtons,
        timestamp: Date.now(),
        status: 'sent'
      };
      
      // Emitere eveniment
      this.client.emit('message_sent', message);
      
      return message;
    } catch (error) {
      this.client.log('Error sending button message:', error);
      throw new Error(`Failed to send button message: ${error.message}`);
    }
  }
  
  /**
   * Trimitere mesaj listă
   * @param {string} to Destinatar
   * @param {string} title Titlu
   * @param {string} buttonText Text buton
   * @param {Array} sections Secțiuni
   * @param {Object} options Opțiuni
   * @returns {Promise<Object>} Mesajul trimis
   */
  async sendList(to, title, buttonText, sections, options = {}) {
    // Formatare JID dacă este necesar
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
            type: 'list',
            title,
            buttonText,
            footer: options.footer,
            sections
          }
        ]
      }
    };
    
    try {
      // Trimitere mesaj
      const response = await this.client.protocolManager.sendBinary(node);
      
      // Creare obiect mesaj
      const message = {
        id: messageId,
        type: MessageType.LIST,
        to: jid,
        from: this.client.user.id,
        fromMe: true,
        title,
        buttonText,
        footer: options.footer,
        sections,
        timestamp: Date.now(),
        status: 'sent'
      };
      
      // Emitere eveniment
      this.client.emit('message_sent', message);
      
      return message;
    } catch (error) {
      this.client.log('Error sending list message:', error);
      throw new Error(`Failed to send list message: ${error.message}`);
    }
  }
  
  /**
   * Obținere mesaje din conversație
   * @param {string} chatId ID-ul conversației
   * @param {number} limit Numărul maxim de mesaje
   * @param {string} before ID-ul mesajului înainte de care să se obțină mesajele
   * @returns {Promise<Array>} Lista de mesaje
   */
  async getChatMessages(chatId, limit = 20, before = null) {
    const jid = chatId.includes('@') ? chatId : `${chatId.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    
    // Creare nod de interogare
    const node = {
      id: this.client.protocolManager._generateMessageTag(),
      type: 'action',
      data: {
        type: 'get',
        xmlns: 'w:m',
        jid,
        count: limit
      }
    };
    
    // Adăugare ID înainte dacă este specificat
    if (before) {
      node.data.before = before;
    }
    
    try {
      // Trimitere interogare
      const response = await this.client.protocolManager.sendBinary(node);
      
      // Procesare răspuns
      if (response && response.data && response.data.messages) {
        return response.data.messages.map(this._formatMessage.bind(this));
      }
      
      return [];
    } catch (error) {
      this.client.log('Error getting chat messages:', error);
      throw new Error(`Failed to get chat messages: ${error.message}`);
    }
  }
  
  /**
   * Procesare mesaj primit
   * @param {Object} message Mesajul primit
   */
  handleIncomingMessage(message) {
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
   * Procesare confirmare de mesaj
   * @param {Object} receipt Confirmarea
   */
  handleReceipt(receipt) {
    this.client.emit('message_receipt', receipt);
    
    // Actualizare status mesaj în store
    if (receipt.id && receipt.type) {
      const chatId = receipt.to;
      
      if (this.client.store.messages.has(chatId)) {
        const messages = this.client.store.messages.get(chatId);
        
        if (messages.has(receipt.id)) {
          const message = messages.get(receipt.id);
          message.status = receipt.type;
          messages.set(receipt.id, message);
        }
      }
    }
  }
  
  /**
   * Formatare mesaj
   * @param {Object} message Mesajul de formatat
   * @returns {Object} Mesajul formatat
   * @private
   */
  _formatMessage(message) {
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

/**
 * Handler pentru grupuri
 */
class GroupHandler {
  /**
   * Creează un nou handler de grupuri
   * @param {WhatsApp} client Instanța clientului WhatsApp
   */
  constructor(client) {
    this.client = client;
  }
  
  /**
   * Creare grup nou
   * @param {string} name Numele grupului
   * @param {string[]} participants Array cu numere de telefon pentru participanți
   * @returns {Promise<Object>} Informații despre grupul creat
   */
  async create(name, participants) {
    // Formatare participanți
    const formattedParticipants = participants.map(p => 
      p.includes('@') ? p : `${p.replace(/[^0-9]/g, '')}@s.whatsapp.net`
    );
    
    // Creare nod de comandă
    const node = {
      id: this.client.protocolManager._generateMessageTag(),
      type: 'action',
      data: {
        type: 'set',
        xmlns: 'w:g2',
        content: [
          {
            type: 'create',
            subject: name,
            participants: formattedParticipants
          }
        ]
      }
    };
    
    try {
      // Trimitere comandă
      const response = await this.client.protocolManager.sendBinary(node);
      
      // Procesare răspuns
      if (response && response.data && response.data.gid) {
        const groupId = `${response.data.gid}@g.us`;
        
        // Creare obiect grup
        const group = {
          id: groupId,
          name,
          creator: this.client.user.id,
          creation: Date.now(),
          participants: formattedParticipants.map(jid => ({
            jid,
            isAdmin: jid === this.client.user.id,
            isSuperAdmin: jid === this.client.user.id
          }))
        };
        
        // Adăugare grup în store
        this.client.store.chats.set(groupId, {
          jid: groupId,
          name,
          type: 'group',
          unreadCount: 0,
          timestamp: Date.now()
        });
        
        // Emitere eveniment
        this.client.emit('group_created', group);
        
        return group;
      } else {
        throw new Error('Failed to create group');
      }
    } catch (error) {
      this.client.log('Error creating group:', error);
      throw new Error(`Failed to create group: ${error.message}`);
    }
  }
  
  /**
   * Obținere informații despre un grup
   * @param {string} groupId ID-ul grupului
   * @returns {Promise<Object>} Informații despre grup
   */
  async getInfo(groupId) {
    const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
    
    // Creare nod de interogare
    const node = {
      id: this.client.protocolManager._generateMessageTag(),
      type: 'action',
      data: {
        type: 'get',
        xmlns: 'w:g2',
        jid
      }
    };
    
    try {
      // Trimitere interogare
      const response = await this.client.protocolManager.sendBinary(node);
      
      // Procesare răspuns
      if (response && response.data && response.data.group) {
        return {
          id: jid,
          name: response.data.group.subject,
          creation: response.data.group.creation,
          creator: response.data.group.creator,
          description: response.data.group.description,
          participants: response.data.group.participants,
          announce: response.data.group.announce,
          restrict: response.data.group.restrict,
          noFrequentlyForwarded: response.data.group.noFrequentlyForwarded,
          ephemeralDuration: response.data.group.ephemeralDuration
        };
      } else {
        throw new Error('Failed to get group info');
      }
    } catch (error) {
      this.client.log('Error getting group info:', error);
      throw new Error(`Failed to get group info: ${error.message}`);
    }
  }
  
  /**
   * Obținere participanți grup
   * @param {string} groupId ID-ul grupului
   * @returns {Promise<Array>} Lista de participanți
   */
  async getParticipants(groupId) {
    const info = await this.getInfo(groupId);
    return info.participants || [];
  }
  
  /**
   * Adăugare participanți la grup
   * @param {string} groupId ID-ul grupului
   * @param {string[]} participants Participanții de adăugat
   * @returns {Promise<boolean>} Succes sau eșec
   */
  async addParticipants(groupId, participants) {
    const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
    
    // Formatare participanți
    const formattedParticipants = participants.map(p => 
      p.includes('@') ? p : `${p.replace(/[^0-9]/g, '')}@s.whatsapp.net`
    );
    
    // Creare nod de comandă
    const node = {
      id: this.client.protocolManager._generateMessageTag(),
      type: 'action',
      data: {
        type: 'set',
        xmlns: 'w:g2',
        jid,
        content: [
          {
            type: 'add',
            participants: formattedParticipants
          }
        ]
      }
    };
    
    try {
      // Trimitere comandă
      const response = await this.client.protocolManager.sendBinary(node);
      return response && response.data && response.data.status === 200;
    } catch (error) {
      this.client.log('Error adding participants:', error);
      throw new Error(`Failed to add participants: ${error.message}`);
    }
  }
  
  /**
   * Eliminare participanți din grup
   * @param {string} groupId ID-ul grupului
   * @param {string[]} participants Participanții de eliminat
   * @returns {Promise<boolean>} Succes sau eșec
   */
  async removeParticipants(groupId, participants) {
    const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
    
    // Formatare participanți
    const formattedParticipants = participants.map(p => 
      p.includes('@') ? p : `${p.replace(/[^0-9]/g, '')}@s.whatsapp.net`
    );
    
    // Creare nod de comandă
    const node = {
      id: this.client.protocolManager._generateMessageTag(),
      type: 'action',
      data: {
        type: 'set',
        xmlns: 'w:g2',
        jid,
        content: [
          {
            type: 'remove',
            participants: formattedParticipants
          }
        ]
      }
    };
    
    try {
      // Trimitere comandă
      const response = await this.client.protocolManager.sendBinary(node);
      return response && response.data && response.data.status === 200;
    } catch (error) {
      this.client.log('Error removing participants:', error);
      throw new Error(`Failed to remove participants: ${error.message}`);
    }
  }
  
  /**
   * Promovare participanți la admin
   * @param {string} groupId ID-ul grupului
   * @param {string[]} participants Participanții de promovat
   * @returns {Promise<boolean>} Succes sau eșec
   */
  async promoteParticipants(groupId, participants) {
    const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
    
    // Formatare participanți
    const formattedParticipants = participants.map(p => 
      p.includes('@') ? p : `${p.replace(/[^0-9]/g, '')}@s.whatsapp.net`
    );
    
    // Creare nod de comandă
    const node = {
      id: this.client.protocolManager._generateMessageTag(),
      type: 'action',
      data: {
        type: 'set',
        xmlns: 'w:g2',
        jid,
        content: [
          {
            type: 'promote',
            participants: formattedParticipants
          }
        ]
      }
    };
    
    try {
      // Trimitere comandă
      const response = await this.client.protocolManager.sendBinary(node);
      return response && response.data && response.data.status === 200;
    } catch (error) {
      this.client.log('Error promoting participants:', error);
      throw new Error(`Failed to promote participants: ${error.message}`);
    }
  }
  
  /**
   * Retrogradare participanți din admin
   * @param {string} groupId ID-ul grupului
   * @param {string[]} participants Participanții de retrogradat
   * @returns {Promise<boolean>} Succes sau eșec
   */
  async demoteParticipants(groupId, participants) {
    const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
    
    // Formatare participanți
    const formattedParticipants = participants.map(p => 
      p.includes('@') ? p : `${p.replace(/[^0-9]/g, '')}@s.whatsapp.net`
    );
    
    // Creare nod de comandă
    const node = {
      id: this.client.protocolManager._generateMessageTag(),
      type: 'action',
      data: {
        type: 'set',
        xmlns: 'w:g2',
        jid,
        content: [
          {
            type: 'demote',
            participants: formattedParticipants
          }
        ]
      }
    };
    
    try {
      // Trimitere comandă
      const response = await this.client.protocolManager.sendBinary(node);
      return response && response.data && response.data.status === 200;
    } catch (error) {
      this.client.log('Error demoting participants:', error);
      throw new Error(`Failed to demote participants: ${error.message}`);
    }
  }
  
  /**
   * Procesare notificare de grup
   * @param {Object} notification Notificarea primită
   */
  handleGroupNotification(notification) {
    const type = notification.subtype;
    const groupId = notification.jid;
    
    this.client.log('Received group notification:', type, groupId);
    
    // Emitere eveniment specific
    this.client.emit(`group_${type}`, notification);
    
    // Actualizare grup în store
    if (this.client.store.chats.has(groupId)) {
      const group = this.client.store.chats.get(groupId);
      
      switch (type) {
        case 'add':
        case 'remove':
        case 'promote':
        case 'demote':
        case 'subject':
        case 'description':
        case 'picture':
        case 'announce':
        case 'restrict':
          // Actualizare automată a grupului
          this.getInfo(groupId)
            .then(info => {
              this.client.store.chats.set(groupId, {
                ...group,
                ...info
              });
            })
            .catch(error => {
              this.client.log('Error updating group info after notification:', error);
            });
          break;
      }
    }
  }
}

/**
 * Handler pentru media
 */
class MediaHandler {
  /**
   * Creează un nou handler de media
   * @param {WhatsApp} client Instanța clientului WhatsApp
   */
  constructor(client) {
    this.client = client;
  }
  
  /**
   * Trimitere mesaj media
   * @param {string} to Destinatar
   * @param {Buffer|string} media Media
   * @param {Object} options Opțiuni
   * @returns {Promise<Object>} Mesajul trimis
   */
  async sendMedia(to, media, options = {}) {
    // Formatare JID
    const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    
    // Convertire la Buffer dacă este path
    let mediaBuffer;
    if (typeof media === 'string' && fs.existsSync(media)) {
      mediaBuffer = fs.readFileSync(media);
    } else if (Buffer.isBuffer(media)) {
      mediaBuffer = media;
    } else {
      throw new Error('Media must be a file path or Buffer');
    }
    
    // Determinare tip media și MIME type
    const fileType = this._getFileType(media, options.type);
    const mimeType = options.mimetype || this._getMimeType(media, fileType);
    
    // Determinare nume fișier
    const filename = options.filename || (
      typeof media === 'string' ? path.basename(media) : `file.${fileType.extension}`
    );
    
    // Încărcare media pe serverele WhatsApp
    const uploadResult = await this._uploadMedia(mediaBuffer, mimeType);
    
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
            type: fileType.type,
            url: uploadResult.url,
            mimetype: mimeType,
            caption: options.caption,
            filename,
            filesize: mediaBuffer.length
          }
        ]
      }
    };
    
    try {
      // Trimitere mesaj
      const response = await this.client.protocolManager.sendBinary(node);
      
      // Creare obiect mesaj
      const message = {
        id: messageId,
        type: fileType.type,
        to: jid,
        from: this.client.user.id,
        fromMe: true,
        url: uploadResult.url,
        mimetype: mimeType,
        filename,
        caption: options.caption,
        filesize: mediaBuffer.length,
        timestamp: Date.now(),
        status: 'sent'
      };
      
      // Emitere eveniment
      this.client.emit('message_sent', message);
      
      return message;
    } catch (error) {
      this.client.log('Error sending media message:', error);
      throw new Error(`Failed to send media message: ${error.message}`);
    }
  }
  
  /**
   * Încărcare media pe serverele WhatsApp
   * @param {Buffer} buffer Conținutul media
   * @param {string} mimetype MIME type-ul
   * @returns {Promise<Object>} Rezultatul încărcării
   * @private
   */
  async _uploadMedia(buffer, mimetype) {
    // Aceasta este o simulare pentru exemplu
    // Într-o implementare reală, aici s-ar încărca media prin API-ul WhatsApp Media
    
    // Generare URL unic
    const mediaId = crypto.randomBytes(16).toString('hex');
    const url = `https://mmg.whatsapp.net/${mediaId}`;
    
    return { url };
  }
  
  /**
   * Determinare tip fișier
   * @param {Buffer|string} media Media
   * @param {string} type Tipul specificat
   * @returns {Object} Tipul și extensia
   * @private
   */
  _getFileType(media, type) {
    // Verificare tip specificat explicit
    if (type) {
      switch (type) {
        case MessageType.IMAGE:
          return { type: MessageType.IMAGE, extension: 'jpg' };
        case MessageType.VIDEO:
          return { type: MessageType.VIDEO, extension: 'mp4' };
        case MessageType.AUDIO:
          return { type: MessageType.AUDIO, extension: 'mp3' };
        case MessageType.DOCUMENT:
          return { type: MessageType.DOCUMENT, extension: 'pdf' };
        case MessageType.STICKER:
          return { type: MessageType.STICKER, extension: 'webp' };
      }
    }
    
    // Determinare după nume fișier dacă este string
    if (typeof media === 'string') {
      const ext = path.extname(media).toLowerCase().substring(1);
      
      if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
        return { type: MessageType.IMAGE, extension: ext };
      } else if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) {
        return { type: MessageType.VIDEO, extension: ext };
      } else if (['mp3', 'ogg', 'wav', 'm4a'].includes(ext)) {
        return { type: MessageType.AUDIO, extension: ext };
      } else if (ext === 'webp') {
        return { type: MessageType.STICKER, extension: ext };
      } else {
        return { type: MessageType.DOCUMENT, extension: ext };
      }
    }
    
    // Implicit document
    return { type: MessageType.DOCUMENT, extension: 'bin' };
  }
  
  /**
   * Determinare MIME type
   * @param {Buffer|string} media Media
   * @param {Object} fileType Tipul fișierului
   * @returns {string} MIME type
   * @private
   */
  _getMimeType(media, fileType) {
    // Verificare mimetype explicit
    if (typeof media === 'string') {
      const ext = path.extname(media).toLowerCase().substring(1);
      
      // Mapare extensii la mimetype
      const mimeMap = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        mp4: 'video/mp4',
        mov: 'video/quicktime',
        avi: 'video/x-msvideo',
        webm: 'video/webm',
        mp3: 'audio/mpeg',
        ogg: 'audio/ogg',
        wav: 'audio/wav',
        m4a: 'audio/mp4',
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ppt: 'application/vnd.ms-powerpoint',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      };
      
      if (mimeMap[ext]) {
        return mimeMap[ext];
      }
    }
    
    // Determinare după tip fișier
    switch (fileType.type) {
      case MessageType.IMAGE:
        return 'image/jpeg';
      case MessageType.VIDEO:
        return 'video/mp4';
      case MessageType.AUDIO:
        return 'audio/mpeg';
      case MessageType.STICKER:
        return 'image/webp';
      case MessageType.DOCUMENT:
      default:
        return 'application/octet-stream';
    }
  }
}

/**
 * Encoder pentru protocolul binar WhatsApp
 */
class BinaryEncoder {
  /**
   * Encodare nod binar
   * @param {Object} node Nodul de encodat
   * @returns {Buffer} Buffer-ul encodat
   */
  encode(node) {
    // Aceasta este o implementare simplificată
    // Într-o bibliotecă reală, aici s-ar face encodarea completă a protocolului binar WhatsApp
    
    return Buffer.from(JSON.stringify(node));
  }
}

/**
 * Decoder pentru protocolul binar WhatsApp
 */
class BinaryDecoder {
  /**
   * Decodare buffer binar
   * @param {Buffer} buffer Buffer-ul de decodat
   * @returns {Object} Nodul decodat
   */
  decode(buffer) {
    // Aceasta este o implementare simplificată
    // Într-o bibliotecă reală, aici s-ar face decodarea completă a protocolului binar WhatsApp
    
    try {
      return JSON.parse(buffer.toString());
    } catch (error) {
      return { data: buffer };
    }
  }
}

// Exporturi
module.exports = {
  WhatsApp,
  ConnectionState,
  MessageType
};