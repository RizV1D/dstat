const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const https = require('https');

const token = '7832153548:AAHtXFpby5-qFHejxyW7CplkD90ZLeDKgv0';
const bot = new TelegramBot(token, { polling: true });

const width = 800;
const height = 600;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

const serverStatus = {
    VShield: false,
    FDCServers: false
};

async function fetchVShieldRequests() {
    try {
        const { data } = await axios.get('https://graph.vshield.pro/7VTnnXWvhdVeUC6q', {
            timeout: 5000,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        });
        if (typeof data === 'string') {
            const parts = data.trim().split(/\s+/);
            const totalRequests = parseInt(parts[parts.length - 1].replace(/\D/g, ''), 10);
            return isNaN(totalRequests) ? 0 : totalRequests;
        }
        return typeof data === 'number' ? data : 0;
    } catch (error) {
        console.error('Error fetching VShield data:', error.message);
        return 0;
    }
}

async function fetchFDCRequests() {
    try {
        const { data } = await axios.get('http://198.16.110.165/nginx_status', {
            timeout: 5000
        });
        const lines = data.split('\n');
        const requestsLine = lines.find(line => line.includes('requests'));
        const parts = requestsLine.trim().split(/\s+/);
        const totalRequests = parseInt(parts[2]);
        return isNaN(totalRequests) ? 0 : totalRequests;
    } catch (error) {
        console.error('Error fetching FDCServers data:', error.message);
        return 0;
    }
}

async function generateChart(dataArray) {
    const labels = Array.from({ length: dataArray.length }, (_, i) => `${i + 1}`);
    const chartConfig = {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Total Requests',
                data: dataArray,
                borderColor: 'rgba(54, 162, 235, 1)',
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                fill: true,
            }],
        },
        options: {
            scales: {
                y: { beginAtZero: true }
            },
        },
    };
    return await chartJSNodeCanvas.renderToBuffer(chartConfig);
}

async function monitorServer(chatId, username, fetchFunction, label) {
    if (serverStatus[label]) {
        const msg = await bot.sendMessage(chatId, `${label} sedang digunakan, tunggu sampai selesai.`);
        setTimeout(() => bot.deleteMessage(chatId, msg.message_id), 5000);
        return;
    }

    serverStatus[label] = true;

    const requestData = [];
    let prevValue = await fetchFunction();

    const endTime = Date.now() + 140 * 1000;

    while (Date.now() < endTime) {
        await new Promise(res => setTimeout(res, 1000));
        const currentValue = await fetchFunction();
        const delta = Math.max(0, currentValue - prevValue);
        requestData.push(delta);
        prevValue = currentValue;
    }

    const total = requestData.reduce((a, b) => a + b, 0);
    const max = Math.max(...requestData);
    const min = Math.min(...requestData);
    const chart = await generateChart(requestData);

    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').split('.')[0];
    const userLink = username ? `<a href="https://t.me/${username}">${username}</a>` : 'Anonymous';

    const caption = `
Dstat <b>${label}</b> has been ended
<b>${dateStr}</b>

Stats during 140 seconds:
➥ Total Requests : <b>${total.toLocaleString()}</b>
➥ Peak Requests  : <b>${max.toLocaleString()}</b>
➥ Min Requests   : <b>${min.toLocaleString()}</b>

Thanks for using <b>Silly Cat Dstat</b>
🚗 ${userLink} 🚗
    `;

    await bot.sendPhoto(chatId, chart, {
        caption: caption.trim(),
        parse_mode: 'HTML',
    });

    serverStatus[label] = false;
}

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const username = query.from.username || 'Anonymous';

    if (data === 'vshield') {
        if (serverStatus['VShield']) {
            return bot.sendMessage(chatId, 'VShield sedang digunakan. Tunggu hingga selesai.');
        }

        await bot.sendMessage(chatId,
            'Server Name: <b>🏝️Vshield🏝️</b>\n' +
            '<b>Statistics have started</b>\n' +
            '<b>Target:</b> <code>https://graph.vshield.pro/7VTnnXWvhdVeUC6q</code>\n' +
            '<b>Protection Type:</b> Vshield\n' +
            '<b>Statistics Duration:</b> 140s',
            { parse_mode: 'HTML' }
        );
        await monitorServer(chatId, username, fetchVShieldRequests, 'VShield');
    } else if (data === 'fdcservers') {
        if (serverStatus['FDCServers']) {
            return bot.sendMessage(chatId, 'FDCServers sedang digunakan. Tunggu hingga selesai.');
        }

        await bot.sendMessage(chatId,
            'Server Name: <b>🛰️FDCServers🛰️</b>\n' +
            '<b>Statistics have started</b>\n' +
            '<b>Target:</b> <code>http://198.16.110.165/nginx_status</code>\n' +
            '<b>Protection Type:</b> Nginx Basic\n' +
            '<b>Statistics Duration:</b> 140s',
            { parse_mode: 'HTML' }
        );
        await monitorServer(chatId, username, fetchFDCRequests, 'FDCServers');
    } else if (data === 'back') {
        await sendMainMenu(chatId, query.message.message_id);
    } else if (data === 'layer4') {
        await bot.editMessageText('Coming soon.', {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: { inline_keyboard: [[{ text: '<< Back', callback_data: 'back' }]] },
        });
    } else if (data === 'layer7') {
        await bot.editMessageText('Select server below (Layer 7)📊', {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Non Protect', callback_data: 'non_protect' },
                        { text: 'Protect', callback_data: 'protect' },
                    ],
                    [{ text: '<< Back', callback_data: 'back' }],
                ],
            },
        });
    } else if (data === 'non_protect') {
        await bot.editMessageText('Select the server menu📊', {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'VShield', callback_data: 'vshield' },
                        { text: 'FDCServers', callback_data: 'fdcservers' },
                    ],
                    [{ text: '<< Back', callback_data: 'back' }],
                ],
            },
        });
    } else if (data === 'protect') {
        await bot.editMessageText('Coming soon.', {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: { inline_keyboard: [[{ text: '<< Back', callback_data: 'back' }]] },
        });
    }
});

async function sendMainMenu(chatId, messageId) {
    await bot.editMessageText(
        'Welcome to <b>Silly Cat Dstat</b> 🐱📊! Choose the type of Dstat to view and stay updated with real-time statistics. Whether it’s for <i>Layer 4</i> or <i>Layer 7</i>, we’ve got you covered!',
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
    await bot.sendMessage(
        chatId,
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
