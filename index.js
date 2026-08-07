const { 
    Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, 
    SlashCommandBuilder, REST, Routes, Collection 
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
    STAFF_ROLE_ID: "STAFF_ROLE_ID_HNA",
    VERIFIED_ROLE_ID: "VERIFIED_ROLE_ID_HNA",
    TICKET_CATEGORY_ID: "TICKET_CATEGORY_ID_HNA",
    SPIN_CATEGORY_ID: "SPIN_CATEGORY_ID_HNA",
    LOGS_CHANNEL_ID: "LOGS_CHANNEL_ID_HNA",
    VERIFY_CHANNEL_ID: "VERIFY_CHANNEL_ID_HNA"
};

let SECURITY_MODE = true; // Mode Security (On/Off)
const invitesCache = new Map();

// ================= BOT READY & INVITE CACHE =================
client.once('ready', async () => {
    console.log(`🤖 Bot Ready: ${client.user.tag}`);
    
    // Cache invites for accurate tracking
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
        new SlashCommandBuilder().setName('verify').setDescription('Verify yourself to get access to the server'),
        
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
            .addIntegerOption(opt => opt.setName('min_invites').setDescription('Minimum required invites (Optional)').setRequired(false)),
            
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

// ================= SLASH COMMANDS HANDLER =================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, member, channel } = interaction;

    // --- VERIFY ---
    if (commandName === 'verify') {
        if (channel.id !== CONFIG.VERIFY_CHANNEL_ID) {
            return interaction.reply({ content: '❌ Direct command use to the verification channel only!', ephemeral: true });
        }
        await member.roles.add(CONFIG.VERIFIED_ROLE_ID).catch(() => {});
        return interaction.reply({ content: '✅ You are verified! Enjoy the community.', ephemeral: true });
    }

    // --- SAY ---
    if (commandName === 'say') {
        if (!member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: '❌ Unauthorized.', ephemeral: true });
        const text = options.getString('text');
        const embed = new EmbedBuilder().setColor('#2b2d31').setDescription(text);
        await channel.send({ embeds: [embed] });
        return interaction.reply({ content: 'Sent!', ephemeral: true });
    }

    // --- COME ---
    if (commandName === 'come') {
        if (!member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: '❌ Unauthorized.', ephemeral: true });
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
        if (!member.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: '❌ Unauthorized.', ephemeral: true });
        const target = options.getUser('user');
        const reason = options.getString('reason') || 'No reason specified';
        await guild.members.ban(target, { reason }).catch(err => interaction.reply({ content: `Err: ${err.message}`, ephemeral: true }));
        return interaction.reply({ content: `🚀 Banned ${target.tag}. Reason: ${reason}` });
    }

    // --- TIMEOUT ---
    if (commandName === 'timeout') {
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: '❌ Unauthorized.', ephemeral: true });
        const targetUser = options.getUser('user');
        const targetMember = await guild.members.fetch(targetUser.id);
        const durationMs = parseDuration(options.getString('duration'));

        if (!durationMs) return interaction.reply({ content: '❌ Invalid duration format! Use: `10m`, `2h`, or `1month`.', ephemeral: true });

        await targetMember.timeout(durationMs).catch(err => interaction.reply({ content: `Err: ${err.message}`, ephemeral: true }));
        return interaction.reply({ content: `🤐 Timed out ${targetUser.tag} for ${options.getString('duration')}.` });
    }

    // --- SECURITY TOGGLE ---
    if (commandName === 'security') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        SECURITY_MODE = options.getString('status') === 'on';
        return interaction.reply({ content: `🛡️ Security mode is now **${SECURITY_MODE ? 'ON' : 'OFF'}**.` });
    }

    // --- GIVEAWAY SYSTEM ---
    if (commandName === 'giveaway') {
        if (!member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: '❌ Unauthorized.', ephemeral: true });
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
                // Verify Invites
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

    // --- SPIN SYSTEM ---
    if (commandName === 'spin' || commandName === 'spin5') {
        if (channel.parentId !== CONFIG.SPIN_CATEGORY_ID) {
            return interaction.reply({ content: '❌ You can only use this command inside your dedicated Spin Ticket!', ephemeral: true });
        }

        const isSuper = commandName === 'spin5';
        const reqInvites = isSuper ? 5 : 1;
        const userInvites = await getUserInviteCount(guild, member.id);

        if (userInvites < reqInvites) {
            return interaction.reply({ content: `❌ You need **${reqInvites} invite(s)** to spin! You have **${userInvites}**.`, ephemeral: true });
        }

        // LUCK CONFIGURATION (Adjust probabilities here)
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

// Weighted Random Algorithm for Custom Luck Control
function getWeightedRandom(items) {
    let total = items.reduce((acc, item) => acc + item.weight, 0);
    let rand = Math.random() * total;
    for (let item of items) {
        if (rand < item.weight) return item.label;
        rand -= item.weight;
    }
}

// Fetch total invite count for a user
async function getUserInviteCount(guild, userId) {
    const invites = await guild.invites.fetch();
    const userInvs = invites.filter(i => i.inviter && i.inviter.id === userId);
    return userInvs.reduce((acc, inv) => acc + inv.uses, 0);
}

// ================= PREFIX CHAT COMMANDS (line, sd, 7l, ms7) =================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.toLowerCase().trim();

    // Line Divider
    if (content === 'line') {
        await message.delete().catch(() => {});
        return message.channel.send('https://media.discordapp.net/attachments/123/456/line.png'); // Replace with your line URL
    }

    // Close Channel (sd)
    if (content === 'sd') {
        if (!message.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return;
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.channel.send('🔒 Channel Lock Status: **CLOSED**');
    }

    // Open Channel (7l)
    if (content === '7l') {
        if (!message.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return;
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        return message.channel.send('🔓 Channel Lock Status: **OPEN**');
    }

    // Delete Messages with Confirmation (ms7)
    if (content.startsWith('ms7')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        
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

// Confirm Purge Button Event
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

// ================= ADVANCED INVITE TRACKER & WELCOME LOG =================
client.on('guildMemberAdd', async (member) => {
    const cachedInvites = invitesCache.get(member.guild.id);
    const newInvites = await member.guild.invites.fetch();

    const usedInvite = newInvites.find(inv => cachedInvites.get(inv.code) < inv.uses);
    const logChannel = member.guild.channels.cache.get(CONFIG.LOGS_CHANNEL_ID);

    let inviterInfo = "Unknown / Custom Vanity";
    if (usedInvite) {
        inviterInfo = `Invited by: <@${usedInvite.inviter.id}> (\`${usedInvite.inviter.tag}\`)\nCode: \`${usedInvite.code}\`\nUses: \`${usedInvite.uses}\``;
    }

    // Refresh cache
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

// ================= ANTI-RAID & BOT SECURITY =================
client.on('guildAuditLogEntryCreate', async (auditLog, guild) => {
    if (!SECURITY_MODE) return;

    const { action, executorId, target } = auditLog;
    const executor = await guild.members.fetch(executorId).catch(() => null);
    if (!executor || executor.id === client.user.id || executor.id === guild.ownerId) return;

    // Actions to protect: BOT_ADD, CHANNEL_DELETE, ROLE_DELETE, MEMBER_KICK
    const protectedActions = [
        'BotAdd', 'ChannelDelete', 'RoleDelete', 'MemberKick'
    ];

    if (protectedActions.includes(action)) {
        // Punish malicious user by removing roles or banning
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
