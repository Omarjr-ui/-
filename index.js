const { 
    Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, 
    SlashCommandBuilder, REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

// ================= CONFIGURATION =================
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID || "1535348813856772248",
    BOT_ID: "1535348813856772248",
    TAX_OWNER_ID: "1241496820455313533",
    TAX_PERCENT: 0.035, // 3.5%

    VERIFIED_ROLE_ID: "1535350311068242010",
    LOGS_CHANNEL_ID: "1535351343529594950",
    SPIN_CATEGORY_ID: "1535350881111769148",

    // Zit hna l-IDs dial les channels li mssmo7 fihom casino (ila kano khawya kyt3tabr gga3 les channels mssmohin)
    CASINO_CHANNELS_IDS: [1535751054233440347, 1535750990710444093, 1535750875471945909], 

    LINE_IMAGE_URL: "https://cdn.discordapp.com/attachments/1315665568228966410/1535362669421264946/line_Skill_Tower.gif",
    THUMBNAIL_URL: "https://cdn.discordapp.com/attachments/1315665568228966410/1535380733198213140/LOGO_GIF_IWTH_SAKURA_FLOWERS.gif", 
    BANNER_URL: "https://cdn.discordapp.com/attachments/1315665568228966410/1535362669773717574/banner_skill_tower_serveur_discord.gif",    

    COMMAND_ROLES: {
        say: "1535359367606702080",
        come: "1535359386258509964",
        ban: "1535359456966352979",
        timeout: "1535359474666315908",
        giveaway: "1535359635073138708",
        security: "1535359422484979792",
        setup: "1535359514981699615"
    },

    TICKETS: {
        pub: { name: 'Pub', category: '1535360598966149151', staffRole: '1535380986236371014' },
        bugs: { name: 'Bugs', category: '1535360542934573168', staffRole: '1535380920775999604' },
        abuse: { name: 'Abuse', category: '1535360378551279656', staffRole: '1535381054473375836' },
        server: { name: 'Server', category: '1535360321072398446', staffRole: '1535381160920617000' },
        staff: { name: 'Staff Abuse', category: '1535360289640554536', staffRole: '1535381215472001147' },
        donate: { name: 'Donate', category: '1535360193548787762', staffRole: '1535381267372048384' },
        spin: { name: 'Spin', category: '1535350881111769148', staffRole: '1535380873157935265' }
    }
};

let ticketCounter = 1;
let SECURITY_MODE = true;

const pendingPurges = new Map();
const usedSpins = new Map();
const activeCasinoGames = new Set(); // Multi-game lock to prevent exploits

// ================= DATABASE (JSON FILE STORAGE) =================
const DB_FILE = path.join(__dirname, 'userProfiles.json');
let userProfiles = new Map();

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const rawData = fs.readFileSync(DB_FILE, 'utf8');
            const parsed = JSON.parse(rawData);
            userProfiles = new Map(Object.entries(parsed));
            console.log('📂 User profiles database loaded successfully.');
        }
    } catch (err) {
        console.error('Error loading database file:', err);
    }
}

function saveDatabase() {
    try {
        const obj = Object.fromEntries(userProfiles);
        fs.writeFileSync(DB_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
        console.error('Error saving database file:', err);
    }
}

function getUserData(userId) {
    const cleanId = String(userId).replace(/[^0-9]/g, '');
    if (!userProfiles.has(cleanId)) {
        userProfiles.set(cleanId, { balance: 0, peak: 0, lastSender: 'None' });
    }
    return userProfiles.get(cleanId);
}

function addCredits(userId, amount, senderName = 'System') {
    const cleanId = String(userId).replace(/[^0-9]/g, '');
    const data = getUserData(cleanId);
    data.balance += amount;
    if (data.balance > data.peak) {
        data.peak = data.balance;
    }
    if (senderName !== 'System') {
        data.lastSender = senderName;
    }
    userProfiles.set(cleanId, data);
    saveDatabase();
}

function removeCredits(userId, amount) {
    const cleanId = String(userId).replace(/[^0-9]/g, '');
    const data = getUserData(cleanId);
    data.balance = Math.max(0, data.balance - amount);
    userProfiles.set(cleanId, data);
    saveDatabase();
}

// Format Input Function (1m -> 1,000,000 / 1k -> 1,000)
function parseAmount(input) {
    if (typeof input === 'number') return input;
    if (!input || typeof input !== 'string') return null;

    const cleaned = input.trim().toLowerCase();
    const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/);
    if (!match) return null;

    let num = parseFloat(match[1]);
    const unit = match[2];

    if (unit === 'k') num *= 1_000;
    else if (unit === 'm') num *= 1_000_000;
    else if (unit === 'b') num *= 1_000_000_000;

    return Math.floor(num);
}

function hasCommandRole(member, commandName) {
    const requiredRoleId = CONFIG.COMMAND_ROLES[commandName] || CONFIG.COMMAND_ROLES.setup;
    return member.roles.cache.has(requiredRoleId) || member.permissions.has(PermissionFlagsBits.Administrator);
}

async function getUserInviteCount(guild, userId) {
    try {
        const invites = await guild.invites.fetch();
        const userInvs = invites.filter(i => i.inviter && i.inviter.id === userId);
        return userInvs.reduce((acc, inv) => acc + inv.uses, 0);
    } catch (err) {
        return 0;
    }
}

async function sendLog(guild, embed) {
    try {
        const logChannel = guild.channels.cache.get(CONFIG.LOGS_CHANNEL_ID) || await guild.channels.fetch(CONFIG.LOGS_CHANNEL_ID).catch(() => null);
        if (logChannel) await logChannel.send({ embeds: [embed] });
    } catch (err) {
        console.error("Log error:", err);
    }
}

function getWeightedRandom(items) {
    let total = items.reduce((acc, item) => acc + item.weight, 0);
    let rand = Math.random() * total;
    for (let item of items) {
        if (rand < item.weight) return item.label;
        rand -= item.weight;
    }
    return items[0].label;
}

function parseDuration(str) {
    const match = str.match(/^(\d+)([mhd])$/i);
    if (!match) return null;
    const val = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    if (unit === 'm') return val * 60 * 1000;
    if (unit === 'h') return val * 60 * 60 * 1000;
    if (unit === 'd') return val * 24 * 60 * 60 * 1000;
    return null;
}

function isCasinoChannel(channelId) {
    if (!CONFIG.CASINO_CHANNELS_IDS || CONFIG.CASINO_CHANNELS_IDS.length === 0) return true;
    return CONFIG.CASINO_CHANNELS_IDS.includes(channelId);
}

// ================= BOT READY & SLASH COMMANDS =================
client.once('ready', async () => {
    loadDatabase();
    console.log(`🤖 Bot online as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('setup-verify').setDescription('Setup Custom Verification Panel'),
        new SlashCommandBuilder().setName('setup-ticket').setDescription('Setup TANJYA Ticket Support System'),
        new SlashCommandBuilder().setName('spin').setDescription('Spin the Wheel (Requires 1 available invite)'),
        new SlashCommandBuilder().setName('spin5').setDescription('Super Spin (Requires 5 available invites)'),
        new SlashCommandBuilder().setName('invites').setDescription('Check your invite count & available spins').addUserOption(opt => opt.setName('user').setDescription('User to check')),
        new SlashCommandBuilder().setName('points').setDescription('Check your remaining Spin points').addUserOption(opt => opt.setName('user').setDescription('User to check')),
        new SlashCommandBuilder().setName('profile').setDescription('Check your credits profile, peak & level').addUserOption(opt => opt.setName('user').setDescription('User to check')),
        
        // Transfers & Credits
        new SlashCommandBuilder().setName('sendluxa').setDescription('Transfer credits securely').addUserOption(opt => opt.setName('user').setDescription('Target User').setRequired(true)).addStringOption(opt => opt.setName('amount').setDescription('e.g. 100k, 1m, 5000').setRequired(true)),
        new SlashCommandBuilder().setName('transfer').setDescription('Transfer credits to another user').addUserOption(opt => opt.setName('user').setDescription('Target User').setRequired(true)).addStringOption(opt => opt.setName('amount').setDescription('Amount e.g 1m').setRequired(true)),
        new SlashCommandBuilder().setName('givecredits').setDescription('Give credits to a user (Owner Only)').addStringOption(opt => opt.setName('userid').setDescription('Target User ID or Mention').setRequired(true)).addStringOption(opt => opt.setName('amount').setDescription('Amount of credits e.g 10m').setRequired(true)),
        new SlashCommandBuilder().setName('removecredits').setDescription('Remove credits from a user (Owner Only)').addStringOption(opt => opt.setName('userid').setDescription('Target User ID or Mention').setRequired(true)).addStringOption(opt => opt.setName('amount').setDescription('Amount of credits e.g 10m').setRequired(true)),

        // Help & Utility
        new SlashCommandBuilder().setName('idbot').setDescription('Get bot ID & deposit instructions'),
        new SlashCommandBuilder().setName('tutorial').setDescription('How to deposit and play games'),

        // Casino Games (5 Modes)
        new SlashCommandBuilder().setName('blackjack').setDescription('Play Blackjack (Multiplier 2.5x)').addStringOption(opt => opt.setName('bet').setDescription('Amount to bet (e.g. 100k, 1m)').setRequired(true)),
        new SlashCommandBuilder().setName('roulette').setDescription('Play Roulette').addStringOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true)).addStringOption(opt => opt.setName('space').setDescription('red, black, green, even, odd, or number (0-36)').setRequired(true)),
        new SlashCommandBuilder().setName('crash').setDescription('Play Crash Game').addStringOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true)),
        new SlashCommandBuilder().setName('mines').setDescription('Play Mines').addStringOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true)).addIntegerOption(opt => opt.setName('bombs').setDescription('Number of bombs (1-24)').setRequired(false)),
        new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin').addStringOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true)).addStringOption(opt => opt.setName('side').setDescription('heads or tails').setRequired(true).addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })),

        // Admin & Moderation
        new SlashCommandBuilder().setName('say').setDescription('Send embed message').addStringOption(opt => opt.setName('text').setDescription('Message').setRequired(true)),
        new SlashCommandBuilder().setName('come').setDescription('Summon user').addUserOption(opt => opt.setName('user').setDescription('Target User').setRequired(true)),
        new SlashCommandBuilder().setName('ban').setDescription('Ban user').addUserOption(opt => opt.setName('user').setDescription('Target').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason')),
        new SlashCommandBuilder().setName('timeout').setDescription('Timeout user').addUserOption(opt => opt.setName('user').setDescription('Target').setRequired(true)).addStringOption(opt => opt.setName('duration').setDescription('e.g. 10m, 2h, 1d').setRequired(true)),
        new SlashCommandBuilder().setName('security').setDescription('Toggle Security Mode').addStringOption(opt => opt.setName('status').setDescription('ON/OFF').setRequired(true).addChoices({ name: 'ON', value: 'on' }, { name: 'OFF', value: 'off' }))
    ];

    const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID), { body: commands });
        console.log('✅ Commands Registered');
    } catch (err) {
        console.error('Error registering commands:', err);
    }
});

// ================= MESSAGE CREATE LISTENERS (Tax, Chat Commands & Profile) =================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // 1. Check Profile when user types 'p' f chat
    if (message.content.trim().toLowerCase() === 'p') {
        const data = getUserData(message.author.id);
        const level = Math.floor(data.balance / 1_000_000) + 1;

        const profEmbed = new EmbedBuilder()
            .setColor('#00d2d3')
            .setTitle(`💳 Profile & Credits - ${message.author.username}`)
            .setThumbnail(message.author.displayAvatarURL())
            .addFields(
                { name: '💰 Current Balance', value: `\`${data.balance.toLocaleString()} Luxa\``, inline: true },
                { name: '🚀 Peak Credits', value: `\`${data.peak.toLocaleString()} Luxa\``, inline: true },
                { name: '⭐ Level', value: `\`Lvl ${level}\``, inline: true },
                { name: '🎁 Last Sent By', value: `\`${data.lastSender}\``, inline: false }
            )
            .setTimestamp();

        return message.reply({ embeds: [profEmbed] });
    }

    // 2. Text command 'c @user amount' transfer shortcut
    if (message.content.startsWith('c ')) {
        const parts = message.content.split(/\s+/);
        if (parts.length >= 3) {
            const targetUser = message.mentions.users.first();
            const rawAmount = parts[2];
            const amount = parseAmount(rawAmount);

            if (!targetUser) return message.reply('❌ Taggi user s'hih! Format: `c @user 1m`');
            if (targetUser.id === message.author.id) return message.reply('❌ Ma-ymknch t-sift credits l rasak!');
            if (!amount || amount <= 0) return message.reply('❌ Amount ghlat!');

            const senderData = getUserData(message.author.id);
            if (senderData.balance < amount) {
                return message.reply(`❌ Ma-3ndkch credits kfya! Balance: **${senderData.balance.toLocaleString()}**`);
            }

            removeCredits(message.author.id, amount);
            addCredits(targetUser.id, amount, message.author.tag);

            return message.reply(`💸 **${message.author}** ssift **${amount.toLocaleString()} Luxa** l **${targetUser}** b-najah!`);
        }
    }

    // 3. TAX SYSTEM & DEPOSIT DETECTOR (If user sends currency to Bot ID)
    if (message.content.includes(CONFIG.BOT_ID) || message.mentions.users.has(CONFIG.BOT_ID)) {
        // Look for potential credit numbers in the text message
        const match = message.content.match(/(\d+(?:\.\d+)?\s*[kmb]?)/i);
        if (match) {
            const parsedAmount = parseAmount(match[0]);
            if (parsedAmount && parsedAmount > 0) {
                const tax = Math.floor(parsedAmount * CONFIG.TAX_PERCENT);
                const finalAmount = parsedAmount - tax;

                // Credit Tax to Owner
                addCredits(CONFIG.TAX_OWNER_ID, tax, `Tax from ${message.author.tag}`);
                // Credit remainder to user
                addCredits(message.author.id, finalAmount, 'Deposit System');

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#57F287')
                            .setTitle('📥 Deposit Confirmed & Tax Applied')
                            .setDescription(`✅ **${parsedAmount.toLocaleString()} Luxa** Recieved!\n\n• 💸 **Tax (3.5%):** \`${tax.toLocaleString()}\` sent to Owner.\n• 💰 **Added to Balance:** \`+${finalAmount.toLocaleString()} Luxa\``)
                    ]
                });
            }
        }
    }
});

// ================= LOG EVENTS =================
client.on('guildMemberAdd', async (member) => {
    const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('📥 Member Joined')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: 'User', value: `${member.user.tag} (${member.id})` },
            { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` }
        )
        .setTimestamp();
    await sendLog(member.guild, embed);
});

client.on('guildMemberRemove', async (member) => {
    const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('📤 Member Left')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: 'User', value: `${member.user.tag} (${member.id})` }
        )
        .setTimestamp();
    await sendLog(member.guild, embed);
});

client.on('messageDelete', async (message) => {
    if (message.author?.bot || !message.guild) return;

    const embed = new EmbedBuilder()
        .setColor('#FEE75C')
        .setTitle('🗑️ Message Deleted')
        .addFields(
            { name: 'Author', value: `${message.author.tag} (${message.author.id})`, inline: true },
            { name: 'Channel', value: `${message.channel}`, inline: true },
            { name: 'Content', value: message.content ? message.content.slice(0, 1024) : '*[No Text Content / Attachment]*' }
        )
        .setTimestamp();
    await sendLog(message.guild, embed);
});

// ================= INTERACTION HANDLER =================
client.on('interactionCreate', async (interaction) => {

    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, member, channel } = interaction;

        const publicCmds = ['spin', 'spin5', 'invites', 'points', 'profile', 'transfer', 'sendluxa', 'idbot', 'tutorial', 'blackjack', 'roulette', 'crash', 'mines', 'coinflip'];
        if (!publicCmds.includes(commandName) && !hasCommandRole(member, commandName)) {
            return interaction.reply({ content: '❌ MA3NDKCH ROLE BCH T-ST3ML HAD L-COMMAND!', ephemeral: true });
        }

        // Restriction Check for Casino Channels
        const casinoCmds = ['blackjack', 'roulette', 'crash', 'mines', 'coinflip'];
        if (casinoCmds.includes(commandName) && !isCasinoChannel(channel.id)) {
            return interaction.reply({ content: '❌ Had l-command mssmouha ghir f les channels dial Casino!', ephemeral: true });
        }

        // HELP & ID BOT COMMANDS
        if (commandName === 'idbot' || commandName === 'tutorial') {
            const embed = new EmbedBuilder()
                .setColor('#00d2d3')
                .setTitle('ℹ️ Casino & Bot Deposit Guide')
                .setDescription(
                    `🤖 **Bot ID:** \`${CONFIG.BOT_ID}\`\n\n` +
                    `**How to deposit Luxa to play:**\n` +
                    `1️⃣ Sift Luxa l l-Bot (ex: \`/sendluxa user:${CONFIG.BOT_ID} amount:1m\`)\n` +
                    `2️⃣ Tax dial 3.5% kat mchi l-Owner w l-baqi ky-idaf l balance dialk f-bot.\n` +
                    `3️⃣ Kat qdr tl3ab b \`/blackjack\`, \`/roulette\`, \`/crash\`, \`/mines\`, aw \`/coinflip\`!\n` +
                    `4️⃣ Kat chouf balance dialk b \`/profile\` aw ktb \`p\` f chat!`
                );
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'profile') {
            const targetUser = options.getUser('user') || member.user;
            const data = getUserData(targetUser.id);
            const level = Math.floor(data.balance / 1_000_000) + 1;

            const profEmbed = new EmbedBuilder()
                .setColor('#00d2d3')
                .setTitle(`💳 Profile & Credits - ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: '💰 Current Balance', value: `\`${data.balance.toLocaleString()} Luxa\``, inline: true },
                    { name: '🚀 Peak Credits', value: `\`${data.peak.toLocaleString()} Luxa\``, inline: true },
                    { name: '⭐ Level', value: `\`Lvl ${level}\``, inline: true },
                    { name: '🎁 Last Sent By', value: `\`${data.lastSender}\``, inline: false }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [profEmbed] });
        }

        if (commandName === 'givecredits') {
            const rawInput = options.getString('userid');
            const targetId = rawInput.replace(/[^0-9]/g, '');
            const amount = parseAmount(options.getString('amount'));

            if (!targetId) return interaction.reply({ content: '❌ User ID ma-saḥiḥch!', ephemeral: true });
            if (!amount || amount <= 0) return interaction.reply({ content: '❌ Amount ghlat!', ephemeral: true });

            addCredits(targetId, amount, member.user.tag);

            const logEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('💵 Admin Credits Added')
                .addFields(
                    { name: 'Admin', value: `${member.user.tag}`, inline: true },
                    { name: 'Target User', value: `<@${targetId}> (\`${targetId}\`)`, inline: true },
                    { name: 'Amount Added', value: `\`+${amount.toLocaleString()} Luxa\``, inline: true }
                )
                .setTimestamp();
            await sendLog(guild, logEmbed);

            return interaction.reply({ content: `✅ **+${amount.toLocaleString()} Luxa** tzadat l <@${targetId}>!`, ephemeral: true });
        }

        if (commandName === 'removecredits') {
            const rawInput = options.getString('userid');
            const targetId = rawInput.replace(/[^0-9]/g, '');
            const amount = parseAmount(options.getString('amount'));

            if (!targetId) return interaction.reply({ content: '❌ User ID ma-saḥiḥch!', ephemeral: true });
            if (!amount || amount <= 0) return interaction.reply({ content: '❌ Amount ghlat!', ephemeral: true });

            removeCredits(targetId, amount);

            const logEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('💸 Admin Credits Removed')
                .addFields(
                    { name: 'Admin', value: `${member.user.tag}`, inline: true },
                    { name: 'Target User', value: `<@${targetId}> (\`${targetId}\`)`, inline: true },
                    { name: 'Amount Removed', value: `\`-${amount.toLocaleString()} Luxa\``, inline: true }
                )
                .setTimestamp();
            await sendLog(guild, logEmbed);

            return interaction.reply({ content: `✅ **-${amount.toLocaleString()} Luxa** t-t3ydat mn <@${targetId}>!`, ephemeral: true });
        }

        if (commandName === 'transfer' || commandName === 'sendluxa') {
            const targetUser = options.getUser('user');
            const amount = parseAmount(options.getString('amount'));

            if (targetUser.id === member.id) return interaction.reply({ content: '❌ Ma-ymknch t-sift credits l rasak!', ephemeral: true });
            if (!amount || amount <= 0) return interaction.reply({ content: '❌ Amount ghlat!', ephemeral: true });

            const senderData = getUserData(member.id);
            if (senderData.balance < amount) {
                return interaction.reply({ content: `❌ Ma-3ndkch credits kfya! Balance: **${senderData.balance.toLocaleString()} Luxa**`, ephemeral: true });
            }

            removeCredits(member.id, amount);

            // TAX applies if sent directly to bot
            if (targetUser.id === CONFIG.BOT_ID) {
                const tax = Math.floor(amount * CONFIG.TAX_PERCENT);
                const finalAmount = amount - tax;

                addCredits(CONFIG.TAX_OWNER_ID, tax, `Tax from ${member.user.tag}`);
                addCredits(member.id, finalAmount, 'Deposit to Bot');

                return interaction.reply({
                    content: `📥 **Deposit Successful!**\n• Amount: **${amount.toLocaleString()} Luxa**\n• Tax (3.5%): **${tax.toLocaleString()} Luxa** sent to Owner\n• Added to your bot balance: **+${finalAmount.toLocaleString()} Luxa**`
                });
            }

            addCredits(targetUser.id, amount, member.user.tag);

            const logEmbed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('🔄 Credits Transfer')
                .addFields(
                    { name: 'From', value: `${member.user.tag}`, inline: true },
                    { name: 'To', value: `${targetUser.tag}`, inline: true },
                    { name: 'Amount', value: `\`${amount.toLocaleString()} Luxa\``, inline: true }
                )
                .setTimestamp();
            await sendLog(guild, logEmbed);

            return interaction.reply({ content: `💸 **${member}** ssift **${amount.toLocaleString()} Luxa** l **${targetUser}** b-najah!` });
        }

        // =========================================================================
        // ============================ CASINO MODES ===============================
        // =========================================================================

        // 1. BLACKJACK (Multiplier 2.5x)
        if (commandName === 'blackjack') {
            const bet = parseAmount(options.getString('bet'));
            if (!bet || bet <= 0) return interaction.reply({ content: '❌ Bet amount ghlat!', ephemeral: true });

            const userData = getUserData(member.id);
            if (userData.balance < bet) return interaction.reply({ content: `❌ Ma-3ndkch balance kfya! Balance dialk: **${userData.balance.toLocaleString()} Luxa**`, ephemeral: true });

            if (activeCasinoGames.has(member.id)) return interaction.reply({ content: '❌ 3ndk game active khra, kmlha hyya l'owla!', ephemeral: true });
            activeCasinoGames.add(member.id);

            removeCredits(member.id, bet);

            const deck = [2,3,4,5,6,7,8,9,10,10,10,10,11];
            const getCard = () => deck[Math.floor(Math.random() * deck.length)];

            let playerHand = [getCard(), getCard()];
            let dealerHand = [getCard(), getCard()];

            const calcScore = (hand) => {
                let score = hand.reduce((a, b) => a + b, 0);
                if (score > 21 && hand.includes(11)) {
                    score -= 10;
                }
                return score;
            };

            const buildEmbed = (finished = false) => {
                const pScore = calcScore(playerHand);
                const dScore = calcScore(dealerHand);
                return new EmbedBuilder()
                    .setColor('#f1c40f')
                    .setTitle(`🃏 Blackjack (Bet: ${bet.toLocaleString()} Luxa)`)
                    .addFields(
                        { name: '👤 Your Cards', value: `${playerHand.join(', ')} (Total: **${pScore}**)`, inline: true },
                        { name: '🤖 Dealer Cards', value: finished ? `${dealerHand.join(', ')} (Total: **${dScore}**)` : `${dealerHand[0]}, ?`, inline: true }
                    );
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit 🃏').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand 🛑').setStyle(ButtonStyle.Success)
            );

            const msg = await interaction.reply({ embeds: [buildEmbed()], components: [row], fetchReply: true });

            const collector = msg.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async (i) => {
                if (i.user.id !== member.id) return i.reply({ content: 'Machi dyalk had l-game!', ephemeral: true });

                if (i.customId === 'bj_hit') {
                    playerHand.push(getCard());
                    if (calcScore(playerHand) > 21) {
                        collector.stop('bust');
                    } else {
                        await i.update({ embeds: [buildEmbed()] });
                    }
                } else if (i.customId === 'bj_stand') {
                    collector.stop('stand');
                }
            });

            collector.on('end', async (_, reason) => {
                activeCasinoGames.delete(member.id);

                let pScore = calcScore(playerHand);
                let dScore = calcScore(dealerHand);

                while (dScore < 17 && reason === 'stand') {
                    dealerHand.push(getCard());
                    dScore = calcScore(dealerHand);
                }

                let resultMsg = '';
                if (reason === 'bust' || pScore > 21) {
                    resultMsg = `❌ **Bust! Khsrti ${bet.toLocaleString()} Luxa.**`;
                } else if (dScore > 21 || pScore > dScore) {
                    const winAmount = Math.floor(bet * 2.5);
                    addCredits(member.id, winAmount, 'Blackjack Win');
                    resultMsg = `🎉 **Mbrooook! Rbhti ${winAmount.toLocaleString()} Luxa! (2.5x)**`;
                } else if (pScore === dScore) {
                    addCredits(member.id, bet, 'Blackjack Tie');
                    resultMsg = `⚖️ **Egalite! Rj3at lik ${bet.toLocaleString()} Luxa.**`;
                } else {
                    resultMsg = `❌ **Khsrti! Dealer rbeh b ${dScore}.**`;
                }

                const finalEmbed = buildEmbed(true).setDescription(resultMsg);
                await msg.edit({ embeds: [finalEmbed], components: [] }).catch(() => {});
            });

            return;
        }

        // 2. ROULETTE
        if (commandName === 'roulette') {
            const bet = parseAmount(options.getString('bet'));
            const space = options.getString('space').toLowerCase();

            if (!bet || bet <= 0) return interaction.reply({ content: '❌ Bet ghlat!', ephemeral: true });
            const userData = getUserData(member.id);
            if (userData.balance < bet) return interaction.reply({ content: `❌ Ma-3ndkch balance kfya!`, ephemeral: true });

            removeCredits(member.id, bet);

            const spin = Math.floor(Math.random() * 37);
            const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
            let color = spin === 0 ? 'green' : redNumbers.includes(spin) ? 'red' : 'black';

            let won = false;
            let multiplier = 2;

            if (space === color) won = true;
            if (space === 'even' && spin !== 0 && spin % 2 === 0) won = true;
            if (space === 'odd' && spin !== 0 && spin % 2 !== 0) won = true;
            if (!isNaN(parseInt(space)) && parseInt(space) === spin) {
                won = true;
                multiplier = 36;
            }
            if (space === 'green' && spin === 0) multiplier = 14;

            let resultEmbed = new EmbedBuilder()
                .setTitle('🎰 Roulette Result')
                .addFields(
                    { name: 'L-Ra3qm:', value: `**${spin}** (${color.toUpperCase()})`, inline: true },
                    { name: 'Bet dialk:', value: `${space}`, inline: true }
                );

            if (won) {
                const winAmount = bet * multiplier;
                addCredits(member.id, winAmount, 'Roulette Win');
                resultEmbed.setColor('#57F287').setDescription(`🎉 **Mbrooook! Rbhti ${winAmount.toLocaleString()} Luxa!**`);
            } else {
                resultEmbed.setColor('#ED4245').setDescription(`❌ **Khsrti ${bet.toLocaleString()} Luxa!**`);
            }

            return interaction.reply({ embeds: [resultEmbed] });
        }

        // 3. CRASH
        if (commandName === 'crash') {
            const bet = parseAmount(options.getString('bet'));
            if (!bet || bet <= 0) return interaction.reply({ content: '❌ Bet ghlat!', ephemeral: true });

            const userData = getUserData(member.id);
            if (userData.balance < bet) return interaction.reply({ content: `❌ Balance ma kafyach!`, ephemeral: true });

            if (activeCasinoGames.has(member.id)) return interaction.reply({ content: '❌ 3ndk game active!', ephemeral: true });
            activeCasinoGames.add(member.id);

            removeCredits(member.id, bet);

            let currentMultiplier = 1.0;
            const crashPoint = (Math.random() * 3.5 + 1.1).toFixed(2);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('crash_cashout').setLabel('Cashout 💰').setStyle(ButtonStyle.Success)
            );

            const embed = new EmbedBuilder()
                .setColor('#f39c12')
                .setTitle('🚀 Crash Game')
                .setDescription(`Current Multiplier: **1.00x**\nBet: **${bet.toLocaleString()} Luxa**`);

            const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

            let cashedOut = false;

            const collector = msg.createMessageComponentCollector({ time: 15000 });

            const interval = setInterval(async () => {
                currentMultiplier = parseFloat((currentMultiplier + 0.2).toFixed(2));
                if (currentMultiplier >= crashPoint) {
                    clearInterval(interval);
                    collector.stop('crashed');
                } else if (!cashedOut) {
                    await msg.edit({
                        embeds: [new EmbedBuilder().setColor('#f39c12').setTitle('🚀 Crash Game').setDescription(`Current Multiplier: **${currentMultiplier}x**\nBet: **${bet.toLocaleString()} Luxa**`)]
                    }).catch(() => {});
                }
            }, 1200);

            collector.on('collect', async (i) => {
                if (i.user.id !== member.id) return i.reply({ content: 'Machi dyalk!', ephemeral: true });
                cashedOut = true;
                clearInterval(interval);
                collector.stop('cashout');
            });

            collector.on('end', async (_, reason) => {
                activeCasinoGames.delete(member.id);
                clearInterval(interval);

                if (reason === 'cashout') {
                    const winAmount = Math.floor(bet * currentMultiplier);
                    addCredits(member.id, winAmount, 'Crash Win');
                    await msg.edit({
                        embeds: [new EmbedBuilder().setColor('#57F287').setTitle('🚀 Cashout Successful!').setDescription(`🎉 Rbhti **${winAmount.toLocaleString()} Luxa** (Multiplier: **${currentMultiplier}x**)`)],
                        components: []
                    }).catch(() => {});
                } else {
                    await msg.edit({
                        embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('💥 CRASHED!').setDescription(`❌ Rocket tfrq3at f **${crashPoint}x**! Khsrti ${bet.toLocaleString()} Luxa.`)],
                        components: []
                    }).catch(() => {});
                }
            });

            return;
        }

        // 4. MINES
        if (commandName === 'mines') {
            const bet = parseAmount(options.getString('bet'));
            const bombCount = options.getInteger('bombs') || 3;

            if (!bet || bet <= 0) return interaction.reply({ content: '❌ Bet ghlat!', ephemeral: true });
            if (bombCount < 1 || bombCount > 24) return interaction.reply({ content: '❌ Bombs khass ikono bin 1 w 24!', ephemeral: true });

            const userData = getUserData(member.id);
            if (userData.balance < bet) return interaction.reply({ content: `❌ Balance ma kafyach!`, ephemeral: true });

            if (activeCasinoGames.has(member.id)) return interaction.reply({ content: '❌ 3ndk game active!', ephemeral: true });
            activeCasinoGames.add(member.id);

            removeCredits(member.id, bet);

            let grid = Array(25).fill('gem');
            let bombPositions = new Set();
            while (bombPositions.size < bombCount) {
                bombPositions.add(Math.floor(Math.random() * 25));
            }
            bombPositions.forEach(pos => grid[pos] = 'bomb');

            let revealed = Array(25).fill(false);
            let gemsFound = 0;
            let multiplier = 1.0;

            const buildRows = (disableAll = false) => {
                const rows = [];
                for (let i = 0; i < 5; i++) {
                    const row = new ActionRowBuilder();
                    for (let j = 0; j < 5; j++) {
                        const idx = i * 5 + j;
                        const btn = new ButtonBuilder().setCustomId(`mine_${idx}`);

                        if (revealed[idx] || disableAll) {
                            btn.setDisabled(true);
                            if (grid[idx] === 'bomb') btn.setLabel('💣').setStyle(ButtonStyle.Danger);
                            else btn.setLabel('💎').setStyle(ButtonStyle.Success);
                        } else {
                            btn.setLabel('❓').setStyle(ButtonStyle.Secondary);
                        }
                        row.addComponents(btn);
                    }
                    rows.push(row);
                }
                
                const controlRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('mine_cashout').setLabel(`Cashout (${Math.floor(bet * multiplier)} Luxa)`).setStyle(ButtonStyle.Primary).setDisabled(gemsFound === 0 || disableAll)
                );
                rows.push(controlRow);
                return rows;
            };

            const msg = await interaction.reply({
                content: `💣 **Mines Game** | Bet: **${bet.toLocaleString()} Luxa** | Multiplier: **${multiplier.toFixed(2)}x**`,
                components: buildRows(),
                fetchReply: true
            });

            const collector = msg.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async (i) => {
                if (i.user.id !== member.id) return i.reply({ content: 'Machi dyalk!', ephemeral: true });

                if (i.customId === 'mine_cashout') {
                    collector.stop('cashout');
                    return;
                }

                const idx = parseInt(i.customId.replace('mine_', ''));
                revealed[idx] = true;

                if (grid[idx] === 'bomb') {
                    collector.stop('bomb');
                } else {
                    gemsFound++;
                    multiplier += 0.25;
                    await i.update({
                        content: `💣 **Mines Game** | Gems: **${gemsFound}** | Multiplier: **${multiplier.toFixed(2)}x**`,
                        components: buildRows()
                    });
                }
            });

            collector.on('end', async (_, reason) => {
                activeCasinoGames.delete(member.id);

                if (reason === 'cashout') {
                    const winAmount = Math.floor(bet * multiplier);
                    addCredits(member.id, winAmount, 'Mines Win');
                    await msg.edit({
                        content: `🎉 **Cashout Successful!** Rbhti **${winAmount.toLocaleString()} Luxa**!`,
                        components: buildRows(true)
                    }).catch(() => {});
                } else {
                    await msg.edit({
                        content: `💥 **BOOM! Tfrq3at fik qanboula!** Khsrti ${bet.toLocaleString()} Luxa.`,
                        components: buildRows(true)
                    }).catch(() => {});
                }
            });

            return;
        }

        // 5. COINFLIP
        if (commandName === 'coinflip') {
            const bet = parseAmount(options.getString('bet'));
            const side = options.getString('side');

            if (!bet || bet <= 0) return interaction.reply({ content: '❌ Bet ghlat!', ephemeral: true });

            const userData = getUserData(member.id);
            if (userData.balance < bet) return interaction.reply({ content: `❌ Balance ma kafyach!`, ephemeral: true });

            removeCredits(member.id, bet);

            const result = Math.random() < 0.5 ? 'heads' : 'tails';
            if (result === side) {
                const winAmount = bet * 2;
                addCredits(member.id, winAmount, 'Coinflip Win');
                return interaction.reply(`🪙 Coin landed on **${result.toUpperCase()}**! 🎉 Rbhti **${winAmount.toLocaleString()} Luxa**!`);
            } else {
                return interaction.reply(`🪙 Coin landed on **${result.toUpperCase()}**! ❌ Khsrti **${bet.toLocaleString()} Luxa**.`);
            }
        }

        // ================= STANDARD COMMANDS =================
        if (commandName === 'spin' || commandName === 'spin5') {
            if (channel.parentId !== CONFIG.SPIN_CATEGORY_ID) {
                return interaction.reply({ content: '❌ Kat-st3ml had l-command ghir f-Ticket d Spin!', ephemeral: true });
            }

            await interaction.deferReply();

            const isSuper = commandName === 'spin5';
            const reqInvites = isSuper ? 5 : 1;

            const totalInvites = await getUserInviteCount(guild, member.id);
            const consumed = usedSpins.get(member.id) || 0;
            const availableSpins = totalInvites - consumed;

            if (availableSpins < reqInvites) {
                return interaction.editReply({ 
                    content: `❌ **Ma-3ndkch kfya d Invites!**\n\n• Total Invites: **${totalInvites}**\n• Consumed Invites: **${consumed}**\n• Available Spins: **${availableSpins}**\n\n> Khassk **${reqInvites - availableSpins}** invite(s) extra bch t-spini!`
                });
            }

            usedSpins.set(member.id, consumed + reqInvites);

            let rewards = isSuper 
                ? [{ label: '2M', weight: 70 }, { label: '8M', weight: 20 }, { label: '15M', weight: 10 }]
                : [{ label: '3M', weight: 60 }, { label: '5M', weight: 30 }, { label: '10M', weight: 10 }];

            const wonLabel = getWeightedRandom(rewards);
            const rewardCredits = parseAmount(wonLabel);

            addCredits(member.id, rewardCredits, 'Spin Wheel');

            const logEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('🎰 Spin Credits Won')
                .addFields(
                    { name: 'User', value: `${member.user.tag}`, inline: true },
                    { name: 'Type', value: isSuper ? 'Super Spin (5)' : 'Spin (1)', inline: true },
                    { name: 'Credits Won', value: `\`+${rewardCredits.toLocaleString()} Luxa\``, inline: true }
                )
                .setTimestamp();
            await sendLog(guild, logEmbed);

            return interaction.editReply({ 
                content: `🎰 **Spin Result:** Mabrouk ${member}! Reb7ti **${wonLabel}**! 🎉\n` +
                         `💳 **+${rewardCredits.toLocaleString()} Luxa** tzadat f l'account dialk automatiquement!\n` +
                         `*(Remaining Available Spins: ${availableSpins - reqInvites})*` 
            });
        }

        if (commandName === 'points' || commandName === 'invites') {
            await interaction.deferReply();
            const targetUser = options.getUser('user') || member.user;
            const totalInvites = await getUserInviteCount(guild, targetUser.id);
            const consumed = usedSpins.get(targetUser.id) || 0;
            const availableSpins = Math.max(0, totalInvites - consumed);

            const invEmbed = new EmbedBuilder()
                .setColor('#00ff7f')
                .setTitle(`📩 Tracker - ${targetUser.username}`)
                .addFields(
                    { name: '📥 Total Invites', value: `\`${totalInvites}\``, inline: true },
                    { name: '🎰 Used Spins', value: `\`${consumed}\``, inline: true },
                    { name: '✨ Available Spins / Points', value: `\`${availableSpins}\``, inline: true }
                )
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            return interaction.editReply({ embeds: [invEmbed] });
        }

        if (commandName === 'setup-verify') {
            const embed = new EmbedBuilder()
                .setColor('#8a2be2')
                .setTitle('🧬 community')
                .setDescription(
                    `**Welcome to the community server**\n\n` +
                    `Here, there is no luck...\nOnly **skill**, **speed**, and **precision** define the outcome.\n\n` +
                    `⚔️ **Fast-paced community system** for intense interaction\n` +
                    `🎯 **100% Active members**\n` +
                    `🔒 **Strong protection** with advanced Anti-Cheat systems\n\n` +
                    `Are you ready to join us?`
                )
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .setImage(CONFIG.BANNER_URL);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_verify').setLabel('Verify ✅').setStyle(ButtonStyle.Success)
            );

            await channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: '✅ Verify Panel Sent!', ephemeral: true });
        }

        if (commandName === 'setup-ticket') {
            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('🔮 ⚡ TANJYA • Ticket Support System')
                .setDescription(
                    `• We want to keep our community safe, friendly, and fun for everyone:\n\n` +
                    `• 🛡️ **Pub** : \`Report spam or pub\` ⚔️\n` +
                    `• 🔑 **Bugs** : \`Report bugs or issues\` ⚔️\n` +
                    `• 🛠️ **Abuse** : \`Report abuse or harassment\` ⚔️\n` +
                    `• 👾 **Server** : \`Server info or requests\` ⚔️\n` +
                    `• 🔨 **Staff Abuse** : \`Report staff issues\` ⚔️\n` +
                    `• 💵 **Donate** : \`Support The Server\` ⚔️\n` +
                    `• 🎰 **Spin Wheel** : \`Open Spin Ticket\` ⚔️\n\n` +
                    `• 🌸 ⚡ Use these modules for assistance.`
                )
                .setThumbnail(CONFIG.THUMBNAIL_URL)
                .setImage(CONFIG.BANNER_URL);

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_pub').setLabel('Pub').setStyle(ButtonStyle.Secondary).setEmoji('🛡️'),
                new ButtonBuilder().setCustomId('ticket_bugs').setLabel('Bugs').setStyle(ButtonStyle.Secondary).setEmoji('🔑'),
                new ButtonBuilder().setCustomId('ticket_abuse').setLabel('Abuse').setStyle(ButtonStyle.Secondary).setEmoji('🛠️')
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_server').setLabel('Server').setStyle(ButtonStyle.Secondary).setEmoji('👾'),
                new ButtonBuilder().setCustomId('ticket_staff').setLabel('Staff').setStyle(ButtonStyle.Secondary).setEmoji('🔨'),
                new ButtonBuilder().setCustomId('ticket_donate').setLabel('Donate').setStyle(ButtonStyle.Success).setEmoji('💵'),
                new ButtonBuilder().setCustomId('ticket_spin').setLabel('Spin Wheel').setStyle(ButtonStyle.Primary).setEmoji('🎰')
            );

            await channel.send({ embeds: [embed], components: [row1, row2] });
            return interaction.reply({ content: '✅ Ticket Panel Sent!', ephemeral: true });
        }

        if (commandName === 'say') {
            const embed = new EmbedBuilder().setColor('#2b2d31').setDescription(options.getString('text'));
            await channel.send({ embeds: [embed] });
            return interaction.reply({ content: 'Done', ephemeral: true });
        }

        if (commandName === 'come') {
            const target = options.getUser('user');
            await target.send(`You have been summoned by ${member} in ${channel}!`).catch(() => {});
            return interaction.reply({ content: `Summoned ${target}.`, ephemeral: true });
        }

        if (commandName === 'ban') {
            const target = options.getUser('user');
            const reason = options.getString('reason') || 'No reason provided';
            const targetMember = await guild.members.fetch(target.id).catch(() => null);

            if (!targetMember || !targetMember.bannable) {
                return interaction.reply({ content: '❌ Ma-ymknch l-bot y-banni had l-user!', ephemeral: true });
            }

            await targetMember.ban({ reason });
            return interaction.reply({ content: `✅ **${target.tag}** t-banna b-najah! Reason: ${reason}` });
        }

        if (commandName === 'timeout') {
            const target = options.getUser('user');
            const durationStr = options.getString('duration');
            const ms = parseDuration(durationStr);

            if (!ms) {
                return interaction.reply({ content: '❌ Duration ghlat! St3ml format bḥal: `10m`, `2h`, `1d`.', ephemeral: true });
            }

            const targetMember = await guild.members.fetch(target.id).catch(() => null);
            if (!targetMember || !targetMember.moderatable) {
                return interaction.reply({ content: '❌ Ma-ymknch l-bot y-dirlih timeout!', ephemeral: true });
            }

            await targetMember.timeout(ms, `Timeout by ${member.user.tag}`);
            return interaction.reply({ content: `✅ **${target.tag}** t-darlih timeout l-moddat **${durationStr}**!` });
        }

        if (commandName === 'security') {
            SECURITY_MODE = options.getString('status') === 'on';
            return interaction.reply({ content: `🛡️ Security mode: **${SECURITY_MODE ? 'ON' : 'OFF'}**.` });
        }
    }

    // --- BUTTON INTERACTIONS ---
    if (interaction.isButton()) {
        const { customId, guild, member, channel } = interaction;

        if (customId === 'confirm_ms7') {
            await interaction.deferUpdate();
            const deleteCount = pendingPurges.get(channel.id) || 10;
            pendingPurges.delete(channel.id);

            try {
                const deleted = await channel.bulkDelete(deleteCount + 2, true);
                const msg = await channel.send(`✅ **Tm3ato ${deleted.size - 2} messages b-najah!**`);
                setTimeout(() => msg.delete().catch(() => {}), 3000);
            } catch (err) {
                await channel.send('❌ Ma-qdrch l-bot ymseh l-messages.');
            }
            return;
        }

        if (customId === 'cancel_ms7') {
            await interaction.deferUpdate();
            pendingPurges.delete(channel.id);
            return interaction.message.delete().catch(() => {});
        }

        if (customId === 'btn_verify') {
            await member.roles.add(CONFIG.VERIFIED_ROLE_ID).catch(() => {});
            return interaction.reply({ content: '✅ Verified successfully!', ephemeral: true });
        }

        if (customId.startsWith('ticket_')) {
            const typeKey = customId.replace('ticket_', '');
            const ticketConfig = CONFIG.TICKETS[typeKey];

            if (!ticketConfig) return;

            const ticketId = ticketCounter++;
            const sanitizedUser = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
            const ticketChannel = await guild.channels.create({
                name: `${ticketConfig.name.toLowerCase()}-${sanitizedUser || 'user'}`,
                type: ChannelType.GuildText,
                parent: ticketConfig.category,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
                    { id: ticketConfig.staffRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const welcomeMsg = typeKey === 'spin' 
                ? `Welcome ${member}! Use \`/spin\` or \`/spin5\` here to spin.`
                : `Hello ${member}, welcome to your ticket`;

            const ticketEmbed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`🏺 Ticket #${ticketId}`)
                .setDescription(welcomeMsg)
                .addFields(
                    { name: 'Type', value: `\`${ticketConfig.name.toLowerCase()}\``, inline: true },
                    { name: 'Created By', value: `${member}`, inline: true },
                    { name: 'ID', value: `\`#${ticketId}\``, inline: true }
                )
                .setThumbnail(member.user.displayAvatarURL())
                .setFooter({ text: `Vynel • Tickets` })
                .setTimestamp();

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('close_ticket_reason').setLabel('Close with Reason').setStyle(ButtonStyle.Secondary)
            );

            await ticketChannel.send({ content: `${member}`, embeds: [ticketEmbed], components: [actionRow] });
            return interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });
        }

        if (customId === 'close_ticket') {
            await interaction.reply({ content: '🔒 Ticket closing in 5 seconds...' });
            setTimeout(() => channel.delete().catch(() => {}), 5000);
        }

        if (customId === 'close_ticket_reason') {
            const modal = new ModalBuilder()
                .setCustomId('modal_close_reason')
                .setTitle('Close Ticket Reason');

            const reasonInput = new TextInputBuilder()
                .setCustomId('reason_input')
                .setLabel('Reason for closing')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            await interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_close_reason') {
            const reason = interaction.fields.getTextInputValue('reason_input');
            await interaction.reply({ content: `🔒 Closing ticket. Reason: **${reason}**` });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 4000);
        }
    }
});

client.login(CONFIG.TOKEN);
