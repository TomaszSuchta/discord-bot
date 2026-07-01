process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

const {
  Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits,
  ChannelType, REST, Routes, SlashCommandBuilder, AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// ─── KEEP-ALIVE HTTP SERVER ──────────────────────────────────────────────────
const http = require('http');
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const parseBody = () => new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });

  if (req.method === 'GET' && req.url === '/config') {
    const guild = client.guilds.cache.first();
    const roles = guild ? guild.roles.cache.filter(r => r.name !== '@everyone').map(r => ({ name: r.name, id: r.id })).sort((a,b) => a.name.localeCompare(b.name)) : [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ config: {
      welcomeChannelName: config.welcomeChannelName,
      logChannelName: config.logChannelName,
      autoRole: config.autoRole,
      badWords: config.badWords,
      permissions: config.permissions,
      memberCounterChannelName: config.memberCounterChannelName,
      joinDM: config.joinDM,
      antiSpam: config.antiSpam,
      warnThresholds: config.warnThresholds,
    }, roles }));
  }

  if (req.method === 'POST' && req.url === '/config') {
    const data = await parseBody();
    const allowed = ['welcomeChannelName','logChannelName','autoRole','badWords','permissions','memberCounterChannelName','joinDM','antiSpam','warnThresholds'];
    allowed.forEach(k => { if (data[k] !== undefined) config[k] = data[k]; });
    saveConfig();
    res.writeHead(200); return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === 'GET' && req.url === '/channels') {
    const guild = client.guilds.cache.first();
    if (!guild) { res.writeHead(500); return res.end(JSON.stringify({ error: 'Not in server' })); }
    const channels = guild.channels.cache.filter(c => c.type === 0).map(c => ({ name: c.name, id: c.id })).sort((a,b) => a.name.localeCompare(b.name));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(channels));
  }

  if (req.method === 'GET' && req.url === '/reaction-roles') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(reactionRoles));
  }

  if (req.method === 'POST' && req.url === '/reaction-roles') {
    const data = await parseBody();
    // data: { channelId, messageId, emoji, roleId, roleName }
    const guild = client.guilds.cache.first();
    if (!guild) { res.writeHead(500); return res.end(JSON.stringify({ error: 'Not in server' })); }
    try {
      const channel = guild.channels.cache.get(data.channelId);
      const message = await channel.messages.fetch(data.messageId);
      await message.react(data.emoji);
      const key = `${data.messageId}-${data.emoji}`;
      reactionRoles[key] = { roleId: data.roleId, roleName: data.roleName, emoji: data.emoji, messageId: data.messageId, channelId: data.channelId };
      saveReactionRoles();
      res.writeHead(200); return res.end(JSON.stringify({ success: true }));
    } catch(err) {
      res.writeHead(500); return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (req.method === 'POST' && req.url === '/announce') {
    const data = await parseBody();
    const guild = client.guilds.cache.first();
    if (!guild) { res.writeHead(500); return res.end(JSON.stringify({ error: 'Bot not in any server' })); }
    const channel = guild.channels.cache.find(c => c.name === data.channel && c.type === 0);
    if (!channel) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Channel not found' })); }
    try {
      const mode = data.mode || 'embed';
      if (mode === 'imageOnly') {
        if (data.image && data.image.startsWith('data:')) {
          const buf = Buffer.from(data.image.split(',')[1], 'base64');
          await channel.send({ files: [new AttachmentBuilder(buf, { name: 'image.png' })] });
        } else if (data.image) { await channel.send({ content: data.image }); }
      } else if (mode === 'imageTop') {
        if (data.image) {
          if (data.image.startsWith('data:')) {
            const buf = Buffer.from(data.image.split(',')[1], 'base64');
            await channel.send({ files: [new AttachmentBuilder(buf, { name: 'image.png' })] });
          } else { await channel.send({ content: data.image }); }
        }
        const embed = new EmbedBuilder().setColor(data.color || '#5865F2');
        if (data.title) embed.setTitle(data.title);
        if (data.description) embed.setDescription(data.description);
        if (data.thumbnail) embed.setThumbnail(data.thumbnail);
        if (data.footer) embed.setFooter({ text: data.footer });
        if (data.fields?.length) embed.addFields(data.fields);
        await channel.send({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder().setColor(data.color || '#5865F2');
        if (data.title) embed.setTitle(data.title);
        if (data.description) embed.setDescription(data.description);
        if (data.thumbnail) embed.setThumbnail(data.thumbnail);
        if (data.footer) embed.setFooter({ text: data.footer });
        if (data.fields?.length) embed.addFields(data.fields);
        if (data.image?.startsWith('data:')) {
          const buf = Buffer.from(data.image.split(',')[1], 'base64');
          embed.setImage('attachment://image.png');
          await channel.send({ embeds: [embed], files: [new AttachmentBuilder(buf, { name: 'image.png' })] });
        } else {
          if (data.image) embed.setImage(data.image);
          await channel.send({ embeds: [embed] });
        }
      }
      res.writeHead(200); res.end(JSON.stringify({ success: true }));
    } catch(err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
    return;
  }

  res.writeHead(200); res.end('Bot is running!');
}).listen(process.env.PORT || 3000, () => console.log('HTTP server running'));

// ─── CLIENT ──────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessageReactions,
  ],
});

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────
const DATA_DIR = './data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(`${DATA_DIR}/${file}`, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, data) {
  fs.writeFileSync(`${DATA_DIR}/${file}`, JSON.stringify(data, null, 2));
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const defaultConfig = {
  welcomeChannelName: 'welcome',
  logChannelName: 'mod-logs',
  ticketCategoryName: 'Tickets',
  memberCounterChannelName: '👤⬩Members: {count}',
  autoRole: '👤⬩Member',
  badWords: ['badword1', 'badword2'],
  customCommands: {
    'rules': 'Follow the server rules or you will be banned!',
    'socials': 'Instagram: @yourhandle | YouTube: @yourchannel',
  },
  joinDM: {
    enabled: false,
    message: 'Welcome to the server! Make sure to read the rules.',
  },
  antiSpam: {
    enabled: true,
    maxMessages: 5,
    timeWindow: 5,
    muteDuration: 10,
  },
  warnThresholds: {
    muteAt: 3,
    muteDuration: 60,
    banAt: 5,
  },
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
  },
};

const config = { ...defaultConfig, ...loadJSON('config.json', {}) };
function saveConfig() { saveJSON('config.json', config); }

// ─── PERSISTENT DATA ──────────────────────────────────────────────────────────
let warnings = loadJSON('warnings.json', {});
let reactionRoles = loadJSON('reaction-roles.json', {});
const spamTracker = {};

function saveWarnings() { saveJSON('warnings.json', warnings); }
function saveReactionRoles() { saveJSON('reaction-roles.json', reactionRoles); }

// ─── PERMISSIONS ──────────────────────────────────────────────────────────────
function hasPermission(member, command) {
  const allowed = config.permissions[command] || [];
  return member.roles.cache.some(r => allowed.includes(r.name));
}

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder().setName('kick').setDescription('Kick a member')
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a member')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('unban').setDescription('Unban by user ID')
    .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a member')
    .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
    .addIntegerOption(o => o.setName('duration').setDescription('Duration amount').setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName('unit').setDescription('Unit').setRequired(true)
      .addChoices({ name: 'Minutes', value: 'minutes' }, { name: 'Hours', value: 'hours' }, { name: 'Days', value: 'days' }))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute a member')
    .addUserOption(o => o.setName('user').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('warn').setDescription('Warn a member')
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('warnings').setDescription('Check warnings')
    .addUserOption(o => o.setName('user').setDescription('User to check')),
  new SlashCommandBuilder().setName('clearwarnings').setDescription('Clear all warnings for a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('Delete messages in bulk')
    .addIntegerOption(o => o.setName('amount').setDescription('Amount (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('purge').setDescription('Delete messages from a specific user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Messages to scan (max 100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('reactionrole').setDescription('Add a reaction role to a message')
    .addStringOption(o => o.setName('messageid').setDescription('Message ID to add reaction to').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji to react with').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true)),
  new SlashCommandBuilder().setName('rules').setDescription('Show server rules'),
  new SlashCommandBuilder().setName('socials').setDescription('Show social media links'),
  new SlashCommandBuilder().setName('help').setDescription('Show all commands'),
];

async function registerCommands(clientId, guildId) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands.map(c => c.toJSON()) });
    console.log('✅ Slash commands registered!');
  } catch (err) { console.error('Command reg error:', err); }
}

// ─── MEMBER COUNTER ───────────────────────────────────────────────────────────
async function updateMemberCount(guild) {
  try {
    const channelName = config.memberCounterChannelName.replace('{count}', guild.memberCount);
    let channel = guild.channels.cache.find(c => c.name.startsWith('👤') && c.type === ChannelType.GuildVoice);
    if (channel) await channel.setName(channelName).catch(() => {});
    else await guild.channels.create({ name: channelName, type: ChannelType.GuildVoice, permissionOverwrites: [{ id: guild.roles.everyone, deny: [PermissionFlagsBits.Connect] }] });
  } catch (err) { console.error('Member count error:', err); }
}

// ─── MOD LOG ──────────────────────────────────────────────────────────────────
function logAction(guild, action, target, moderator, reason, color = '#ED4245') {
  try {
    const logChannel = guild.channels.cache.find(c => c.name === config.logChannelName);
    if (!logChannel) return;
    const embed = new EmbedBuilder().setColor(color).setTitle(action).setTimestamp();
    if (target) embed.addFields({ name: 'User', value: `${target.tag} (${target.id})`, inline: true });
    if (moderator) embed.addFields({ name: moderator.bot ? 'Action' : 'Moderator', value: moderator.tag, inline: true });
    if (reason) embed.addFields({ name: 'Reason', value: reason });
    logChannel.send({ embeds: [embed] });
  } catch (err) { console.error('Log error:', err); }
}

// ─── MUTED ROLE ───────────────────────────────────────────────────────────────
async function getMutedRole(guild) {
  let role = guild.roles.cache.find(r => r.name === 'Muted');
  if (!role) {
    role = await guild.roles.create({ name: 'Muted', color: '#818386', reason: 'Auto-created muted role' });
    for (const channel of guild.channels.cache.values()) {
      if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice) {
        await channel.permissionOverwrites.create(role, { SendMessages: false, SendMessagesInThreads: false, AddReactions: false, Speak: false }).catch(() => {});
      }
    }
  }
  return role;
}

// ─── MUTE HELPER ─────────────────────────────────────────────────────────────
async function muteUser(member, durationMs, reason, guild) {
  const mutedRole = await getMutedRole(guild);
  await member.roles.add(mutedRole, reason);
  setTimeout(async () => { await member.roles.remove(mutedRole).catch(() => {}); }, durationMs);
}

// ─── WARN + THRESHOLD ─────────────────────────────────────────────────────────
async function addWarning(member, reason, guild, moderator) {
  const uid = member.user.id;
  if (!warnings[uid]) warnings[uid] = [];
  warnings[uid].push({ reason, date: new Date().toISOString(), moderator: moderator?.tag || 'Auto-Mod' });
  saveWarnings();

  const count = warnings[uid].length;
  const { muteAt, muteDuration, banAt } = config.warnThresholds;

  if (count >= banAt) {
    await member.ban({ reason: `Auto-ban: reached ${banAt} warnings` }).catch(() => {});
    logAction(guild, `🔨 AUTO-BAN (${count} warnings)`, member.user, client.user, `Reached ${banAt} warnings`, '#ff0000');
  } else if (count >= muteAt) {
    await muteUser(member, muteDuration * 60 * 1000, `Auto-mute: ${count} warnings`, guild);
    logAction(guild, `🔇 AUTO-MUTE (${count} warnings)`, member.user, client.user, `Reached ${muteAt} warnings`, '#faa61a');
  }

  return count;
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

// ─── MEMBER JOIN ──────────────────────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  console.log(`Member joined: ${member.user.tag}`);
  await updateMemberCount(member.guild);

  const role = member.guild.roles.cache.find(r => r.name === config.autoRole);
  if (role) await member.roles.add(role).catch(err => console.error('Role assign error:', err));

  // Welcome channel embed
  const welcomeChannel = member.guild.channels.cache.find(ch => ch.name === config.welcomeChannelName);
  if (welcomeChannel) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`👋 Welcome to ${member.guild.name}!`)
      .setDescription(`Hey ${member}, glad to have you here!\nMake sure to read the rules and enjoy your stay.`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `Member #${member.guild.memberCount}` });
    welcomeChannel.send({ embeds: [embed] });
  }

  // Join DM
  if (config.joinDM?.enabled && config.joinDM?.message) {
    await member.send(config.joinDM.message).catch(() => {});
  }

  // Mod log
  logAction(member.guild, '📥 MEMBER JOINED', member.user, null, null, '#57f287');
});

// ─── MEMBER LEAVE ─────────────────────────────────────────────────────────────
client.on('guildMemberRemove', async (member) => {
  await updateMemberCount(member.guild);
  logAction(member.guild, '📤 MEMBER LEFT', member.user, null, null, '#ed4245');
});

// ─── ANTI-SPAM + AUTO-MOD ─────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // Bad word filter
  const lower = message.content.toLowerCase();
  if (config.badWords.some(w => lower.includes(w))) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`⚠️ ${message.author}, that language isn't allowed here.`);
    setTimeout(() => warn.delete().catch(() => {}), 5000);
    return;
  }

  // Anti-spam
  if (config.antiSpam?.enabled) {
    const uid = message.author.id;
    const now = Date.now();
    const window = (config.antiSpam.timeWindow || 5) * 1000;
    if (!spamTracker[uid]) spamTracker[uid] = [];
    spamTracker[uid] = spamTracker[uid].filter(t => now - t < window);
    spamTracker[uid].push(now);
    if (spamTracker[uid].length >= (config.antiSpam.maxMessages || 5)) {
      spamTracker[uid] = [];
      const member = message.guild.members.cache.get(uid);
      if (member && !member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        const muteDuration = (config.antiSpam.muteDuration || 10) * 60 * 1000;
        await muteUser(member, muteDuration, 'Auto-mute: spam detected', message.guild);
        const alert = await message.channel.send(`🚨 ${message.author} has been muted for spam.`);
        setTimeout(() => alert.delete().catch(() => {}), 5000);
        logAction(message.guild, '🚨 AUTO-MUTE (spam)', message.author, client.user, 'Spam detected');
      }
    }
  }
});

// ─── REACTION ROLES ───────────────────────────────────────────────────────────
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  const key = `${reaction.message.id}-${reaction.emoji.name}`;
  const rr = reactionRoles[key];
  if (!rr) return;
  const guild = reaction.message.guild;
  const member = guild.members.cache.get(user.id);
  if (member) await member.roles.add(rr.roleId).catch(() => {});
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  const key = `${reaction.message.id}-${reaction.emoji.name}`;
  const rr = reactionRoles[key];
  if (!rr) return;
  const guild = reaction.message.guild;
  const member = guild.members.cache.get(user.id);
  if (member) await member.roles.remove(rr.roleId).catch(() => {});
});

// ─── SLASH COMMAND HANDLER ────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, member } = interaction;

  try {
    await interaction.deferReply();

    if (commandName === 'kick') {
      if (!hasPermission(member, 'kick')) return interaction.editReply('❌ No permission.');
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await target.kick(reason);
      interaction.editReply(`✅ **${target.user.tag}** kicked. Reason: ${reason}`);
      logAction(guild, '🦵 KICK', target.user, interaction.user, reason);

    } else if (commandName === 'ban') {
      if (!hasPermission(member, 'ban')) return interaction.editReply('❌ No permission.');
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await target.ban({ reason });
      interaction.editReply(`✅ **${target.user.tag}** banned. Reason: ${reason}`);
      logAction(guild, '🔨 BAN', target.user, interaction.user, reason);

    } else if (commandName === 'unban') {
      if (!hasPermission(member, 'unban')) return interaction.editReply('❌ No permission.');
      const userId = interaction.options.getString('userid');
      await guild.members.unban(userId);
      interaction.editReply(`✅ User \`${userId}\` unbanned.`);

    } else if (commandName === 'mute') {
      if (!hasPermission(member, 'mute')) return interaction.editReply('❌ No permission.');
      const target = interaction.options.getMember('user');
      const duration = interaction.options.getInteger('duration');
      const unit = interaction.options.getString('unit');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const msMap = { minutes: 60000, hours: 3600000, days: 86400000 };
      await muteUser(target, duration * msMap[unit], reason, guild);
      interaction.editReply(`✅ **${target.user.tag}** muted for ${duration} ${unit}. Reason: ${reason}`);
      logAction(guild, `🔇 MUTE (${duration} ${unit})`, target.user, interaction.user, reason);

    } else if (commandName === 'unmute') {
      if (!hasPermission(member, 'unmute')) return interaction.editReply('❌ No permission.');
      const target = interaction.options.getMember('user');
      const mutedRole = guild.roles.cache.find(r => r.name === 'Muted');
      if (mutedRole) await target.roles.remove(mutedRole).catch(() => {});
      interaction.editReply(`✅ **${target.user.tag}** unmuted.`);

    } else if (commandName === 'warn') {
      if (!hasPermission(member, 'warn')) return interaction.editReply('❌ No permission.');
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const count = await addWarning(target, reason, guild, interaction.user);
      const { muteAt, banAt } = config.warnThresholds;
      let extra = '';
      if (count >= banAt) extra = '\n🔨 **User has been auto-banned.**';
      else if (count >= muteAt) extra = '\n🔇 **User has been auto-muted.**';
      interaction.editReply(`⚠️ **${target.user.tag}** warned. (${count} total warnings)${extra}`);
      logAction(guild, '⚠️ WARN', target.user, interaction.user, reason);

    } else if (commandName === 'warnings') {
      const target = interaction.options.getMember('user') || member;
      const uid = target.user.id;
      const warns = warnings[uid];
      if (!warns || warns.length === 0) return interaction.editReply(`✅ **${target.user.tag}** has no warnings.`);
      const list = warns.map((w, i) => `${i + 1}. ${w.reason} — by ${w.moderator} (${w.date.split('T')[0]})`).join('\n');
      interaction.editReply(`⚠️ **${target.user.tag}** — ${warns.length} warning(s):\n${list}`);

    } else if (commandName === 'clearwarnings') {
      if (!hasPermission(member, 'warn')) return interaction.editReply('❌ No permission.');
      const target = interaction.options.getMember('user');
      delete warnings[target.user.id];
      saveWarnings();
      interaction.editReply(`✅ Cleared all warnings for **${target.user.tag}**.`);

    } else if (commandName === 'clear') {
      if (!hasPermission(member, 'clear')) return interaction.editReply('❌ No permission.');
      const amount = interaction.options.getInteger('amount');
      await interaction.channel.bulkDelete(amount, true);
      interaction.editReply(`✅ Deleted ${amount} message(s).`);
      setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);

    } else if (commandName === 'purge') {
      if (!hasPermission(member, 'purge')) return interaction.editReply('❌ No permission.');
      const target = interaction.options.getMember('user');
      const amount = interaction.options.getInteger('amount');
      const messages = await interaction.channel.messages.fetch({ limit: amount });
      const userMessages = messages.filter(m => m.author.id === target.user.id);
      if (userMessages.size === 0) return interaction.editReply(`❌ No messages found from **${target.user.tag}**.`);
      await interaction.channel.bulkDelete(userMessages, true).catch(() => {});
      interaction.editReply(`✅ Deleted **${userMessages.size}** message(s) from **${target.user.tag}**.`);
      setTimeout(() => interaction.deleteReply().catch(() => {}), 4000);
      logAction(guild, '🗑️ PURGE', target.user, interaction.user, `Deleted ${userMessages.size} messages`);

    } else if (commandName === 'reactionrole') {
      if (!hasPermission(member, 'announce')) return interaction.editReply('❌ No permission.');
      const messageId = interaction.options.getString('messageid');
      const emoji = interaction.options.getString('emoji');
      const role = interaction.options.getRole('role');
      try {
        const message = await interaction.channel.messages.fetch(messageId);
        await message.react(emoji);
        const key = `${messageId}-${emoji}`;
        reactionRoles[key] = { roleId: role.id, roleName: role.name, emoji, messageId, channelId: interaction.channel.id };
        saveReactionRoles();
        interaction.editReply(`✅ Reaction role set! React with ${emoji} on that message to get **${role.name}**.`);
      } catch (err) {
        interaction.editReply(`❌ Error: ${err.message}. Make sure the message ID is from this channel.`);
      }

    } else if (commandName === 'rules') {
      interaction.editReply(config.customCommands['rules']);
    } else if (commandName === 'socials') {
      interaction.editReply(config.customCommands['socials']);
    } else if (commandName === 'help') {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📋 Bot Commands')
        .addFields(
          { name: '🔨 Moderation', value: '`/kick` `/ban` `/unban` `/mute` `/unmute` `/warn` `/warnings` `/clearwarnings` `/clear` `/purge`' },
          { name: '🎭 Roles', value: '`/reactionrole` — Add a reaction role to a message' },
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

// ─── LOGIN ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
