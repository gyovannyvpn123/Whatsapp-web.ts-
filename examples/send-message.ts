/**
 * Exemplu de trimitere mesaje WhatsApp
 */

import { WAConnection, MessageType } from '../src';
import * as fs from 'fs';
import * as path from 'path';

// Destinatarul (înlocuiți cu număr real)
const RECIPIENT = "REPLACE_WITH_PHONE_NUMBER@s.whatsapp.net";

// Creare instanță WhatsApp
const client = new WAConnection({
  debug: true
});

// Eveniment pentru pregătit
client.on('ready', async () => {
  console.log('Client is ready to send messages!');
  
  try {
    // Trimitere mesaj text
    const textMessage = await client.sendTextMessage(
      RECIPIENT,
      'Hello from WhatsApp Web API!'
    );
    console.log('Text message sent:', textMessage.id);
    
    // Trimitere imagine
    const imageFile = path.join(__dirname, '../test-image.jpg');
    if (fs.existsSync(imageFile)) {
      const imageMessage = await client.sendImage(
        RECIPIENT,
        imageFile,
        { caption: 'Test image sent from WhatsApp Web API' }
      );
      console.log('Image message sent:', imageMessage.id);
    }
    
    // Trimitere mesaj cu butoane
    const buttonMessage = await client.sendButtons(
      RECIPIENT,
      'Please choose an option:',
      [
        { id: 'btn1', text: 'Option 1' },
        { id: 'btn2', text: 'Option 2' },
        { id: 'btn3', text: 'Option 3' }
      ],
      { footer: 'This is a test message with buttons' }
    );
    console.log('Button message sent:', buttonMessage.id);
    
    // Trimitere locație
    const locationMessage = await client.sendLocation(
      RECIPIENT,
      37.7749, 
      -122.4194,
      { 
        name: 'San Francisco',
        address: 'California, USA'
      }
    );
    console.log('Location message sent:', locationMessage.id);
    
    console.log('All messages sent successfully!');
    
  } catch (error) {
    console.error('Error sending messages:', error);
  } finally {
    // Deconectare după trimitere
    setTimeout(() => {
      console.log('Disconnecting...');
      client.disconnect();
    }, 5000);
  }
});

// Eveniment pentru schimbare stare
client.on('state_change', ({ from, to }) => {
  console.log(`Connection state changed from ${from} to ${to}`);
});

// Verificare dacă există o sesiune salvată
if (fs.existsSync('./session.json')) {
  try {
    const sessionData = JSON.parse(fs.readFileSync('./session.json', 'utf8'));
    client.restoreSession(sessionData);
    console.log('Session restored!');
  } catch (error) {
    console.error('Error restoring session:', error);
    console.log('Please authenticate first using basic-connection.ts example');
    process.exit(1);
  }
} else {
  console.error('No saved session found.');
  console.log('Please authenticate first using basic-connection.ts example');
  process.exit(1);
}