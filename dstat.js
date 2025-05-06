const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const token = '7832153548:AAHtXFpby5-qFHejxyW7CplkD90ZLeDKgv0';
const bot = new TelegramBot(token, { polling: true });

const width = 800;
const height = 600;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

// Tracking pengguna aktif per server
let activeMonitors = {
    vshield: null,
    fdcservers: null
};

async function fetchVShieldRequests() {
    try {
        const { data } = await axios.get('https://graph.vshield.pro/7VTnnXWvhdVeUC6q', {
            timeout: 5000,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
        });

        if (typeof data === 'string') {
            const parts = data.trim().split(/\s+/);
            const totalRequests = parseInt(parts[parts.length - 1].replace(/\D/g, ''), 10);
            return isNaN(totalRequests) ? 0 : totalRequests;
        }
        return typeof data === 'number' ? data : 0;
    } catch (error) {
        console.error('VShield fetch error:', error.message);
        return 0;
    }
}

async function fetchFDCRequests() {
    try {
        const { data } = await axios.get('http://198.16.110.165/nginx_status', {
            timeout: 5000,
        });

        const match = data.match(/(\d+)\s+requests/);
        return match ? parseInt(match[1], 10) : 0;
    } catch (error) {
        console.error('FDC fetch error:', error.message);
        return 0;
    }
}

async function generateChart(dataArray) {
    const labels = Array.from({ length: dataArray.length }, (_, i) => `${i + 1}`);
    const chartConfig = {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Requests',
                data: dataArray,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                fill: true,
            }],
        },
        options: {
            scales: {
                y: { beginAtZero: true },
            },
        },
    };
    return await chartJSNodeCanvas.renderToBuffer(chartConfig);
}

async function monitorServer(chatId, userId, username, serverKey, label, fetchFunction) {
    if (activeMonitors[serverKey] !== null && activeMonitors[serverKey] !== userId) {
        const waitMsg = await bot.sendMessage(chatId, `Monitoring <b>${label}</b> sedang digunakan oleh pengguna lain. Silakan tunggu.`, { parse_mode: 'HTML' });
        setTimeout(() => bot.deleteMessage(chatId, waitMsg.message_id), 5000);
        return;
    }

    activeMonitors[serverKey] = userId;

    const requestData = [];
    const startValue = await fetchFunction();
    const endTime = Date.now() + 140 * 1000;

    while (Date.now() < endTime) {
        const current = await fetchFunction();
        const delta = Math.max(0, current - startValue - requestData.reduce((a, b) => a + b, 0));
        requestData.push(delta);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const total = requestData.reduce((a, b) => a + b, 0);
    const max = Math.max(...requestData);
    const min = Math.min(...requestData);
    const chart = await generateChart(requestData);

    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').split('.')[0];
    const userLink = username ? `<a href="https://t.me/${username}">${username}</a>` : 'Anonymous';

    const caption = `
Dstat <b>${label}</b> selesai
<b>${dateStr}</b>

Stats selama 140 detik:
➥ Total Requests : <b>${total.toLocaleString()}</b>
➥ Peak Requests  : <b>${max.toLocaleString()}</b>
➥ Min Requests   : <b>${min.toLocaleString()}</b>

Terima kasih telah menggunakan <b>Silly Cat Dstat</b>
🚗 ${userLink} 🚗
`;

    await bot.sendPhoto(chatId, chart, {
        caption: caption.trim(),
        parse_mode: 'HTML',
    });

    activeMonitors[serverKey] = null;
}

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const username = query.from.username || 'Anonymous';
    const data = query.data;

    if (data === 'vshield') {
        await bot.sendMessage(chatId,
            'Server Name: <b>🏝️Vshield🏝️</b>\n' +
            '<b>Statistics have started</b>\n' +
            '<b>Target:</b> <code>https://graph.vshield.pro/7VTnnXWvhdVeUC6q</code>\n' +
            '<b>Protection Type:</b> Vshield\n' +
            '<b>Statistics Duration:</b> 140s',
            { parse_mode: 'HTML' }
        );
        await monitorServer(chatId, userId, username, 'vshield', 'VShield', fetchVShieldRequests);

    } else if (data === 'fdcservers') {
        await bot.sendMessage(chatId,
            'Server Name: <b>FDCServers</b>\n' +
            '<b>Statistics have started</b>\n' +
            '<b>Target:</b> <code>http://198.16.110.165/nginx_status</code>\n' +
            '<b>Protection Type:</b> FDC\n' +
            '<b>Statistics Duration:</b> 140s',
            { parse_mode: 'HTML' }
        );
        await monitorServer(chatId, userId, username, 'fdcservers', 'FDCServers', fetchFDCRequests);

    } else if (data === 'layer7') {
        await bot.editMessageText('Pilih server di bawah ini (Layer 7)📊', {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'VShield', callback_data: 'vshield' }],
                    [{ text: 'FDCServers', callback_data: 'fdcservers' }],
                    [{ text: '<< Back', callback_data: 'back' }],
                ],
            },
        });
    } else if (data === 'layer4') {
        await bot.editMessageText('coming soon.', {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: {
                inline_keyboard: [[{ text: '<< Back', callback_data: 'back' }]],
            },
        });
    } else if (data === 'back') {
        await sendMainMenu(chatId, query.message.message_id);
    }
});

async function sendMainMenu(chatId, messageId) {
    await bot.editMessageText(
        'Welcome to <b>Silly Cat Dstat</b> 🐱📊! Choose the type of Dstat to view and stay updated with real-time statistics. Let’s start monitoring now!',
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Layer 4', callback_data: 'layer4' },
                        { text: 'Layer 7', callback_data: 'layer7' },
                    ],
                ],
            },
        }
    );
}

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId,
        'Welcome to <b>Silly Cat Dstat</b> 🐱📊! Choose the type of Dstat to view and stay updated with real-time statistics.',
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Layer 4', callback_data: 'layer4' },
                        { text: 'Layer 7', callback_data: 'layer7' },
                    ],
                ],
            },
        }
    );
});
