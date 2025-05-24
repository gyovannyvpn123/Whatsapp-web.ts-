/**
 * Exemplu de conectare basic la WhatsApp Web
 */

import { WAConnection, ConnectionState } from '../src';
import * as qrcode from 'qrcode';
import * as fs from 'fs';

// Creare instanță WhatsApp
const client = new WAConnection({
  debug: true
});

// Eveniment pentru cod QR
client.on('qr', ({ qrText, filePath }) => {
  console.log('==========================================================');
  console.log('SCAN THIS QR CODE WITH YOUR WHATSAPP MOBILE APP:');
  console.log('==========================================================');
  console.log(qrText);
  console.log('==========================================================');
  console.log(`QR code saved at: ${filePath}`);
  console.log('==========================================================');
});

// Eveniment pentru schimbare stare
client.on('state_change', ({ from, to }) => {
  console.log(`Connection state changed from ${from} to ${to}`);
});

// Eveniment pentru autentificare reușită
client.on('authenticated', ({ user }) => {
  console.log('Authentication successful!');
  console.log(`User: ${user.name} (${user.id})`);
  
  // Salvare sesiune
  const session = client.getSession();
  fs.writeFileSync('./session.json', JSON.stringify(session));
  console.log('Session saved!');
});

// Eveniment pentru pregătit
client.on('ready', () => {
  console.log('Client is ready to send messages!');
});

// Eveniment pentru mesaj primit
client.on('message', (message) => {
  console.log(`Message from ${message.from}: ${message.text || '[Media]'}`);
  
  // Răspuns automat la mesaje text
  if (message.text) {
    client.sendTextMessage(message.from, `I received your message: ${message.text}`);
  }
});

// Verificare dacă există o sesiune salvată
if (fs.existsSync('./session.json')) {
  try {
    const sessionData = JSON.parse(fs.readFileSync('./session.json', 'utf8'));
    client.restoreSession(sessionData);
    console.log('Session restored!');
  } catch (error) {
    console.error('Error restoring session:', error);
    console.log('Connecting with QR code...');
    client.connect();
  }
} else {
  console.log('No saved session found. Connecting with QR code...');
  client.connect();
}