const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Хранение клиентов по их PeerID (для WS-объектов)
const clients = new Map(); 

app.use(express.static(path.join(__dirname, '')));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// [CORE_LOGIC] ОБРАБОТКА ПОДКЛЮЧЕНИЙ
wss.on('connection', function connection(ws) {
    console.log(`[SYSTEM] New client connected. Total WS connections: ${wss.clients.size}`);
    
    // [BROADCAST_PROTOCOL] РАССЫЛКА СООБЩЕНИЙ И СИГНАЛОВ
    ws.on('message', function incoming(message) {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error("INVALID MESSAGE FORMAT.");
            return;
        }
        
        // 1. ОБРАБОТКА РЕГИСТРАЦИИ КЛИЕНТА (WS -> Peer ID)
        if (data.type === 'REGISTER') {
            if (data.peerId && data.sender) {
                // Если клиент уже зарегистрирован, удаляем старый
                if (ws.peerId && clients.has(ws.peerId)) {
                    clients.delete(ws.peerId);
                }
                
                // Регистрируем новый Peer ID
                clients.set(data.peerId, ws);
                ws.peerId = data.peerId; 
                ws.nickname = data.sender;
                
                // Отправляем всем обновленный список активных пиров (Peer ID, Nickname)
                const users = Array.from(clients.entries()).map(([id, clientWs]) => ({
                    id: id,
                    nickname: clientWs.nickname
                }));
                
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'USER_LIST_UPDATE',
                            // Отправляем список всех пользователей, включая отправителя. 
                            // Клиент сам решит, кого ему инициировать.
                            users: users 
                        }));
                    }
                });
                console.log(`[REGISTRY] Client registered: ${data.peerId} (${data.sender})`);
            }
            return;
        }
        
        // 2. ОБРАБОТКА ЧАТ-СООБЩЕНИЙ (SMS BROADCAST)
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

        // 3. ОБРАБОТКА СИГНАЛОВ WEBRTC (MESH BROADCAST)
        if (data.type === 'WEBRTC_SIGNAL') {
            // Перенаправляем сигнал ВСЕМ, кроме отправителя
            const signal_data = JSON.stringify({
                type: 'WEBRTC_SIGNAL',
                senderId: data.senderId,
                targetId: data.targetId, // Используется клиентом для идентификации получателя сигнала
                signal: data.signal
            });
            
            wss.clients.forEach(function each(client) {
                // НЕ отправляем сигнал обратно отправителю
                if (client.readyState === WebSocket.OPEN && client !== ws) { 
                    client.send(signal_data);
                }
            });
            return;
        }
    });

    // ОБРАБОТКА ЗАКРЫТИЯ СОЕДИНЕНИЯ
    ws.on('close', () => {
        let closedPeerId = ws.peerId;
        if (closedPeerId) {
            clients.delete(closedPeerId);
            
            // Оповещение всех об удалении клиента
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
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
    console.log(`[STEALTH_GHOST] Conference Server is LIVE on port ${PORT}`);
});
