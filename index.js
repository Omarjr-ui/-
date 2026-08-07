const { 
    Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, 
    SlashCommandBuilder, REST, Routes 
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
    STAFF_ROLE_ID: "1535350471630258268",
    VERIFIED_ROLE_ID: "1535350311068242010",
    TICKET_CATEGORY_ID: "1535351201275707573", // Support Category
    SPIN_CATEGORY_ID: "1535350881111769148",   // Spin Category
    LOGS_CHANNEL_ID: "1535351343529594950",
    VERIFY_CHANNEL_ID: "1535336059838140467"
};

let SECURITY_MODE = true;
const invitesCache = new Map();

// ================= BOT READY & COMMANDS REGISTRATION =================
client.once('ready', async () => {
    console.log(`🤖 Bot Ready: ${client.user.tag}`);
    
    // Cache invites for tracking
    client.guilds.cache.forEach(async (guild) => {
        try {
            const firstInvites = await guild.invites.fetch();
            invitesCache.set(guild.id, new Map(firstInvites.map((inv) => [inv.code, inv.uses])));
        } catch (err) {
            console.log(`Could not fetch invites for ${guild.name}`);
        }
    });

    // Register Slash Commands
    const commands = [
        new SlashCommandBuilder().setName('setup-verify').setDescription('Send verification panel (Staff Only)'),
        new SlashCommandBuilder().setName('setup-spin-panel').setDescription('Send Spin ticket panel (Staff Only)'),
        new SlashCommandBuilder().setName('setup-support-panel').setDescription('Send Support ticket panel (Staff Only)'),
        
        new SlashCommandBuilder()
            .setName('say')
            .setDescription('Send a custom embed/message from the bot')
            .addStringOption(opt => opt.setName('text').setDescription('Message to send').setRequired(true)),
            
        new SlashCommandBuilder()
            .setName('come')
            .setDescription('Summon a user to a private location/ticket')
            .addUserOption(opt => opt.setName('user').setDescription('Target User').setRequired(true)),
            
        new SlashCommandBuilder()
            .setName('ban')
            .setDescription('Ban a user from the server')
            .addUserOption(opt => opt.setName('user').setDescription('Target User').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason')),
            
        new SlashCommandBuilder()
            .setName('timeout')
            .setDescription('Timeout a user (e.g. 10m, 2h, 1month)')
            .addUserOption(opt => opt.setName('user').setDescription('Target User').setRequired(true))
            .addStringOption(opt => opt.setName('duration').setDescription('Format: 10m, 2h, 1month').setRequired(true)),
            
        new SlashCommandBuilder()
            .setName('giveaway')
            .setDescription('Start a giveaway')
            .addStringOption(opt => opt.setName('prize').setDescription('Prize').setRequired(true))
            .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 10m, 2h)').setRequired(true))
            .addIntegerOption(opt => opt.setName('min_invites').setDescription('Minimum required invites').setRequired(false)),
            
        new SlashCommandBuilder().setName('spin').setDescription('Spin the Wheel (Requires 1 invite)'),
        new SlashCommandBuilder().setName('spin5').setDescription('Super Spin (Requires 5 invites)'),
        
        new SlashCommandBuilder()
            .setName('security')
            .setDescription('Toggle Security Mode')
            .addStringOption(opt => opt.setName('status').setDescription('ON or OFF').setRequired(true).addChoices(
                { name: 'ON', value: 'on' },
                { name: 'OFF', value: 'off' }
            ))
    ];

    const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID), { body: commands });
        console.log('✅ Slash Commands Registered Successfully!');
    } catch (error) {
        console.error(error);
    }
});

// ================= UTILS: PARSE TIME =================
function parseDuration(str) {
    const regex = /^(\d+)(m|h|month)$/i;
    const match = str.match(regex);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'm') return num * 60 * 1000;
    if (unit === 'h') return num * 60 * 60 * 1000;
    if (unit === 'month') return num * 30 * 24 * 60 * 60 * 1000;
    return null;
}

// Fetch total invite count for a user
async function getUserInviteCount(guild, userId) {
    const invites = await guild.invites.fetch();
    const userInvs = invites.filter(i => i.inviter && i.inviter.id === userId);
    return userInvs.reduce((acc, inv) => acc + inv.uses, 0);
}

function getWeightedRandom(items) {
    let total = items.reduce((acc, item) => acc + item.weight, 0);
    let rand = Math.random() * total;
    for (let item of items) {
        if (rand < item.weight) return item.label;
        rand -= item.weight;
    }
}

// ================= SLASH COMMANDS HANDLER =================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, member, channel } = interaction;

    // Check Staff Role for non-public commands
    const staffOnlyCmds = ['say', 'come', 'ban', 'timeout', 'giveaway', 'security', 'setup-verify', 'setup-spin-panel', 'setup-support-panel'];
    if (staffOnlyCmds.includes(commandName)) {
        if (!member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
            return interaction.reply({ content: '❌ Direct command access restricted to Staff Role!', ephemeral: true });
        }
    }

    // --- SETUP VERIFY PANEL ---
    if (commandName === 'setup-verify') {
        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('🔒 Server Verification')
            .setDescription('Wrk 3la l-button bch t-verifiya w tban lik l-community كاملة!');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_verify').setLabel('Verify ✅').setStyle(ButtonStyle.Success)
        );

        await channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: 'Verify Panel Sent!', ephemeral: true });
    }

    // --- SETUP SPIN PANEL ---
    if (commandName === 'setup-spin-panel') {
        const embed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('🎰 Spin Wheel Ticket')
            .setDescription('Wrk 3la l-button l-te7t bch t-7el Ticket Spin w t-spini!');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('open_spin_ticket').setLabel('Open Spin Ticket 🎰').setStyle(ButtonStyle.Primary)
        );

        await channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: 'Spin Panel Sent!', ephemeral: true });
    }

    // --- SETUP SUPPORT PANEL ---
    if (commandName === 'setup-support-panel') {
        const embed = new EmbedBuilder()
            .setColor('#5865f2')
            .setTitle('🎫 Support Ticket')
            .setDescription('Wrk 3la l-button bch t-7el Ticket Support m3a l-Staff!');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('open_support_ticket').setLabel('Open Support Ticket 🎫').setStyle(ButtonStyle.Secondary)
        );

        await channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: 'Support Panel Sent!', ephemeral: true });
    }

    // --- SAY ---
    if (commandName === 'say') {
        const text = options.getString('text');
        const embed = new EmbedBuilder().setColor('#2b2d31').setDescription(text);
        await channel.send({ embeds: [embed] });
        return interaction.reply({ content: 'Sent!', ephemeral: true });
    }

    // --- COME ---
    if (commandName === 'come') {
        const target = options.getUser('user');
        const embed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('📌 Summon Notification')
            .setDescription(`You have been summoned by ${interaction.user} to ${channel}!`)
            .setTimestamp();
        
        await target.send({ embeds: [embed] }).catch(() => {});
        return interaction.reply({ content: `✅ Notified ${target}.`, ephemeral: true });
    }

    // --- BAN ---
    if (commandName === 'ban') {
        const target = options.getUser('user');
        const reason = options.getString('reason') || 'No reason specified';
        await guild.members.ban(target, { reason }).catch(err => interaction.reply({ content: `Err: ${err.message}`, ephemeral: true }));
        return interaction.reply({ content: `🚀 Banned ${target.tag}. Reason: ${reason}` });
    }

    // --- TIMEOUT ---
    if (commandName === 'timeout') {
        const targetUser = options.getUser('user');
        const targetMember = await guild.members.fetch(targetUser.id);
        const durationMs = parseDuration(options.getString('duration'));

        if (!durationMs) return interaction.reply({ content: '❌ Invalid duration format! Use: `10m`, `2h`, or `1month`.', ephemeral: true });

        await targetMember.timeout(durationMs).catch(err => interaction.reply({ content: `Err: ${err.message}`, ephemeral: true }));
        return interaction.reply({ content: `🤐 Timed out ${targetUser.tag} for ${options.getString('duration')}.` });
    }

    // --- SECURITY TOGGLE ---
    if (commandName === 'security') {
        SECURITY_MODE = options.getString('status') === 'on';
        return interaction.reply({ content: `🛡️ Security mode is now **${SECURITY_MODE ? 'ON' : 'OFF'}**.` });
    }

    // --- GIVEAWAY ---
    if (commandName === 'giveaway') {
        const prize = options.getString('prize');
        const durationMs = parseDuration(options.getString('duration'));
        const minInvites = options.getInteger('min_invites') || 0;

        if (!durationMs) return interaction.reply({ content: '❌ Invalid duration!', ephemeral: true });

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`🎉 GIVEAWAY: ${prize}`)
            .setDescription(`Click 🎉 to participate!\n\n⌛ **Duration:** ${options.getString('duration')}\n📌 **Requirement:** ${minInvites > 0 ? `${minInvites} Invites` : 'None'}`)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`gw_join_${minInvites}`).setLabel('Join 🎉').setStyle(ButtonStyle.Success)
        );

        const gwMsg = await channel.send({ embeds: [embed], components: [row] });
        interaction.reply({ content: 'Giveaway started!', ephemeral: true });

        const participants = new Set();
        const collector = gwMsg.createMessageComponentCollector({ time: durationMs });

        collector.on('collect', async i => {
            const req = parseInt(i.customId.split('_')[2]);
            if (req > 0) {
                const userInvites = await getUserInviteCount(guild, i.user.id);
                if (userInvites < req) {
                    return i.reply({ content: `❌ You need at least **${req} invites** to join! You currently have **${userInvites}**.`, ephemeral: true });
                }
            }
            participants.add(i.user.id);
            await i.reply({ content: '✅ You joined the giveaway!', ephemeral: true });
        });

        collector.on('end', () => {
            const arr = Array.from(participants);
            if (arr.length === 0) return channel.send(`🎉 Giveaway ended for **${prize}**. No participants.`);
            const winner = arr[Math.floor(Math.random() * arr.length)];
            channel.send(`🎉 Congratulations <@${winner}>! You won **${prize}**!`);
        });
    }

    // --- SPIN COMMANDS ---
    if (commandName === 'spin' || commandName === 'spin5') {
        if (channel.parentId !== CONFIG.SPIN_CATEGORY_ID) {
            return interaction.reply({ content: '❌ You can only use this command inside a Spin Ticket!', ephemeral: true });
        }

        const isSuper = commandName === 'spin5';
        const reqInvites = isSuper ? 5 : 1;
        const userInvites = await getUserInviteCount(guild, member.id);

        if (userInvites < reqInvites) {
            return interaction.reply({ content: `❌ You need **${reqInvites} invite(s)** to spin! You have **${userInvites}**.`, ephemeral: true });
        }

        let rewards = [
            { label: '3M', weight: 60 },
            { label: '5M', weight: 30 },
            { label: '10M', weight: 10 }
        ];

        if (isSuper) {
            rewards = [
                { label: '2M', weight: 70 },
                { label: '8M', weight: 20 },
                { label: '15M', weight: 10 }
            ];
        }

        const won = getWeightedRandom(rewards);
        return interaction.reply({ content: `🎰 **Spin Result:** Congratulations! You won **${won}**! 🎉` });
    }
});

// ================= BUTTON INTERACTION HANDLER =================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, guild, member } = interaction;

    // Verify Button Handler
    if (customId === 'btn_verify') {
        await member.roles.add(CONFIG.VERIFIED_ROLE_ID).catch(() => {});
        return interaction.reply({ content: '✅ You are now verified!', ephemeral: true });
    }

    // Open Spin Ticket
    if (customId === 'open_spin_ticket') {
        const ticketChannel = await guild.channels.create({
            name: `spin-${member.user.username}`,
            type: ChannelType.GuildText,
            parent: CONFIG.SPIN_CATEGORY_ID,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
            ]
        });

        const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket 🔒').setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({ content: `Welcome ${member}! Use \`/spin\` or \`/spin5\` here.`, components: [closeRow] });
        return interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });
    }

    // Open Support Ticket
    if (customId === 'open_support_ticket') {
        const ticketChannel = await guild.channels.create({
            name: `ticket-${member.user.username}`,
            type: ChannelType.GuildText,
            parent: CONFIG.TICKET_CATEGORY_ID,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
            ]
        });

        const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket 🔒').setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({ content: `Welcome ${member}! Staff will be with you shortly.`, components: [closeRow] });
        return interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });
    }

    // Close Ticket
    if (customId === 'close_ticket') {
        if (!member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
            return interaction.reply({ content: '❌ Only Staff can close tickets.', ephemeral: true });
        }
        await interaction.reply({ content: '🔒 Closing ticket in 5 seconds...' });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
});

// ================= CHAT PREFIX COMMANDS & MODERATION =================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.toLowerCase().trim();

    if (content === 'line') {
        await message.delete().catch(() => {});
        return message.channel.send('https://media.discordapp.net/attachments/123/456/line.png');
    }

    if (content === 'sd') {
        if (!message.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return;
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.channel.send('🔒 Channel Lock Status: **CLOSED**');
    }

    if (content === '7l') {
        if (!message.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return;
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        return message.channel.send('🔓 Channel Lock Status: **OPEN**');
    }

    if (content.startsWith('ms7')) {
        if (!message.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return;
        
        const embed = new EmbedBuilder()
            .setColor('#ed4245')
            .setTitle('⚠️ Confirmation')
            .setDescription('Wach mt2kd baghi tmss7 hhad l-messages?');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_ms7').setLabel('Yes, Delete').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('cancel_ms7').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );

        return message.channel.send({ embeds: [embed], components: [row] });
    }
});

// Purge Confirmation Listener
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'confirm_ms7') {
        await interaction.channel.bulkDelete(20, true).catch(() => {});
        return interaction.reply({ content: '✅ Messages cleared.', ephemeral: true });
    }
    if (interaction.customId === 'cancel_ms7') {
        await interaction.message.delete().catch(() => {});
        return interaction.reply({ content: '❌ Action cancelled.', ephemeral: true });
    }
});

// ================= INVITE TRACKER LOGS =================
client.on('guildMemberAdd', async (member) => {
    const cachedInvites = invitesCache.get(member.guild.id);
    const newInvites = await member.guild.invites.fetch();

    const usedInvite = newInvites.find(inv => cachedInvites.get(inv.code) < inv.uses);
    const logChannel = member.guild.channels.cache.get(CONFIG.LOGS_CHANNEL_ID);

    let inviterInfo = "Unknown / Custom Vanity";
    if (usedInvite) {
        inviterInfo = `Invited by: <@${usedInvite.inviter.id}> (\`${usedInvite.inviter.tag}\`)\nCode: \`${usedInvite.code}\`\nUses: \`${usedInvite.uses}\``;
    }

    invitesCache.set(member.guild.id, new Map(newInvites.map((inv) => [inv.code, inv.uses])));

    if (logChannel) {
        const embed = new EmbedBuilder()
            .setColor('#57f287')
            .setTitle('📥 Member Joined')
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
                { name: 'User', value: `${member.user} (\`${member.user.id}\`)`, inline: true },
                { name: 'Joined At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: 'Invite Details', value: inviterInfo }
            )
            .setTimestamp();
            
        logChannel.send({ embeds: [embed] });
    }
});

// ================= BOT SECURITY =================
client.on('guildAuditLogEntryCreate', async (auditLog, guild) => {
    if (!SECURITY_MODE) return;

    const { action, executorId } = auditLog;
    const executor = await guild.members.fetch(executorId).catch(() => null);
    if (!executor || executor.id === client.user.id || executor.id === guild.ownerId) return;

    const protectedActions = ['BotAdd', 'ChannelDelete', 'RoleDelete', 'MemberKick'];

    if (protectedActions.includes(action)) {
        await executor.roles.set([]).catch(() => {});
        const logChannel = guild.channels.cache.get(CONFIG.LOGS_CHANNEL_ID);
        if (logChannel) {
            logChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ed4245')
                        .setTitle('🚨 SECURITY ALERT')
                        .setDescription(`Unauthorized Action Detected!\n**Executor:** <@${executorId}>\n**Action:** ${action}`)
                        .setTimestamp()
                ]
            });
        }
    }
});

client.login(CONFIG.TOKEN);
