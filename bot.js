require('dotenv').config();
    const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
    const Database = require('better-sqlite3');

    const TOKEN = process.env.BOT_TOKEN;
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

    // ──────────────── Render 포트 설정 ────────────────
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('✅ Discord Bot is running');
});

// Render가 지정하는 포트(환경변수 PORT)를 사용
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

    // DB 초기화
    const db = new Database('./balances.db');
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS stocks (
        name TEXT PRIMARY KEY,
        price INTEGER NOT NULL,
        trend TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock_portfolio (
        user_id TEXT,
        stock_name TEXT,
        amount INTEGER,
        PRIMARY KEY(user_id, stock_name)
    );
    `);

    // 초기 주식 데이터 삽입
    const insertStock = db.prepare('INSERT OR IGNORE INTO stocks(name, price, trend) VALUES (?, ?, ?)');
    const initialStocks = [
        { name: '도이치모터스', price: 1000, trend: 'normal' },
        { name: '삼성전자', price: 70000, trend: 'normal' },
        { name: '산맥부대', price: 3000, trend: 'down' },
        { name: '법무법인 홀더', price: 150000, trend: 'up' },
        { name: '주식회사 김건희', price: 5000, trend: 'normal' }
    ];
    initialStocks.forEach(s => insertStock.run(s.name, s.price, s.trend));

    // User balance helpers
    const ensureUser = db.prepare('INSERT OR IGNORE INTO users(id, balance) VALUES (?, 0)');
    const getBalance = db.prepare('SELECT balance FROM users WHERE id = ?');
    const changeBalance = db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?');
    function getOrZero(uid) {
        const row = getBalance.get(uid);
        return row ? row.balance : 0;
    }

    // Locks
    const locks = new Map();
    async function withLock(uid, fn) {
        while (locks.get(uid)) await new Promise(r => setTimeout(r, 10));
        locks.set(uid, true);
        try { return await fn(); } finally { locks.delete(uid); }
    }

    // 주식 업데이트 함수
    function updateStocks() {
        const stocks = db.prepare('SELECT * FROM stocks').all();
        const updateStock = db.prepare('UPDATE stocks SET price = ? WHERE name = ?');
        stocks.forEach(stock => {
            let change = Math.floor(Math.random() * 100) - 50; // -50~49 변동
            if (stock.trend === 'up') change = Math.abs(change); // 상승 추세
            if (stock.trend === 'down') change = -Math.abs(change); // 하락 추세
            let newPrice = Math.max(stock.price + change, 1);
            updateStock.run(newPrice, stock.name);
        });
    }

    // 주식 임베드 생성
    function getStockEmbed() {
        const stocks = db.prepare('SELECT * FROM stocks').all();
        const embed = new EmbedBuilder()
            .setTitle('📈 주식 시장 현황')
            .setColor(0x3498db)
            .setTimestamp();
        stocks.forEach(s => {
            embed.addFields({ name: s.name, value: `${s.price.toLocaleString()}원 (${s.trend})`, inline: true });
        });
        return embed;
    }

    // 메시지 기반 주식 업데이트
    let stockMessage = null;
    client.on('messageCreate', async message => {
        if (message.content === '!주식' && message.channel.id === '1436374743061237914') {
            if (!stockMessage) {
                stockMessage = await message.channel.send({ embeds: [getStockEmbed()] });
            }
        }
    });

    // 주식 1초마다 업데이트
    setInterval(async () => {
        updateStocks();
        if (stockMessage) {
            stockMessage.edit({ embeds: [getStockEmbed()] }).catch(console.error);
        }
    }, 1000);

    client.once('ready', () => {
        console.log(`✅ 로그인 완료: ${client.user.tag}`);
    });

    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;
        const uid = interaction.user.id;
        const username = interaction.user.username;

        if (interaction.commandName === '주식') {
        const stocks = db.prepare('SELECT * FROM stocks').all();
        if (!stocks.length) return interaction.reply({ content: '주식 데이터가 없습니다.', ephemeral: true });
        
        const embed = new EmbedBuilder()
            .setTitle('📈 주식 현황')
            .setColor(0x3498db)
            .setTimestamp();
        
        stocks.forEach(s => {
            embed.addFields({ name: s.name, value: `${s.price.toLocaleString()}원 (${s.trend})`, inline: true });
        });

        return interaction.reply({ embeds: [embed] });
    }

        // ──────────────── /압류 ────────────────
        if (interaction.commandName === '압류') {
            const allowedUserId = '1410269476011770059';
            if (uid !== allowedUserId) return interaction.reply({ content: '권한이 없습니다.', ephemeral: true });
            const target = interaction.options.getUser('대상');
            ensureUser.run(target.id);
            const bal = getOrZero(target.id);
            await withLock(target.id, async () => {
                changeBalance.run(-bal, target.id);
                changeBalance.run(bal, uid);
            });
            const embed = new EmbedBuilder()
                .setTitle(`${username} 님이 ${target.username}님의 자산을 압류했습니다!`)
                .addFields(
                    { name: '압류자', value: username, inline: true },
                    { name: '대상', value: target.username, inline: true },
                    { name: '압류 금액', value: `${bal.toLocaleString()}원`, inline: true }
                ).setColor(0xe74c3c)
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        // ──────────────── /주식구매 ────────────────
        if (interaction.commandName === '주식구매') {
            const stockName = interaction.options.getString('주식');
            const amount = interaction.options.getInteger('수량');
            ensureUser.run(uid);
            const bal = getOrZero(uid);
            const stock = db.prepare('SELECT * FROM stocks WHERE name = ?').get(stockName);
            if (!stock) return interaction.reply({ content: '해당 주식이 존재하지 않습니다.', ephemeral: true });
            const totalPrice = stock.price * amount;
            if (bal < totalPrice) return interaction.reply({ content: `잔액이 부족합니다. (${bal.toLocaleString()}원)`, ephemeral: true });
            await withLock(uid, async () => {
                changeBalance.run(-totalPrice, uid);
                const existing = db.prepare('SELECT * FROM stock_portfolio WHERE user_id = ? AND stock_name = ?').get(uid, stockName);
                if (existing) {
                    db.prepare('UPDATE stock_portfolio SET amount = amount + ? WHERE user_id = ? AND stock_name = ?').run(amount, uid, stockName);
                } else {
                    db.prepare('INSERT INTO stock_portfolio(user_id, stock_name, amount) VALUES (?, ?, ?)').run(uid, stockName, amount);
                }
            });
            return interaction.reply({ embeds: [new EmbedBuilder()
                .setTitle(`${username} 님이 ${stockName} 주식을 구매했습니다!`)
                .addFields(
                    { name: '주식', value: stockName, inline: true },
                    { name: '수량', value: `${amount}`, inline: true },
                    { name: '가격', value: `${stock.price.toLocaleString()}원`, inline: true }
                )
                .setColor(0x2ecc71)
                .setTimestamp()] });
        }

        // ──────────────── /주식판매 ────────────────
        if (interaction.commandName === '주식판매') {
            const stockName = interaction.options.getString('주식');
            const amount = interaction.options.getInteger('수량');
            const stock = db.prepare('SELECT * FROM stocks WHERE name = ?').get(stockName);
            if (!stock) return interaction.reply({ content: '해당 주식이 존재하지 않습니다.', ephemeral: true });
            const holding = db.prepare('SELECT * FROM stock_portfolio WHERE user_id = ? AND stock_name = ?').get(uid, stockName);
            if (!holding || holding.amount < amount) return interaction.reply({ content: '보유 수량이 부족합니다.', ephemeral: true });
            await withLock(uid, async () => {
                db.prepare('UPDATE stock_portfolio SET amount = amount - ? WHERE user_id = ? AND stock_name = ?').run(amount, uid, stockName);
                changeBalance.run(stock.price * amount, uid);
            });
            return interaction.reply({ embeds: [new EmbedBuilder()
                .setTitle(`${username} 님이 ${stockName} 주식을 판매했습니다!`)
                .addFields(
                    { name: '주식', value: stockName, inline: true },
                    { name: '수량', value: `${amount}`, inline: true },
                    { name: '가격', value: `${stock.price.toLocaleString()}원`, inline: true }
                )
                .setColor(0xe67e22)
                .setTimestamp()] });
        }

        // ──────────────── /도박 ────────────────
        if (interaction.commandName === '도박') {
            const amount = interaction.options.getInteger('금액');
            if (amount < 500) return interaction.reply({ content: '최소 배팅금액은 500원입니다.', ephemeral: true });
            ensureUser.run(uid);
            const bal = getOrZero(uid);
            if (bal < amount) return interaction.reply({ content: `잔액이 부족합니다. (${bal.toLocaleString()}원)`, ephemeral: true });
            await withLock(uid, async () => {
                changeBalance.run(-amount, uid);
                const win = Math.random() < 0.3;
                const payout = win ? Math.floor(amount * 0.3) : -amount;
                if (win) changeBalance.run(payout, uid);
                const newBal = getOrZero(uid);
                const embed = new EmbedBuilder()
                    .setColor(win ? 0x3498db : 0xe74c3c)
                    .setTitle(`${username} 님이 도이치모터스에 투자했습니다.`)
                    .addFields(
                        { name: '투자자', value: username, inline: true },
                        { name: '투자금액', value: `${amount.toLocaleString()}원`, inline: true },
                        { name: '결과', value: win ? `+${payout.toLocaleString()}원` : `-${amount.toLocaleString()}원`, inline: true },
                        { name: '잔액', value: `${newBal.toLocaleString()}원`, inline: true }
                    )
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            });
        }

        // ──────────────── /송금 ────────────────
        if (interaction.commandName === '송금') {
            const target = interaction.options.getUser('대상');
            const amount = interaction.options.getInteger('금액');
            if (target.id === uid) return interaction.reply('자기 자신에게 송금할 수 없습니다.');
            if (amount <= 0) return interaction.reply('금액은 1원 이상이어야 합니다.');
            ensureUser.run(uid);
            ensureUser.run(target.id);
            const senderBal = getOrZero(uid);
            if (senderBal < amount) return interaction.reply({ content: `잔액이 부족합니다. (${senderBal.toLocaleString()}원)`, ephemeral: true });
            await withLock(uid, async () => {
                changeBalance.run(-amount, uid);
                changeBalance.run(amount, target.id);
            });
            const senderNew = getOrZero(uid);
            const targetNew = getOrZero(target.id);
            const embed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle(`${username} 님이 ${target.username} 님께 ${amount.toLocaleString()}원을 송금했습니다.`)
                .addFields(
                    { name: '송금자', value: username, inline: true },
                    { name: '입금자', value: target.username, inline: true },
                    { name: '송금금액', value: `${amount.toLocaleString()}원`, inline: true },
                    { name: '입금자 총 잔액', value: `${targetNew.toLocaleString()}원`, inline: true },
                    { name: '송금자 총 잔액', value: `${senderNew.toLocaleString()}원`, inline: true }
                )
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        // ──────────────── /지급 ────────────────
    if (interaction.commandName === '지급') {
        const target = interaction.options.getUser('대상'); // 대상 유저
        const amount = interaction.options.getInteger('금액'); // 지급 금액
        if (amount <= 0) return interaction.reply({ content: '금액은 1원 이상이어야 합니다.', ephemeral: true });

        ensureUser.run(target.id); // 대상 유저 DB 초기화
        await withLock(target.id, async () => {
            changeBalance.run(amount, target.id);
        });

        const newBal = getOrZero(target.id);
        const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle(`${interaction.user.username} 님이 ${target.username} 님에게 ${amount.toLocaleString()}원을 지급했습니다!`)
            .addFields(
                { name: '지급자', value: interaction.user.username, inline: true },
                { name: '수령자', value: target.username, inline: true },
                { name: '지급 금액', value: `${amount.toLocaleString()}원`, inline: true },
                { name: '수령자 총 잔액', value: `${newBal.toLocaleString()}원`, inline: true }
            )
            .setTimestamp();
        
        return interaction.reply({ embeds: [embed] });
    }

// ──────────────── /보유주식 ────────────────
if (interaction.commandName === '보유주식') {
    const uid = interaction.user.id;
    ensureUser.run(uid); // DB에 사용자 존재 확인

    const portfolio = db.prepare('SELECT * FROM stock_portfolio WHERE user_id = ?').all(uid);

    if (!portfolio.some(p => p.amount > 0)) {
        return interaction.reply({ content: '보유한 주식이 없습니다.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle(`${interaction.user.username} 님의 보유 주식`)
        .setColor(0x3498db)
        .setTimestamp();

    portfolio.forEach(p => {
        if (p.amount > 0) { // 수량이 0보다 클 때만 표시
            const stock = db.prepare('SELECT * FROM stocks WHERE name = ?').get(p.stock_name);
            embed.addFields({
                name: p.stock_name,
                value: `수량: ${p.amount}\n현재 가격: ${stock.price.toLocaleString()}원\n총액: ${(stock.price * p.amount).toLocaleString()}원`,
                inline: false
            });
        }
    });

    return interaction.reply({ embeds: [embed] });
}

        // ──────────────── /잔액 ────────────────
        if (interaction.commandName === '잔액') {
            ensureUser.run(uid);
            const bal = getOrZero(uid);
            return interaction.reply({ content: `현재 잔액: ${bal.toLocaleString()}원`, ephemeral: true });
        }
    });

    client.login(TOKEN);
