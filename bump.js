const { EmbedBuilder } = require("discord.js");
const { Pool } = require("pg");
const cron = require("node-cron");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    idleTimeoutMillis: 30000, // ✅ Auto-close idle connections
});

// ✅ In-memory bump cache (userid -> { username, count })
const bumpCache = new Map();

// ✅ Ensure bumps table exists
(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bumps (
                userid TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                count INTEGER NOT NULL DEFAULT 0
            );
        `);
        console.log("✅ Bumps table ensured.");
    } catch (err) {
        console.error("❌ Error creating bumps table:", err);
    }
})();

const BUMP_BOT_ID = "735147814878969968";
const BUMP_MESSAGE = "Thx for bumping our Server! We will remind you in 2 hours!";

// ✅ Function to track bump (cached, not immediate DB write)
module.exports.trackBump = async (message) => {
    if (message.author.id === BUMP_BOT_ID && message.content.startsWith(BUMP_MESSAGE)) {
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) return;

        const userId = mentionedUser.id;
        const username = mentionedUser.username;

        // Update in-memory cache
        if (bumpCache.has(userId)) {
            bumpCache.get(userId).count += 1;
        } else {
            bumpCache.set(userId, { username, count: 1 });
        }
    }
};

// ✅ Function to save cached bumps to DB at 22:30 IST daily
cron.schedule("00 13 * * *", async () => {
    console.log("⏳ Uploading bump data to database...");

    if (bumpCache.size === 0) {
        console.log("✅ No bump data to write.");
        return;
    }

    try {
        const client = await pool.connect();

        for (const [userId, data] of bumpCache.entries()) {
            const { username, count } = data;
            const result = await client.query(`SELECT * FROM bumps WHERE userid = $1`, [userId]);

            if (result.rows.length > 0) {
                await client.query(`UPDATE bumps SET count = count + $1 WHERE userid = $2`, [count, userId]);
            } else {
                await client.query(
                    `INSERT INTO bumps (userid, username, count) VALUES ($1, $2, $3)`,
                    [userId, username, count]
                );
            }
        }

        bumpCache.clear(); // ✅ Clear cache after writing
        client.release();
        console.log("✅ Bump data saved to database.");
    } catch (err) {
        console.error("❌ Error saving bump data to database:", err);
    }
}, { timezone: "Asia/Kolkata" }); // ✅ 22:30 IST

// ✅ Function to fetch and display bump leaderboard
module.exports.showLeaderboard = async (message) => {
    try {
        const client = await pool.connect();

        const leaderboardData = await client.query(`
            SELECT username, count
            FROM bumps
            ORDER BY count DESC
            LIMIT 10
        `);

        client.release();

        if (leaderboardData.rows.length === 0) {
            return message.channel.send("No bumps recorded yet.");
        }

        const topUser = leaderboardData.rows[0]; // Get the top-ranked user
        const cheerMessage = `🎉 **${topUser.username} is leading the bump race! Keep it up!** 🚀`;

        const leaderboardEmbed = new EmbedBuilder()
            .setTitle("DISBOARD BUMP LEADERBOARD")
            .setColor("#acf508")
            .setDescription(
                leaderboardData.rows
                    .map((row, index) => `**#${index + 1}** | **${row.username}** - **Bumps:** ${row.count}`)
                    .join("\n") + `\n\n${cheerMessage}\n\n**Keep bumping to rank up!**`
            );

        message.channel.send({ embeds: [leaderboardEmbed] });

    } catch (error) {
        console.error("❌ Error fetching bump leaderboard:", error);
        message.channel.send("An error occurred while retrieving the bump leaderboard.");
    }
};