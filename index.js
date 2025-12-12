const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Хранение клиентов по их PeerID для WebRTC
const clients = new Map(); 

app.use(express.static(path.join(__dirname, '')));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// [CORE_LOGIC] ОБРАБОТКА ПОДКЛЮЧЕНИЙ
wss.on('connection', function connection(ws) {
    console.log(`[SYSTEM] New client connected. Total clients: ${wss.clients.size}`);
    
    ws.send(JSON.stringify({
        type: 'SYSTEM',
        message: 'CONNECTION_INITIATED. ENTER CALLSIGN AND PEER ID TO CONNECT.'
    }));
    
    // [BROADCAST_PROTOCOL] РАССЫЛКА СООБЩЕНИЙ И СИГНАЛОВ
    ws.on('message', function incoming(message) {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error("INVALID MESSAGE FORMAT.");
            return;
        }
        
        // 1. ОБРАБОТКА РЕГИСТРАЦИИ КЛИЕНТА
        if (data.type === 'REGISTER') {
            if (data.peerId && data.sender) {
                // Регистрируем клиента по его WebSocket
                clients.set(data.peerId, ws);
                ws.peerId = data.peerId; // Сохраняем ID на самом WS-объекте для закрытия
                
                const users = Array.from(clients.keys());
                
                // Оповещаем всех о новом пользователе
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'USER_LIST_UPDATE',
                            users: users.filter(id => id !== client.peerId), // Отправляем список всех, кроме самого себя
                            newUser: data.sender
                        }));
                    }
                });
                console.log(`[REGISTRY] Client registered: ${data.peerId} (${data.sender})`);
            }
            return;
        }
        
        // 2. ОБРАБОТКА ЧАТ-СООБЩЕНИЙ (BROADCAST)
        if (data.type === 'CHAT_MESSAGE') {
            if (!data.sender || !data.message) return;
            
            const broadcast_data = JSON.stringify({
                type: 'CHAT_MESSAGE',
                sender: data.sender,
                message: data.message
            });
            
            // Отправка сообщения ВСЕМ клиентам
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(broadcast_data);
                }
            });
            return;
        }

        // 3. ОБРАБОТКА СИГНАЛОВ WEBRTC (ЗВОНКИ)
        if (data.type === 'WEBRTC_SIGNAL') {
            const targetClient = clients.get(data.targetId);
            
            if (targetClient && targetClient.readyState === WebSocket.OPEN) {
                // Перенаправляем сигнал
                targetClient.send(JSON.stringify({
                    type: 'WEBRTC_SIGNAL',
                    senderId: data.senderId,
                    signal: data.signal // Offer, Answer, ICE
                }));
            } else {
                console.warn(`[SIGNAL_ERROR] Target client ${data.targetId} not found or not ready.`);
            }
            return;
        }
    });

    // ОБРАБОТКА ЗАКРЫТИЯ СОЕДИНЕНИЯ
    ws.on('close', () => {
        let closedPeerId = ws.peerId;
        if (closedPeerId) {
            clients.delete(closedPeerId);
            
            // Оповещение всех об удалении клиента (если была регистрация)
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN && client.peerId) {
                    client.send(JSON.stringify({
                        type: 'USER_LEFT',
                        leftId: closedPeerId
                    }));
                }
            });
            console.log(`[SYSTEM] Client disconnected. Peer ID removed: ${closedPeerId}`);
        } else {
            console.log('[SYSTEM] Client disconnected (unregistered).');
        }
    });
});

// ЗАПУСК НА ПОРТУ
server.listen(PORT, () => {
    console.log(`[STEALTH_GHOST] Server is LIVE on port ${PORT}`);
});
