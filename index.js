const { Client, GatewayIntentBits, Collection, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
require('dotenv').config();

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
// Edit these to match your server
const config = {
  prefix: '!',                         // Command prefix
  welcomeChannelName: 'welcome',       // Name of your welcome channel
  logChannelName: 'mod-logs',          // Name of your mod-log channel
  ticketCategoryName: 'Tickets',       // Name of the ticket category
  badWords: ['badword1', 'badword2'],  // Add your bad words here
  customCommands: {                    // Add your custom commands here
    'rules': 'Follow the server rules or you will be banned!',
    'socials': 'Instagram: @yourhandle | YouTube: @yourchannel',
    'discord': 'Join our community: https://discord.gg/yourinvite',
  },
  warnings: {},                        // Stored in memory (resets on restart)
  memberCounterChannelName: '👤⬩Members: {count}', // Voice channel name template
};
// ───────────────────────────────────────────────────────────────────────────

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

// ─── READY ─────────────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  client.user.setActivity('Moderating the server', { type: 3 });
  client.guilds.cache.forEach((guild) => updateMemberCount(guild));
});

// ─── WELCOME NEW MEMBERS ────────────────────────────────────────────────────
client.on('guildMemberAdd', (member) => {
  updateMemberCount(member.guild);
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

// ─── MEMBER LEAVE (update counter) ──────────────────────────────────────────
client.on('guildMemberRemove', (member) => {
  updateMemberCount(member.guild);
});

// ─── MESSAGE HANDLER ────────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Auto-mod: bad word filter
  const lowerContent = message.content.toLowerCase();
  if (config.badWords.some((word) => lowerContent.includes(word))) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(
      `⚠️ ${message.author}, that language isn't allowed here.`
    );
    setTimeout(() => warn.delete().catch(() => {}), 5000);
    return;
  }

  // Command handler
  if (!message.content.startsWith(config.prefix)) return;
  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ── CUSTOM COMMANDS ──────────────────────────────────────────────────────
  if (config.customCommands[command]) {
    return message.reply(config.customCommands[command]);
  }

  // ── MODERATION COMMANDS ──────────────────────────────────────────────────
  const isMod = message.member.permissions.has(PermissionFlagsBits.ModerateMembers);

  // KICK
  if (command === 'kick') {
    if (!isMod) return message.reply('❌ You do not have permission to use this.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Usage: `!kick @user [reason]`');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    await target.kick(reason);
    message.reply(`✅ **${target.user.tag}** has been kicked. Reason: ${reason}`);
    logAction(message.guild, `🦵 KICK`, target.user, message.author, reason);
  }

  // BAN
  else if (command === 'ban') {
    if (!isMod) return message.reply('❌ You do not have permission to use this.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Usage: `!ban @user [reason]`');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    await target.ban({ reason });
    message.reply(`✅ **${target.user.tag}** has been banned. Reason: ${reason}`);
    logAction(message.guild, `🔨 BAN`, target.user, message.author, reason);
  }

  // UNBAN
  else if (command === 'unban') {
    if (!isMod) return message.reply('❌ You do not have permission to use this.');
    const userId = args[0];
    if (!userId) return message.reply('Usage: `!unban <userID>`');
    await message.guild.members.unban(userId);
    message.reply(`✅ User \`${userId}\` has been unbanned.`);
  }

  // MUTE (timeout)
  else if (command === 'mute') {
    if (!isMod) return message.reply('❌ You do not have permission to use this.');
    const target = message.mentions.members.first();
    const minutes = parseInt(args[1]) || 10;
    const reason = args.slice(2).join(' ') || 'No reason provided';
    if (!target) return message.reply('Usage: `!mute @user [minutes] [reason]`');
    await target.timeout(minutes * 60 * 1000, reason);
    message.reply(`✅ **${target.user.tag}** has been muted for ${minutes} minute(s).`);
    logAction(message.guild, `🔇 MUTE (${minutes}m)`, target.user, message.author, reason);
  }

  // UNMUTE
  else if (command === 'unmute') {
    if (!isMod) return message.reply('❌ You do not have permission to use this.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Usage: `!unmute @user`');
    await target.timeout(null);
    message.reply(`✅ **${target.user.tag}** has been unmuted.`);
  }

  // WARN
  else if (command === 'warn') {
    if (!isMod) return message.reply('❌ You do not have permission to use this.');
    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason provided';
    if (!target) return message.reply('Usage: `!warn @user [reason]`');
    const uid = target.user.id;
    if (!config.warnings[uid]) config.warnings[uid] = [];
    config.warnings[uid].push({ reason, date: new Date().toISOString() });
    message.reply(`⚠️ **${target.user.tag}** has been warned. (${config.warnings[uid].length} total warnings)`);
    logAction(message.guild, `⚠️ WARN`, target.user, message.author, reason);
  }

  // WARNINGS (check)
  else if (command === 'warnings') {
    const target = message.mentions.members.first() || message.member;
    const uid = target.user.id;
    const warns = config.warnings[uid];
    if (!warns || warns.length === 0) return message.reply(`✅ **${target.user.tag}** has no warnings.`);
    const list = warns.map((w, i) => `${i + 1}. ${w.reason} (${w.date.split('T')[0]})`).join('\n');
    message.reply(`⚠️ **${target.user.tag}** has ${warns.length} warning(s):\n${list}`);
  }

  // CLEAR MESSAGES
  else if (command === 'clear') {
    if (!isMod) return message.reply('❌ You do not have permission to use this.');
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) return message.reply('Usage: `!clear <1-100>`');
    await message.channel.bulkDelete(amount + 1, true);
    const msg = await message.channel.send(`✅ Deleted ${amount} message(s).`);
    setTimeout(() => msg.delete().catch(() => {}), 3000);
  }

  // TICKET
  else if (command === 'ticket') {
    await handleTicketCreate(message);
  }

  // CLOSE TICKET
  else if (command === 'close') {
    await handleTicketClose(message);
  }

  // HELP
  else if (command === 'help') {
    const customList = Object.keys(config.customCommands).map((c) => `\`!${c}\``).join(', ');
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📋 Bot Commands')
      .addFields(
        { name: '🔨 Moderation', value: '`!kick` `!ban` `!unban` `!mute` `!unmute` `!warn` `!warnings` `!clear`' },
        { name: '🎫 Tickets', value: '`!ticket` — Open a support ticket\n`!close` — Close a ticket (mod only)' },
        { name: '⚡ Custom', value: customList || 'None set yet' },
      )
      .setFooter({ text: 'Prefix: !' });
    message.reply({ embeds: [embed] });
  }
});

// ─── TICKET SYSTEM ──────────────────────────────────────────────────────────
async function handleTicketCreate(message) {
  const guild = message.guild;
  let category = guild.channels.cache.find(
    (c) => c.name === config.ticketCategoryName && c.type === ChannelType.GuildCategory
  );

  if (!category) {
    category = await guild.channels.create({
      name: config.ticketCategoryName,
      type: ChannelType.GuildCategory,
    });
  }

  const existing = guild.channels.cache.find(
    (c) => c.name === `ticket-${message.author.username.toLowerCase()}`
  );
  if (existing) return message.reply(`❌ You already have an open ticket: ${existing}`);

  const ticketChannel = await guild.channels.create({
    name: `ticket-${message.author.username.toLowerCase()}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: message.author.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    ],
  });

  const embed = new EmbedBuilder()
    .setColor('#57F287')
    .setTitle('🎫 Support Ticket')
    .setDescription(`Hello ${message.author}! A moderator will be with you shortly.\nDescribe your issue and we'll help you out.\n\nType \`!close\` to close this ticket.`)
    .setTimestamp();

  await ticketChannel.send({ embeds: [embed] });
  message.reply(`✅ Your ticket has been created: ${ticketChannel}`);
}

async function handleTicketClose(message) {
  const isMod = message.member.permissions.has(PermissionFlagsBits.ModerateMembers);
  if (!isMod) return message.reply('❌ Only moderators can close tickets.');
  if (!message.channel.name.startsWith('ticket-')) return message.reply('❌ This is not a ticket channel.');

  await message.reply('🔒 Closing ticket in 5 seconds...');
  setTimeout(() => message.channel.delete().catch(() => {}), 5000);
}

// ─── MOD LOG HELPER ─────────────────────────────────────────────────────────
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

// ─── LOGIN ───────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
