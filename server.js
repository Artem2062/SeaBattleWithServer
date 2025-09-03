const express = require('express');
const { engine } = require('express-handlebars');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const WebSocket = require('ws');
const http = require('http');
const User = require('./models/User');
const Field = require('./models/Field');
const Game = require('./models/Game');
const app = express();
const server = http.createServer(app);
const port = 3000;
const MONGO_URI = 'mongodb://localhost:27017/seabattle';
const SESSION_SECRET = '1'; // CHANGE THIS TO A REAL, UNIQUE SECRET IN PRODUCTION!
const TURN_DURATION = 60; // seconds
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));
const sessionMiddleware = session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
});
app.use(sessionMiddleware);
app.engine('handlebars', engine({
    layoutsDir: path.join(__dirname, 'views', 'layouts'),
    defaultLayout: 'main',
    partialsDir: path.join(__dirname, 'views', 'partials'),
    helpers: {
    }
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
console.log('Serving static files from:', path.join(__dirname, 'public'));
app.use(express.static(path.join(__dirname, 'public')));
const requireLogin = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    } else {
        req.session.returnTo = req.originalUrl;
        res.redirect('/login');
    }
};
const redirectIfLoggedIn = (req, res, next) => {
    if (req.session && req.session.userId) {
        res.redirect('/fields');
    } else {
        next();
    }
};
app.get('/', redirectIfLoggedIn, (req, res) => {
    res.render('register', { title: 'Регистрация' });
});
app.get('/login', redirectIfLoggedIn, (req, res) => {
    res.render('login', { title: 'Вход' });
});
app.get('/fields', requireLogin, async (req, res) => {
    try {
        const fields = await Field.find({}).lean();
        const user = await User.findById(req.session.userId).lean();
        if (!user) {
            req.session.destroy(() => res.redirect('/login'));
            return;
        }
        console.log(user.status)
        res.render('fields', { title: 'Поля', fields: fields, nickname: user.nickname, status: user.status });
    } catch (error) {
        console.error('Error fetching fields:', error);
        res.status(500).send('Internal Server Error');
    }
});
app.get('/rules', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).lean();
        if (!user) {
            req.session.destroy(() => res.redirect('/login'));
            return;
        }
        res.render('rules', { title: 'Правила', nickname: user.nickname });
    } catch (error) {
        console.error('Error fetching user for rules:', error);
        res.status(500).send('Internal Server Error');
    }
});
app.get('/confirm/:fieldId', requireLogin, async (req, res) => {
    try {
        const field = await Field.findById(req.params.fieldId).lean();
        if (!field) {
            return res.status(404).send('Поле не найдено');
        }
        const user = await User.findById(req.session.userId).lean();
        if (!user) {
            req.session.destroy(() => res.redirect('/login'));
            return;
        }
        res.render('confirm', { title: 'Подтверждение', fieldId: field._id, fieldName: field.fieldName, nickname: user.nickname });
    } catch (error) {
        console.error('Error confirming field:', error);
        res.status(500).send('Internal Server Error');
    }
});
app.get('/create-field', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).lean();
        if (!user) {
            req.session.destroy(() => res.redirect('/login'));
            return;
        }
        res.render('create-field', { title: 'Создание', nickname: user.nickname });
    } catch (error) {
        console.error('Error rendering create field:', error);
        res.status(500).send('Internal Server Error');
    }
});
app.get('/game/:gameId', requireLogin, async (req, res) => {
    try {
        const game = await Game.findById(req.params.gameId).lean();
        if (!game) {
            return res.status(404).send('Игра не найдена');
        }
        if (game.player1.toString() !== req.session.userId && game.player2.toString() !== req.session.userId) {
            return res.status(403).send('Вы не участник этой игры');
        }
        const user = await User.findById(req.session.userId).lean();
        if (!user) {
            req.session.destroy(() => res.redirect('/login'));
            return;
        }
        const player1User = await User.findById(game.player1).lean();
        const player2User = game.player2 ? await User.findById(game.player2).lean() : null;
        const opponentNickname = game.player1.toString() === req.session.userId ? (player2User ? player2User.nickname : 'Ожидание...') : (player1User ? player1User.nickname : 'Ожидание...');
        res.render('game', {
            title: 'Бой',
            gameId: game._id,
            userId: req.session.userId,
            nickname: user.nickname,
            opponentNickname: opponentNickname,
            mineFieldRows: Array(10).fill(Array(10).fill(0)),
            enemyFieldRows: Array(10).fill(Array(10).fill(0)),
        });
    } catch (error) {
        console.error('Error rendering game page:', error);
        res.status(500).send('Internal Server Error');
    }
});
app.post('/api/register', async (req, res) => {
    console.log('Registration data:', req.body);
    const { nickname, login, password, passwordcheck } = req.body;

    // Валидация
    if (!nickname || !login || !password || !passwordcheck) {
        return res.status(400).json({ message: 'Все поля должны быть заполнены' });
    }

    if (login.includes(' ')) {
        return res.status(400).json({ message: 'Логин не должен содержать пробелов' });
    }
    if (nickname.includes(' ')) {
        return res.status(400).json({ message: 'Никнейм не должен содержать пробелов' });
    }
    if (password !== passwordcheck) {
        return res.status(400).json({ message: 'Пароли не совпадают' });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: 'Пароль должен содержать минимум 6 символов' });
    }

    try {
        const existingUser = await User.findOne({ login });
        if (existingUser) {
            return res.status(400).json({ message: 'Данный логин уже занят' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            nickname,
            login,
            password: hashedPassword,
            status: 'user',
        });
        await newUser.save();
        res.status(201).json({ message: 'Пользователь успешно зарегистрирован!' });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return res.status(400).json({ message: `Это ${field} уже используется.` });
        }
        console.error('Registration error:', err);
        res.status(500).json({ message: 'Ошибка сервера при регистрации' });
    }
});
app.post('/api/login', async (req, res) => {
    const { login, password } = req.body;
    if (!login || !password) {
        return res.status(400).json({ message: 'Введите логин и пароль' });
    }
    try {
        const user = await User.findOne({ login });
        if (!user) {
            return res.status(404).json({ message: 'Такого аккаунта не существует' });
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Неверный пароль' });
        }
        req.session.userId = user._id.toString();
        req.session.nickname = user.nickname;
        req.session.status = user.status;
        const returnTo = req.session.returnTo || '/fields';
        delete req.session.returnTo;
        res.status(200).json({
            message: 'Вы успешно вошли в аккаунт',
            redirectUrl: returnTo
        });
    } catch (error) {
        console.error('Error logging in user:', error);
        res.status(500).json({ message: 'Ошибка сервера при входе' });
    }
});
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).json({ message: 'Ошибка сервера при выходе' });
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Вы успешно вышли из аккаунта', redirectUrl: '/login' });
    });
});
app.get('/api/fields', async (req, res) => {
    try {
        const fields = await Field.find({}).lean();
        res.status(200).json(fields);
    } catch (error) {
        console.error('Error fetching fields:', error);
        res.status(500).json({ message: 'Ошибка сервера при получении полей' });
    }
});
app.post('/api/fields', requireLogin, async (req, res) => {
    const { fieldName } = req.body;
    const creatorId = req.session.userId;
    if (!fieldName) {
        return res.status(400).json({ message: 'Заполните поле' });
    }
    if (fieldName.length > 40) {
        return res.status(400).json({ message: 'Слишком длинное имя.' });
    }
    try {
        const newField = new Field({
            fieldName,
            creator: creatorId,
            player1: null,
            player2: null,
            players: 0,
        });
        await newField.save();
        res.status(201).json({ message: 'Поле успешно зарегистрировано!', fieldId: newField._id });
    } catch (error) {
        console.error('Error creating field:', error);
        res.status(500).json({ message: 'Ошибка сервера при создании поля' });
    }
});
app.delete('/api/fields/:fieldId', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).lean();
        if (!user || user.status !== 'admin') {
            return res.status(403).json({ message: 'Недостаточно прав' });
        }
        const fieldId = req.params.fieldId;
        const deletedField = await Field.findByIdAndDelete(fieldId);
        if (!deletedField) {
            return res.status(404).json({ message: 'Поле не найдено' });
        }
        await Game.deleteMany({ field: fieldId });
        res.status(200).json({ message: 'Поле успешно удалено!' });
    } catch (error) {
        console.error('Error deleting field:', error);
        res.status(500).json({ message: 'Ошибка сервера при удалении поля' });
    }
});
app.post('/api/fields/join/:fieldId', requireLogin, async (req, res) => {
    const fieldId = req.params.fieldId;
    const playerUserId = req.session.userId;
    try {
        const field = await Field.findById(fieldId);
        if (!field) {
            return res.status(404).json({ message: 'Поле не найдено' });
        }
        if (field.players === 2) {
            return res.status(409).json({ message: 'Поле уже занято' });
        }
        if ((field.player1 && field.player1.toString() === playerUserId) || (field.player2 && field.player2.toString() === playerUserId)) {
            return res.status(400).json({ message: 'Вы уже на этом поле' });
        }
        let gameId = null;
        if (field.players === 0) {
            field.player1 = playerUserId;
            field.players = 1;
            const newGame = new Game({
                field: field._id,
                player1: playerUserId,
                player2: null,
                player1Turn: Math.random() < 0.5,
                status: 'waiting',
                turnStartTime: null,
            });
            await newGame.save();
            gameId = newGame._id;
        } else if (field.players === 1) {
            const existingGame = await Game.findOne({ field: fieldId, status: 'waiting' });
            if (!existingGame) {
                console.error(`Error: Player ${playerUserId} joining field ${fieldId} with players=1 but no 'waiting' game found.`);
                return res.status(500).json({ message: 'Ошибка: Не найдена ожидающая игра для этого поля' });
            }
            field.player2 = playerUserId;
            field.players = 2;
            existingGame.player2 = playerUserId;
            existingGame.status = 'waiting_for_ships';
            await existingGame.save();
            gameId = existingGame._id;
            const gameIdString = existingGame._id.toString();
            const player1IdString = existingGame.player1.toString();
            const player1Ws = gameConnections.get(gameIdString)?.get(player1IdString);
            if (player1Ws && player1Ws.readyState === WebSocket.OPEN) {
                const player2User = await User.findById(playerUserId).lean();
                const opponentNickname = player2User ? player2User.nickname : 'Соперник';
                player1Ws.send(JSON.stringify({ type: 'OPPONENT_JOINED', message: `${opponentNickname} присоединился. Расставьте корабли!` }));
            }
        }
        await field.save();
        res.status(200).json({ message: 'Вы присоединились к полю', field, gameId });
    } catch (error) {
        console.error('Error joining field:', error);
        res.status(500).json({ message: 'Ошибка сервера при присоединении к полю' });
    }
});
const wss = new WebSocket.Server({ server });
const gameConnections = new Map();
const gameTimers = new Map();
wss.on('connection', (ws, req) => {
    sessionMiddleware(req, {}, async () => {
        if (!req.session || !req.session.userId) {
            console.log('WebSocket connection rejected: No active session');
            ws.terminate();
            return;
        }
        const userId = req.session.userId;
        console.log(`User ${userId} connected to WebSocket`);
        ws.userId = userId;
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                const { type, payload } = data;
                console.log(`Received WebSocket message from ${userId}:`, type, payload);
                switch (type) {
                    case 'JOIN_GAME':
                        const { gameId } = payload;
                        if (!gameId) {
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Некорректный ID игры' }));
                            return;
                        }
                        const gameIdString = gameId.toString();
                        const existingWs = gameConnections.get(gameIdString)?.get(userId);
                        if (existingWs && existingWs !== ws && existingWs.readyState === WebSocket.OPEN) {
                            console.log(`Closing older WebSocket connection for user ${userId} in game ${gameIdString}`);
                            existingWs.terminate();
                        }
                        const game = await Game.findById(gameId);
                        if (!game || (game.player1?.toString() !== userId && game.player2?.toString() !== userId)) {
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Игра не найдена или вы не участник' }));
                            ws.terminate(); // Close connection if not a valid participant
                            return;
                        }
                        if (!gameConnections.has(gameIdString)) {
                            gameConnections.set(gameIdString, new Map());
                        }
                        gameConnections.get(gameIdString).set(userId, ws);
                        console.log(`User ${userId} joined game ${gameIdString} WebSocket room`);
                        await sendInitialGameState(game, userId, ws);
                        if (game.status === 'in_progress') {
                            const isMyTurn = (game.player1.toString() === userId && game.player1Turn) || (game.player2.toString() === userId && !game.player1Turn);
                            if (game.turnStartTime && !gameTimers.has(gameIdString)) {
                                const elapsed = (new Date().getTime() - new Date(game.turnStartTime).getTime()) / 1000;
                                const remaining = Math.max(0, TURN_DURATION - elapsed);
                                if (remaining > 0) {
                                    const currentPlayerInGame = game.player1Turn ? game.player1.toString() : game.player2.toString();
                                    startTurnTimer(gameIdString, currentPlayerInGame, remaining);
                                } else {
                                    console.log(`User ${userId} reconnected to game ${gameIdString} with expired timer.`);
                                    handleTurnTimeout(gameIdString, game.player1Turn ? game.player1.toString() : game.player2.toString());
                                }
                            } else if (game.status === 'in_progress' && game.turnStartTime && gameTimers.has(gameIdString)) {
                                const elapsed = (new Date().getTime() - new Date(game.turnStartTime).getTime()) / 1000;
                                const remaining = Math.max(0, TURN_DURATION - elapsed);
                                if (remaining > 0) {
                                    ws.send(JSON.stringify({
                                        type: 'TURN_TIMER_START',
                                        startTime: game.turnStartTime,
                                        duration: TURN_DURATION
                                    }));
                                } else {
                                    ws.send(JSON.stringify({ type: 'TURN_TIMER_STOP' }));
                                }
                            }
                        }
                        break;
                    case 'SUBMIT_SHIPS':
                        const { gameId: submitGameId, ships } = payload;
                        if (!submitGameId) {
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Некорректный ID игры' }));
                            return;
                        }
                        const submitGameIdString = submitGameId.toString();
                        const gameToUpdate = await Game.findById(submitGameId);
                        if (!gameToUpdate || (gameToUpdate.player1?.toString() !== userId && gameToUpdate.player2?.toString() !== userId) || gameToUpdate.status !== 'waiting_for_ships') {
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Игра не найдена, вы не участник или неверный статус игры' }));
                            return;
                        }
                        const isValid = validateServerShipPlacement(ships);
                        if (!isValid) {
                            ws.send(JSON.stringify({ type: 'SHIP_PLACEMENT_ERROR', message: 'Неверная расстановка кораблей. Проверьте количество и расположение.' }));
                            return;
                        }
                        let playerSubmitted = false;
                        if (gameToUpdate.player1.toString() === userId) {
                            if (gameToUpdate.player1Ships) {
                                ws.send(JSON.stringify({ type: 'ERROR', message: 'Вы уже расставили корабли.' }));
                                return;
                            }
                            gameToUpdate.player1Ships = ships;
                            playerSubmitted = true;
                        } else if (gameToUpdate.player2.toString() === userId) {
                            if (gameToUpdate.player2Ships) {
                                ws.send(JSON.stringify({ type: 'ERROR', message: 'Вы уже расставили корабли.' }));
                                return;
                            }
                            gameToUpdate.player2Ships = ships;
                            playerSubmitted = true;
                        }
                        if (!playerSubmitted) {
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Ошибка при сохранении расстановки кораблей.' }));
                            return;
                        }
                        await gameToUpdate.save();
                        ws.send(JSON.stringify({ type: 'SHIPS_SUBMITTED', message: 'Расстановка кораблей принята. Ожидание соперника.' }));
                        if (gameToUpdate.player1Ships && gameToUpdate.player2Ships) {
                            gameToUpdate.status = 'in_progress';
                            gameToUpdate.turnStartTime = new Date();
                            await gameToUpdate.save();
                            broadcastToGame(submitGameIdString, { type: 'GAME_START', game: gameToUpdate });
                            const player1Ws = gameConnections.get(submitGameIdString)?.get(gameToUpdate.player1.toString());
                            const player2Ws = gameConnections.get(submitGameIdString)?.get(gameToUpdate.player2.toString());
                            if (player1Ws) await sendInitialGameState(gameToUpdate, gameToUpdate.player1.toString(), player1Ws);
                            if (player2Ws) await sendInitialGameState(gameToUpdate, gameToUpdate.player2.toString(), player2Ws);
                            const firstPlayerId = gameToUpdate.player1Turn ? gameToUpdate.player1.toString() : gameToUpdate.player2.toString();
                            startTurnTimer(submitGameIdString, firstPlayerId, TURN_DURATION);
                        }
                        break;
                    case 'MAKE_SHOT':
                        const { gameId: shotGameId, row: shotRow, col: shotCol } = payload;
                        const shotGameIdString = shotGameId.toString();
                        const gameForShot = await Game.findById(shotGameId);
                        if (!gameForShot || (gameForShot.player1?.toString() !== userId && gameForShot.player2?.toString() !== userId) || gameForShot.status !== 'in_progress') {
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Игра не найдена, вы не участник или игра не в процессе' }));
                            return;
                        }
                        const isPlayer1 = gameForShot.player1.toString() === userId;
                        const isPlayer2 = gameForShot.player2.toString() === userId;
                        if ((isPlayer1 && !gameForShot.player1Turn) || (isPlayer2 && gameForShot.player1Turn)) {
                            ws.send(JSON.stringify({ type: 'NOT_YOUR_TURN', message: 'Сейчас не ваш ход' }));
                            return;
                        }
                        const opponentShips = isPlayer1 ? gameForShot.player2Ships : gameForShot.player1Ships;
                        if (!opponentShips) {
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Корабли соперника еще не расставлены' }));
                            return;
                        }
                        if (opponentShips[shotRow][shotCol] === 2 || opponentShips[shotRow][shotCol] === 3 || opponentShips[shotRow][shotCol] === 4) {
                            ws.send(JSON.stringify({ type: 'INVALID_SHOT', message: 'Вы уже стреляли в эту клетку' }));
                            return;
                        }
                        stopTurnTimer(shotGameIdString);
                        let shotResult = 'miss';
                        if (opponentShips[shotRow][shotCol] === 1) {
                            opponentShips[shotRow][shotCol] = 2;
                            shotResult = 'hit';
                            const sunkBoat = checkServerBoatSunk(opponentShips, shotRow, shotCol);
                            if (sunkBoat) {
                                shotResult = 'sunk';
                                markSurroundingMissedAndSunk(opponentShips, sunkBoat);
                            }
                        } else if (opponentShips[shotRow][shotCol] === 0) {
                            opponentShips[shotRow][shotCol] = 3;
                        }
                        if (isPlayer1) {
                            gameForShot.player2Ships = opponentShips;
                        } else {
                            gameForShot.player1Ships = opponentShips;
                        }
                        const winnerId = checkServerWinCondition(gameForShot);
                        if (winnerId) {
                            gameForShot.status = 'finished';
                            gameForShot.winner = winnerId;
                            gameForShot.turnStartTime = null;
                            await gameForShot.save();
                            broadcastToGame(shotGameIdString, { type: 'GAME_OVER', winner: winnerId.toString() }); // Send winner ID as string
                            stopTurnTimer(shotGameIdString);
                            deleteGameAndFreeField(shotGameIdString);
                        } else {
                            if (shotResult === 'miss') {
                                gameForShot.player1Turn = !gameForShot.player1Turn;
                            }
                            gameForShot.turnStartTime = new Date();
                            await gameForShot.save();
                            const player1Ws = gameConnections.get(shotGameIdString)?.get(gameForShot.player1.toString());
                            const player2Ws = gameConnections.get(shotGameIdString)?.get(gameForShot.player2.toString());
                            if (player1Ws) await sendInitialGameState(gameForShot, gameForShot.player1.toString(), player1Ws, { shotResult, lastShot: { row: shotRow, col: shotCol } });
                            if (player2Ws) await sendInitialGameState(gameForShot, gameForShot.player2.toString(), player2Ws, { shotResult, lastShot: { row: shotRow, col: shotCol } });
                            if (gameForShot.status === 'in_progress') {
                                const nextPlayerId = gameForShot.player1Turn ? gameForShot.player1.toString() : gameForShot.player2.toString();
                                startTurnTimer(shotGameIdString, nextPlayerId, TURN_DURATION);
                            }
                        }
                        break;
                    case 'SURRENDER':
                        const { gameId: surrenderGameId } = payload;
                        const surrenderGameIdString = surrenderGameId.toString();
                        const gameToSurrender = await Game.findById(surrenderGameId);
                        if (!gameToSurrender || (gameToSurrender.player1?.toString() !== userId && gameToSurrender.player2?.toString() !== userId)) {
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Игра не найдена или вы не участник' }));
                            return;
                        }
                        if (gameToSurrender.status === 'finished' || gameToSurrender.status === 'abandoned') {
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Игра уже завершена или покинута' }));
                            return;
                        }
                        gameToSurrender.status = 'finished';
                        gameToSurrender.winner = gameToSurrender.player1?.toString() === userId ? gameToSurrender.player2 : gameToSurrender.player1;
                        gameToSurrender.turnStartTime = null;
                        await gameToSurrender.save();
                        broadcastToGame(surrenderGameIdString, { type: 'GAME_OVER', winner: gameToSurrender.winner.toString() });
                        stopTurnTimer(surrenderGameIdString);
                        deleteGameAndFreeField(surrenderGameIdString);
                        break;
                    case 'LEAVE_FIELD':
                        const { fieldId: leaveFieldId } = payload;
                        const leaveFieldIdString = leaveFieldId.toString();
                        try {
                            const fieldToLeave = await Field.findById(leaveFieldId);
                            if (fieldToLeave) {
                                if ((fieldToLeave.player1 && fieldToLeave.player1.toString() === userId) || (fieldToLeave.player2 && fieldToLeave.player2.toString() === userId)) {
                                    let fieldUpdated = false;
                                    if (fieldToLeave.player1 && fieldToLeave.player1.toString() === userId) {
                                        fieldToLeave.player1 = null;
                                        fieldToLeave.players = Math.max(0, fieldToLeave.players - 1);
                                        fieldUpdated = true;
                                    } else if (fieldToLeave.player2 && fieldToLeave.player2.toString() === userId) {
                                        fieldToLeave.player2 = null;
                                        fieldToLeave.players = Math.max(0, fieldToLeave.players - 1);
                                        fieldUpdated = true;
                                    }
                                    if (fieldUpdated) {
                                        await fieldToLeave.save();
                                    }
                                    if (fieldToLeave.players < 2) {
                                        const gameToAbandon = await Game.findOne({ field: leaveFieldId, status: { $in: ['waiting', 'waiting_for_ships', 'in_progress'] } });
                                        if (gameToAbandon) {
                                            gameToAbandon.status = 'abandoned';
                                            gameToAbandon.turnStartTime = null;
                                            await gameToAbandon.save();
                                            console.log(`Game ${gameToAbandon._id} abandoned due to player leaving field.`);
                                            const gameToAbandonIdString = gameToAbandon._id.toString();
                                            const otherPlayerId = gameToAbandon.player1?.toString() === userId ? gameToAbandon.player2?.toString() : gameToAbandon.player1?.toString();
                                            if (otherPlayerId) {
                                                const otherPlayerWs = gameConnections.get(gameToAbandonIdString)?.get(otherPlayerId);
                                                if (otherPlayerWs && otherPlayerWs.readyState === WebSocket.OPEN) {
                                                    otherPlayerWs.send(JSON.stringify({ type: 'OPPONENT_LEFT', message: 'Соперник покинул поле. Игра отменена.' }));
                                                }
                                            }
                                            stopTurnTimer(gameToAbandonIdString);
                                            deleteGameAndFreeField(gameToAbandonIdString);
                                        }
                                    }
                                    ws.send(JSON.stringify({ type: 'FIELD_LEFT', message: 'Вы покинули поле' }));
                                } else {
                                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Вы не находились на этом поле.' }));
                                }
                            } else {
                                ws.send(JSON.stringify({ type: 'ERROR', message: 'Поле не найдено.' }));
                            }
                        } catch (error) {
                            console.error('Error leaving field via WebSocket:', error);
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Ошибка при покидании поля' }));
                        }
                        break;
                    case 'CHAT_MESSAGE':
                        const { gameId: chatGameId, message: chatMessage } = payload;
                        const chatGameIdString = chatGameId.toString();
                        const gameForChat = await Game.findById(chatGameId).lean();
                        const gameIdStr = chatGameId.toString();
                        if (!gameForChat || (gameForChat.player1?.toString() !== userId && gameForChat.player2?.toString() !== userId)) {
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Нельзя отправить сообщение в эту игру' }));
                            return;
                        }
                        if (typeof chatMessage !== 'string' || chatMessage.trim().length === 0 || chatMessage.length > 200) {
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Недопустимое сообщение' }));
                            return;
                        }
                        const sender = await User.findById(userId).lean();
                        if (!sender) {
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Ошибка пользователя при отправке сообщения' }));
                            return;
                        }
                        broadcastToGame(gameIdStr, {
                            type: 'CHAT_MESSAGE',
                            sender: sender.nickname, // никнейм, который нужен
                            message: chatMessage,
                            payload: {
                                senderId: userId
                            }
                        });
                        break;
                    case 'REQUEST_GAME_STATE':
                        const { gameId: requestGameId } = payload;
                        const requestGameIdString = requestGameId.toString();
                        const gameToRequest = await Game.findById(requestGameId);
                        if (!gameToRequest || (gameToRequest.player1?.toString() !== userId && gameToRequest.player2?.toString() !== userId)) {
                            ws.send(JSON.stringify({ type: 'ERROR', message: 'Игра не найдена или вы не участник' }));
                            return;
                        }
                        await sendInitialGameState(gameToRequest, userId, ws);
                        console.log(`Sent game state to user ${userId} for game ${requestGameIdString}`);
                        break;
                    default:
                        console.log('Unknown message type:', type);
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'Неизвестный тип сообщения' }));
                }
            } catch (error) {
                console.error(`Error processing WebSocket message from user ${userId}:`, error);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Произошла ошибка при обработке вашего запроса.' }));
                }
            }
        });

        ws.on('close', (code, reason) => {
            console.log(`User ${userId} disconnected from WebSocket. Code: ${code}, Reason: ${reason}`);
            gameConnections.forEach((userConnections, gameIdString) => {
                if (userConnections.has(userId)) {
                    userConnections.delete(userId);
                    console.log(`User ${userId} removed from game ${gameIdString} connections map`);
                }
            });
        });

        ws.on('error', (error) => {
            console.error(`WebSocket error for user ${userId}:`, error);
        });
    });
});
function broadcastToGame(gameIdString, message) {
    const gameConns = gameConnections.get(gameIdString);
    if (gameConns) {
        gameConns.forEach((ws, userId) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                if (message.type === 'CHAT_MESSAGE') {
                    const isMine = ws.userId === message.payload.senderId;
                    ws.send(JSON.stringify({ ...message, isMine }));
                } else {
                    ws.send(JSON.stringify(message));
                }
            }
        });
    }
}
async function sendInitialGameState(game, userId, ws, additionalData = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    try {
        const player1User = await User.findById(game.player1).lean();
        const player2User = game.player2 ? await User.findById(game.player2).lean() : null;
        const currentUser = await User.findById(userId).lean();

        if (!currentUser) {
            console.error(`User ${userId} not found when sending game state for game ${game._id}`);
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Ошибка получения данных пользователя.' }));
            ws.terminate();
            return;
        }

        const opponentNickname = game.player1?.toString() === userId ? (player2User ? player2User.nickname : 'Ожидание...') : (player1User ? player1User.nickname : 'Ожидание...');

        const gameState = {
            status: game.status,
            isMyTurn: (game.player1?.toString() === userId && game.player1Turn) || (game.player2?.toString() === userId && !game.player1Turn),
            myShips: getPlayerShips(game, userId),
            opponentShips: revealOpponentBoard(game, userId),
            turnStartTime: game.turnStartTime ? game.turnStartTime.toISOString() : null,
            turnDuration: TURN_DURATION,
            myNickname: currentUser.nickname,
            opponentNickname: opponentNickname,
            winner: game.winner ? game.winner.toString() : null,
            ...additionalData
        };
        ws.send(JSON.stringify({ type: 'UPDATE_GAME_STATE', gameState }));
    } catch (error) {
        console.error(`Error sending initial game state to user ${userId} for game ${game._id}:`, error);
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Ошибка получения начального состояния игры.' }));
    }
}
function validateServerShipPlacement(board) {
    if (!Array.isArray(board) || board.length !== 10 || !board.every(row => Array.isArray(row) && row.length === 10 && row.every(cell => cell === 0 || cell === 1))) {
        return false;
    }
    const ships = { 4: 0, 3: 0, 2: 0, 1: 0 };
    const visited = Array(10).fill(0).map(() => Array(10).fill(false));
    const allDirections = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            if (board[i][j] === 1 && !visited[i][j]) {
                const currentShipSegments = [];
                const stack = [[i, j]];
                visited[i][j] = true;
                let isHorizontal = null;
                while (stack.length > 0) {
                    const [r, c] = stack.pop();
                    currentShipSegments.push([r, c]);
                    const shipDirections = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                    for (const [dr, dc] of shipDirections) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10 && board[nr][nc] === 1 && !visited[nr][nc]) {
                            visited[nr][nc] = true;
                            stack.push([nr, nc]);
                            if (currentShipSegments.length === 1) {
                                if (dr !== 0) isHorizontal = false;
                                if (dc !== 0) isHorizontal = true;
                            } else if (currentShipSegments.length > 1) {
                                if (isHorizontal === true && dr !== 0) return false;
                                if (isHorizontal === false && dc !== 0) return false;
                            }
                        }
                    }
                }
                const size = currentShipSegments.length;
                if (size < 1 || size > 4) return false;
                ships[size]++;
                for (const [sr, sc] of currentShipSegments) {
                    for (const [dr, dc] of allDirections) {
                        const nr = sr + dr;
                        const nc = sc + dc;
                        if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10 && board[nr][nc] === 1) {
                            let isPartOfCurrentShip = false;
                            for (const [csr, csc] of currentShipSegments) {
                                if (csr === nr && csc === nc) {
                                    isPartOfCurrentShip = true;
                                    break;
                                }
                            }
                            if (!isPartOfCurrentShip) {
                                return false;
                            }
                        }
                    }
                }
            }
        }
    }
    if (ships[4] !== 1 || ships[3] !== 2 || ships[2] !== 3 || ships[1] !== 4) {
        return false;
    }
    return true;
}
function checkServerBoatSunk(board, hitRow, hitCol) {
    if (board[hitRow][hitCol] !== 2) return null;
    const visited = Array(10).fill(0).map(() => Array(10).fill(false));
    const shipSegments = [];
    const stack = [[hitRow, hitCol]];
    visited[hitRow][hitCol] = true;
    let hasUnhitSegment = false;
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    while (stack.length > 0) {
        const [r, c] = stack.pop();
        shipSegments.push([r, c]);
        for (const [dr, dc] of directions) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10 && !visited[nr][nc]) {
                if (board[nr][nc] === 1) {
                    hasUnhitSegment = true;
                } else if (board[nr][nc] === 2) {
                    visited[nr][nc] = true;
                    stack.push([nr, nc]);
                }
            }
        }
    }
    if (!hasUnhitSegment) {
        if (shipSegments.length > 1) {
            const isHorizontal = shipSegments.every((coord, index, arr) => index === 0 || coord[0] === arr[0][0]);
            const isVertical = shipSegments.every((coord, index, arr) => index === 0 || coord[1] === arr[0][1]);
            if (!isHorizontal && !isVertical) {
                console.error("Discovered sunk segments do not form a straight line!");
                return null;
            }
        }
        return shipSegments;
    } else {
        return null;
    }
}
function markSurroundingMissedAndSunk(board, sunkBoatSegments) {
    for (const [r, c] of sunkBoatSegments) {
        board[r][c] = 4;
    }
    const allDirections = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];
    for (const [sr, sc] of sunkBoatSegments) {
        for (const [dr, dc] of allDirections) {
            const nr = sr + dr;
            const nc = sc + dc;
            if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10) {
                if (board[nr][nc] === 0) {
                    board[nr][nc] = 3;
                }
            }
        }
    }
}
function checkServerWinCondition(game) {
    const player1Ships = game.player1Ships;
    const player2Ships = game.player2Ships;
    let player1HasIntactShips = false;
    if (player1Ships) {
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
                if (player1Ships[i][j] === 1) {
                    player1HasIntactShips = true;
                    break;
                }
            }
            if (player1HasIntactShips) break;
        }
    }
    let player2HasIntactShips = false;
    if (player2Ships) {
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
                if (player2Ships[i][j] === 1) {
                    player2HasIntactShips = true;
                    break;
                }
            }
            if (player2HasIntactShips) break;
        }
    }
    if (!player2HasIntactShips) {
        return game.player1;
    }
    if (!player1HasIntactShips) {
        return game.player2;
    }
    return null;
}
function revealOpponentBoard(game, requestingUserId) {
    const opponentShips = game.player1?.toString() === requestingUserId ? game.player2Ships : game.player1Ships;
    if (!opponentShips) return Array(10).fill(Array(10).fill(0));
    const revealedBoard = Array(10).fill(0).map(() => Array(10).fill(0));
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            if (opponentShips[i][j] === 2 || opponentShips[i][j] === 3 || opponentShips[i][j] === 4) {
                revealedBoard[i][j] = opponentShips[i][j];
            } else {
                revealedBoard[i][j] = 0;
            }
        }
    }
    return revealedBoard;
}
function getPlayerShips(game, requestingUserId) {
    if (game.player1?.toString() === requestingUserId) {
        return game.player1Ships || Array(10).fill(0).map(() => Array(10).fill(0));
    } else if (game.player2?.toString() === requestingUserId) {
        return game.player2Ships || Array(10).fill(0).map(() => Array(10).fill(0));
    }
    return Array(10).fill(0).map(() => Array(10).fill(0));
}
async function handlePlayerDisconnect(gameIdString, disconnectedUserId) {
    try {
        const game = await Game.findById(gameIdString);
        if (game) {
            console.log(`User ${disconnectedUserId} disconnected from game ${gameIdString}. Game status: ${game.status}`);
            const gameConns = gameConnections.get(gameIdString);
            if (gameConns) {
                gameConns.delete(disconnectedUserId);
                console.log(`User ${disconnectedUserId} removed from game ${gameIdString} connections map`);
                if (gameConns.size === 0) {
                    console.log(`No players left connected to game ${gameIdString}.`);
                    if (game.status === 'in_progress' || game.status === 'waiting_for_ships') {
                        console.log(`Marking game ${gameIdString} as potentially abandoned due to no connections.`);
                        if (game.status === 'waiting_for_ships') {
                            game.status = 'abandoned';
                            game.turnStartTime = null;
                            await game.save();
                            console.log(`Game ${gameIdString} status set to abandoned.`);
                            stopTurnTimer(gameIdString);
                            deleteGameAndFreeField(gameIdString);
                        }
                    } else if (game.status === 'waiting') {
                        console.log(`Game ${gameIdString} (waiting) has no connections. Cleaning up.`);
                        const field = await Field.findById(game.field);
                        if (field) {
                            if (field.player1?.toString() === disconnectedUserId) {
                                field.player1 = null;
                                field.players = Math.max(0, field.players - 1);
                            } else if (field.player2?.toString() === disconnectedUserId) {
                                field.player2 = null;
                                field.players = Math.max(0, field.players - 1);
                            }
                            await field.save();
                            console.log(`Field ${field._id} updated after player disconnect.`);
                        }
                        game.status = 'abandoned';
                        game.turnStartTime = null;
                        await game.save();
                        console.log(`Game ${gameIdString} status set to abandoned.`);
                        stopTurnTimer(gameIdString);
                        deleteGameAndFreeField(gameIdString);
                    }
                } else {
                    const otherPlayerId = game.player1?.toString() === disconnectedUserId ? game.player2?.toString() : game.player1?.toString();
                    if (otherPlayerId) {
                        const otherPlayerWs = gameConns.get(otherPlayerId);
                        if (otherPlayerWs && otherPlayerWs.readyState === WebSocket.OPEN) {
                            if (game.status === 'in_progress') {
                                otherPlayerWs.send(JSON.stringify({ type: 'OPPONENT_DISCONNECTED', message: 'Соперник отключился. Ожидание переподключения или таймаута хода.' }));
                            } else if (game.status === 'waiting_for_ships') {
                                otherPlayerWs.send(JSON.stringify({ type: 'OPPONENT_LEFT', message: 'Соперник покинул игру. Игра отменена.' }));
                                game.status = 'abandoned';
                                game.turnStartTime = null;
                                await game.save();
                                stopTurnTimer(gameIdString);
                                deleteGameAndFreeField(gameIdString);
                            } else if (game.status === 'waiting') {
                                otherPlayerWs.send(JSON.stringify({ type: 'OPPONENT_LEFT', message: 'Соперник покинул поле. Ожидание другого игрока.' }));
                                game.status = 'abandoned';
                                game.turnStartTime = null;
                                await game.save();
                                stopTurnTimer(gameIdString);
                                deleteGameAndFreeField(gameIdString);
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error(`Error handling player disconnect for user ${disconnectedUserId} in game ${gameIdString}:`, error);
    }
}
function startTurnTimer(gameIdString, playerIdForThisTurn, duration) {
    stopTurnTimer(gameIdString);
    console.log(`Starting timer for game ${gameIdString}, player ${playerIdForThisTurn}. Duration: ${duration}s`);
    const timerId = setTimeout(async () => {
        console.log(`Turn timer timed out for game ${gameIdString}, player ${playerIdForThisTurn}`);
        await handleTurnTimeout(gameIdString, playerIdForThisTurn);
        gameTimers.delete(gameIdString);
    }, duration * 1000);
    gameTimers.set(gameIdString, timerId);
    const gameConns = gameConnections.get(gameIdString);
    if (gameConns) {
        gameConns.forEach(ws => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'TURN_TIMER_START',
                    startTime: new Date().toISOString(),
                    duration: TURN_DURATION
                }));
            }
        });
    }
}

function stopTurnTimer(gameIdString) {
    const timerId = gameTimers.get(gameIdString);
    if (timerId) {
        console.log(`Stopping timer for game ${gameIdString}`);
        clearTimeout(timerId);
        gameTimers.delete(gameIdString);
        const gameConns = gameConnections.get(gameIdString);
        if (gameConns) {
            gameConns.forEach(ws => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'TURN_TIMER_STOP' }));
                }
            });
        }
    }
}

async function handleTurnTimeout(gameIdString, timedOutPlayerId) {
    try {
        const game = await Game.findById(gameIdString);
        if (!game || game.status !== 'in_progress') {
            console.log(`Timeout occurred for game ${gameIdString}, but game is not in progress or not found.`);
            return;
        }
        const currentPlayerId = game.player1Turn ? game.player1.toString() : game.player2.toString();
        if (currentPlayerId !== timedOutPlayerId) {
            console.warn(`Timeout triggered for ${timedOutPlayerId}, but it's ${currentPlayerId}'s turn in game ${gameIdString}. Ignoring timeout.`);
            return;
        }
        console.log(`Handling timeout for player ${timedOutPlayerId} in game ${gameIdString}`);
        game.status = 'finished';
        game.winner = game.player1.toString() === timedOutPlayerId ? game.player2 : game.player1;
        game.turnStartTime = null;
        await game.save();
        broadcastToGame(gameIdString, { type: 'GAME_OVER', winner: game.winner.toString(), message: `Время хода игрока ${timedOutPlayerId === game.player1.toString() ? '1' : '2'} истекло. Игрок ${game.winner.toString() === game.player1.toString() ? '1' : '2'} победил!` });
        deleteGameAndFreeField(gameIdString);
    } catch (error) {
        console.error(`Error handling turn timeout for game ${gameIdString}:`, error);
    }
}
async function deleteGameAndFreeField(gameIdString) {
    try {
        const game = await Game.findById(gameIdString);
        if (game) {
            const fieldId = game.field;
            gameConnections.delete(gameIdString);
            console.log(`Game ${gameIdString} connections removed from map.`);
            stopTurnTimer(gameIdString);
            await Game.findByIdAndDelete(gameIdString);
            console.log(`Game ${gameIdString} document deleted.`);
            const field = await Field.findById(fieldId);
            if (field) {
                let fieldUpdated = false;
                if (field.player1?.toString() === game.player1?.toString() || field.player1?.toString() === game.player2?.toString()) {
                    field.player1 = null;
                    field.players = Math.max(0, field.players - 1);
                    fieldUpdated = true;
                }
                if (field.player2?.toString() === game.player1?.toString() || field.player2?.toString() === game.player2?.toString()) {
                    if (field.player2?.toString() !== field.player1?.toString()) {
                        field.player2 = null;
                        field.players = Math.max(0, field.players - 1);
                        fieldUpdated = true;
                    }
                }
                if (!field.player1 && !field.player2 && field.players !== 0) {
                    field.players = 0;
                    fieldUpdated = true;
                }
                if (fieldUpdated) {
                    await field.save();
                    console.log(`Field ${fieldId} slot freed.`);
                } else {
                    console.log(`Field ${fieldId} players already cleared or game players didn't match field players.`);
                }
            } else {
                console.warn(`Field ${fieldId} associated with game ${gameIdString} not found.`);
            }
        } else {
            console.warn(`Game ${gameIdString} not found for deletion/cleanup.`);
        }
    } catch (error) {
        console.error(`Error during game cleanup for game ${gameIdString}:`, error);
    }
}
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
