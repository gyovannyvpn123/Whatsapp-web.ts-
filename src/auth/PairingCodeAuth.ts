/**
 * Autentificare prin cod de asociere pentru WhatsApp Web
 */

import * as crypto from 'crypto';
import * as curve from 'curve25519-n';

export class PairingCodeAuth {
  private client: any;
  private clientId: string | null = null;
  private keys: any = null;
  
  constructor(client: any) {
    this.client = client;
  }
  
  /**
   * Generare chei pentru autentificare
   */
  public generateKeys(): void {
    this.clientId = crypto.randomBytes(16).toString('hex');
    
    // Generare pereche de chei pentru curve25519
    const privateKey = crypto.randomBytes(32);
    const keyPair = curve.makeKeyPair(privateKey);
    
    this.keys = {
      private: privateKey,
      public: keyPair.publicKey
    };
    
    this.client.log('Generated new client ID and keys for pairing code authentication');
  }
  
  /**
   * Solicită un cod de asociere pentru autentificare
   * @param {string} phoneNumber Numărul de telefon (format: 1234567890)
   */
  public async requestPairingCode(phoneNumber: string): Promise<void> {
    if (!this.keys || !this.clientId) {
      this.generateKeys();
    }
    
    try {
      // Formatare număr telefon
      const formattedPhone = phoneNumber.includes('@') 
        ? phoneNumber 
        : `${phoneNumber.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
      
      // Creare mesaj de solicitare
      const pairingMessage = {
        type: 'request_pair',
        ref: crypto.randomBytes(8).toString('hex').toUpperCase(),
        publicKey: Buffer.from(this.keys.public).toString('base64'),
        phone: formattedPhone
      };
      
      // Emitere eveniment de solicitare
      this.client.emit('pairing_code_request', formattedPhone);
      
      // Trimitere mesaj
      await this.client.protocolManager.sendJSON(pairingMessage);
      
      this.client.log(`Pairing code requested for phone: ${formattedPhone}`);
      
    } catch (error) {
      this.client.log('Error requesting pairing code:', error);
      this.client.emit('pairing_code_error', error);
    }
  }
  
  /**
   * Procesare răspuns la solicitarea codului de asociere
   * @param {Object} data Datele răspunsului
   */
  public handlePairingCodeResponse(data: any): void {
    if (data.type === 'pair_success') {
      // Cod generat cu succes
      this.client.log('Pairing code generated successfully');
      
      // Emitere eveniment cu codul
      this.client.emit('pairing_code', data.code);
      
    } else if (data.type === 'pair_error') {
      // Eroare la generarea codului
      this.client.log(`Error generating pairing code: ${data.reason || 'Unknown error'}`);
      
      // Emitere eveniment de eroare
      this.client.emit('pairing_code_error', {
        reason: data.reason || 'Unknown error'
      });
    }
  }
  
  /**
   * Procesare autentificare reușită (același ca la QR)
   * @param {Object} data Datele de autentificare
   */
  public handleAuthSuccess(data: any): void {
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
    this.client.state = 'AUTHENTICATED';
    this.client.emit('state_change', { from: prevState, to: 'AUTHENTICATED' });
    
    // Emitere eveniment autentificare
    this.client.emit('authenticated', {
      user: this.client.user,
      session: this.client.session
    });
    
    // Resetare contoare de reconectare
    this.client.reconnectCount = 0;
    
    // Setare stare pregătit după un scurt delay
    setTimeout(() => {
      if (this.client.state === 'AUTHENTICATED') {
        this.client.state = 'READY';
        this.client.emit('state_change', { from: 'AUTHENTICATED', to: 'READY' });
        this.client.emit('ready');
      }
    }, 1000);
  }
}