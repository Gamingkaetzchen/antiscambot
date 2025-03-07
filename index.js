const { Client, GatewayIntentBits, PermissionsBitField, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

const bannedWordsFile = 'banned_words.json';
const bannedLinksFile = 'banned_links.json';
const hitFile = 'hit.json';
let bannedWords = JSON.parse(fs.readFileSync(bannedWordsFile, 'utf8'));
let bannedLinks = JSON.parse(fs.readFileSync(bannedLinksFile, 'utf8'));
let hitData = JSON.parse(fs.readFileSync(hitFile, 'utf8'));

const commands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Setup für den Bot')
        .addRoleOption(option => option.setName('roll').setDescription('Die gewünschte Rolle').setRequired(true)),
    new SlashCommandBuilder()
        .setName('addword')
        .setDescription('Fügt ein verbotenes Wort hinzu')
        .addStringOption(option => option.setName('word').setDescription('Das verbotene Wort').setRequired(true)), // Nur ein Wort
    new SlashCommandBuilder()
        .setName('addlink')
        .setDescription('Fügt einen verbotenen Link hinzu')
        .addStringOption(option => option.setName('link').setDescription('Der verbotene Link').setRequired(true)) // Nur ein Link
].map(command => command.toJSON());



const rest = new REST({ version: '10' }).setToken(config.botToken);
(async () => {
    try {
        console.log('Registriere Slash-Befehle...');
        await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
        console.log('Slash-Befehle erfolgreich registriert!');
    } catch (error) {
        console.error('Fehler beim Registrieren der Befehle:', error);
    }
})();

client.once('ready', () => {
    console.log(`Bot ist bereit! Eingeloggt als ${client.user.tag}`);
});


const { MessageEmbed } = require('discord.js');

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    let userId = message.author.id;
    let now = Date.now();

    // Überprüfe, ob ein verbotene Wort oder Link enthalten ist
    if (
        bannedWords.some(word => message.content.toLowerCase().includes(word)) ||
        bannedLinks.some(link => message.content.toLowerCase().includes(link))
    ) {
        message.delete(); // Lösche die Nachricht, wenn sie einen Verstoß enthält

        if (!hitData[userId]) {
            hitData[userId] = [];
        }

        // Füge den aktuellen Verstoß zu den Hits des Benutzers hinzu
        hitData[userId].push(now);
        hitData[userId] = hitData[userId].filter(time => now - time < 1800000); // Filtere Verstöße aus, die älter als 30 Minuten sind

        // Hole den Warnkanal aus der config
        const warnChannel = await client.channels.fetch(config.warnChannel);
        console.log('Warn Channel:', warnChannel); // Debugging: Überprüfe den Kanal

        // Überprüfe, ob der Kanal existiert
        if (!warnChannel) {
            console.error("Warn Channel konnte nicht abgerufen werden.");
            return;
        }

        // Erstelle das Embed für die Warnung
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('Warnung wegen Verstoß gegen die Regeln')
            .setDescription(`**Benutzer**: <@${userId}> \n**Verstoß**: Verwenden eines verbotenen Wortes oder Links.\n**Maßnahme**: Timeout für 1 Stunde.`)
            .addFields([{ name: 'Inhalt der Nachricht', value: message.content }])
            .setTimestamp()
            .setFooter({ text: 'AntiscamBot' });


        // Sende die Warnung als Embed im festgelegten Warnkanal
        warnChannel.send({ content: `<@${userId}> hat gegen die Regeln verstoßen!`, embeds: [embed] });

        // Füge den Benutzer für den ersten Verstoß in Timeout
        let member = await message.guild.members.fetch(userId);
        await member.timeout(3600000, 'Verstoß gegen die Regeln'); // Sperre für 1 Stunde

        // Speichere die Hit-Daten
        fs.writeFileSync(hitFile, JSON.stringify(hitData));
    }
});



client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, options, member } = interaction;

    // Für das Setup
    if (commandName === 'setup') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'Keine Berechtigung!', ephemeral: true });
        }

        let role = options.getRole('roll');
        return interaction.reply({ content: `Setup abgeschlossen für Rolle: ${role.name}`, ephemeral: true });
    }

    // Für das Hinzufügen eines verbotenen Wortes
    if (commandName === 'addword') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'Keine Berechtigung!', ephemeral: true });
        }

        let word = options.getString('word');
        console.log('Word:', word);  // Debugging-Ausgabe, um sicherzustellen, dass das Wort richtig übergeben wird
        if (word) {
            // Wandelt das Wort in Kleinbuchstaben um, bevor es zur Liste hinzugefügt wird
            bannedWords.push(word.toLowerCase());
            fs.writeFileSync(bannedWordsFile, JSON.stringify(bannedWords));
            return interaction.reply({ content: `Wort hinzugefügt: ${word}`, ephemeral: true });  // Private Antwort
        } else {
            return interaction.reply({ content: 'Kein Wort angegeben.', ephemeral: true });  // Private Antwort, falls kein Wort angegeben
        }
    }

    // Für das Hinzufügen eines verbotenen Links
    if (commandName === 'addlink') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'Keine Berechtigung!', ephemeral: true });
        }

        let link = options.getString('link');
        console.log('Link:', link);  // Debugging-Ausgabe, um sicherzustellen, dass der Link richtig übergeben wird
        if (link) {
            // Wandelt den Link in Kleinbuchstaben um, bevor er zur Liste hinzugefügt wird
            bannedLinks.push(link.toLowerCase());
            fs.writeFileSync(bannedLinksFile, JSON.stringify(bannedLinks));
            return interaction.reply({ content: `Link hinzugefügt: ${link}`, ephemeral: true });  // Private Antwort
        } else {
            return interaction.reply({ content: 'Kein Link angegeben.', ephemeral: true });  // Private Antwort, falls kein Link angegeben
        }
    }
});


client.login(config.botToken);