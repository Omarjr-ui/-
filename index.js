const { 
    Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, 
    SlashCommandBuilder, REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');

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
    CLIENT_ID: process.env.CLIENT_ID,
    VERIFIED_ROLE_ID: "1535350311068242010",
    LOGS_CHANNEL_ID: "1535351343529594950",
    SPIN_CATEGORY_ID: "1535350881111769148",

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
const userProfiles = new Map();

function getUserData(userId) {
    if (!userProfiles.has(userId)) {
        userProfiles.set(userId, { balance: 0, peak: 0, lastSender: 'None' });
    }
    return userProfiles.get(userId);
}

function addCredits(userId, amount, senderName = 'System') {
    const data = getUserData(userId);
    data.balance += amount;
    if (data.balance > data.peak) {
        data.peak = data.balance;
    }
    if (senderName !== 'System') {
        data.lastSender = senderName;
    }
    userProfiles.set(userId, data);
}

function removeCredits(userId, amount) {
    const data = getUserData(userId);
    data.balance = Math.max(0, data.balance - amount);
    userProfiles.set(userId, data);
}

function parseRewardValue(label) {
    const match = label.match(/^(\d+)([MK])?$/i);
    if (!match) return 0;
    const num = parseInt(match[1], 10);
    const unit = match[2] ? match[2].toUpperCase() : '';
    if (unit === 'M') return num * 1_000_000;
    if (unit === 'K') return num * 1_000;
    return num;
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

// ================= BOT READY & SLASH COMMANDS =================
client.once('ready', async () => {
    console.log(`🤖 Bot online as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('setup-verify').setDescription('Setup Custom Verification Panel'),
        new SlashCommandBuilder().setName('setup-ticket').setDescription('Setup TANJYA Ticket Support System'),
        new SlashCommandBuilder().setName('spin').setDescription('Spin the Wheel (Requires 1 available invite)'),
        new SlashCommandBuilder().setName('spin5').setDescription('Super Spin (Requires 5 available invites)'),
        new SlashCommandBuilder().setName('invites').setDescription('Check your invite count & available spins').addUserOption(opt => opt.setName('user').setDescription('User to check')),
        new SlashCommandBuilder().setName('points').setDescription('Check your remaining Spin points').addUserOption(opt => opt.setName('user').setDescription('User to check')),
        new SlashCommandBuilder().setName('profile').setDescription('Check your credits profile, peak & level').addUserOption(opt => opt.setName('user').setDescription('User to check')),
        new SlashCommandBuilder().setName('transfer').setDescription('Transfer credits to another user').addUserOption(opt => opt.setName('user').setDescription('Target User').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Amount of credits').setRequired(true)),
        new SlashCommandBuilder().setName('givecredits').setDescription('Give credits to a user ID (Owner Only)').addStringOption(opt => opt.setName('userid').setDescription('Target User ID').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Amount of credits').setRequired(true)),
        new SlashCommandBuilder().setName('removecredits').setDescription('Remove credits from a user ID (Owner Only)').addStringOption(opt => opt.setName('userid').setDescription('Target User ID').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Amount of credits').setRequired(true)),
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

        const publicCmds = ['spin', 'spin5', 'invites', 'points', 'profile', 'transfer'];
        if (!publicCmds.includes(commandName) && !hasCommandRole(member, commandName)) {
            return interaction.reply({ content: '❌ MA3NDKCH ROLE BCH T-ST3ML HAD L-COMMAND!', ephemeral: true });
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
                    { name: '💰 Current Credits', value: `\`${data.balance.toLocaleString()} Credits\``, inline: true },
                    { name: '🚀 Peak Credits', value: `\`${data.peak.toLocaleString()} Credits\``, inline: true },
                    { name: '⭐ Level', value: `\`Lvl ${level}\``, inline: true },
                    { name: '🎁 Last Sent By', value: `\`${data.lastSender}\``, inline: false }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [profEmbed] });
        }

        if (commandName === 'givecredits') {
            const targetId = options.getString('userid');
            const amount = options.getInteger('amount');

            if (amount <= 0) return interaction.reply({ content: '❌ Amount khass ykon kbr mn 0!', ephemeral: true });

            addCredits(targetId, amount, member.user.tag);

            const logEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('💵 Admin Credits Added')
                .addFields(
                    { name: 'Admin', value: `${member.user.tag}`, inline: true },
                    { name: 'Target User ID', value: `\`${targetId}\``, inline: true },
                    { name: 'Amount Added', value: `\`+${amount.toLocaleString()} Credits\``, inline: true }
                )
                .setTimestamp();
            await sendLog(guild, logEmbed);

            return interaction.reply({ content: `✅ **+${amount.toLocaleString()} Credits** tzadat l User ID: \`${targetId}\`!`, ephemeral: true });
        }

        if (commandName === 'removecredits') {
            const targetId = options.getString('userid');
            const amount = options.getInteger('amount');

            if (amount <= 0) return interaction.reply({ content: '❌ Amount khass ykon kbr mn 0!', ephemeral: true });

            removeCredits(targetId, amount);

            const logEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('💸 Admin Credits Removed')
                .addFields(
                    { name: 'Admin', value: `${member.user.tag}`, inline: true },
                    { name: 'Target User ID', value: `\`${targetId}\``, inline: true },
                    { name: 'Amount Removed', value: `\`-${amount.toLocaleString()} Credits\``, inline: true }
                )
                .setTimestamp();
            await sendLog(guild, logEmbed);

            return interaction.reply({ content: `✅ **-${amount.toLocaleString()} Credits** t-t3ydat mn User ID: \`${targetId}\`!`, ephemeral: true });
        }

        if (commandName === 'transfer') {
            const targetUser = options.getUser('user');
            const amount = options.getInteger('amount');

            if (targetUser.id === member.id) return interaction.reply({ content: '❌ Ma-ymknch t-sift credits l rasak!', ephemeral: true });
            if (amount <= 0) return interaction.reply({ content: '❌ Amount khass ykon kbr mn 0!', ephemeral: true });

            const senderData = getUserData(member.id);
            if (senderData.balance < amount) {
                return interaction.reply({ content: `❌ Ma-3ndkch credits kfya! Current Balance: **${senderData.balance.toLocaleString()}**`, ephemeral: true });
            }

            removeCredits(member.id, amount);
            addCredits(targetUser.id, amount, member.user.tag);

            const logEmbed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('🔄 Credits Transfer')
                .addFields(
                    { name: 'From', value: `${member.user.tag}`, inline: true },
                    { name: 'To', value: `${targetUser.tag}`, inline: true },
                    { name: 'Amount', value: `\`${amount.toLocaleString()} Credits\``, inline: true }
                )
                .setTimestamp();
            await sendLog(guild, logEmbed);

            return interaction.reply({ content: `💸 **${member}** ssift **${amount.toLocaleString()} Credits** l **${targetUser}** b-najah!` });
        }

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
            const rewardCredits = parseRewardValue(wonLabel);

            addCredits(member.id, rewardCredits, 'Spin Wheel');

            const logEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('🎰 Spin Credits Won')
                .addFields(
                    { name: 'User', value: `${member.user.tag}`, inline: true },
                    { name: 'Type', value: isSuper ? 'Super Spin (5)' : 'Spin (1)', inline: true },
                    { name: 'Credits Won', value: `\`+${rewardCredits.toLocaleString()} Credits\``, inline: true }
                )
                .setTimestamp();
            await sendLog(guild, logEmbed);

            return interaction.editReply({ 
                content: `🎰 **Spin Result:** Mabrouk ${member}! Reb7ti **${wonLabel}**! 🎉\n` +
                         `💳 **+${rewardCredits.toLocaleString()} Credits** tzadat f l'account dialk automatiquement!\n` +
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

// ================= CHAT COMMANDS =================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.toLowerCase().trim();

    if (content === 'bisous' || content === 'bisou') {
        return message.channel.send('💋💋 **BOUSSA KBIRA LIK!** 💋💋');
    }

    if (content === 'line') {
        await message.delete().catch(() => {});
        return message.channel.send(CONFIG.LINE_IMAGE_URL);
    }

    if (content === 'sd') {
        if (!hasCommandRole(message.member, 'setup')) return;
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.channel.send('🔒 Channel status: **CLOSED**');
    }

    if (content === '7l') {
        if (!hasCommandRole(message.member, 'setup')) return;
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        return message.channel.send('🔓 Channel status: **OPEN**');
    }

    if (content.startsWith('ms7')) {
        if (!hasCommandRole(message.member, 'setup')) return;

        const args = content.split(' ');
        const amount = parseInt(args[1], 10) || 10;

        pendingPurges.set(message.channel.id, amount);

        const embed = new EmbedBuilder()
            .setColor('#ed4245')
            .setTitle('⚠️ Confirmation')
            .setDescription(`Wach mt2kd baghi tmss7 **${amount}** d l-messages?`);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_ms7').setLabel('Yes, Delete').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('cancel_ms7').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );

        return message.channel.send({ embeds: [embed], components: [row] });
    }
});

client.login(CONFIG.TOKEN);
