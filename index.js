const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Хранилище подключенных пользователей: { nickname: WebSocket }
const users = {};

// Обслуживаем статический файл index.html
// Replit автоматически делает это, но лучше явно указать
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Функции для кодирования/декодирования (CONTEXT_DODGER)
// Используем Base64 для минимальной маскировки трафика от сканеров
function decodePayload(data) {
    try {
        const decodedString = Buffer.from(data, 'base64').toString('utf8');
        return JSON.parse(decodedString);
    } catch (e) {
        console.error("Ошибка декодирования/парсинга входящего пакета:", e.message);
        return null;
    }
}

function encodePayload(data) {
    return Buffer.from(JSON.stringify(data)).toString('base64');
}

wss.on('connection', (ws) => {
    let currentUserNick = null;

    ws.on('message', (message) => {
        const data = decodePayload(message.toString());
        if (!data) return;

        // console.log(`[INCOMING] Type: ${data.type}, From: ${data.from || 'Unknown'}, To: ${data.recipient_nick || 'All'}`);

        switch (data.type) {
            case 'init':
                // Инициализация пользователя
                if (data.nickname) {
                    currentUserNick = data.nickname;
                    users[currentUserNick] = ws;
                    console.log(`[USER_JOIN] ${currentUserNick} подключился.`);
                    // Оповещаем нового пользователя, что он онлайн
                    ws.send(encodePayload({ type: 'status', text: `[SYSTEM] Вы в сети как ${currentUserNick}.` }));
                }
                break;

            case 'msg':
            case 'call-offer':
            case 'call-answer':
            case 'ice-candidate':
            case 'call-decline':
            case 'call-busy':
                // Логика маршрутизации P2P (точка-точка)
                const recipient = users[data.recipient_nick];
                if (recipient && recipient.readyState === WebSocket.OPEN) {
                    // Пересылаем сообщение получателю
                    recipient.send(encodePayload(data));
                    // console.log(`[RELAY] ${data.type} от ${data.from} -> ${data.recipient_nick}`);
                } else {
                    // Отправляем обратно отправителю, что получатель оффлайн/недоступен
                    if (data.from) {
                        const errorMsg = (data.type.startsWith('call')) 
                            ? `[ERROR] Пользователь ${data.recipient_nick} недоступен для звонка.`
                            : `[ERROR] Пользователь ${data.recipient_nick} не в сети.`;
                        ws.send(encodePayload({ type: 'error', text: errorMsg, from: 'SYSTEM' }));
                    }
                }
                break;
            
            default:
                console.warn(`[UNKNOWN] Неизвестный тип данных: ${data.type}`);
        }
    });

    ws.on('close', () => {
        if (currentUserNick && users[currentUserNick]) {
            delete users[currentUserNick];
            console.log(`[USER_LEAVE] ${currentUserNick} отключился.`);
            // Здесь должна быть логика завершения активных WebRTC сессий, но в v1 пропускаем.
        }
    });

    ws.on('error', (error) => {
        console.error(`[WS_ERROR] Ошибка соединения для ${currentUserNick || 'Unknown'}:`, error.message);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[STEALTH_GHOST] Сервер запущен на порту ${PORT}`);
});
