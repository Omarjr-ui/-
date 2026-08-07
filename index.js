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
    SPIN_CATEGORY_ID: "1535350881111769148", // Spin Tickets Category

    // UPDATED URLS FROM USER
    LINE_IMAGE_URL: "https://cdn.discordapp.com/attachments/1315665568228966410/1535362669421264946/line_Skill_Tower.gif?ex=6a777d6a&is=6a762bea&hm=725c4f798f8725a72c8ce1554cf892532e078e7dd2ad5c8bc829cb53ff69acf5&",
    THUMBNAIL_URL: "https://cdn.discordapp.com/attachments/1315665568228966410/1535362670033768630/sw_logo_animated.gif?ex=6a777d6a&is=6a762bea&hm=63aa6dd141b99dd52ad358b2a759c860ce7456d33319c830b1d3cf22564870a8&", 
    BANNER_URL: "https://cdn.discordapp.com/attachments/1315665568228966410/1535362669773717574/banner_skill_tower_serveur_discord.gif?ex=6a777d6a&is=6a762bea&hm=cf25921e11f6eb09b21cafb4a997d40a3bc28582a2a70f03b3f7601706d3aa19&",    

    // ROLES PER COMMAND
    COMMAND_ROLES: {
        say: "1535359367606702080",
        come: "1535359386258509964",
        ban: "1535359456966352979",
        timeout: "1535359474666315908",
        giveaway: "1535359635073138708",
        security: "1535359422484979792",
        setup: "1535359514981699615"
    },

    // CATEGORIES AND STAFF ROLES FOR EACH TICKET TYPE
    TICKETS: {
        pub: { name: 'Pub', category: '1535360598966149151', staffRole: '1535350471630258268' },
        bugs: { name: 'Bugs', category: '1535360542934573168', staffRole: '1535350471630258268' },
        abuse: { name: 'Abuse', category: '1535360378551279656', staffRole: '1535350471630258268' },
        server: { name: 'Server', category: '1535360321072398446', staffRole: '1535350471630258268' },
        staff: { name: 'Staff Abuse', category: '1535360289640554536', staffRole: '1535350471630258268' },
        donate: { name: 'Donate', category: '1535360193548787762', staffRole: '1535350471630258268' },
        spin: { name: 'Spin', category: '1535350881111769148', staffRole: '1535350471630258268' }
    }
};

let ticketCounter = 1;
let SECURITY_MODE = true;

// Helper function to check role permissions per command
function hasCommandRole(member, commandName) {
    const requiredRoleId = CONFIG.COMMAND_ROLES[commandName] || CONFIG.COMMAND_ROLES.setup;
    return member.roles.cache.has(requiredRoleId) || member.permissions.has(PermissionFlagsBits.Administrator);
}

// Helper to fetch invite count for Spin Wheel
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

// ================= BOT READY & SLASH COMMANDS =================
client.once('ready', async () => {
    console.log(`🤖 Bot online as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('setup-verify').setDescription('Setup Custom Verification Panel'),
        new SlashCommandBuilder().setName('setup-ticket').setDescription('Setup TANJYA Ticket Support System'),
        
        // Spin Slash Commands
        new SlashCommandBuilder().setName('spin').setDescription('Spin the Wheel (Requires 1 invite)'),
        new SlashCommandBuilder().setName('spin5').setDescription('Super Spin (Requires 5 invites)'),

        new SlashCommandBuilder().setName('say').setDescription('Send embed message').addStringOption(opt => opt.setName('text').setDescription('Message').setRequired(true)),
        new SlashCommandBuilder().setName('come').setDescription('Summon user').addUserOption(opt => opt.setName('user').setDescription('Target User').setRequired(true)),
        new SlashCommandBuilder().setName('ban').setDescription('Ban user').addUserOption(opt => opt.setName('user').setDescription('Target').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason')),
        new SlashCommandBuilder().setName('timeout').setDescription('Timeout user').addUserOption(opt => opt.setName('user').setDescription('Target').setRequired(true)).addStringOption(opt => opt.setName('duration').setDescription('10m, 2h, 1month').setRequired(true)),
        new SlashCommandBuilder().setName('security').setDescription('Toggle Security Mode').addStringOption(opt => opt.setName('status').setDescription('ON/OFF').setRequired(true).addChoices({ name: 'ON', value: 'on' }, { name: 'OFF', value: 'off' }))
    ];

    const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID), { body: commands });
        console.log('✅ Commands Registered');
    } catch (err) {
        console.error(err);
    }
});

// ================= INTERACTION HANDLER =================
client.on('interactionCreate', async (interaction) => {
    
    // --- SLASH COMMANDS ---
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, member, channel } = interaction;

        // Public commands check
        const publicCmds = ['spin', 'spin5'];
        if (!publicCmds.includes(commandName) && !hasCommandRole(member, commandName)) {
            return interaction.reply({ content: '❌ MA3NDKCH ROLE BCH T-ST3ML HAD L-COMMAND!', ephemeral: true });
        }

        // Setup Verify
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
                    `Are you ready to join us?\n\n` +
                    `Whether you are a **beginner** or a **pro**, this is where you prove yourself.`
                )
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .setImage(CONFIG.BANNER_URL);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_verify').setLabel('Verify ✅').setStyle(ButtonStyle.Success)
            );

            await channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: '✅ Verify Panel Sent!', ephemeral: true });
        }

        // Setup Ticket (Support Panel + Spin Button)
        if (commandName === 'setup-ticket') {
            const embed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('🔮 ⚡ TANJYA • Ticket Support System')
                .setDescription(
                    `• We want to keep our community safe, friendly, and fun for everyone. To help with this, we have a report system you can use to tell us about any problems or questions you have. Here's a quick look at the different parts of our report system: ⋱\n\n` +
                    `• 🛡️ **Pub** : \`Report spam or pub\` ⚔️\n` +
                    `• 🔑 **Bugs** : \`Report bugs or issues\` ⚔️\n` +
                    `• 🛠️ **Abuse** : \`Report abuse or harassment\` ⚔️\n` +
                    `• 👾 **Server** : \`Server info or requests\` ⚔️\n` +
                    `• 🔨 **Staff Abuse** : \`Report staff issues\` ⚔️\n` +
                    `• 💵 **Donate** : \`Support The Server\` ⚔️\n` +
                    `• 🎰 **Spin Wheel** : \`Open Spin Ticket\` ⚔️\n\n` +
                    `• 🌸 ⚡ Use these modules for assistance or to report issues. Our team is here to help!`
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

        // Spin Commands Implementation
        if (commandName === 'spin' || commandName === 'spin5') {
            if (channel.parentId !== CONFIG.SPIN_CATEGORY_ID) {
                return interaction.reply({ content: '❌ Kat-st3ml had l-command ghir f-Ticket d Spin!', ephemeral: true });
            }

            const isSuper = commandName === 'spin5';
            const reqInvites = isSuper ? 5 : 1;
            const userInvites = await getUserInviteCount(guild, member.id);

            if (userInvites < reqInvites) {
                return interaction.reply({ content: `❌ Khassk **${reqInvites} invites** bch t-spini! 3ndk daba **${userInvites}**.`, ephemeral: true });
            }

            let rewards = isSuper 
                ? [{ label: '2M', weight: 70 }, { label: '8M', weight: 20 }, { label: '15M', weight: 10 }]
                : [{ label: '3M', weight: 60 }, { label: '5M', weight: 30 }, { label: '10M', weight: 10 }];

            const won = getWeightedRandom(rewards);
            return interaction.reply({ content: `🎰 **Spin Result:** Mabrouk! Reb7ti **${won}**! 🎉` });
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

        if (commandName === 'security') {
            SECURITY_MODE = options.getString('status') === 'on';
            return interaction.reply({ content: `🛡️ Security mode: **${SECURITY_MODE ? 'ON' : 'OFF'}**.` });
        }
    }

    // --- BUTTON INTERACTIONS ---
    if (interaction.isButton()) {
        const { customId, guild, member, channel } = interaction;

        // VERIFY BUTTON
        if (customId === 'btn_verify') {
            await member.roles.add(CONFIG.VERIFIED_ROLE_ID).catch(() => {});
            return interaction.reply({ content: '✅ Verified successfully!', ephemeral: true });
        }

        // TICKET CREATION LOGIC (Handles Spin + All Support categories)
        if (customId.startsWith('ticket_')) {
            const typeKey = customId.replace('ticket_', '');
            const ticketConfig = CONFIG.TICKETS[typeKey];

            if (!ticketConfig) return;

            const ticketId = ticketCounter++;
            const ticketChannel = await guild.channels.create({
                name: `${ticketConfig.name.toLowerCase()}-${member.user.username}`,
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

        // CLOSE TICKET
        if (customId === 'close_ticket') {
            await interaction.reply({ content: '🔒 Ticket closing in 5 seconds...' });
            setTimeout(() => channel.delete().catch(() => {}), 5000);
        }

        // CLOSE TICKET WITH REASON MODAL
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

    // --- MODAL SUBMIT HANDLER ---
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_close_reason') {
            const reason = interaction.fields.getTextInputValue('reason_input');
            await interaction.reply({ content: `🔒 Closing ticket. Reason: **${reason}**` });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 4000);
        }
    }
});

// ================= CHAT COMMANDS & TRIGGERS =================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.toLowerCase().trim();

    // BISOU / BOUSSA TRIGGER
    if (content === 'bisous' || content === 'bisou') {
        return message.channel.send('💋💋 **BOUSSA KBIRA LIK!** 💋💋');
    }

    // LINE COMMAND
    if (content === 'line') {
        await message.delete().catch(() => {});
        return message.channel.send(CONFIG.LINE_IMAGE_URL);
    }

    // SD COMMAND (LOCK CHANNEL)
    if (content === 'sd') {
        if (!hasCommandRole(message.member, 'setup')) return;
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.channel.send('🔒 Channel status: **CLOSED**');
    }

    // 7L COMMAND (UNLOCK CHANNEL)
    if (content === '7l') {
        if (!hasCommandRole(message.member, 'setup')) return;
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        return message.channel.send('🔓 Channel status: **OPEN**');
    }

    // MS7 COMMAND (PURGE DELETE)
    if (content.startsWith('ms7')) {
        if (!hasCommandRole(message.member, 'setup')) return;

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

client.login(CONFIG.TOKEN);
