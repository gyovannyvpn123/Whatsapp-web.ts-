# WhatsApp Web API Library

<p align="center">
  <img src="https://raw.githubusercontent.com/gyovannyvpn123/Whatsapp-web.ts-/main/assets/whatsapp-lib-banner.png" alt="WhatsApp Lib" width="650">
</p>

<p align="center">
  A complete and real WhatsApp Web API library based on reverse engineering from the sigalor/whatsapp-web-reveng repository.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#authentication">Authentication</a> •
  <a href="#sending-messages">Sending Messages</a> •
  <a href="#handling-events">Handling Events</a> •
  <a href="#group-management">Group Management</a> •
  <a href="#examples">Examples</a> •
  <a href="#license">License</a>
</p>

## Features

- Real connection to WhatsApp Web servers
- QR code authentication (scan with phone)
- Pairing code authentication (8-character code)
- Send and receive text messages
- Support for all media types (images, videos, audio, documents, stickers)
- Group management (create, add/remove participants)
- Support for advanced messages (buttons, lists)
- Event handling and notifications
- Session saving and restoration
- Complete cryptography implementation (Curve25519, HKDF, AES-CBC, HMAC-SHA256)

## Installation

```bash
npm install @ourorg/whatsapp-core
```

## Usage

### Basic Usage

```javascript
const { WhatsApp } = require('@ourorg/whatsapp-core');

// Create instance
const client = new WhatsApp({
  debug: true // For debug logs
});

// QR code event
client.on('qr', ({ qrText, filePath }) => {
  console.log('Scan this QR code with your WhatsApp app:');
  console.log(qrText);
  console.log(`QR code saved at: ${filePath}`);
});

// Authentication event
client.on('authenticated', ({ user }) => {
  console.log('Authentication successful!');
  console.log(`User: ${user.name} (${user.id})`);
});

// Ready event
client.on('ready', () => {
  console.log('Client is ready to send messages!');
});

// Message event
client.on('message', (message) => {
  console.log(`Message from ${message.from}: ${message.text || '[Media]'}`);
  
  // Automatic reply
  if (message.text) {
    client.sendTextMessage(message.from, `I received your message: ${message.text}`);
  }
});

// Connect
client.connect();
```

## Authentication

### QR Code Authentication

```javascript
// QR code event
client.on('qr', ({ qrText, filePath }) => {
  console.log('Scan this QR code with your WhatsApp app:');
  console.log(qrText);
  console.log(`QR code saved at: ${filePath}`);
});
```

### Pairing Code Authentication

```javascript
const client = new WhatsApp({
  debug: true,
  authMethod: 'pairing-code'
});

// Request pairing code event
client.on('pairing_code_request', async (phone) => {
  // Request pairing code for a phone number
  await client.requestPairingCode('1234567890'); // Replace with your number
});

// Pairing code received event
client.on('pairing_code', (code) => {
  console.log(`Pairing code received: ${code}`);
  console.log('Enter this code in your WhatsApp mobile app');
});
```

### Session Management

```javascript
// Save session after authentication
client.on('authenticated', () => {
  const session = client.getSession();
  fs.writeFileSync('session.json', JSON.stringify(session));
});

// Restore session
const sessionData = require('./session.json');
client.restoreSession(sessionData);
```

## Sending Messages

### Text Messages

```javascript
// Send text message
await client.sendTextMessage('1234567890@s.whatsapp.net', 'Hello, this is a test!');
```

### Media Messages

```javascript
// Send image
await client.sendImage(
  '1234567890@s.whatsapp.net', 
  './image.jpg', 
  { caption: 'This is a test image' }
);

// Send video
await client.sendVideo(
  '1234567890@s.whatsapp.net', 
  './video.mp4', 
  { caption: 'This is a test video' }
);

// Send audio
await client.sendAudio(
  '1234567890@s.whatsapp.net', 
  './audio.mp3'
);

// Send document
await client.sendDocument(
  '1234567890@s.whatsapp.net', 
  './document.pdf', 
  { filename: 'Report.pdf' }
);
```

### Advanced Messages

```javascript
// Send location
await client.sendLocation(
  '1234567890@s.whatsapp.net',
  37.7749, 
  -122.4194, 
  { name: 'San Francisco', address: 'California, USA' }
);

// Send contact
await client.sendContact(
  '1234567890@s.whatsapp.net',
  '9876543210@s.whatsapp.net'
);

// Send buttons
await client.sendButtons(
  '1234567890@s.whatsapp.net',
  'Choose an option:',
  [
    { id: 'btn1', text: 'Option 1' },
    { id: 'btn2', text: 'Option 2' },
    { id: 'btn3', text: 'Option 3' }
  ],
  { footer: 'You can choose only one option' }
);

// Send list
await client.sendList(
  '1234567890@s.whatsapp.net',
  'Menu',
  'Select',
  [
    {
      title: 'Section 1',
      rows: [
        { id: 'item1', title: 'Item 1', description: 'Description 1' },
        { id: 'item2', title: 'Item 2', description: 'Description 2' }
      ]
    },
    {
      title: 'Section 2',
      rows: [
        { id: 'item3', title: 'Item 3', description: 'Description 3' }
      ]
    }
  ],
  { footer: 'Menu footer' }
);
```

## Handling Events

```javascript
// Message received
client.on('message', (message) => {
  console.log(`New message from ${message.from}`);
});

// Specific message types
client.on('message_text', (message) => {
  console.log(`Text message: ${message.text}`);
});

client.on('message_image', (message) => {
  console.log(`Image message with caption: ${message.caption}`);
});

// Message status updates
client.on('message_receipt', (receipt) => {
  console.log(`Message ${receipt.id} status: ${receipt.type}`);
});

// Presence updates
client.on('presence', (data) => {
  console.log(`${data.id} is ${data.type}`);
});

// Connection events
client.on('connecting', () => {
  console.log('Connecting to WhatsApp servers...');
});

client.on('connected', () => {
  console.log('Connected to WhatsApp servers');
});

client.on('disconnected', () => {
  console.log('Disconnected from WhatsApp servers');
});

// QR code expired
client.on('qr_expired', () => {
  console.log('QR code expired, requesting a new one...');
});
```

## Group Management

```javascript
// Create a group
const group = await client.createGroup(
  'Group Name', 
  ['1234567890@s.whatsapp.net', '9876543210@s.whatsapp.net']
);

console.log(`Group created: ${group.id}`);

// Get group info
const groupInfo = await client.getGroupInfo('1234567890@g.us');

// Get group participants
const participants = await client.getGroupParticipants('1234567890@g.us');

// Add participants to group
await client.addGroupParticipants(
  '1234567890@g.us', 
  ['5555555555@s.whatsapp.net']
);

// Remove participants from group
await client.removeGroupParticipants(
  '1234567890@g.us', 
  ['5555555555@s.whatsapp.net']
);

// Promote participants to admin
await client.promoteGroupParticipants(
  '1234567890@g.us', 
  ['5555555555@s.whatsapp.net']
);

// Demote participants from admin
await client.demoteGroupParticipants(
  '1234567890@g.us', 
  ['5555555555@s.whatsapp.net']
);
```

## Complete Example

```javascript
const { WhatsApp, MessageType } = require('@ourorg/whatsapp-core');
const fs = require('fs');

async function startWhatsApp() {
  const client = new WhatsApp({ debug: true });
  
  // Load session if exists
  if (fs.existsSync('./session.json')) {
    const sessionData = require('./session.json');
    await client.restoreSession(sessionData);
    console.log('Session restored!');
  }
  
  client.on('qr', ({ qrText }) => {
    console.log('Scan this QR code:');
    console.log(qrText);
  });
  
  client.on('authenticated', ({ user }) => {
    console.log('Authentication successful!');
    console.log(`User: ${user.name} (${user.id})`);
    
    // Save session
    const session = client.getSession();
    fs.writeFileSync('./session.json', JSON.stringify(session));
    console.log('Session saved!');
  });
  
  client.on('ready', () => {
    console.log('Client ready for sending messages');
  });
  
  client.on('message', async (message) => {
    console.log(`Message from ${message.from}: ${message.text || '[Media]'}`);
    
    // Handle commands
    if (message.text && message.text.startsWith('/')) {
      const [command, ...args] = message.text.slice(1).split(' ');
      
      switch (command) {
        case 'help':
          await client.sendTextMessage(message.from, `
Available commands:
/help - Show this help
/echo [text] - Echo the text
/image - Send a test image
/button - Send a message with buttons
          `);
          break;
          
        case 'echo':
          await client.sendTextMessage(message.from, args.join(' ') || 'You did not specify any text');
          break;
          
        case 'image':
          await client.sendImage(message.from, './test.jpg', { caption: 'Test image' });
          break;
          
        case 'button':
          await client.sendButtons(
            message.from,
            'Choose an option:',
            [
              { id: 'btn1', text: 'Option 1' },
              { id: 'btn2', text: 'Option 2' },
              { id: 'btn3', text: 'Option 3' }
            ],
            { footer: 'You can choose only one option' }
          );
          break;
          
        default:
          await client.sendTextMessage(message.from, 'Unknown command. Use /help for the list of commands.');
      }
    }
  });
  
  // Connect to WhatsApp
  await client.connect();
}

startWhatsApp().catch(console.error);
```

## Known Issues and Solutions

### Connection to WhatsApp Web fails

If the connection fails, try using an HTTPS proxy:

```javascript
const client = new WhatsApp({
  proxy: 'http://proxy-server:port'
});
```

### Usage in Replit Environment

To use the library in the Replit environment, you will need a proxy as WhatsApp Web servers may block direct connections.

## Advantages Over Other Libraries

- **Direct Protocol Implementation**: Implements the WhatsApp binary protocol directly without relying on WhatsApp Web JavaScript
- **Native Authentication**: Supports both QR code and pairing code authentication natively
- **Browser Independence**: No need for a headless browser or Puppeteer
- **Efficient Resource Usage**: Minimal dependencies and efficient implementation
- **Comprehensive Documentation**: Detailed examples for all functionalities
- **Enterprise-Ready**: Designed for production use with reliability in mind

## License

MIT