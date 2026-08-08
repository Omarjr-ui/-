// ================= GLOBAL ERROR HANDLERS (PREVENT CRASHES) =================
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [CRASH PREVENTION] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err, origin) => {
    console.error('⚠️ [CRASH PREVENTION] Uncaught Exception:', err, 'origin:', origin);
});

process.on('uncaughtExceptionMonitor', (err, origin) => {
    console.error('⚠️ [CRASH PREVENTION] Uncaught Exception Monitor:', err, 'origin:', origin);
});

const { 
    Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, 
    SlashCommandBuilder, REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');

// ================= KEEP ALIVE SERVER =================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send('Skill Tower Bot is Online and Healthy!');
});

app.listen(PORT, () => {
    console.log(`🌐 Keep-Alive web server running on port ${PORT}`);
});

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
    }
};

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

// ================= BOT READY & SLASH COMMANDS =================
client.once('ready', async () => {
    loadDatabase();
    console.log(`🤖 Bot online as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('profile').setDescription('Check your credits profile, peak & level').addUserOption(opt => opt.setName('user').setDescription('User to check')),
        new SlashCommandBuilder().setName('sendluxa').setDescription('Transfer credits securely').addUserOption(opt => opt.setName('user').setDescription('Target User').setRequired(true)).addStringOption(opt => opt.setName('amount').setDescription('e.g. 100k, 1m, 5000').setRequired(true)),
        new SlashCommandBuilder().setName('transfer').setDescription('Transfer credits to another user').addUserOption(opt => opt.setName('user').setDescription('Target User').setRequired(true)).addStringOption(opt => opt.setName('amount').setDescription('Amount e.g 1m').setRequired(true)),
        new SlashCommandBuilder().setName('givecredits').setDescription('Give credits to a user (Owner Only)').addStringOption(opt => opt.setName('userid').setDescription('Target User ID or Mention').setRequired(true)).addStringOption(opt => opt.setName('amount').setDescription('Amount of credits e.g 10m').setRequired(true)),
        new SlashCommandBuilder().setName('removecredits').setDescription('Remove credits from a user (Owner Only)').addStringOption(opt => opt.setName('userid').setDescription('Target User ID or Mention').setRequired(true)).addStringOption(opt => opt.setName('amount').setDescription('Amount of credits e.g 10m').setRequired(true)),
        new SlashCommandBuilder().setName('idbot').setDescription('Get bot ID & deposit instructions'),
        new SlashCommandBuilder().setName('tutorial').setDescription('How to deposit and play games')
    ];

    const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID), { body: commands });
        console.log('✅ Commands Registered');
    } catch (err) {
        console.error('Error registering commands:', err);
    }
});

// ================= MESSAGE COMMANDS (p, c, sd, 7l, ms7) =================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const args = message.content.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    // Command "p" (Profile)
    if (cmd === 'p') {
        const targetUser = message.mentions.users.first() || message.author;
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

        return message.reply({ embeds: [profEmbed] });
    }

    // Command "c" (Transfer / Deposit)
    if (cmd === 'c') {
        if (args.length < 3) return message.reply("❌ Format: `c @user 1m` aw `c @Skill Tower 1m`");

        const targetUser = message.mentions.users.first();
        const rawAmount = args[2];
        const amount = parseAmount(rawAmount);

        if (!targetUser) return message.reply("❌ Taggi user s'hih!");
        if (!amount || amount <= 0) return message.reply('❌ Amount ghlat!');

        // Deposit to Bot
        if (targetUser.id === CONFIG.BOT_ID) {
            const tax = Math.floor(amount * CONFIG.TAX_PERCENT);
            const finalAmount = amount - tax;

            // 1. Sift tax l owner
            addCredits(CONFIG.TAX_OWNER_ID, tax, `Tax from ${message.author.tag}`);
            // 2. Zid l-mablagh li bqa f hesab l-user f l-bot
            addCredits(message.author.id, finalAmount, 'Deposit System');

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#57F287')
                        .setTitle('📥 Deposit Confirmed & Tax Applied')
                        .setDescription(`✅ **${amount.toLocaleString()} Luxa** Received!\n\n• 💸 **Tax (3.5%):** \`${tax.toLocaleString()}\` sent to Owner.\n• 💰 **Added to Balance:** \`+${finalAmount.toLocaleString()} Luxa\``)
                ]
            });
        }

        // Transfer to normal user
        if (targetUser.id === message.author.id) return message.reply('❌ Ma-ymknch t-sift credits l rasak!');

        const senderData = getUserData(message.author.id);
        if (senderData.balance < amount) {
            return message.reply(`❌ Ma-3ndkch credits kfya! Balance: **${senderData.balance.toLocaleString()} Luxa**`);
        }

        removeCredits(message.author.id, amount);
        addCredits(targetUser.id, amount, message.author.tag);

        return message.reply(`💸 **${message.author}** ssift **${amount.toLocaleString()} Luxa** l **${targetUser}** b-najah!`);
    }

    // Command "sd" (Close Channel Permissions / Lock)
    if (cmd === 'sd') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply("❌ Ma-3ndkch permission باش t-sed l-channel!");
        }
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply("🔒 **L-channel t-sddat b-najaḥ!**");
    }

    // Command "7l" (Open Channel Permissions / Unlock)
    if (cmd === '7l') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply("❌ Ma-3ndkch permission باش t-ḥel l-channel!");
        }
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        return message.reply("🔓 **L-channel t-ḥllat b-najaḥ!**");
    }

    // Command "ms7" (Purge / Clear Messages)
    if (cmd === 'ms7') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply("❌ Ma-3ndkch permission باش t-mseḥ l-messages!");
        }
        const count = parseInt(args[1]) || 10;
        if (count < 1 || count > 100) return message.reply("❌ Khter raqm bin 1 w 100!");

        await message.channel.bulkDelete(count + 1, true).catch(err => {
            return message.reply("❌ Ma-ymknch tseḥ messages li fatet 3lihom 14 yom!");
        });

        const replyMsg = await message.channel.send(`🧹 **T-mseḥ ${count} message b-najaḥ!**`);
        setTimeout(() => replyMsg.delete().catch(() => {}), 3000);
    }
});

// ================= INTERACTION HANDLER (SLASH COMMANDS) =================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member } = interaction;

    if (commandName === 'idbot') {
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🤖 Bot ID & Info')
            .setDescription(`• **Bot Mention:** <@${CONFIG.BOT_ID}>\n• **Bot ID:** \`${CONFIG.BOT_ID}\`\n\n**Kifach t-dirlu Deposit:**\n\`c @Skill Tower | V1 [amount]\``)
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'tutorial') {
        const embed = new EmbedBuilder()
            .setColor('#FEE75C')
            .setTitle('📖 How to Play & Deposit')
            .setDescription(`**1️⃣ Deposit Credits:**\nSend \`c @Skill Tower | V1 [amount]\` (e.g. \`c @Skill Tower | V1 1m\`)\n\n**2️⃣ Check Profile:**\nType \`p\` or use \`/profile\`\n\n**3️⃣ Transfer Credits:**\nSend \`c @user [amount]\` or use \`/transfer\``)
            .setImage(CONFIG.LINE_IMAGE_URL)
            .setTimestamp();

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

    if (commandName === 'transfer' || commandName === 'sendluxa') {
        const targetUser = options.getUser('user');
        const amount = parseAmount(options.getString('amount'));

        if (!targetUser) return interaction.reply({ content: '❌ User ma-moujoudch!', ephemeral: true });
        if (targetUser.id === member.id) return interaction.reply({ content: '❌ Ma-ymknch t-sift credits l rasak!', ephemeral: true });
        if (!amount || amount <= 0) return interaction.reply({ content: '❌ Amount ghlat!', ephemeral: true });

        if (targetUser.id === CONFIG.BOT_ID) {
            const tax = Math.floor(amount * CONFIG.TAX_PERCENT);
            const finalAmount = amount - tax;

            addCredits(CONFIG.TAX_OWNER_ID, tax, `Tax from ${member.user.tag}`);
            addCredits(member.id, finalAmount, 'Deposit to Bot');

            return interaction.reply({
                content: `📥 **Deposit Successful!**\n• Amount: **${amount.toLocaleString()} Luxa**\n• Tax (3.5%): **${tax.toLocaleString()} Luxa** sent to Owner\n• Added to your bot balance: **+${finalAmount.toLocaleString()} Luxa**`
            });
        }

        const senderData = getUserData(member.id);
        if (senderData.balance < amount) {
            return interaction.reply({ content: `❌ Ma-3ndkch credits kfya! Balance: **${senderData.balance.toLocaleString()} Luxa**`, ephemeral: true });
        }

        removeCredits(member.id, amount);
        addCredits(targetUser.id, amount, member.user.tag);
        return interaction.reply({ content: `💸 **${member}** ssift **${amount.toLocaleString()} Luxa** l **${targetUser}** b-najah!` });
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
});

client.login(CONFIG.TOKEN);
