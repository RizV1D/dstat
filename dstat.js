const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const token = '7832153548:AAHtXFpby5-qFHejxyW7CplkD90ZLeDKgv0';
const bot = new TelegramBot(token, { polling: true });

const width = 800;
const height = 600;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

let vshieldInUse = false;

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
        console.error('Error fetching data:', error.message);
        return 0;
    }
}

async function generateChart(dataArray) {
    const labels = Array.from({ length: dataArray.length }, (_, i) => `${i + 1}`);

    const chartConfig = {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Total Requests',
                    data: dataArray,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: true,
                },
            ],
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                },
            },
        },
    };

    return await chartJSNodeCanvas.renderToBuffer(chartConfig);
}

async function monitorRequests(chatId, username) {
    if (vshieldInUse) {
        const inUseMessage = await bot.sendMessage(chatId, 'The server is in use, please wait');
        setTimeout(async () => {
            await bot.deleteMessage(chatId, inUseMessage.message_id);
        }, 5000);
        return;
    }

    vshieldInUse = true;
    const requestData = [];
    const endTime = Date.now() + 140 * 1000;

    while (Date.now() < endTime) {
        const requests = await fetchVShieldRequests();
        if (requests > 0) {
            requestData.push(requests);
        } else {
            console.log('Invalid or zero requests received, skipping.');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (requestData.length === 0) {
        await bot.sendMessage(chatId, 'Tidak ada data requests yang valid selama 60 detik terakhir.');
        vshieldInUse = false;
        return;
    }

    const totalRequests = requestData.reduce((a, b) => a + b, 0);
    const maxRequests = Math.max(...requestData);
    const minRequests = Math.min(...requestData);
    const chartImage = await generateChart(requestData);

    const userLink = username ? `<a href="https://t.me/${username}">${username}</a>` : 'Anonymous';
    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().replace('T', ' ').split('.')[0];

    const caption = `
Dstat <b>Vshield</b> has been ended
<b>${formattedDate}</b>

Stats during 140 seconds:
➥ Total Requests : <b>${totalRequests.toLocaleString()}</b>
➥ Peak Requests  : <b>${maxRequests.toLocaleString()}</b>
➥ Min Requests   : <b>${minRequests.toLocaleString()}</b>

Thanks for using <b>Silly Cat Dstat</b> ❤️
🚗  ${userLink} 🚗
    `;

    await bot.sendPhoto(chatId, chartImage, {
        caption: caption.trim(),
        parse_mode: 'HTML',
    });

    vshieldInUse = false;
}

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'vshield') {
        if (vshieldInUse) {
            const inUseMessage = await bot.sendMessage(chatId, 'The server is in use, please wait');
            setTimeout(async () => {
                await bot.deleteMessage(chatId, inUseMessage.message_id);
            }, 5000);
            return;
        }

        const username = query.from.username || 'Anonymous';

        await bot.sendMessage(chatId,
            'Server Name: <b>🏝️Vshield🏝️</b>\n' +
            '<b>Statistics have started</b>\n' +
            '<b>Target (Click to copy URL):</b> <code>https://graph.vshield.pro/7VTnnXWvhdVeUC6q</code>\n' +
            '<b>Protection Type:</b> Vshield\n' +
            '<b>Statistics Duration:</b> 140s',
            { parse_mode: 'HTML' }
        );
        await monitorRequests(chatId, username);

    } else if (data === 'fdcservers') {
        const username = query.from.username || 'Anonymous';

        try {
            const { data: nginxData } = await axios.get('http://198.16.110.165/nginx_status', {
                timeout: 5000
            });

            const lines = nginxData.split('\n');
            const requestsLine = lines.find(line => line.includes('requests'));
            const parts = requestsLine.trim().split(/\s+/);
            const totalRequests = parseInt(parts[2]);

            const currentTime = new Date().toLocaleString();
            const userLink = `<a href="https://t.me/${username}">${username}</a>`;

            await bot.sendMessage(chatId,
                `<b>FDCServers Stats</b>\n` +
                `📅 <b>${currentTime}</b>\n` +
                `➥ Total Requests: <b>${totalRequests.toLocaleString()}</b>\n\n` +
                `Thanks for using <b>Silly Cat Dstat</b>\n` +
                `🚗 ${userLink} 🚗`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Failed to fetch FDCServers stats:', error.message);
            await bot.sendMessage(chatId, 'Failed to fetch data from FDCServers.');
        }

    } else if (data === 'layer4') {
        await bot.editMessageText('coming soon.', {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '<< Back', callback_data: 'back' }],
                ],
            },
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
    } else if (data === 'protect') {
        await bot.editMessageText('coming soon', {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '<< Back', callback_data: 'back' }],
                ],
            },
        });
    } else if (data === 'non_protect') {
        await bot.editMessageText('select the server menu📊', {
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
    } else if (data === 'back') {
        await sendMainMenu(chatId, query.message.message_id);
    }
});

async function sendMainMenu(chatId, messageId) {
    await bot.editMessageText(
        'Welcome to <b>Silly Cat Dstat</b> 🐱📊! Choose the type of Dstat to view and stay updated with real-time statistics. Whether it’s for <i>Layer 4</i> or <i>Layer 7</i>, we’ve got you covered! Let’s start monitoring now!',
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
        'Welcome to <b>Silly Cat Dstat</b> 🐱📊! Choose the type of Dstat to view and stay updated with real-time statistics. Whether it’s for <i>Layer 4</i> or <i>Layer 7</i>, we’ve got you covered! Let’s start monitoring now!',
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
