/**
 * Exemplu de autentificare WhatsApp prin cod de asociere (pairing code)
 * Acest exemplu folosește metoda oficială WhatsApp de autentificare prin cod de 8 caractere
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const curve = require('curve25519-n');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Configurează numărul tău de telefon aici (format internațional fără + sau spații)
// Exemplu: pentru +40 712 345 678 -> "40712345678"
const PHONE_NUMBER = process.env.PHONE_NUMBER || "NUMĂR_TELEFON"; // Înlocuiește cu numărul tău real

// Setăm un proxy pentru a ocolí blocarea din Replit (necesită proxy real)
const PROXY_URL = null; // Setează la adresa proxy dacă e nevoie

// Constante WhatsApp Web
const WA_WEB_URL = 'wss://web.whatsapp.com/ws';
const WA_VERSION = [2, 2348, 50];
const WA_BROWSER = ['WhatsApp Web API', 'Chrome', '120.0.0.0'];
const WA_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Magic bytes și token-uri pentru protocolul binar WhatsApp
const WA_MAGIC = Buffer.from([0x57, 0x41]); // "WA"
const WA_PREFIX_INFO = Buffer.from([6, 0, 0, 0]); // info server-client

// Funcție principală
async function main() {
    console.log('WhatsApp Web API - Autentificare prin Cod de Asociere');
    console.log('-----------------------------------------------------');
    
    if (PHONE_NUMBER === "NUMĂR_TELEFON") {
        console.log('\nTrebuie să configurezi numărul tău de telefon în cod!');
        console.log('Deschide fișierul și modifică variabila PHONE_NUMBER cu numărul tău real');
        console.log('Format: Număr internațional fără + sau spații (ex: 40712345678)');
        return;
    }
    
    console.log(`\nVa începe procesul de autentificare pentru numărul: ${PHONE_NUMBER}`);
    console.log('Vei primi un cod de 8 caractere pe telefonul tău prin WhatsApp');
    console.log('Procesul va dura câteva secunde...\n');
    
    try {
        // Generare chei criptografice
        const clientId = crypto.randomBytes(16).toString('hex');
        const privateKey = crypto.randomBytes(32);
        const keyPair = curve.makeKeyPair(privateKey);
        const publicKey = keyPair.publicKey;
        const publicKeyBase64 = Buffer.from(publicKey).toString('base64');
        
        console.log('Chei generate cu succes:');
        console.log(`- Client ID: ${clientId}`);
        console.log(`- Public Key: ${publicKeyBase64.substring(0, 15)}...`);
        
        // Creare opțiuni WebSocket
        const wsOptions = {
            origin: 'https://web.whatsapp.com',
            headers: {
                'User-Agent': WA_UA
            }
        };
        
        // Adaugă proxy dacă e configurat
        if (PROXY_URL) {
            console.log(`\nFolosesc proxy: ${PROXY_URL}`);
            wsOptions.agent = new HttpsProxyAgent(PROXY_URL);
        }
        
        // Conectare la serverul WhatsApp
        console.log('\nSe conectează la serverele WhatsApp...');
        const ws = new WebSocket(WA_WEB_URL, wsOptions);
        
        // Handler pentru deschiderea conexiunii
        ws.on('open', () => {
            console.log('Conexiune stabilită cu serverul WhatsApp!');
            
            // Trimite mesajul de inițializare
            const initialMessage = {
                clientToken: clientId,
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
            
            console.log('Trimit mesaj de inițializare...');
            sendJsonMessage(ws, initialMessage);
        });
        
        // Handler pentru mesaje primite
        ws.on('message', async (data) => {
            try {
                // Verifică dacă e un mesaj JSON valid
                if (data[0] === WA_MAGIC[0] && data[1] === WA_MAGIC[1] && data[2] === WA_PREFIX_INFO[0]) {
                    // Extrage partea JSON
                    const jsonData = data.slice(4).toString();
                    const message = JSON.parse(jsonData);
                    
                    console.log(`\nMesaj primit: ${message.type || message.status}`);
                    
                    // Procesare mesaje în funcție de tip
                    if (message.status === 'connected') {
                        console.log('Conexiune confirmată de server');
                        
                        // Solicită cod de asociere după conectare
                        console.log('\nSolicit cod de asociere pentru numărul tău...');
                        
                        // Formatează numărul în format WhatsApp
                        const formattedPhone = `${PHONE_NUMBER}@s.whatsapp.net`;
                        
                        // Solicită codul de asociere
                        const pairingMessage = {
                            type: 'request_pair',
                            ref: crypto.randomBytes(8).toString('hex').toUpperCase(),
                            publicKey: publicKeyBase64,
                            phone: formattedPhone
                        };
                        
                        sendJsonMessage(ws, pairingMessage);
                    } 
                    else if (message.type === 'pair_success') {
                        console.log('\n=====================================================');
                        console.log('SUCCES! Cod de asociere generat și trimis la telefonul tău!');
                        console.log('=====================================================');
                        console.log(`\nVerifică telefonul cu numărul ${PHONE_NUMBER}`);
                        console.log('Ar trebui să primești un mesaj de la WhatsApp cu un cod de 8 caractere');
                        console.log('Introdu acest cod pe telefon pentru a finaliza conectarea');
                        console.log('\nAștept confirmarea autentificării...');
                    }
                    else if (message.type === 'pair_error') {
                        console.log('\n=====================================================');
                        console.log('EROARE LA GENERAREA CODULUI DE ASOCIERE!');
                        console.log('=====================================================');
                        console.log(`\nMotiv: ${message.reason || 'Necunoscut'}`);
                        
                        if (message.reason === 'missing') {
                            console.log('\nNumărul de telefon nu pare să fie înregistrat pe WhatsApp');
                            console.log('Verifică dacă ai introdus corect numărul și că are WhatsApp instalat');
                        } else {
                            console.log('\nVerifică dacă numărul este corect și încearcă din nou');
                            console.log('Asigură-te că telefonul este conectat la internet');
                        }
                        
                        ws.close();
                    }
                    else if (message.type === 'success') {
                        console.log('\n=====================================================');
                        console.log('AUTENTIFICARE REUȘITĂ! EȘTI CONECTAT LA WHATSAPP!');
                        console.log('=====================================================');
                        console.log('\nDate utilizator:');
                        console.log(`- Nume: ${message.pushname || 'Nedefinit'}`);
                        console.log(`- ID WhatsApp: ${message.wid || 'Necunoscut'}`);
                        console.log(`- Telefon: ${PHONE_NUMBER}`);
                        
                        // Salvează datele sesiunii pentru utilizare ulterioară
                        const session = {
                            clientId,
                            serverToken: message.session,
                            clientToken: message.clientToken,
                            encKey: message.encKey,
                            macKey: message.macKey,
                            wid: message.wid,
                            phone: PHONE_NUMBER,
                            pushname: message.pushname
                        };
                        
                        // Salvează sesiunea în fișier pentru reutilizare
                        fs.writeFileSync('whatsapp-session.json', JSON.stringify(session, null, 2));
                        console.log('\nSesiune salvată în fișierul whatsapp-session.json');
                        console.log('Poți folosi această sesiune pentru reconectare fără cod de asociere');
                        
                        console.log('\nAcum poți trimite și primi mesaje prin WhatsApp Web API!');
                        console.log('Conexiunea va rămâne activă. Apasă Ctrl+C pentru a închide.');
                    }
                    else {
                        // Alte tipuri de mesaje
                        console.log(message);
                    }
                } else {
                    // Mesaj binar (protocolul complet ar procesa aici)
                    console.log(`Mesaj binar primit (${data.length} bytes)`);
                }
            } catch (error) {
                console.error('Eroare la procesarea mesajului:', error);
            }
        });
        
        // Handler pentru erori
        ws.on('error', (error) => {
            console.error('\nEroare WebSocket:', error.message);
            
            if (error.message.includes('403')) {
                console.log('\nServerul WhatsApp a blocat conexiunea (403 Forbidden)');
                console.log('Încearcă să folosești un proxy sau rulează de pe alt server');
            } else if (error.message.includes('404')) {
                console.log('\nEndpoint-ul WhatsApp nu a fost găsit (404 Not Found)');
                console.log('Verifică dacă URL-ul serverului este corect');
            }
        });
        
        // Handler pentru închiderea conexiunii
        ws.on('close', (code, reason) => {
            console.log(`\nConexiune închisă (cod: ${code})`);
            if (reason) {
                console.log(`Motiv: ${reason.toString()}`);
            }
        });
        
        // Handler pentru ieșire
        process.on('SIGINT', () => {
            console.log('\nÎnchidere conexiune și terminare program...');
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
            process.exit(0);
        });
        
    } catch (error) {
        console.error('\nEroare generală:', error);
    }
}

// Funcție pentru trimiterea mesajelor JSON
function sendJsonMessage(ws, data) {
    if (ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket nu este deschis pentru trimitere');
        return;
    }
    
    try {
        const jsonStr = JSON.stringify(data);
        const buffer = Buffer.concat([
            WA_MAGIC,
            WA_PREFIX_INFO,
            Buffer.from(jsonStr)
        ]);
        
        ws.send(buffer);
    } catch (error) {
        console.error('Eroare la trimiterea mesajului:', error);
    }
}

// Rulează programul
main().catch(console.error);