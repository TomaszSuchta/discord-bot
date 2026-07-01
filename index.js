process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

const {
  Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits,
  ChannelType, REST, Routes, SlashCommandBuilder
} = require('discord.js');
require('dotenv').config();

// ─── HTTP SERVER (keep-alive + announce API) ─────────────────────────────────
const http = require('http');
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'POST' && req.url === '/announce') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const guild = client.guilds.cache.first();
        if (!guild) { res.writeHead(500); return res.end(JSON.stringify({ error: 'Bot not in any server' })); }
        const channel = guild.channels.cache.find(c => c.name === data.channel && c.type === 0);
        if (!channel) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Channel not found' })); }

        const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
        const mode = data.mode || 'embed';

        if (mode === 'imageOnly') {
          if (data.image && data.image.startsWith('data:')) {
            const base64 = data.image.split(',')[1];
            const buf = Buffer.from(base64, 'base64');
            const att = new AttachmentBuilder(buf, { name: 'image.png' });
            await channel.send({ files: [att] });
          } else if (data.image) {
            await channel.send({ content: data.image });
          }
        } else if (mode === 'imageTop') {
          // Send image first, then embed below
          if (data.image) {
            if (data.image.startsWith('data:')) {
              const base64 = data.image.split(',')[1];
              const buf = Buffer.from(base64, 'base64');
              const att = new AttachmentBuilder(buf, { name: 'image.png' });
              await channel.send({ files: [att] });
            } else {
              await channel.send({ content: data.image });
            }
          }
          const embed = new EmbedBuilder().setColor(data.color || '#5865F2');
          if (data.title) embed.setTitle(data.title);
          if (data.description) embed.setDescription(data.description);
          if (data.thumbnail) embed.setThumbnail(data.thumbnail);
          if (data.footer) embed.setFooter({ text: data.footer });
          if (data.fields && data.fields.length > 0) embed.addFields(data.fields);
          await channel.send({ embeds: [embed] });
        } else {
          const embed = new EmbedBuilder()
            .setColor(data.color || '#5865F2')
            .setTimestamp();
          if (data.title) embed.setTitle(data.title);
          if (data.description) embed.setDescription(data.description);
          if (data.thumbnail) embed.setThumbnail(data.thumbnail);
          if (data.footer) embed.setFooter({ text: data.footer });
          if (data.fields && data.fields.length > 0) embed.addFields(data.fields);
          if (data.image && !data.image.startsWith('data:')) embed.setImage(data.image);
          if (data.image && data.image.startsWith('data:')) {
            const base64 = data.image.split(',')[1];
            const buf = Buffer.from(base64, 'base64');
            const att = new AttachmentBuilder(buf, { name: 'image.png' });
            embed.setImage('attachment://image.png');
            await channel.send({ embeds: [embed], files: [att] });
          } else {
            await channel.send({ embeds: [embed] });
          }
        }
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const guild = client.guilds.cache.first();
    const roles = guild ? guild.roles.cache.filter(r => r.name !== '@everyone').map(r => ({ name: r.name, id: r.id })).sort((a,b) => a.name.localeCompare(b.name)) : [];
    return res.end(JSON.stringify({ config: {
      welcomeChannelName: config.welcomeChannelName,
      logChannelName: config.logChannelName,
      autoRole: config.autoRole,
      badWords: config.badWords,
      permissions: config.permissions,
      memberCounterChannelName: config.memberCounterChannelName,
    }, roles }));
  }

  if (req.method === 'POST' && req.url === '/config') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.welcomeChannelName !== undefined) config.welcomeChannelName = data.welcomeChannelName;
        if (data.logChannelName !== undefined) config.logChannelName = data.logChannelName;
        if (data.autoRole !== undefined) config.autoRole = data.autoRole;
        if (data.badWords !== undefined) config.badWords = data.badWords;
        if (data.permissions !== undefined) config.permissions = data.permissions;
        if (data.memberCounterChannelName !== undefined) config.memberCounterChannelName = data.memberCounterChannelName;
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/channels') {
    const guild = client.guilds.cache.first();
    if (!guild) { res.writeHead(500); return res.end(JSON.stringify({ error: 'Bot not in any server' })); }
    const channels = guild.channels.cache
      .filter(c => c.type === 0)
      .map(c => ({ name: c.name, id: c.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(channels));
  }

  res.writeHead(200);
  res.end('Bot is running!');
}).listen(process.env.PORT || 3000, () => {
  console.log('HTTP server running');
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
  // Role-based permissions — lists of role names allowed to use each command group
  permissions: {
    kick:     ['👑⬩Owner', '📖⬩Moderator'],
    ban:      ['👑⬩Owner', '📖⬩Moderator'],
    unban:    ['👑⬩Owner', '📖⬩Moderator'],
    mute:     ['👑⬩Owner', '📖⬩Moderator'],
    unmute:   ['👑⬩Owner', '📖⬩Moderator'],
    warn:     ['👑⬩Owner', '📖⬩Moderator'],
    clear:    ['👑⬩Owner', '📖⬩Moderator'],
    purge:    ['👑⬩Owner', '📖⬩Moderator'],
    announce: ['👑⬩Owner'],
    close:    ['👑⬩Owner', '📖⬩Moderator'],
  },
};

function hasPermission(member, command) {
  const allowed = config.permissions[command] || [];
  return member.roles.cache.some(r => allowed.includes(r.name));
}

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
  new SlashCommandBuilder().setName('mute').setDescription('Mute a member (cannot type, can use voice)')
    .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
    .addIntegerOption(o => o.setName('duration').setDescription('Duration amount').setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName('unit').setDescription('Duration unit').setRequired(true)
      .addChoices(
        { name: 'Minutes', value: 'minutes' },
        { name: 'Hours', value: 'hours' },
        { name: 'Days', value: 'days' },
      ))
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
  new SlashCommandBuilder().setName('purge').setDescription('Delete messages from a specific user')
    .addUserOption(o => o.setName('user').setDescription('User whose messages to delete').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to scan (max 100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('ticket').setDescription('Open a support ticket'),
  new SlashCommandBuilder().setName('close').setDescription('Close a support ticket (mods only)'),
  new SlashCommandBuilder().setName('rules').setDescription('Show server rules'),
  new SlashCommandBuilder().setName('socials').setDescription('Show social media links'),
  new SlashCommandBuilder().setName('help').setDescription('Show all commands'),

  new SlashCommandBuilder().setName('announce').setDescription('Send a rich formatted announcement embed')
    .addStringOption(o => o.setName('title').setDescription('Title of the announcement').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Main text (use \\n for new lines)').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to send to (defaults to current)').setRequired(false))
    .addStringOption(o => o.setName('color').setDescription('Embed color (hex, e.g. #ff0000)').setRequired(false))
    .addStringOption(o => o.setName('image').setDescription('Image URL to attach').setRequired(false))
    .addStringOption(o => o.setName('thumbnail').setDescription('Small thumbnail image URL (top right)').setRequired(false))
    .addStringOption(o => o.setName('footer').setDescription('Footer text').setRequired(false))
    .addStringOption(o => o.setName('fields').setDescription('Extra fields: "Name|Value, Name2|Value2"').setRequired(false)),
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

// ─── MUTED ROLE SETUP ────────────────────────────────────────────────────────
async function getMutedRole(guild) {
  let role = guild.roles.cache.find(r => r.name === 'Muted');
  if (!role) {
    role = await guild.roles.create({
      name: 'Muted',
      color: '#818386',
      reason: 'Auto-created muted role',
    });
    // Deny Send Messages in all text and voice channels
    for (const channel of guild.channels.cache.values()) {
      if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice) {
        await channel.permissionOverwrites.create(role, {
          SendMessages: false,
          SendMessagesInThreads: false,
          AddReactions: false,
          Speak: false,
        }).catch(() => {});
      }
    }
    console.log('Created Muted role');
  }
  return role;
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
      if (!hasPermission(member, 'kick')) return interaction.editReply('❌ You do not have permission to use this command.');
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await target.kick(reason);
      interaction.editReply(`✅ **${target.user.tag}** kicked. Reason: ${reason}`);
      logAction(guild, '🦵 KICK', target.user, interaction.user, reason);

    } else if (commandName === 'ban') {
      if (!hasPermission(member, 'ban')) return interaction.editReply('❌ You do not have permission to use this command.');
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await target.ban({ reason });
      interaction.editReply(`✅ **${target.user.tag}** banned. Reason: ${reason}`);
      logAction(guild, '🔨 BAN', target.user, interaction.user, reason);

    } else if (commandName === 'unban') {
      if (!hasPermission(member, 'unban')) return interaction.editReply('❌ You do not have permission to use this command.');
      const userId = interaction.options.getString('userid');
      await guild.members.unban(userId);
      interaction.editReply(`✅ User \`${userId}\` unbanned.`);

    } else if (commandName === 'mute') {
      if (!hasPermission(member, 'mute')) return interaction.editReply('❌ You do not have permission to use this command.');
      const target = interaction.options.getMember('user');
      const duration = interaction.options.getInteger('duration');
      const unit = interaction.options.getString('unit');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const msMap = { minutes: 60 * 1000, hours: 60 * 60 * 1000, days: 24 * 60 * 60 * 1000 };
      const ms = duration * msMap[unit];
      const mutedRole = await getMutedRole(guild);
      await target.roles.add(mutedRole, reason);
      interaction.editReply(`✅ **${target.user.tag}** muted for ${duration} ${unit}. Reason: ${reason}`);
      logAction(guild, `🔇 MUTE (${duration} ${unit})`, target.user, interaction.user, reason);
      setTimeout(async () => {
        await target.roles.remove(mutedRole).catch(() => {});
        console.log(`Auto-unmuted ${target.user.tag} after ${duration} ${unit}`);
      }, ms);

    } else if (commandName === 'unmute') {
      if (!hasPermission(member, 'unmute')) return interaction.editReply('❌ You do not have permission to use this command.');
      const target = interaction.options.getMember('user');
      const mutedRole = guild.roles.cache.find(r => r.name === 'Muted');
      if (mutedRole) await target.roles.remove(mutedRole).catch(() => {});
      interaction.editReply(`✅ **${target.user.tag}** unmuted.`);

    } else if (commandName === 'warn') {
      if (!hasPermission(member, 'warn')) return interaction.editReply('❌ You do not have permission to use this command.');
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
      if (!hasPermission(member, 'clear')) return interaction.editReply('❌ You do not have permission to use this command.');
      const amount = interaction.options.getInteger('amount');
      await interaction.channel.bulkDelete(amount, true);
      interaction.editReply(`✅ Deleted ${amount} message(s).`);
      setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);

    } else if (commandName === 'purge') {
      if (!hasPermission(member, 'purge')) return interaction.editReply('❌ You do not have permission to use this command.');
      const target = interaction.options.getMember('user');
      const amount = interaction.options.getInteger('amount');
      const messages = await interaction.channel.messages.fetch({ limit: amount });
      const userMessages = messages.filter(m => m.author.id === target.user.id);
      if (userMessages.size === 0) return interaction.editReply(`❌ No messages found from **${target.user.tag}** in the last ${amount} messages.`);
      await interaction.channel.bulkDelete(userMessages, true).catch(() => {});
      interaction.editReply(`✅ Deleted **${userMessages.size}** message(s) from **${target.user.tag}**.`);
      setTimeout(() => interaction.deleteReply().catch(() => {}), 4000);
      logAction(guild, '🗑️ PURGE', target.user, interaction.user, `Deleted ${userMessages.size} messages`);

    } else if (commandName === 'ticket') {
      await handleTicketCreate(interaction);

    } else if (commandName === 'close') {
      await handleTicketClose(interaction);

    } else if (commandName === 'rules') {
      interaction.editReply(config.customCommands['rules']);

    } else if (commandName === 'socials') {
      interaction.editReply(config.customCommands['socials']);

    } else if (commandName === 'announce') {
      if (!hasPermission(member, 'announce')) return interaction.editReply('❌ You do not have permission to use this command.');
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description').split('\\n').join('\n');
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const color = interaction.options.getString('color') || '#5865F2';
      const image = interaction.options.getString('image');
      const thumbnail = interaction.options.getString('thumbnail');
      const footer = interaction.options.getString('footer');
      const fieldsRaw = interaction.options.getString('fields');

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color);

      if (image) embed.setImage(image);
      if (thumbnail) embed.setThumbnail(thumbnail);
      if (footer) embed.setFooter({ text: footer });
      if (fieldsRaw) {
        const fields = fieldsRaw.split(',').map(f => {
          const [name, value] = f.split('|');
          return { name: name?.trim() || '​', value: value?.trim() || '​', inline: true };
        });
        embed.addFields(fields);
      }

      await channel.send({ embeds: [embed] });
      interaction.editReply(`✅ Announcement sent to ${channel}!`);

    } else if (commandName === 'help') {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📋 Bot Commands')
        .addFields(
          { name: '🔨 Moderation', value: '`/kick` `/ban` `/unban` `/mute` `/unmute` `/warn` `/warnings` `/clear`' },
          { name: '🎫 Tickets', value: '`/ticket` — Open a ticket\n`/close` — Close a ticket (mods only)' },
          { name: '⚡ Custom', value: '`/rules` `/socials`' },
        { name: '📢 Announcements', value: '`/announce` — Send a rich embed with title, description, image, color, fields' },
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
  if (!hasPermission(interaction.member, 'close'))
    return interaction.editReply('❌ Only moderators can close tickets.');
  if (!interaction.channel.name.startsWith('ticket-'))
    return interaction.editReply('❌ This is not a ticket channel.');
  await interaction.editReply('🔒 Closing ticket in 5 seconds...');
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
