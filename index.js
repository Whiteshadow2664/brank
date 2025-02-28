require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

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

// SQLite database connection
const db = new sqlite3.Database("database.sqlite", (err) => {
  if (err) {
    console.error("❌ Error opening SQLite database:", err.message);
  } else {
    console.log("✅ Connected to SQLite database.");
  }
});

// Ensure `bumps` table exists
db.run(
  `CREATE TABLE IF NOT EXISTS bumps (
    userId TEXT PRIMARY KEY,
    username TEXT,
    count INTEGER DEFAULT 0
  )`,
  (err) => {
    if (err) {
      console.error("❌ Failed to initialize SQLite table:", err.message);
    } else {
      console.log("✅ Bump table ensured in SQLite.");
    }
  }
);

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

    db.get(`SELECT count FROM bumps WHERE userId = ?`, [userId], (err, row) => {
      if (err) {
        return console.error("❌ Error fetching bump count:", err.message);
      }

      if (row) {
        db.run(`UPDATE bumps SET count = count + 1 WHERE userId = ?`, [userId], (err) => {
          if (err) {
            console.error("❌ Error updating bump count:", err.message);
          }
        });
      } else {
        db.run(`INSERT INTO bumps (userId, username, count) VALUES (?, ?, 1)`, [userId, username], (err) => {
          if (err) {
            console.error("❌ Error inserting bump:", err.message);
          }
        });
      }
    });
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
    console.log("✅ Slash commands registered.");
  } catch (err) {
    console.error("❌ Error registering slash commands:", err);
  }
});

// Handle slash commands
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === "brank") {
    db.all(`SELECT username, count FROM bumps ORDER BY count DESC LIMIT 10`, [], (err, rows) => {
      if (err) {
        console.error("❌ Error retrieving leaderboard:", err.message);
        return interaction.reply("Error retrieving leaderboard.");
      }

      if (rows.length === 0) {
        return interaction.reply("No bumps recorded yet.");
      }

      const leaderboard = rows
        .map((entry, index) => `**${index + 1}.** ${entry.username} - **${entry.count} bumps**`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setTitle("DISBOARD BUMPS")
        .setColor("#acf508")
        .setDescription(leaderboard)
        .setFooter({ text: "Keep bumping to climb the leaderboard!" });

      interaction.reply({ embeds: [embed] });
    });
  }
});

// Bot login
client.login(process.env.TOKEN);