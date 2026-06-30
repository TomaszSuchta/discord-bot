process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

const {
  Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits,
  ChannelType, REST, Routes, SlashCommandBuilder
} = require('discord.js');
require('dotenv').config();

// ─── KEEP-ALIVE HTTP SERVER ──────────────────────────────────────────────────
const http = require('http');
http.createServer((req, res) => res.end('Bot is running!')).listen(process.env.PORT || 3000, () => {
  console.log('HTTP keep-alive server running');
});

// ─── CLIENT ──────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
});

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const config = {
  welcomeChannelName: 'welcome',
  logChannelName: 'mod-logs',
  ticketCategoryName: 'Tickets',
  memberCounterChannelName: '👤⬩Members: {count}',
  autoRole: '👤⬩Member',
  badWords: ['badword1', 'badword2'],
  customCommands: {
    'rules': 'Follow the server rules or you will be banned!',
    'socials': 'Instagram: @yourhandle | YouTube: @yourchannel',
    'discord': 'Join our community: https://discord.gg/yourinvite',
  },
  warnings: {},
};

// ─── SLASH COMMANDS ──────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder().setName('kick').setDescription('Kick a member')
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a member')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('unban').setDescription('Unban a user by ID')
    .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Timeout a member')
    .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
    .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('unmute').setDescription('Remove timeout from a member')
    .addUserOption(o => o.setName('user').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('warn').setDescription('Warn a member')
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('warnings').setDescription('Check warnings for a user')
    .addUserOption(o => o.setName('user').setDescription('User to check')),
  new SlashCommandBuilder().setName('clear').setDescription('Delete messages in bulk')
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('ticket').setDescription('Open a support ticket'),
  new SlashCommandBuilder().setName('close').setDescription('Close a support ticket (mods only)'),
  new SlashCommandBuilder().setName('rules').setDescription('Show server rules'),
  new SlashCommandBuilder().setName('socials').setDescription('Show social media links'),
  new SlashCommandBuilder().setName('help').setDescription('Show all commands'),
];

// ─── REGISTER COMMANDS ───────────────────────────────────────────────────────
async function registerCommands(clientId, guildId) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands.map(c => c.toJSON()),
    });
    console.log('✅ Slash commands registered!');
  } catch (err) {
    console.error('Command registration error:', err);
  }
}

// ─── MEMBER COUNTER ──────────────────────────────────────────────────────────
async function updateMemberCount(guild) {
  try {
    const channelName = config.memberCounterChannelName.replace('{count}', guild.memberCount);
    let channel = guild.channels.cache.find(
      (c) => c.name.startsWith('👤') && c.type === ChannelType.GuildVoice
    );
    if (channel) {
      await channel.setName(channelName);
    } else {
      await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: [PermissionFlagsBits.Connect] },
        ],
      });
    }
  } catch (err) {
    console.error('Member count update error:', err);
  }
}

// ─── MOD LOG ─────────────────────────────────────────────────────────────────
function logAction(guild, action, target, moderator, reason) {
  try {
    const logChannel = guild.channels.cache.find((c) => c.name === config.logChannelName);
    if (!logChannel) return;
    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle(action)
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: `${moderator.tag}`, inline: true },
        { name: 'Reason', value: reason },
      )
      .setTimestamp();
    logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Log error:', err);
  }
}

// ─── READY ───────────────────────────────────────────────────────────────────
client.once('clientReady', async () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  client.user.setActivity('Moderating the server', { type: 3 });
  for (const guild of client.guilds.cache.values()) {
    await registerCommands(client.user.id, guild.id);
    await updateMemberCount(guild);
  }
});

// ─── MEMBER JOIN ─────────────────────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  console.log(`Member joined: ${member.user.tag}`);
  await updateMemberCount(member.guild);

  const role = member.guild.roles.cache.find((r) => r.name === config.autoRole);
  if (role) {
    await member.roles.add(role).catch(err => console.error('Role assign error:', err));
    console.log(`Assigned role ${role.name} to ${member.user.tag}`);
  } else {
    console.log(`Role "${config.autoRole}" not found in server`);
  }

  const welcomeChannel = member.guild.channels.cache.find(ch => ch.name === config.welcomeChannelName);
  if (!welcomeChannel) return;
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`👋 Welcome to ${member.guild.name}!`)
    .setDescription(`Hey ${member}, glad to have you here!\nMake sure to read the rules and enjoy your stay.`)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `Member #${member.guild.memberCount}` })
    .setTimestamp();
  welcomeChannel.send({ embeds: [embed] });
});

// ─── MEMBER LEAVE ────────────────────────────────────────────────────────────
client.on('guildMemberRemove', async (member) => {
  await updateMemberCount(member.guild);
});

// ─── AUTO MOD ────────────────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const lower = message.content.toLowerCase();
  if (config.badWords.some(w => lower.includes(w))) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`⚠️ ${message.author}, that language isn't allowed here.`);
    setTimeout(() => warn.delete().catch(() => {}), 5000);
  }
});

// ─── SLASH COMMAND HANDLER ───────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, member } = interaction;
  const isMod = member.permissions.has(PermissionFlagsBits.ModerateMembers);

  try {
    await interaction.deferReply();

    if (commandName === 'kick') {
      if (!isMod) return interaction.editReply('❌ No permission.');
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await target.kick(reason);
      interaction.editReply(`✅ **${target.user.tag}** kicked. Reason: ${reason}`);
      logAction(guild, '🦵 KICK', target.user, interaction.user, reason);

    } else if (commandName === 'ban') {
      if (!isMod) return interaction.editReply('❌ No permission.');
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await target.ban({ reason });
      interaction.editReply(`✅ **${target.user.tag}** banned. Reason: ${reason}`);
      logAction(guild, '🔨 BAN', target.user, interaction.user, reason);

    } else if (commandName === 'unban') {
      if (!isMod) return interaction.editReply('❌ No permission.');
      const userId = interaction.options.getString('userid');
      await guild.members.unban(userId);
      interaction.editReply(`✅ User \`${userId}\` unbanned.`);

    } else if (commandName === 'mute') {
      if (!isMod) return interaction.editReply('❌ No permission.');
      const target = interaction.options.getMember('user');
      const minutes = interaction.options.getInteger('duration');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await target.timeout(minutes * 60 * 1000, reason);
      interaction.editReply(`✅ **${target.user.tag}** muted for ${minutes} min. Reason: ${reason}`);
      logAction(guild, `🔇 MUTE (${minutes}m)`, target.user, interaction.user, reason);

    } else if (commandName === 'unmute') {
      if (!isMod) return interaction.editReply('❌ No permission.');
      const target = interaction.options.getMember('user');
      await target.timeout(null);
      interaction.editReply(`✅ **${target.user.tag}** unmuted.`);

    } else if (commandName === 'warn') {
      if (!isMod) return interaction.editReply('❌ No permission.');
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const uid = target.user.id;
      if (!config.warnings[uid]) config.warnings[uid] = [];
      config.warnings[uid].push({ reason, date: new Date().toISOString() });
      interaction.editReply(`⚠️ **${target.user.tag}** warned. (${config.warnings[uid].length} total)`);
      logAction(guild, '⚠️ WARN', target.user, interaction.user, reason);

    } else if (commandName === 'warnings') {
      const target = interaction.options.getMember('user') || member;
      const uid = target.user.id;
      const warns = config.warnings[uid];
      if (!warns || warns.length === 0) return interaction.editReply(`✅ **${target.user.tag}** has no warnings.`);
      const list = warns.map((w, i) => `${i + 1}. ${w.reason} (${w.date.split('T')[0]})`).join('\n');
      interaction.editReply(`⚠️ **${target.user.tag}** — ${warns.length} warning(s):\n${list}`);

    } else if (commandName === 'clear') {
      if (!isMod) return interaction.editReply('❌ No permission.');
      const amount = interaction.options.getInteger('amount');
      await interaction.channel.bulkDelete(amount, true);
      interaction.editReply(`✅ Deleted ${amount} message(s).`);
      setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);

    } else if (commandName === 'ticket') {
      await handleTicketCreate(interaction);

    } else if (commandName === 'close') {
      await handleTicketClose(interaction);

    } else if (commandName === 'rules') {
      interaction.editReply(config.customCommands['rules']);

    } else if (commandName === 'socials') {
      interaction.editReply(config.customCommands['socials']);

    } else if (commandName === 'help') {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📋 Bot Commands')
        .addFields(
          { name: '🔨 Moderation', value: '`/kick` `/ban` `/unban` `/mute` `/unmute` `/warn` `/warnings` `/clear`' },
          { name: '🎫 Tickets', value: '`/ticket` — Open a ticket\n`/close` — Close a ticket (mods only)' },
          { name: '⚡ Custom', value: '`/rules` `/socials`' },
        )
        .setFooter({ text: 'Type / to see all commands with their options!' });
      interaction.editReply({ embeds: [embed] });
    }

  } catch (err) {
    console.error('Interaction error:', err);
    try { await interaction.editReply('❌ Something went wrong.'); } catch {}
  }
});

// ─── TICKET SYSTEM ───────────────────────────────────────────────────────────
async function handleTicketCreate(interaction) {
  const guild = interaction.guild;
  let category = guild.channels.cache.find(
    c => c.name === config.ticketCategoryName && c.type === ChannelType.GuildCategory
  );
  if (!category) {
    category = await guild.channels.create({ name: config.ticketCategoryName, type: ChannelType.GuildCategory });
  }
  const existing = guild.channels.cache.find(
    c => c.name === `ticket-${interaction.user.username.toLowerCase()}`
  );
  if (existing) return interaction.editReply(`❌ You already have an open ticket: ${existing}`);
  const ticketChannel = await guild.channels.create({
    name: `ticket-${interaction.user.username.toLowerCase()}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    ],
  });
  const embed = new EmbedBuilder()
    .setColor('#57F287')
    .setTitle('🎫 Support Ticket')
    .setDescription(`Hello ${interaction.user}! A moderator will be with you shortly.\n\nUse \`/close\` to close this ticket.`)
    .setTimestamp();
  await ticketChannel.send({ embeds: [embed] });
  interaction.editReply(`✅ Ticket created: ${ticketChannel}`);
}

async function handleTicketClose(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers))
    return interaction.editReply('❌ Only moderators can close tickets.');
  if (!interaction.channel.name.startsWith('ticket-'))
    return interaction.editReply('❌ This is not a ticket channel.');
  await interaction.editReply('🔒 Closing ticket in 5 seconds...');
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
