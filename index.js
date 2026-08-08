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

    CASINO_CHANNELS_IDS: [], 

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
const activeCasinoGames = new Set();

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

async function sendLog(guild, embed) {
    try {
        const logChannel = guild.channels.cache.get(CONFIG.LOGS_CHANNEL_ID) || await guild.channels.fetch(CONFIG.LOGS_CHANNEL_ID).catch(() => null);
        if (logChannel) await logChannel.send({ embeds: [embed] });
    } catch (err) {
        console.error("Log error:", err);
    }
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
        
        new SlashCommandBuilder().setName('sendluxa').setDescription('Transfer credits securely').addUserOption(opt => opt.setName('user').setDescription('Target User').setRequired(true)).addStringOption(opt => opt.setName('amount').setDescription('e.g. 100k, 1m, 5000').setRequired(true)),
        new SlashCommandBuilder().setName('transfer').setDescription('Transfer credits to another user').addUserOption(opt => opt.setName('user').setDescription('Target User').setRequired(true)).addStringOption(opt => opt.setName('amount').setDescription('Amount e.g 1m').setRequired(true)),
        new SlashCommandBuilder().setName('givecredits').setDescription('Give credits to a user (Owner Only)').addStringOption(opt => opt.setName('userid').setDescription('Target User ID or Mention').setRequired(true)).addStringOption(opt => opt.setName('amount').setDescription('Amount of credits e.g 10m').setRequired(true)),
        new SlashCommandBuilder().setName('removecredits').setDescription('Remove credits from a user (Owner Only)').addStringOption(opt => opt.setName('userid').setDescription('Target User ID or Mention').setRequired(true)).addStringOption(opt => opt.setName('amount').setDescription('Amount of credits e.g 10m').setRequired(true)),

        new SlashCommandBuilder().setName('idbot').setDescription('Get bot ID & deposit instructions'),
        new SlashCommandBuilder().setName('tutorial').setDescription('How to deposit and play games'),

        new SlashCommandBuilder().setName('blackjack').setDescription('Play Blackjack (Multiplier 2.5x)').addStringOption(opt => opt.setName('bet').setDescription('Amount to bet (e.g. 100k, 1m)').setRequired(true)),
        new SlashCommandBuilder().setName('roulette').setDescription('Play Roulette').addStringOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true)).addStringOption(opt => opt.setName('space').setDescription('red, black, green, even, odd, or number (0-36)').setRequired(true)),
        new SlashCommandBuilder().setName('crash').setDescription('Play Crash Game').addStringOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true)),
        new SlashCommandBuilder().setName('mines').setDescription('Play Mines').addStringOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true)).addIntegerOption(opt => opt.setName('bombs').setDescription('Number of bombs (1-24)').setRequired(false)),
        new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin').addStringOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true)).addStringOption(opt => opt.setName('side').setDescription('heads or tails').setRequired(true).addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })),

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

// ================= MESSAGE CREATE LISTENERS =================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Check Profile b command "p"
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

    // Transfer b command "c @user amount"
    if (message.content.startsWith('c ')) {
        const parts = message.content.split(/\s+/);
        if (parts.length >= 3) {
            const targetUser = message.mentions.users.first();
            const rawAmount = parts[2];
            const amount = parseAmount(rawAmount);

            if (!targetUser) return message.reply("❌ Taggi user s'hih! Format: `c @user 1m`");
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

    // Deposit check: Khasa tkoun "c @Bot 1m" aw "c BOT_ID 1m" mashy ghir mention 3adiya
    if (message.content.toLowerCase().startsWith('c ') && (message.mentions.users.has(CONFIG.BOT_ID) || message.content.includes(CONFIG.BOT_ID))) {
        const parts = message.content.split(/\s+/);
        if (parts.length >= 3) {
            const amount = parseAmount(parts[2]);
            if (amount && amount > 0) {
                const tax = Math.floor(amount * CONFIG.TAX_PERCENT);
                const finalAmount = amount - tax;

                addCredits(CONFIG.TAX_OWNER_ID, tax, `Tax from ${message.author.tag}`);
                addCredits(message.author.id, finalAmount, 'Deposit System');

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#57F287')
                            .setTitle('📥 Deposit Confirmed & Tax Applied')
                            .setDescription(`✅ **${amount.toLocaleString()} Luxa** Recieved!\n\n• 💸 **Tax (3.5%):** \`${tax.toLocaleString()}\` sent to Owner.\n• 💰 **Added to Balance:** \`+${finalAmount.toLocaleString()} Luxa\``)
                    ]
                });
            }
        }
    }
});

// ================= INTERACTION HANDLER =================
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, member, channel } = interaction;

        const publicCmds = ['spin', 'spin5', 'invites', 'points', 'profile', 'transfer', 'sendluxa', 'idbot', 'tutorial', 'blackjack', 'roulette', 'crash', 'mines', 'coinflip'];
        if (!publicCmds.includes(commandName) && !hasCommandRole(member, commandName)) {
            return interaction.reply({ content: '❌ MA3NDKCH ROLE BCH T-ST3ML HAD L-COMMAND!', ephemeral: true });
        }

        const casinoCmds = ['blackjack', 'roulette', 'crash', 'mines', 'coinflip'];
        if (casinoCmds.includes(commandName) && !isCasinoChannel(channel.id)) {
            return interaction.reply({ content: '❌ Had l-command mssmouha ghir f les channels dial Casino!', ephemeral: true });
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

            return interaction.reply({ content: `✅ **+${amount.toLocaleString()} Luxa** tzadat l <@${targetId}>!`, ephemeral: true });
        }

        if (commandName === 'removecredits') {
            const rawInput = options.getString('userid');
            const targetId = rawInput.replace(/[^0-9]/g, '');
            const amount = parseAmount(options.getString('amount'));

            if (!targetId) return interaction.reply({ content: '❌ User ID ma-saḥiḥch!', ephemeral: true });
            if (!amount || amount <= 0) return interaction.reply({ content: '❌ Amount ghlat!', ephemeral: true });

            removeCredits(targetId, amount);

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
            return interaction.reply({ content: `💸 **${member}** ssift **${amount.toLocaleString()} Luxa** l **${targetUser}** b-najah!` });
        }
    }
});

// Bach tmseh l-balance l-khafjiya l-qdima f-lfile JSON dialk, tqdr t-msh l-file `userProfiles.json` aw t-snyf fih `{}` mlli t-ftah.
