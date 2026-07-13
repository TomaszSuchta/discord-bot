process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

const {
  Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits,
  ChannelType, REST, Routes, SlashCommandBuilder, AttachmentBuilder,
  // BUG FIX #2: Partials are required so reaction events fire on messages that
  // aren't in the bot's cache (e.g. messages posted before the bot started).
  // Without these, messageReactionAdd/Remove silently never trigger for old messages.
  Partials,
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
      introSystem: config.introSystem,
      welcomeMessage: config.welcomeMessage,
      customCommands: config.customCommands,
    }, roles }));
  }

  if (req.method === 'POST' && req.url === '/config') {
    const data = await parseBody();
    // Accept ALL config keys from dashboard
    for (const key of Object.keys(data)) {
      config[key] = data[key];
    }
    console.log('Config updated, keys:', Object.keys(data).join(', '));
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

  // ── NEW FEATURE: /warnings-data endpoint for the dashboard Mod Log Viewer ──
  if (req.method === 'GET' && req.url === '/warnings-data') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(warnings));
  }


  // Previously the dashboard had no way to see live server stats.
  if (req.method === 'GET' && req.url === '/stats') {
    const guild = client.guilds.cache.first();
    if (!guild) { res.writeHead(500); return res.end(JSON.stringify({ error: 'Not in server' })); }
    await guild.members.fetch().catch(() => {});
    const totalWarnings = Object.values(warnings).reduce((sum, w) => sum + w.length, 0);
    const bannedCount = (await guild.bans.fetch().catch(() => ({ size: 0 }))).size;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      memberCount: guild.memberCount,
      totalWarnings,
      bannedCount,
      reactionRoleCount: Object.keys(reactionRoles).length,
      botTag: client.user?.tag,
    }));
  }

  res.writeHead(200); res.end('Bot is running!');
}).listen(process.env.PORT || 3000, () => console.log('HTTP server running'));

// ─── CLIENT ──────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
  ],
  // BUG FIX #2 (continued): These three partials must ALL be present together.
  // Message  — allows receiving reaction events for uncached messages
  // Channel  — required when Message partial is used (reaction may be in uncached DM channel)
  // Reaction — allows receiving the reaction data itself when it's only partially available
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ─── RAILWAY VARIABLE PERSISTENCE ────────────────────────────────────────────
const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN;
const RAILWAY_PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const RAILWAY_SERVICE_ID = process.env.RAILWAY_SERVICE_ID;
const RAILWAY_ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID;
const DATA_DIR = './data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(`${DATA_DIR}/${file}`, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, data) {
  try { fs.writeFileSync(`${DATA_DIR}/${file}`, JSON.stringify(data, null, 2)); } catch {}
}

async function railwayGraphQL(query, variables) {
  const res = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RAILWAY_TOKEN}` },
    body: JSON.stringify({ query, variables })
  });
  return res.json();
}

async function loadConfigFromCloud() {
  if (!RAILWAY_TOKEN) { console.log('⚠️ No RAILWAY_TOKEN set'); return null; }
  try {
    const data = await railwayGraphQL(`
      query($projectId: String!, $serviceId: String!, $environmentId: String!) {
        variables(projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId)
      }
    `, { projectId: RAILWAY_PROJECT_ID, serviceId: RAILWAY_SERVICE_ID, environmentId: RAILWAY_ENVIRONMENT_ID });
    const vars = data?.data?.variables;
    console.log('Railway vars keys:', vars ? Object.keys(vars).join(', ') : 'null');
    if (vars?.BOT_CONFIG) {
      const parsed = JSON.parse(vars.BOT_CONFIG);
      console.log('✅ Config loaded from Railway Variables, keys:', Object.keys(parsed).join(', '));
      return parsed;
    }
    console.log('⚠️ No BOT_CONFIG variable found yet');
  } catch (err) { console.error('Railway load error:', err.message); }
  return null;
}

async function saveConfigToCloud(configData) {
  if (!RAILWAY_TOKEN) return;
  try {
    const result = await railwayGraphQL(`
      mutation($projectId: String!, $serviceId: String!, $environmentId: String!, $name: String!, $value: String!) {
        variableUpsert(input: {
          projectId: $projectId,
          serviceId: $serviceId,
          environmentId: $environmentId,
          name: $name,
          value: $value
        })
      }
    `, {
      projectId: RAILWAY_PROJECT_ID,
      serviceId: RAILWAY_SERVICE_ID,
      environmentId: RAILWAY_ENVIRONMENT_ID,
      name: 'BOT_CONFIG',
      value: JSON.stringify(configData)
    });
    if (result.errors) {
      console.error('Railway save error:', JSON.stringify(result.errors));
    } else {
      console.log('✅ Config saved to Railway Variables');
    }
  } catch (err) { console.error('Railway save error:', err.message); }
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
    title: '',
    description: '',  // <── BUG FIX #2: this is the correct field name (not .message)
    color: '#5865F2',
    image: '',
    thumbnail: '',
    footer: '',
    btnLabel: '',
    btnUrl: '',
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
  // BUG FIX #3: the description used '\\n' (literal backslash-n) in the old code.
  // That rendered as the text "\n" in Discord instead of a real line break.
  // Using a real newline character here fixes it.
  welcomeMessage: {
    enabled: true,
    title: '👋 Welcome to {server}!',
    description: 'Hey {mention}, glad to have you here!\nMake sure to read the rules and enjoy your stay.',
    color: '#5865F2',
    image: '',
    thumbnail: 'avatar',
  },
  introSystem: {
    enabled: false,
    channelId: '',
    channelName: '',
    minWords: 15,
    successMsg: 'Welcome {mention} check your DMs I just sent you a gift',
    shortMsg: 'That is too short! Try again.',
    dmTitle: '',
    dmDesc: '',
    dmLink: '',
    color: '#5865F2',
    dmImage: '',
  },
  permissions: {
    kick:      ['👑⬩Owner', '📖⬩Moderator'],
    ban:       ['👑⬩Owner', '📖⬩Moderator'],
    unban:     ['👑⬩Owner', '📖⬩Moderator'],
    mute:      ['👑⬩Owner', '📖⬩Moderator'],
    unmute:    ['👑⬩Owner', '📖⬩Moderator'],
    warn:      ['👑⬩Owner', '📖⬩Moderator'],
    clear:     ['👑⬩Owner', '📖⬩Moderator'],
    purge:     ['👑⬩Owner', '📖⬩Moderator'],
    announce:  ['👑⬩Owner'],
    slowmode:  ['👑⬩Owner', '📖⬩Moderator'], // FEATURE 1
  },
};

const config = { ...defaultConfig, ...loadJSON('config.json', {}) };
function saveConfig() {
  saveJSON('config.json', config);
  saveConfigToCloud(config); // fire-and-forget; errors logged inside the function
}

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
  // BUG FIX #3: /ticket and /close were listed in the dashboard's Commands page
  // but never actually registered or implemented. Added here so they work.
  new SlashCommandBuilder().setName('ticket').setDescription('Open a support ticket'),
  new SlashCommandBuilder().setName('close').setDescription('Close this ticket channel (mods only)'),
  // FEATURE 1: /slowmode — lets mods throttle a channel during raids or floods
  new SlashCommandBuilder().setName('slowmode').setDescription('Set slowmode on this channel')
    .addIntegerOption(o => o.setName('seconds').setDescription('Seconds between messages (0 = off, max 21600)').setRequired(true).setMinValue(0).setMaxValue(21600)),
  // FEATURE 2: /userinfo — lets mods quickly look up a user's join date, roles, and warning count
  new SlashCommandBuilder().setName('userinfo').setDescription('Show info about a user')
    .addUserOption(o => o.setName('user').setDescription('User to look up (leave blank for yourself)')),
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

// ─── BUILD WELCOME EMBED ─────────────────────────────────────────────────────
// BUG FIX #4: The old guildMemberAdd handler completely ignored config.welcomeMessage.
// It always sent a hardcoded embed. This function reads the actual saved config.
function buildWelcomeEmbed(member) {
  const wm = config.welcomeMessage;
  // Replace placeholders: {mention}, {user}, {server}, {count}
  const replacePlaceholders = (text) => (text || '')
    .replace(/\{mention\}/g, `<@${member.user.id}>`)
    .replace(/\{user\}/g, member.user.username)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{count\}/g, String(member.guild.memberCount));

  const embed = new EmbedBuilder()
    .setColor(wm.color || '#5865F2')
    .setTitle(replacePlaceholders(wm.title || '👋 Welcome to {server}!'))
    .setDescription(replacePlaceholders(wm.description || 'Hey {mention}, glad to have you here!\nEnjoy your stay.'))
    .setFooter({ text: `Member #${member.guild.memberCount}` });

  // Thumbnail: 'avatar' = member's avatar, a URL = custom image, '' = none
  if (wm.thumbnail === 'avatar') {
    embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
  } else if (wm.thumbnail) {
    embed.setThumbnail(wm.thumbnail);
  }

  if (wm.image) embed.setImage(wm.image);
  return embed;
}

// ─── READY ───────────────────────────────────────────────────────────────────
// BUG FIX #1: discord.js v14 removed the 'clientReady' event name.
// The correct event is 'ready'. Using 'clientReady' means this block NEVER fires —
// slash commands never register, config never loads, member counter never sets up.
client.once('ready', async () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  client.user.setActivity('Moderating the server', { type: 3 });

  const cloudConfig = await loadConfigFromCloud();
  if (cloudConfig) {
    for (const key of Object.keys(cloudConfig)) {
      config[key] = cloudConfig[key];
    }
    for (const key of Object.keys(defaultConfig)) {
      if (config[key] === undefined) {
        config[key] = defaultConfig[key];
        console.log(`✅ Added missing key from defaults: ${key}`);
      }
    }
    console.log('✅ Config restored from cloud');
  } else {
    console.log('⚠️ No cloud config found, using defaults');
  }

  for (const guild of client.guilds.cache.values()) {
    await registerCommands(client.user.id, guild.id);
    await updateMemberCount(guild);
  }
});

// ─── MEMBER JOIN ──────────────────────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  console.log(`Member joined: ${member.user.tag}`);
  await updateMemberCount(member.guild);

  if (config.autoRole) {
    const role = member.guild.roles.cache.find(r => r.name === config.autoRole);
    if (role) await member.roles.add(role).catch(err => console.error('Role assign error:', err));
  }

  // ── BUG FIX #4 (continued): Now uses config.welcomeMessage instead of hardcoded embed ──
  if (config.welcomeMessage?.enabled !== false) {
    const welcomeChannel = member.guild.channels.cache.find(ch => ch.name === config.welcomeChannelName);
    if (welcomeChannel) {
      welcomeChannel.send({ embeds: [buildWelcomeEmbed(member)] }).catch(err => console.error('Welcome send error:', err));
    }
  }

  // ── BUG FIX #2: joinDM used config.joinDM.message which never existed. ──
  // The dashboard stores the content as title + description + color + image + etc.
  // We now build the embed from those fields instead.
  if (config.joinDM?.enabled) {
    const dm = config.joinDM;
    // Only send if there's actual content configured
    if (dm.title || dm.description) {
      const embed = new EmbedBuilder().setColor(dm.color || '#5865F2');
      if (dm.title) embed.setTitle(dm.title);
      if (dm.description) embed.setDescription(dm.description.replace(/\{user\}/g, member.user.username));
      if (dm.thumbnail) embed.setThumbnail(dm.thumbnail);
      if (dm.footer) embed.setFooter({ text: dm.footer });
      // Image must be a URL (base64 images can't be sent in embeds via DM)
      if (dm.image && dm.image.startsWith('http')) embed.setImage(dm.image);

      const sendOptions = { embeds: [embed] };
      // If a button was configured, we can't add buttons to DMs via embeds alone —
      // but we can append the link as plain text below the embed.
      const components = [];
      if (dm.btnLabel && dm.btnUrl) {
        // Send link as a separate line since buttons require component rows
        await member.send(sendOptions).catch(() => {});
        await member.send(`[${dm.btnLabel}](${dm.btnUrl})`).catch(() => {});
      } else {
        await member.send(sendOptions).catch(() => {});
      }
    }
  }

  logAction(member.guild, '📥 MEMBER JOINED', member.user, null, null, '#57f287');
});

// ─── MEMBER LEAVE ─────────────────────────────────────────────────────────────
client.on('guildMemberRemove', async (member) => {
  await updateMemberCount(member.guild);
  logAction(member.guild, '📤 MEMBER LEFT', member.user, null, null, '#ed4245');
});

// ─── ANTI-SPAM + AUTO-MOD + INTRO SYSTEM ─────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // ── BUG FIX #5: Intro system was configured in the dashboard but never ──────
  // implemented in the bot. This is the complete implementation.
  const intro = config.introSystem;
  if (intro?.enabled && intro?.channelId && message.channel.id === intro.channelId) {
    const wordCount = message.content.trim().split(/\s+/).filter(Boolean).length;
    const minWords = intro.minWords || 15;

    if (wordCount < minWords) {
      // Too short — reply in channel then done (don't auto-mod this channel)
      const shortReply = (intro.shortMsg || 'That is too short! Try again.')
        .replace(/\{mention\}/g, `<@${message.author.id}>`);
      await message.reply(shortReply).catch(() => {});
    } else {
      // Valid intro — reply in channel
      const successReply = (intro.successMsg || 'Welcome {mention}!')
        .replace(/\{mention\}/g, `<@${message.author.id}>`);
      await message.reply(successReply).catch(() => {});

      // Send resource DM if configured
      if (intro.dmTitle || intro.dmDesc) {
        const embed = new EmbedBuilder().setColor(intro.color || '#5865F2');
        if (intro.dmTitle) embed.setTitle(intro.dmTitle);
        if (intro.dmDesc) embed.setDescription(intro.dmDesc);
        if (intro.dmImage && intro.dmImage.startsWith('http')) embed.setImage(intro.dmImage);

        await message.author.send({ embeds: [embed] }).catch(() => {
          console.log(`Could not DM ${message.author.tag} — they may have DMs off`);
        });

        // Send resource link as separate message if configured
        if (intro.dmLink) {
          await message.author.send(intro.dmLink).catch(() => {});
        }
      }
    }
    // Skip the rest of messageCreate for intro channel messages
    return;
  }

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
// BUG FIX #6: Discord sometimes sends "partial" reaction objects for messages
// that aren't in the bot's cache (e.g. messages sent before the bot started).
// Calling reaction.fetch() fills in the missing data before we try to use it.
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  // Fetch partial reactions/messages to avoid crashes on old messages
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  const key = `${reaction.message.id}-${reaction.emoji.name}`;
  const rr = reactionRoles[key];
  if (!rr) return;
  const guild = reaction.message.guild;
  if (!guild) return;
  // Fetch member in case they aren't cached
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (member) await member.roles.add(rr.roleId).catch(() => {});
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  const key = `${reaction.message.id}-${reaction.emoji.name}`;
  const rr = reactionRoles[key];
  if (!rr) return;
  const guild = reaction.message.guild;
  if (!guild) return;
  const member = await guild.members.fetch(user.id).catch(() => null);
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

    // BUG FIX #3 (continued): Ticket and close command implementations.
    // /ticket creates a private channel only visible to the user + moderators.
    // /close deletes it after a 5-second countdown.
    } else if (commandName === 'ticket') {
      // Check if this user already has an open ticket
      const existingTicket = guild.channels.cache.find(
        c => c.name === `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}` && c.topic === member.user.id
      );
      if (existingTicket) {
        return interaction.editReply(`❌ You already have an open ticket: ${existingTicket}. Use \`/close\` inside it to close it first.`);
      }

      // Find or create the Tickets category
      let category = guild.channels.cache.find(c => c.name === config.ticketCategoryName && c.type === ChannelType.GuildCategory);
      if (!category) {
        category = await guild.channels.create({ name: config.ticketCategoryName, type: ChannelType.GuildCategory }).catch(() => null);
      }

      // Build permission overwrites: hide from @everyone, show to the user and mod roles
      const permissionOverwrites = [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ];
      // Also give access to all allowed mod roles
      const modRoles = [...new Set([
        ...(config.permissions.kick || []),
        ...(config.permissions.ban || []),
      ])];
      for (const roleName of modRoles) {
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (role) permissionOverwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
      }

      const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
      const ticketChannel = await guild.channels.create({
        name: `ticket-${safeName}`,
        type: ChannelType.GuildText,
        topic: member.user.id, // store user ID in topic so we can find it later
        parent: category?.id,
        permissionOverwrites,
      }).catch(err => { console.error('Ticket create error:', err); return null; });

      if (!ticketChannel) return interaction.editReply('❌ Failed to create ticket channel. Make sure I have Manage Channels permission.');

      const ticketEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎫 Support Ticket')
        .setDescription(`Hey ${member}, thanks for opening a ticket!\n\nDescribe your issue and a moderator will be with you shortly.\n\nUse \`/close\` to close this ticket when you're done.`)
        .setFooter({ text: 'Only you and moderators can see this channel' })
        .setTimestamp();
      await ticketChannel.send({ embeds: [ticketEmbed] });
      interaction.editReply(`✅ Ticket created: ${ticketChannel}`);
      logAction(guild, '🎫 TICKET OPENED', member.user, member.user, 'User opened a support ticket', '#5865f2');

    } else if (commandName === 'close') {
      // Must be inside a ticket channel (identified by the topic being a user ID)
      if (!interaction.channel.topic?.match(/^\d{17,19}$/)) {
        return interaction.editReply('❌ This command can only be used inside a ticket channel.');
      }
      if (!hasPermission(member, 'kick') && interaction.channel.topic !== member.user.id) {
        return interaction.editReply('❌ Only moderators can close tickets they did not open.');
      }
      interaction.editReply('🔒 Ticket closing in 5 seconds...');
      logAction(guild, '🎫 TICKET CLOSED', member.user, interaction.user, 'Ticket closed', '#ed4245');
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);

    // FEATURE 1: /slowmode — throttle a channel to prevent message floods
    } else if (commandName === 'slowmode') {
      if (!hasPermission(member, 'clear')) return interaction.editReply('❌ No permission.');
      const seconds = interaction.options.getInteger('seconds');
      await interaction.channel.setRateLimitPerUser(seconds, `Slowmode set by ${interaction.user.tag}`);
      if (seconds === 0) {
        interaction.editReply('✅ Slowmode **disabled** in this channel.');
      } else {
        const label = seconds >= 3600 ? `${Math.floor(seconds/3600)}h ${seconds%3600 > 0 ? Math.floor((seconds%3600)/60)+'m' : ''}`.trim()
                    : seconds >= 60   ? `${Math.floor(seconds/60)}m ${seconds%60 > 0 ? seconds%60+'s' : ''}`.trim()
                    : `${seconds}s`;
        interaction.editReply(`✅ Slowmode set to **${label}** in this channel.`);
      }
      logAction(guild, `⏱️ SLOWMODE (${seconds}s)`, null, interaction.user, `Set on #${interaction.channel.name}`, '#5865f2');

    // FEATURE 2: /userinfo — quick moderator lookup for a user's join date, roles, and warnings
    } else if (commandName === 'userinfo') {
      const target = interaction.options.getMember('user') || member;
      const warnCount = (warnings[target.user.id] || []).length;
      const roles = target.roles.cache.filter(r => r.name !== '@everyone').map(r => r.toString()).join(', ') || 'None';
      const joinedServer = target.joinedAt ? `<t:${Math.floor(target.joinedAt.getTime()/1000)}:R>` : 'Unknown';
      const createdAccount = `<t:${Math.floor(target.user.createdAt.getTime()/1000)}:R>`;
      const embed = new EmbedBuilder()
        .setColor(warnCount >= config.warnThresholds.banAt ? '#ed4245' : warnCount >= config.warnThresholds.muteAt ? '#faa61a' : '#5865f2')
        .setTitle(`👤 ${target.user.tag}`)
        .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: 'User ID', value: target.user.id, inline: true },
          { name: 'Joined Server', value: joinedServer, inline: true },
          { name: 'Account Created', value: createdAccount, inline: true },
          { name: 'Warnings', value: warnCount === 0 ? '✅ None' : `⚠️ ${warnCount} warning(s)`, inline: true },
          { name: 'Roles', value: roles.length > 1024 ? roles.slice(0, 1021) + '...' : roles },
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();
      interaction.editReply({ embeds: [embed] });

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
          { name: '⏱️ Channel Tools', value: '`/slowmode <seconds>` — Throttle a channel (0 to disable)\n`/userinfo [@user]` — Look up join date, roles, and warnings' },
          { name: '🎫 Tickets', value: '`/ticket` — Open a support ticket  |  `/close` — Close a ticket (mods)' },
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
