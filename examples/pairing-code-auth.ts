/**
 * Exemplu de autentificare cu cod de asociere
 */

import { WAConnection } from '../src';
import * as fs from 'fs';

// Configurați numărul de telefon aici (format internațional fără + sau spații)
// Exemplu: pentru +40 712 345 678 -> "40712345678"
const PHONE_NUMBER = "REPLACE_WITH_PHONE_NUMBER";

// Creare instanță WhatsApp cu autentificare prin cod de asociere
const client = new WAConnection({
  debug: true,
  authMethod: 'pairing-code'
});

// Eveniment pentru schimbare stare
client.on('state_change', ({ from, to }) => {
  console.log(`Connection state changed from ${from} to ${to}`);
});

// Eveniment pentru solicitare cod de asociere
client.on('pairing_code_request', async (phone) => {
  console.log(`Requesting pairing code for phone number: ${phone}`);
});

// Eveniment pentru primire cod de asociere
client.on('pairing_code', (code) => {
  console.log('==========================================================');
  console.log(`PAIRING CODE RECEIVED: ${code}`);
  console.log('Enter this code in your WhatsApp mobile app');
  console.log('==========================================================');
});

// Eveniment pentru eroare cod de asociere
client.on('pairing_code_error', (error) => {
  console.error('Error requesting pairing code:', error);
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

// Verificare dacă există o sesiune salvată
if (fs.existsSync('./session.json')) {
  try {
    const sessionData = JSON.parse(fs.readFileSync('./session.json', 'utf8'));
    client.restoreSession(sessionData);
    console.log('Session restored!');
  } catch (error) {
    console.error('Error restoring session:', error);
    connectWithPairingCode();
  }
} else {
  connectWithPairingCode();
}

// Funcție pentru conectare cu cod de asociere
function connectWithPairingCode() {
  console.log('No saved session found. Connecting with pairing code...');
  
  if (PHONE_NUMBER === "REPLACE_WITH_PHONE_NUMBER") {
    console.error('Please replace PHONE_NUMBER with your actual phone number!');
    process.exit(1);
  }
  
  // Conectare și solicitare cod de asociere
  client.connect().then(() => {
    client.requestPairingCode(PHONE_NUMBER);
  }).catch(console.error);
}