/**
 * Autentificare prin cod QR pentru WhatsApp Web
 */

import * as crypto from 'crypto';
import * as qrcode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import * as curve from 'curve25519-n';

export class QRAuth {
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
    
    this.client.log('Generated new client ID and keys');
  }
  
  /**
   * Procesare cod QR primit
   * @param {string} ref Referința codului QR
   */
  public async handleQRCode(ref: string): Promise<void> {
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
      this.client.log('
==========================================================');
      this.client.log('SCAN THIS QR CODE WITH YOUR WHATSAPP MOBILE APP:');
      this.client.log('==========================================================
');
      this.client.log(qrText);
      this.client.log('
==========================================================');
      this.client.log(`QR code saved as: ${qrFilePath}`);
      this.client.log('QR code will expire in 60 seconds');
      this.client.log('==========================================================
');
      
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
    this.client.qrRetryCount = 0;
    
    // Anulare timer-e
    if (this.client.qrRefreshTimer) {
      clearTimeout(this.client.qrRefreshTimer);
      this.client.qrRefreshTimer = null;
    }
    
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