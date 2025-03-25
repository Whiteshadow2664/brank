require("dotenv").config();
const { Client, GatewayIntentBits, SlashCommandBuilder, Routes } = require("discord.js");
const { REST } = require("@discordjs/rest");
const bump = require("./bump.js");

// ✅ Ensure required environment variables are set
if (!process.env.TOKEN) throw new Error("❌ Missing TOKEN in environment variables!");
if (!process.env.CLIENT_ID) throw new Error("❌ Missing CLIENT_ID in environment variables!");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// ✅ Register slash commands
const commands = [
    new SlashCommandBuilder()
        .setName("brank")
        .setDescription("Shows the bump leaderboard"),
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log("⏳ Registering slash commands...");
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands.map(command => command.toJSON()) }
        );
        console.log("✅ Slash commands registered.");
    } catch (error) {
        console.error("❌ Error registering commands:", error);
    }
})();

// ✅ Track bumps from the bump bot
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    await bump.trackBump(message);
});

// ✅ Handle slash commands
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === "brank") {
        await bump.showLeaderboard(interaction);
    }
});

// ✅ Bot login
client.login(process.env.TOKEN).catch((err) => {
    console.error("❌ Failed to log in! Check TOKEN:", err);
});