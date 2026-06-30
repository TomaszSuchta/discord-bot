const {
  Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits,
  ChannelType, REST, Routes, SlashCommandBuilder, ApplicationCommandOptionType
} = require('discord.js');
require('dotenv').config();

// ─── KEEP-ALIVE HTTP SERVER (required for Railway) ──────────────────────────
const http = require('http');
http.createServer((req, res) => res.end('Bot is running!')).listen(process.env.PORT || 3000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
});

// ─── CONFIG ────────────────────────────────────────────────────────────────
const config = {
  welcomeChannelName: 'welcome',
  logChannelName: 'mod-logs',
  ticketCategoryName: 'Tickets',
  memberCounterChannelName: '👤⬩Members: {count}',
  badWords: ['badword1', 'badword2'],
  customCommands: {
    'rules': 'Follow the server rules or you will be banned!',
    'socials': 'Instagram: @yourhandle | YouTube: @yourchannel',
    'discord': 'Join our community: https://discord.gg/yourinvite',
  },
  warnings: {},
};
// ───────────────────────────────────────────────────────────────────────────

// ─── SLASH COMMAND DEFINITIONS ─────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption(o => o.setName('user').setDescription('The user to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the kick').setRequired(false)),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption(o => o.setName('user').setDescription('The user to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the ban').setRequired(false)),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by their ID')
    .addStringOption(o => o.setName('userid').setDescription('The user ID to unban').setRequired(true)),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout (mute) a member')
    .addUserOption(o => o.setName('user').setDescription('The user to mute').setRequired(true))
    .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the mute').setRequired(false)),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove timeout from a member')
    .addUserOption(o => o.setName('user').setDescription('The user to unmute').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption(o => o.setName('user').setDescription('The user to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(false)),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check warnings for a user')
    .addUserOption(o => o.setName('user').setDescription('The user to check').setRequired(false)),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete messages in bulk')
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Open a support ticket'),

  new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close the current support ticket (mods only)'),

  new SlashCommandBuilder()
    .setName('rules')
    .setDescription('Show server rules'),

  new SlashCommandBuilder()
    .setName('socials')
    .setDescription('Show our social media links'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands'),
];

// ─── REGISTER SLASH COMMANDS ────────────────────────────────────────────────
async function registerCommands(clientId, guildId) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands.map(c => c.toJSON()),
    });
    console.log('✅ Slash commands registered!');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

// ─── MEMBER COUNTER ─────────────────────────────────────────────────────────
async function updateMemberCount(guild) {
  const channelName = config.memberCounterChannelName.replace('{count}', guild.memberCount);
  let channel = guild.channels.cache.find(
    (c) => c.name.startsWith('👤') && c.type === ChannelType.GuildVoice
  );
  if (channel) {
    await channel.setName(channelName).catch(() => {});
  } else {
    await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.Connect] },
      ],
    });
  }
}

// ─── READY ──────────────────────────────────────────────────────────────────
client.once('clientReady', async () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  client.user.setActivity('Moderating the server', { type: 3 });

  for (const guild of client.guilds.cache.values()) {
    await registerCommands(client.user.id, guild.id).catch(err => console.error('Command reg error:', err));
    await updateMemberCount(guild).catch(err => console.error('Member count error:', err));
  }
});

// ─── WELCOME NEW MEMBERS ────────────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  await updateMemberCount(member.guild).catch(err => console.error('MemberAdd count error:', err));

  // Auto-assign role
  const role = member.guild.roles.cache.find((r) => r.name === '👤⬩Member');
  if (role) member.roles.add(role).catch(() => {});

  const welcomeChannel = member.guild.channels.cache.find(
    (ch) => ch.name === config.welcomeChannelName
  );
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

client.on('guildMemberRemove', async (member) => {
  await updateMemberCount(member.guild).catch(err => console.error('MemberRemove count error:', err));
});

// ─── AUTO MOD (bad words) ────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const lowerContent = message.content.toLowerCase();
  if (config.badWords.some((word) => lowerContent.includes(word))) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`⚠️ ${message.author}, that language isn't allowed here.`);
    setTimeout(() => warn.delete().catch(() => {}), 5000);
  }
});

// ─── SLASH COMMAND HANDLER ───────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  try {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, member } = interaction;
  const isMod = member.permissions.has(PermissionFlagsBits.ModerateMembers);

  await interaction.deferReply();

  // ── KICK ──
  if (commandName === 'kick') {
    if (!isMod) return interaction.editReply('❌ You do not have permission.');
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await target.kick(reason);
    interaction.editReply(`✅ **${target.user.tag}** has been kicked. Reason: ${reason}`);
    logAction(guild, '🦵 KICK', target.user, interaction.user, reason);
  }

  // ── BAN ──
  else if (commandName === 'ban') {
    if (!isMod) return interaction.editReply('❌ You do not have permission.');
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await target.ban({ reason });
    interaction.editReply(`✅ **${target.user.tag}** has been banned. Reason: ${reason}`);
    logAction(guild, '🔨 BAN', target.user, interaction.user, reason);
  }

  // ── UNBAN ──
  else if (commandName === 'unban') {
    if (!isMod) return interaction.editReply('❌ You do not have permission.');
    const userId = interaction.options.getString('userid');
    await guild.members.unban(userId);
    interaction.editReply(`✅ User \`${userId}\` has been unbanned.`);
  }

  // ── MUTE ──
  else if (commandName === 'mute') {
    if (!isMod) return interaction.editReply('❌ You do not have permission.');
    const target = interaction.options.getMember('user');
    const minutes = interaction.options.getInteger('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await target.timeout(minutes * 60 * 1000, reason);
    interaction.editReply(`✅ **${target.user.tag}** has been muted for ${minutes} minute(s). Reason: ${reason}`);
    logAction(guild, `🔇 MUTE (${minutes}m)`, target.user, interaction.user, reason);
  }

  // ── UNMUTE ──
  else if (commandName === 'unmute') {
    if (!isMod) return interaction.editReply('❌ You do not have permission.');
    const target = interaction.options.getMember('user');
    await target.timeout(null);
    interaction.editReply(`✅ **${target.user.tag}** has been unmuted.`);
  }

  // ── WARN ──
  else if (commandName === 'warn') {
    if (!isMod) return interaction.editReply('❌ You do not have permission.');
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const uid = target.user.id;
    if (!config.warnings[uid]) config.warnings[uid] = [];
    config.warnings[uid].push({ reason, date: new Date().toISOString() });
    interaction.editReply(`⚠️ **${target.user.tag}** has been warned. (${config.warnings[uid].length} total warnings)`);
    logAction(guild, '⚠️ WARN', target.user, interaction.user, reason);
  }

  // ── WARNINGS ──
  else if (commandName === 'warnings') {
    const target = interaction.options.getMember('user') || member;
    const uid = target.user.id;
    const warns = config.warnings[uid];
    if (!warns || warns.length === 0) return interaction.editReply(`✅ **${target.user.tag}** has no warnings.`);
    const list = warns.map((w, i) => `${i + 1}. ${w.reason} (${w.date.split('T')[0]})`).join('\n');
    interaction.editReply(`⚠️ **${target.user.tag}** has ${warns.length} warning(s):\n${list}`);
  }

  // ── CLEAR ──
  else if (commandName === 'clear') {
    if (!isMod) return interaction.editReply('❌ You do not have permission.');
    const amount = interaction.options.getInteger('amount');
    await interaction.channel.bulkDelete(amount, true);
    interaction.editReply(`✅ Deleted ${amount} message(s).`);
    setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
  }

  // ── TICKET ──
  else if (commandName === 'ticket') {
    await handleTicketCreate(interaction);
  }

  // ── CLOSE ──
  else if (commandName === 'close') {
    await handleTicketClose(interaction);
  }

  // ── RULES ──
  else if (commandName === 'rules') {
    interaction.editReply(config.customCommands['rules']);
  }

  // ── SOCIALS ──
  else if (commandName === 'socials') {
    interaction.editReply(config.customCommands['socials']);
  }

  // ── HELP ──
  else if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📋 Bot Commands')
      .addFields(
        { name: '🔨 Moderation', value: '`/kick` `/ban` `/unban` `/mute` `/unmute` `/warn` `/warnings` `/clear`' },
        { name: '🎫 Tickets', value: '`/ticket` — Open a support ticket\n`/close` — Close a ticket (mods only)' },
        { name: '⚡ Custom', value: '`/rules` `/socials`' },
      )
      .setFooter({ text: 'Use / to see all commands with their options!' });
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
    (c) => c.name === config.ticketCategoryName && c.type === ChannelType.GuildCategory
  );
  if (!category) {
    category = await guild.channels.create({ name: config.ticketCategoryName, type: ChannelType.GuildCategory });
  }
  const existing = guild.channels.cache.find(
    (c) => c.name === `ticket-${interaction.user.username.toLowerCase()}`
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
    .setDescription(`Hello ${interaction.user}! A moderator will be with you shortly.\nDescribe your issue and we'll help you out.\n\nUse \`/close\` to close this ticket.`)
    .setTimestamp();

  await ticketChannel.send({ embeds: [embed] });
  interaction.editReply(`✅ Your ticket has been created: ${ticketChannel}`);
}

async function handleTicketClose(interaction) {
  const isMod = interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers);
  if (!isMod) return interaction.editReply('❌ Only moderators can close tickets.');
  if (!interaction.channel.name.startsWith('ticket-')) return interaction.editReply('❌ This is not a ticket channel.');
  await interaction.editReply('🔒 Closing ticket in 5 seconds...');
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

// ─── MOD LOG ─────────────────────────────────────────────────────────────────
function logAction(guild, action, target, moderator, reason) {
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
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);

// Keep process alive
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));
