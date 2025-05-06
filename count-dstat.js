const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// Inisialisasi bot dengan token
const bot = new TelegramBot('7832153548:AAHtXFpby5-qFHejxyW7CplkD90ZLeDKgv0', { polling: true });

// Muat daftar server dari file JSON
let servers = JSON.parse(fs.readFileSync('./servers.json', 'utf8'));

// Variabel global
const activeUsers = new Map();
const userMonitoring = new Set();
let isLocked = false;

// Fungsi untuk menyimpan perubahan ke servers.json secara aman
async function safeWriteFile(filePath, data) {
    while (isLocked) {
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    isLocked = true;
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
    } finally {
        isLocked = false;
    }
}

// Fungsi untuk mengambil jumlah total permintaan
async function fetchServerRequests(url) {
    try {
        const { data } = await axios.get(url, { timeout: 5000 });
        const parts = data.trim().split(/\s+/);
        const totalRequests = parseInt(parts[parts.length - 1]);
        return totalRequests || 0;
    } catch (error) {
        console.error('Error fetching requests:', error.message);
        return 0;
    }
}

// Menghapus detail URL sensitif dari server untuk ditampilkan
function sanitizeUrl(url) {
    const urlParts = url.split('/');
    return `${urlParts[0]}//${urlParts[2]}`;
}

const languageFile = './Language.json';

// Fungsi untuk membaca data bahasa dari file
function readUserLanguage(userId) {
    let languageData = {};
    if (fs.existsSync(languageFile)) {
        languageData = JSON.parse(fs.readFileSync(languageFile, 'utf8'));
    }
    return languageData[userId] || 'en'; // Default ke bahasa Inggris jika tidak ada
}

// Fungsi untuk menyimpan pengaturan bahasa
function saveUserLanguage(userId, language) {
    let languageData = {};
    if (fs.existsSync(languageFile)) {
        languageData = JSON.parse(fs.readFileSync(languageFile, 'utf8'));
    }
    languageData[userId] = language;
    fs.writeFileSync(languageFile, JSON.stringify(languageData, null, 4));
}

// Fungsi untuk mendapatkan username dari userId
async function getUsername(userId) {
    try {
        const user = await bot.getChat(userId);
        return user.username ? `@${user.username}` : `(Tidak ada username)`;
    } catch (error) {
        console.error(`Error fetching username for userId ${userId}:`, error.message);
        return `(Tidak ditemukan)`;
    }
}

// Fungsi untuk menampilkan ranking total requests per server
async function getRanking(serverIndex) {
    const server = servers[serverIndex];
    const userRequests = server.userRequests || {};

    if (Object.keys(userRequests).length === 0) {
        return 'Belum ada data.';
    }

    const rankings = Object.entries(userRequests)
        .map(([userId, totalRequests]) => ({ userId, totalRequests }))
        .sort((a, b) => b.totalRequests - a.totalRequests)
        .slice(0, 10);

    const rankingResults = await Promise.all(
        rankings.map(async (r, index) => {
            const username = await getUsername(r.userId);
            return `${index + 1}. <b>${username}</b>: <b>${r.totalRequests}</b> requests`;
        })
    );

    return rankingResults.join('\n');
}

// Fungsi untuk memulai monitoring
async function startMonitoring(chatId, userId, serverIndex) {
    const selectedServer = servers[serverIndex];

    if ([...activeUsers.values()].includes(userId)) {
        return bot.sendMessage(chatId, '⚠️ You are doing dstat wait until it is finished ');
    }

    if (selectedServer.isMonitoring) {
        return bot.sendMessage(chatId, '⚠️ server is in use, select another one first');
    }

    selectedServer.isMonitoring = true;
    activeUsers.set(selectedServer.name, userId);
    userMonitoring.add(userId);
    await safeWriteFile('./servers.json', servers);

    const sanitizedUrl = sanitizeUrl(selectedServer.url);

    await bot.sendMessage(
        chatId,
        `
🦄 <b>${selectedServer.name}</b> (∞)
➖➖➖➖➖➖➖➖➖➖
➥ <b>Start Statistics</b>
➥ <b>Target Address</b>: <code>${sanitizedUrl}/</code>
➥ <b>Statistics Duration</b>: 120 seconds
        `,
        { parse_mode: 'HTML', disable_web_page_preview: true }
    );

    let remainingTime = 120;
    let prevStatsMessage = '';

    const statsMessage = await bot.sendMessage(
        chatId,
        `
🦄 <b>${selectedServer.name}</b> (∞)

📈 <b>Max Requests Per Second:</b> 0 req/s
━━━━━━━━━━━━━━━━━━━━━━━━
📈 <b>Total Requests:</b> 0 requests
━━━━━━━━━━━━━━━━━━━━━━━━

⏳ <b>Countdown:</b> ${remainingTime} seconds
        `,
        { parse_mode: 'HTML', disable_web_page_preview: true }
    );

    const interval = setInterval(async () => {
        try {
            const currentRequests = await fetchServerRequests(selectedServer.url);
            const requestsPerSecond =
                currentRequests - (selectedServer.lastRequestCount || 0);

            const validRequestsPerSecond = Math.max(0, requestsPerSecond);
            selectedServer.totalRequests =
                (selectedServer.totalRequests || 0) + validRequestsPerSecond;
            selectedServer.maxRequestsPerSecond = Math.max(
                validRequestsPerSecond,
                selectedServer.maxRequestsPerSecond || 0
            );
            selectedServer.lastRequestCount = currentRequests;

            remainingTime -= 5;

            const newStatsMessage = `
🦄 <b>${selectedServer.name}</b> (∞)

📈 <b>Max Requests Per Second:</b> ${
                selectedServer.maxRequestsPerSecond || 0
            } req/s
━━━━━━━━━━━━━━━━━━━━━━━━
📈 <b>Total Requests:</b> ${
                selectedServer.totalRequests || 0
            } requests
━━━━━━━━━━━━━━━━━━━━━━━━

⏳ <b>Countdown:</b> ${remainingTime} seconds
            `;

            if (newStatsMessage !== prevStatsMessage) {
                await bot.editMessageText(newStatsMessage, {
                    chat_id: chatId,
                    message_id: statsMessage.message_id,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                });
                prevStatsMessage = newStatsMessage;
            }

            if (remainingTime <= 0) {
                clearInterval(interval);

                await bot.deleteMessage(chatId, statsMessage.message_id);
                await bot.sendMessage(
                    chatId,
                    `
🦄 <b>${selectedServer.name}</b> (∞)
----------------------------
<b>Max Requests Per Second:</b> ${
        selectedServer.maxRequestsPerSecond || 0
    }
----------------------------
<b>Total Requests:</b> ${
        selectedServer.totalRequests || 0
    }
----------------------------
Thank you for using Silly Cat Dstat!
                    `,
                    { parse_mode: 'HTML', disable_web_page_preview: true }
                );

                selectedServer.isMonitoring = false;
                selectedServer.totalRequests = 0;
                selectedServer.maxRequestsPerSecond = 0;
                selectedServer.lastRequestCount = 0;

                activeUsers.delete(selectedServer.name);
                userMonitoring.delete(userId);
                await safeWriteFile('./servers.json', servers);
            }
        } catch (error) {
            console.error('Error during monitoring:', error.message);
            clearInterval(interval);

            selectedServer.isMonitoring = false;
            selectedServer.totalRequests = 0;
            selectedServer.maxRequestsPerSecond = 0;
            selectedServer.lastRequestCount = 0;

            activeUsers.delete(selectedServer.name);
            userMonitoring.delete(userId);
            await safeWriteFile('./servers.json', servers);

            await bot.sendMessage(chatId, 'Monitoring stopped due to an error.');
        }
    }, 5000);
}

// Fungsi Start
// Fungsi Start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    const welcomeMessage =
        '👑<a href="https://t.me/Silly_Cat_Network">Silly Cat Network : has L7 & L4 with a strong power of /80GBPS/2 million Rps</a>\n' +
        '➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n' +
        '💎<a href="https://t.me/anomalystresser">Anomaly Stresser : Good Bypass / High Traffic & GBPS for L4 / TCP 20GBPS / High Rps 3 million Requests For L7</a>\n' +
        '➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n' +
        '🔥<a href="https://t.me/teamstarpez">Starpez : Best L7 & L4 / RAW 120 million Requests / Good Botnet / High PPS & Traffic</a>\n' +
        '➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n' +
        '🪙<a href="https://t.me/sagitariusc2">SagitariusC2 : great for bypassing CloudFlare / 0% No HTTP-DDOS / 2 million Rps</a>\n' +
        '➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖';

    await bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Ranking', callback_data: 'ranking' }],
                [
                    { text: 'Layer 4 Stats', callback_data: 'layer4_stats' },
                    { text: 'Layer 7 Stats', callback_data: 'layer7_stats' },
                ],
                [{ text: 'Language', callback_data: 'language' }], // Added Language button
            ],
        },
    });
});


// Callback handler
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const callbackData = callbackQuery.data;

   if (callbackData === 'language') {
        return bot.editMessageText('⚙️ Select your preferred language:', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🇬🇧 English', callback_data: 'language_english' },
                        { text: '🇮🇩 Bahasa Indonesia', callback_data: 'language_indonesia' },
                    ],
                    [{ text: '<< Back', callback_data: 'back' }],
                ],
            },
        });
    }

    if (callbackData === 'language_english') {
        // Logic to set the language to English (for example, storing it in a database or user data)
        return bot.editMessageText('✅ Language set to English.', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [[{ text: '<< Back', callback_data: 'back' }]],
            },
        });
    }

    if (callbackData === 'language_indonesia') {
        // Logic to set the language to Bahasa Indonesia
        return bot.editMessageText('✅ Bahasa Indonesia dipilih.', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [[{ text: '<< Back', callback_data: 'back' }]],
            },
        });
    }

    if (callbackData === 'ranking') {
	    const serverButtons = servers.map((server, index) => [
	        {
	            text: server.name,
	            callback_data: `ranking_${index}`,
	        },
	    ]);

	    return bot.editMessageText('🦄 Select Server Type', {
	        chat_id: chatId,
	        message_id: messageId,
	        reply_markup: {
	            inline_keyboard: [
	                ...serverButtons, // Menambahkan tombol server satu per baris
	                [{ text: '<< Back', callback_data: 'back' }], // Tombol Back di bawah
	            ],
	        },
	    });
	}

    if (callbackData.startsWith('ranking_')) {
        const serverIndex = parseInt(callbackData.split('_')[1]);
        const ranking = await getRanking(serverIndex);

        return bot.editMessageText(
            `
📊 <b>Ranking for Server</b> ${servers[serverIndex].name}
${ranking}
            `,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '<< Back', callback_data: 'ranking' }]],
                },
            }
        );
    }

    if (callbackData === 'layer4_stats') {
        return bot.editMessageText('⛔ Maintenance!', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [[{ text: '<< Back', callback_data: 'back' }]],
            },
        });
    }

    if (callbackData === 'layer7_stats') {
        return bot.editMessageText('🦄 Layer 7 Stats\n\n🚀 choose and use ', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Layer 7 Unprotected', callback_data: 'layer7_unprotected' },
                        { text: 'Layer 7 Protected', callback_data: 'layer7_protected' },
                    ],
                    [{ text: '<< Back', callback_data: 'back' }],
                ],
            },
        });
    }

    if (callbackData === 'layer7_unprotected') {
 	   const serverButtons = servers.map((server, index) => [
	        {
	            text: server.name,
	            callback_data: `monitor_${index}`,
	        },
	    ]);

	    return bot.editMessageText('🦄 Layer 7 Unprotected\n\n🚀 Select Server Type', {
	        chat_id: chatId,
	        message_id: messageId,
	        reply_markup: {
	            inline_keyboard: [
	                ...serverButtons, // Menambahkan tombol server satu per baris
	                [{ text: '<< Back', callback_data: 'layer7_stats' }],
	            ],
	        },
	    });
	}

    if (callbackData === 'layer7_protected') {
        return bot.editMessageText('⚙️coming soon.', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [[{ text: '<< Back', callback_data: 'layer7_stats' }]],
            },
        });
    }


    if (callbackData === 'back') {
        return bot.editMessageText(
            '👑<a href="https://t.me/Silly_Cat_Network">Silly Cat Network : has L7 & L4 with a strong power of /80GBPS/2 million Rps</a>\n' +
            '➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n' +
            '💎<a href="https://t.me/anomalystresser">Anomaly Stresser : Good Bypass / High Traffic & GBPS for L4 / TCP 20GBPS / High Rps 3 million Requests For L7</a>\n' +
            '➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n' +
            '🔥<a href="https://t.me/teamstarpez">Starpez : Best L7 & L4 / RAW 120 million Requests / Good Botnet / High PPS & Traffic</a>\n' +
            '➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n' +
            '🪙<a href="https://t.me/sagitariusc2">SagitariusC2 : great for bypassing CloudFlare / 0% No HTTP-DDOS / 2 million Rps</a>\n' +
            '➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n',
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Ranking', callback_data: 'ranking' }],
                        [
                            { text: 'Layer 4 Stats', callback_data: 'layer4_stats' },
                            { text: 'Layer 7 Stats', callback_data: 'layer7_stats' },
                        ],
                        [{ text: 'Language', callback_data: 'language' }],
                    ],
                },
            }
        );
    }

if (callbackData.startsWith('monitor_')) {
        const serverIndex = parseInt(callbackData.split('_')[1]);
        await startMonitoring(chatId, callbackQuery.from.id, serverIndex);
    }
});
