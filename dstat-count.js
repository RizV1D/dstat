const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

// Token bot Anda dari BotFather
const token = '7832153548:AAHtXFpby5-qFHejxyW7CplkD90ZLeDKgv0';
const bot = new TelegramBot(token, { polling: true });

// Konfigurasi untuk membuat grafik
const width = 800;
const height = 600;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

let vshieldInUse = false; // Flag to track if VShield is in use

async function fetchVShieldRequests() {
    try {
        const { data } = await axios.get('https://graph.vshield.pro/7VTnnXWvhdVeUC6q', {
            timeout: 5000, // Timeout untuk request (5 detik)
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }), // Atasi error SSL
        });

        if (typeof data === 'string') {
            const parts = data.trim().split(/\s+/);
            const totalRequests = parseInt(parts[parts.length - 1].replace(/\D/g, ''), 10);
            return isNaN(totalRequests) ? 0 : totalRequests;
        }
        return typeof data === 'number' ? data : 0;
    } catch (error) {
        console.error('Error fetching data:', error.message);
        return 0; // Return 0 jika terjadi error
    }
}

async function generateChart(dataArray) {
    const labels = Array.from({ length: dataArray.length }, (_, i) => `${i + 1}`);

    const chartConfig = {
        type: 'line',
        data: {
            labels: labels,
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
        // If VShield is already in use, inform the user and stop
        const inUseMessage = await bot.sendMessage(chatId, 'The server is in use, please wait');
        
        // Wait for 5 seconds before deleting the message
        setTimeout(async () => {
            await bot.deleteMessage(chatId, inUseMessage.message_id); // Delete the message after 5 seconds
        }, 5000);
        
        return;
    }

    vshieldInUse = true; // Mark VShield as in use

    const requestData = [];
    const endTime = Date.now() + 140 * 1000; // 140 seconds

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
        vshieldInUse = false; // Release the server after processing
        return;
    }

    const totalRequests = requestData.reduce((a, b) => a + b, 0);
    const maxRequests = Math.max(...requestData);
    const minRequests = Math.min(...requestData);

    const chartImage = await generateChart(requestData);

    // Create a clickable username link
    const userLink = username ? `<a href="https://t.me/${username}">${username}</a>` : 'Anonymous';

    // Get current date and time
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');  // Month is zero-indexed
    const day = String(currentDate.getDate()).padStart(2, '0');
    const hours = String(currentDate.getHours()).padStart(2, '0');
    const minutes = String(currentDate.getMinutes()).padStart(2, '0');
    const seconds = String(currentDate.getSeconds()).padStart(2, '0');

    const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

    // Format numbers with commas
    const formattedTotalRequests = totalRequests.toLocaleString();
    const formattedMaxRequests = maxRequests.toLocaleString();
    const formattedMinRequests = minRequests.toLocaleString();

    // Formatted caption
    const caption = `
Dstat <b>Vshield</b> has been ended
<b>${formattedDate}</b>

Stats during 140 seconds:
➥ Total Requests : <b>${formattedTotalRequests}</b>
➥ Peak Requests  : <b>${formattedMaxRequests}</b>
➥ Min Requests   : <b>${formattedMinRequests}</b>

Thanks for using <b>Silly Cat Dstat</b> ❤️
🚗  ${userLink} 🚗
    `;

    // Send the chart image with the aligned caption
    await bot.sendPhoto(chatId, chartImage, {
        caption: caption.trim(),  // Ensure no extra whitespace at the start/end
        parse_mode: 'HTML', // Enable HTML parsing
    });

    vshieldInUse = false; // Release the server after sending the message
}

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'vshield') {
        if (vshieldInUse) {
            // If VShield is already in use, inform the user and stop
            const inUseMessage = await bot.sendMessage(chatId, 'The server is in use, please wait');
            
            // Wait for 5 seconds before deleting the message
            setTimeout(async () => {
                await bot.deleteMessage(chatId, inUseMessage.message_id); // Delete the message after 5 seconds
            }, 5000);
            
            return; // Prevent the VShield information from being sent
        }

        const username = query.from.username ? query.from.username : 'Anonymous'; // Get username or use 'Anonymous'
        
        // Only send this message if VShield is available
        await bot.sendMessage(chatId,
            'Server Name: <b>🏝️Vshield🏝️</b>\n' +
            '<b>Statistics have started</b>\n' +
            '<b>Target (Click to copy URL):</b> <code>https://graph.vshield.pro/7VTnnXWvhdVeUC6q</code>\n' +
            '<b>Protection Type:</b> Vshield\n' +
            '<b>Statistics Duration:</b> 140s',
            { parse_mode: 'HTML' }
        );
        await monitorRequests(chatId, username); // Pass the username here
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
                    [{ text: 'VShield', callback_data: 'vshield' }],
                    [{ text: '<< Back', callback_data: 'back' }],
                ],
            },
        });
    } else if (data === 'back') {
        await sendMainMenu(chatId, query.message.message_id);
    }
});

// Fungsi untuk menampilkan menu utama dengan deskripsi dalam HTML
async function sendMainMenu(chatId, messageId) {
    await bot.editMessageText(
        'Welcome to <b>Silly Cat Dstat</b> 🐱📊! Choose the type of Dstat to view and stay updated with real-time statistics. Whether it’s for <i>Layer 4</i> or <i>Layer 7</i>, we’ve got you covered! Let’s start monitoring now!',
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML', // Menyertakan parsing HTML untuk menampilkan format teks
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

// Start the bot when it's ready
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    await bot.sendMessage(
        chatId,
        'Welcome to <b>Silly Cat Dstat</b> 🐱📊! Choose the type of Dstat to view and stay updated with real-time statistics. Whether it’s for <i>Layer 4</i> or <i>Layer 7</i>, we’ve got you covered! Let’s start monitoring now!',
        {
            parse_mode: 'HTML', // Menyertakan parsing HTML untuk menampilkan format teks
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
