require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } = require("discord.js");
const { Pool } = require("pg"); 

const app = express();
const PORT = 3000; 

// Express server to keep bot alive on Render
app.get("/", (req, res) => {
  res.send("Bot is running.");
});
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
}); 

// PostgreSQL connection setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
}); 

// Auto-reconnect on database errors
pool.on("error", async (err) => {
  console.error("Database connection lost. Attempting to reconnect...", err);
  try {
    await pool.query("SELECT 1");
    console.log("Database reconnected successfully.");
  } catch (error) {
    console.error("Reconnection attempt failed:", error);
  }
}); 

// Keep the database connection alive
setInterval(async () => {
  try {
    await pool.query("SELECT now()");
  } catch (err) {
    console.error("Database keep-alive failed:", err);
  }
}, 120000); // 2 minutes 

// Ensure `bumps` table exists
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bumps (
        userId TEXT PRIMARY KEY,
        username TEXT,
        count INTEGER DEFAULT 0
      )
    `);
    console.log("Bump table ensured.");
  } catch (err) {
    console.error("Failed to initialize database:", err.message);
  }
})(); 

// Bump bot ID and message
const BUMP_BOT_ID = "735147814878969968";
const BUMP_MESSAGE = "Thx for bumping our Server! We will remind you in 2 hours!"; 

// Handle messages for bump tracking
client.on("messageCreate", async (message) => {
  if (message.author.id === BUMP_BOT_ID && message.content.startsWith(BUMP_MESSAGE)) {
    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) return; 

    const userId = mentionedUser.id;
    const username = mentionedUser.username; 

    try {
      const res = await pool.query(`SELECT count FROM bumps WHERE userId = $1`, [userId]); 

      if (res.rows.length > 0) {
        await pool.query(`UPDATE bumps SET count = count + 1 WHERE userId = $1`, [userId]);
      } else {
        await pool.query(`INSERT INTO bumps (userId, username, count) VALUES ($1, $2, 1)`, [userId, username]);
      }
    } catch (err) {
      console.error("Database error:", err.message);
    }
  }
}); 

// Slash command setup
const commands = [
  {
    name: "brank",
    description: "Displays the bump leaderboard",
  },
]; 

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN); 

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`); 

  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("Slash commands registered.");
  } catch (err) {
    console.error("Error registering slash commands:", err);
  }
}); 

// Handle slash commands
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return; 

  if (interaction.commandName === "brank") {
    try {
      const res = await pool.query(`SELECT username, count FROM bumps ORDER BY count DESC LIMIT 10`); 

      if (res.rows.length === 0) {
        return interaction.reply("No bumps recorded yet.");
      } 

      const leaderboard = res.rows
        .map((entry, index) => `**${index + 1}.** ${entry.username} - **${entry.count} bumps**`)
        .join("\n"); 

      const embed = new EmbedBuilder()
        .setTitle("DISBOARD BUMPS")
        .setColor("#acf508")
        .setDescription(leaderboard)
        .setFooter({ text: "Keep bumping to climb the leaderboard!" }); 

      interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error("Database error:", err.message);
      interaction.reply("Error retrieving leaderboard.");
    }
  }
}); 

// Bot login
client.login(process.env.TOKEN);