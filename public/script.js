// Внутри DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM полностью загружен и разобран');

    // Инициализация элементов UI
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');
    const createFieldForm = document.getElementById('createFieldForm');
    const logoutButton = document.getElementById('logoutButton');
    const fieldsListElement = document.getElementById('fieldsList');
    const createFieldButton = document.getElementById('createFieldButton');
    const rulesButton = document.getElementById('rulesButton');
    const fieldContainer = document.getElementById('fieldContainer');
    const mineFieldElement = document.getElementById('mineField');
    const enemyFieldElement = document.getElementById('enemyField');
    const gameInfoElement = document.getElementById('gameInfo');
    const shipPlacementArea = document.getElementById('shipPlacementArea');
    const submitShipsButton = document.getElementById('submitShips');
    const shipContainer = document.getElementById('shipContainer');
    const surrenderButton = document.getElementById('surrenderButton');
    const chatInput = document.getElementById('chatInput');
    const sendChatButton = document.getElementById('sendChatButton');
    const chatMessagesElement = document.getElementById('chatMessages');
    const turnTimerElement = document.getElementById('turnTimer');
    const opponentNicknameElement = document.getElementById('opponentNickname');
    const mineField = document.getElementById('mineField');
    const enemyField = document.getElementById('enemyField');

    // Создаем клетки полей
    if (mineField) createFieldCells(mineField);
    if (enemyField) createFieldCells(enemyField);

    // WebSocket и переменные
    let websocket = null;
    let currentGameId = null;
    let currentUserId = null;
    let currentNickname = null;
    let myShips = Array(10).fill(0).map(() => Array(10).fill(0));
    let enemyShipsRevealed = Array(10).fill(0).map(() => Array(10).fill(0));
    let isMyTurn = false;
    let gameState = 'loading';
    let turnTimerInterval = null;
    let turnStartTime = null;
    const TURN_DURATION = 60; // секунд
    let currentShipOrientation = 'horizontal';
    const rotateButton = document.getElementById('rotateShipButton');
    const orientationDisplay = document.getElementById('orientationDisplay');
    if (rotateButton && orientationDisplay) {
        rotateButton.addEventListener('click', () => {
            currentShipOrientation = currentShipOrientation === 'horizontal' ? 'vertical' : 'horizontal';
            orientationDisplay.textContent = currentShipOrientation === 'horizontal' ? 'Горизонтально' : 'Вертикально';
        });
    }

    // Расстановка кораблей
    const shipsToPlace = { 4: 1, 3: 2, 2: 3, 1: 4 };
    let placedShips = {};
    let currentSelectedShipSize = null;
    let currentSelectedShipElement = null;
    function resetShipPlacement() {
        myShips = Array(10).fill(0).map(() => Array(10).fill(0));
        createShipElements();
        if (mineField) createFieldCells(mineField);
        if (submitShipsButton) submitShipsButton.disabled = true;
    }

    function placeShip(row, col, size, orientation) {
        if (!canPlaceShip(row, col, size, orientation)) {
            alert('Невозможно разместить корабль в этой позиции.');
            return;
        }
        for (let i = 0; i < size; i++) {
            const r = orientation === 'horizontal' ? row : row + i;
            const c = orientation === 'horizontal' ? col + i : col;
            myShips[r][c] = 1;
            const cell = document.querySelector(`.fieldCell[data-row="${r}"][data-col="${c}"]`);
            if (cell) {
                cell.classList.add('cell-ship');
            }
        }
    }

    function createShipElements() {
        if (!shipContainer) return;
        shipContainer.innerHTML = '';
        for (const size in shipsToPlace) {
            for (let i = 0; i < shipsToPlace[size]; i++) {
                const shipDiv = document.createElement('div');
                shipDiv.className = 'ship';
                shipDiv.dataset.size = size;
                shipDiv.dataset.placed = 'false';
                shipDiv.dataset.orientation = 'horizontal';
                for (let j = 0; j < size; j++) {
                    const segment = document.createElement('div');
                    segment.className = 'ship-segment';
                    shipDiv.appendChild(segment);
                }
                shipDiv.addEventListener('click', () => {
                    if (shipDiv.dataset.placed === 'true') return;
                    if (currentSelectedShipElement) currentSelectedShipElement.classList.remove('selected');
                    shipDiv.classList.add('selected');
                    currentSelectedShipElement = shipDiv;
                    currentSelectedShipSize = parseInt(size);
                });
                shipContainer.appendChild(shipDiv);
            }
        }
        for (const size in shipsToPlace) {
            placedShips[size] = 0;
        }
    }
    createShipElements();

    function createFieldCells(fieldDiv) {
        fieldDiv.innerHTML = '';
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
                const cell = document.createElement('div');
                cell.className = 'fieldCell';
                cell.dataset.row = i;
                cell.dataset.col = j;
                cell.addEventListener('click', () => {
                    if (currentSelectedShipSize && currentSelectedShipElement && currentSelectedShipElement.dataset.placed !== 'true') {
                        placeShipOnBoard(i, j, currentSelectedShipSize, currentShipOrientation, currentSelectedShipElement);
                    }
                });
                fieldDiv.appendChild(cell);
            }
        }
    }

    if (mineField) createFieldCells(mineField);
    if (enemyField) createFieldCells(enemyField);

    function placeShipOnBoard(row, col, size, currentShipOrientation, shipElement) {
        if (!canPlaceShip(row, col, size, currentShipOrientation)) {
            alert('Невозможно разместить корабль здесь.');
            return;
        }
        for (let i = 0; i < size; i++) {
            const r = currentShipOrientation === 'horizontal' ? row : row + i;
            const c = currentShipOrientation === 'horizontal' ? col + i : col;
            myShips[r][c] = 1;
            const cell = mineField.querySelector(`.fieldCell[data-row="${r}"][data-col="${c}"]`);
            if (cell) cell.classList.add('cell-ship');
        }
        shipElement.dataset.placed = 'true';
        shipElement.style.opacity = '0.5';
        placedShips[currentSelectedShipSize]++;
        shipElement.classList.remove('selected');
        currentSelectedShipElement = null;
        currentSelectedShipSize = null;
        checkAllShipsPlaced();
    }

    function canPlaceShip(row, col, size, currentShipOrientation) {
        if (currentShipOrientation === 'horizontal') {
            if (col + size > 10) return false;
        } else {
            if (row + size > 10) return false;
        }
        for (let i = 0; i < size; i++) {
            const r = currentShipOrientation === 'horizontal' ? row : row + i;
            const c = currentShipOrientation === 'horizontal' ? col + i : col;
            if (myShips[r][c] !== 0) return false;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10) {
                        if (myShips[nr][nc] === 1 && !(nr >= row && nr < row + (currentShipOrientation === 'vertical' ? size : 1) && nc >= col && nc < col + (currentShipOrientation === 'horizontal' ? size : 1))) {
                            if (!(nr === r && nc === c)) return false;
                        }
                    }
                }
            }
        }
        return true;
    }

    function checkAllShipsPlaced() {
        let allPlaced = true;
        for (const s in shipsToPlace) {
            if (placedShips[s] !== shipsToPlace[s]) {
                allPlaced = false;
                break;
            }
        }
        if (submitShipsButton) submitShipsButton.disabled = !allPlaced;
    }

    const resetPlacementBtn = document.getElementById('resetPlacement');
    if (resetPlacementBtn) {
        resetPlacementBtn.addEventListener('click', () => {
            myShips = Array(10).fill(0).map(() => Array(10).fill(0));
            if (mineField) createFieldCells(mineField);
            createShipElements();
            if (submitShipsButton) submitShipsButton.disabled = true;
        });
    }

    if (submitShipsButton) {
        submitShipsButton.addEventListener('click', () => {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                websocket.send(JSON.stringify({
                    type: 'SUBMIT_SHIPS',
                    payload: {
                        gameId: currentGameId,
                        ships: myShips
                    }
                }));
                if (shipContainer) {
                    shipContainer.querySelectorAll('.ship').forEach(s => s.style.pointerEvents = 'none');
                }
                alert('Корабли отправлены!');
            }
        });
    }

    // --- WebSocket соединение ---
    function connectWebSocket() {
        const gameId = window.location.pathname.split('/').pop();
        currentGameId = gameId;
        currentUserId = document.body.dataset.userId;
        currentNickname = document.body.dataset.nickname;
        if (!gameId || !currentUserId) {
            console.error('Cannot connect WebSocket: missing gameId или userId');
            return;
        }
        const wsUrl = `ws://${window.location.host}`;
        websocket = new WebSocket(wsUrl);

        websocket.onopen = () => {
            console.log('WebSocket открыт');
            websocket.send(JSON.stringify({ type: 'JOIN_GAME', payload: { gameId: currentGameId } }));
        };

        websocket.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            console.log('Сообщение WebSocket:', data);
            switch (data.type) {
                case 'UPDATE_GAME_STATE':
                    handleGameStateUpdate(data.gameState);
                    break;
                case 'OPPONENT_JOINED':
                    addChatMessage(data.message, 'info');
                    websocket.send(JSON.stringify({ type: 'REQUEST_GAME_STATE', payload: { gameId: currentGameId } }));
                    break;
                case 'SHIPS_SUBMITTED':
                    addChatMessage(data.message, 'info');
                    websocket.send(JSON.stringify({ type: 'REQUEST_GAME_STATE', payload: { gameId: currentGameId } }));
                    break;
                case 'SHIP_PLACEMENT_ERROR':
                    addChatMessage(data.message, 'error');
                    break;
                case 'GAME_START':
                    addChatMessage('Игра началась! Ваш ход?', 'success');
                    websocket.send(JSON.stringify({ type: 'REQUEST_GAME_STATE', payload: { gameId: currentGameId } }));
                    break;
                case 'SHOT_RESULT':
                    // Этот тип устарел, можно игнорировать или оставить
                    console.warn('Получено устаревшее сообщение SHOT_RESULT. Обновление через UPDATE_GAME_STATE.');
                    break;
                case 'NOT_YOUR_TURN':
                    addChatMessage(data.message, 'warning');
                    break;
                case 'INVALID_SHOT':
                    addChatMessage(data.message, 'warning');
                    break;
                case 'GAME_OVER':
                    handleGameOver(data.winner);
                    break;
                case 'OPPONENT_LEFT':
                    addChatMessage(data.message, 'info');
                    handleGameOver(null, data.message);
                    break;
                case 'OPPONENT_DISCONNECTED':
                    addChatMessage(data.message, 'warning');
                    break;
                case 'CHAT_MESSAGE':
                    addChatMessage(data.sender, data.message, data.isMine);
                    break;
                case 'TURN_TIMER_START':
                    startClientTimer(data.startTime, data.duration);
                    break;
                case 'TURN_TIMER_STOP':
                    stopClientTimer();
                    break;
                case 'ERROR':
                    addChatMessage(`Ошибка: ${data.message}`, 'error');
                    break;
                default:
                    console.warn('Неизвестный тип сообщения:', data.type);
            }
        };

        websocket.onerror = (error) => {
            console.error('Ошибка WebSocket:', error);
            addChatMessage('Ошибка соединения с сервером.', 'error');
        };

        websocket.onclose = (event) => {
            console.log('WebSocket закрыт:', event.code, event.reason);
            if (gameState !== 'finished' && gameState !== 'abandoned') {
                addChatMessage('Соединение прервано. Обновите страницу.', 'error');
                stopClientTimer();
            }
            websocket = null;
        };
    }

    // --- Обработка сообщений в UI ---
    function handleGameStateUpdate(state) {
        gameState = state.status;
        isMyTurn = state.isMyTurn;
        myShips = state.myShips;
        enemyShipsRevealed = state.opponentShips;
        turnStartTime = state.turnStartTime ? new Date(state.turnStartTime) : null;
        const opponentNickname = state.opponentNickname || 'Ожидание...';

        if (opponentNicknameElement) {
            opponentNicknameElement.textContent = opponentNickname;
        }
        updateGameUI();
        updateMineFieldDisplay();
        updateEnemyFieldDisplay();

        if (gameState === 'in_progress' && turnStartTime) {
            startClientTimer(turnStartTime.toISOString(), state.turnDuration);
        } else {
            stopClientTimer();
        }

        // Отображение последнего выстрела и результата
        if (state.shotResult && state.lastShot) {
            const { shotResult, lastShot } = state;
            const message = isMyTurn
                ? `Соперник выстрелил в (${lastShot.row + 1}, ${lastShot.col + 1}) и это ${shotResult === 'hit' ? 'попадание!' : shotResult === 'sunk' ? 'потопил мой корабль!' : 'промах.'}`
                : `Вы выстрелили в (${lastShot.row + 1}, ${lastShot.col + 1}) и это ${shotResult === 'hit' ? 'попадание!' : shotResult === 'sunk' ? 'потопил корабль!' : 'промах.'}`;
            addChatMessage(message, shotResult === 'miss' ? 'info' : 'warning');
        }
    }

    function updateGameUI() {
        if (!gameInfoElement || !shipPlacementArea || !fieldContainer || !submitShipsButton || !surrenderButton) return;

        let statusMessage = '';
        let showPlacement = false;
        let showFields = true;

        switch (gameState) {
            case 'loading':
                statusMessage = 'Загрузка игры...';
                showFields = false;
                break;
            case 'waiting':
                statusMessage = 'Ожидание второго игрока...';
                showPlacement = false;
                if (surrenderButton) surrenderButton.style.display = 'none';
                break;
            case 'waiting_for_ships':
                statusMessage = 'Оба игрока готовы. Расставьте корабли!';
                showPlacement = true;
                if (submitShipsButton) submitShipsButton.style.display = 'block';
                if (surrenderButton) surrenderButton.style.display = 'block';
                resetShipPlacement();
                break;
            case 'in_progress':
                statusMessage = isMyTurn ? 'Ваш ход!' : 'Ход соперника.';
                showPlacement = false;
                if (submitShipsButton) submitShipsButton.style.display = 'none';
                if (surrenderButton) surrenderButton.style.display = 'block';
                break;
            case 'finished':
                statusMessage = 'Игра завершена.';
                showPlacement = false;
                if (submitShipsButton) submitShipsButton.style.display = 'none';
                if (surrenderButton) surrenderButton.style.display = 'none';
                break;
            case 'abandoned':
                statusMessage = 'Игра отменена.';
                showPlacement = false;
                if (submitShipsButton) submitShipsButton.style.display = 'none';
                if (surrenderButton) surrenderButton.style.display = 'none';
                break;
        }

        if (gameInfoElement) {
            gameInfoElement.textContent = statusMessage;
        }
        if (shipPlacementArea) {
            shipPlacementArea.style.display = showPlacement ? 'flex' : 'none';
        }
        if (fieldContainer) {
            fieldContainer.style.display = showFields ? 'flex' : 'none';
        }
        if (gameState !== 'waiting_for_ships') {
            if (submitShipsButton) submitShipsButton.style.display = 'none';
        }
    }

    function updateMineFieldDisplay() {
        if (!mineField) return;
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
                const cell = mineField.querySelector(`.fieldCell[data-row="${i}"][data-col="${j}"]`);
                if (cell) {
                    cell.className = 'fieldCell'; // сброс классов
                    const stateCell = myShips[i][j];
                    if (stateCell === 1) {
                        cell.classList.add('cell-ship');
                    } else if (stateCell === 2) {
                        cell.classList.add('cell-ship', 'cell-hit');
                    } else if (stateCell === 3) {
                        cell.classList.add('cell-miss');
                    } else if (stateCell === 4) {
                        cell.classList.add('cell-ship', 'cell-sunk');
                    }
                }
            }
        }
    }

    function updateEnemyFieldDisplay() {
        if (!enemyField) return;
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
                const cell = enemyField.querySelector(`.fieldCell[data-row="${i}"][data-col="${j}"]`);
                if (cell) {
                    cell.className = 'fieldCell';
                    const stateCell = enemyShipsRevealed[i][j];
                    if (stateCell === 2) {
                        cell.classList.add('cell-hit');
                    } else if (stateCell === 3) {
                        cell.classList.add('cell-miss');
                    } else if (stateCell === 4) {
                        cell.classList.add('cell-sunk');
                    } else {
                        cell.classList.add('cell-unrevealed');
                    }
                    cell.onclick = null;
                    if (gameState === 'in_progress' && isMyTurn && stateCell === 0) {
                        cell.onclick = () => handleCellClick(i, j);
                        cell.style.cursor = 'pointer';
                    } else {
                        cell.style.cursor = 'default';
                    }
                }
            }
        }
    }

    function handleCellClick(row, col) {
        if (websocket && websocket.readyState === WebSocket.OPEN && currentGameId && gameState === 'in_progress' && isMyTurn) {
            websocket.send(JSON.stringify({ type: 'MAKE_SHOT', payload: { gameId: currentGameId, row, col } }));
        } else {
            addChatMessage('Невозможно сделать ход в текущий момент.', 'warning');
        }
    }

    function handleGameOver(winnerId, message) {
        gameState = 'finished';
        stopClientTimer();
        let gameOverMsg = message || 'Игра завершена.';
        if (winnerId) {
            if (winnerId.toString() === currentUserId) {
                gameOverMsg = 'Поздравляем! Вы победили!';
                alert('Поздравляем! Вы победили!');
            } else {
                gameOverMsg = `Вы проиграли. Победитель: ${opponentNicknameElement ? opponentNicknameElement.textContent : 'Соперник'}`;
                alert(`Вы проиграли. Победитель: ${opponentNicknameElement ? opponentNicknameElement.textContent : 'Соперник'}`);
            }
        } else {
            gameOverMsg = 'Игра завершилась неожиданно.';
            alert('Игра завершилась неожиданно.');
        }
        addChatMessage(gameOverMsg, winnerId && winnerId.toString() === currentUserId ? 'success' : 'info');
        window.location.href = '/fields';

        if (enemyField) {
            enemyField.querySelectorAll('.fieldCell').forEach(cell => {
                cell.onclick = null;
                cell.style.cursor = 'default';
            });
        }
        if (submitShipsButton) submitShipsButton.style.display = 'none';
        if (surrenderButton) surrenderButton.style.display = 'none';
        if (shipPlacementArea) shipPlacementArea.style.display = 'none';

        if (gameInfoElement) {
            const returnLink = document.createElement('a');
            returnLink.href = '/fields';
            returnLink.textContent = 'Вернуться к списку полей';
            returnLink.className = 'button';
            gameInfoElement.innerHTML = '';
            const finalMsg = document.createElement('span');
            finalMsg.textContent = gameOverMsg;
            gameInfoElement.appendChild(finalMsg);
            gameInfoElement.appendChild(document.createElement('br'));
            gameInfoElement.appendChild(returnLink);
        }
    }

    function startClientTimer(startTimeISO, duration) {
        stopClientTimer();
        const start = new Date(startTimeISO).getTime();
        const end = start + duration * 1000;

        function updateTimer() {
            const now = new Date().getTime();
            const remaining = Math.max(0, end - now);
            if (remaining <= 0) {
                if (turnTimerElement) turnTimerElement.textContent = '00:00';
                stopClientTimer();
                if (gameState === 'in_progress' && isMyTurn) {
                    addChatMessage('Время хода вышло!', 'warning');
                }
                return;
            }
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
            const mStr = String(minutes).padStart(2, '0');
            const sStr = String(seconds).padStart(2, '0');
            if (turnTimerElement) {
                turnTimerElement.textContent = `${mStr}:${sStr}`;
                if (remaining < 10000 && !turnTimerElement.classList.contains('warning')) {
                    turnTimerElement.classList.add('warning');
                } else if (remaining >= 10000) {
                    turnTimerElement.classList.remove('warning');
                }
            }
        }

        updateTimer();
        turnTimerInterval = setInterval(updateTimer, 1000);
    }

    function stopClientTimer() {
        if (turnTimerInterval) {
            clearInterval(turnTimerInterval);
            turnTimerInterval = null;
            if (turnTimerElement) {
                turnTimerElement.textContent = '--:--';
                turnTimerElement.classList.remove('warning');
            }
        }
    }

    // Функция отображения сообщений
    function addChatMessage(sender, message, isMine = false) {
        if (!chatMessagesElement) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message' + (isMine ? ' my-message' : ' opponent-message');
        const senderSpan = document.createElement('span');
        senderSpan.className = 'sender';
        senderSpan.textContent = `${sender}: `;
        const textSpan = document.createElement('span');
        textSpan.className = 'text';
        textSpan.textContent = message;
        msgDiv.appendChild(senderSpan);
        msgDiv.appendChild(textSpan);
        chatMessagesElement.appendChild(msgDiv);
        chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
    }

    // Отправка сообщений чата
    if (sendChatButton && chatInput) {
        sendChatButton.addEventListener('click', () => {
            const msg = chatInput.value.trim();
            if (msg && websocket && websocket.readyState === WebSocket.OPEN && currentGameId) {
                websocket.send(JSON.stringify({ type: 'CHAT_MESSAGE', payload: { gameId: currentGameId, message: msg, senderId: currentUserId } }));
                chatInput.value = '';
            }
        });
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendChatButton.click();
            }
        });
    }

    // Регистрация
    if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(registerForm).entries());

        // Проверка длины логина перед отправкой
        if (data.login && data.login.length < 3) {
            alert('Логин должен содержать минимум 3 символа');
            return; // прерываем выполнение, чтобы не отправлять запрос
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();

            // Выводим alert с сообщением
            alert(result.message);

            addChatMessage(result.message, response.ok ? 'success' : 'error');

            if (response.ok) {
                setTimeout(() => { window.location.href = '/login'; }, 2000);
            }
        } catch (err) {
            console.error('Ошибка регистрации:', err);
            addChatMessage('Ошибка сети или сервера при регистрации.', 'error');
        }
    });
}

    // Вход
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(loginForm).entries());
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await response.json();

                if (response.ok) {
                    // Успешный вход
                    alert(result.message);
                    if (result.redirectUrl) {
                        window.location.href = result.redirectUrl;
                    }
                } else {
                    // Ошибка
                    alert(result.message);
                }
            } catch (err) {
                console.error('Ошибка входа:', err);
                alert('Ошибка сети или сервера при входе.');
            }
        });
    }

    // Выход
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                const response = await fetch('/api/logout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const result = await response.json();
                addChatMessage(result.message, response.ok ? 'success' : 'error');
                if (response.ok && result.redirectUrl) {
                    if (websocket && websocket.readyState === WebSocket.OPEN) {
                        websocket.close(1000, 'Logout');
                    }
                    window.location.href = result.redirectUrl;
                }
            } catch (err) {
                console.error('Ошибка выхода:', err);
                addChatMessage('Ошибка сети или сервера при выходе.', 'error');
            }
        });
    }

    // Работа с полями
    if (fieldsListElement) {
        async function fetchAndDisplayFields() {
            try {
                const response = await fetch('/api/fields');
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const fields = await response.json();
                fieldsListElement.innerHTML = '';

                if (fields.length === 0) {
                    fieldsListElement.innerHTML = '<p>Пока нет доступных полей.</p>';
                    return;
                }

                fields.forEach(field => {
                    const div = document.createElement('div');
                    div.className = 'field-item';
                    div.dataset.fieldId = field._id;

                    const spanName = document.createElement('span');
                    spanName.textContent = `Название поля: ${field.fieldName}`;

                    const spanPlayers = document.createElement('span');
                    spanPlayers.className = 'players-count';
                    spanPlayers.textContent = `Игроков: ${field.players}/2`;

                    const joinLink = document.createElement('a');
                    joinLink.href = `/confirm/${field._id}`;
                    joinLink.textContent = 'Присоединиться';
                    joinLink.className = 'button small';

                    if (field.players >= 2) {
                        joinLink.classList.add('disabled');
                        joinLink.onclick = (e) => e.preventDefault();
                    }

                    div.appendChild(spanName);
                    div.appendChild(spanPlayers);
                    div.appendChild(joinLink);

                    const userStatus = document.body.dataset.userStatus;
                    if (userStatus === 'admin') {
                        const deleteBtn = document.createElement('button');
                        deleteBtn.textContent = 'Удалить';
                        deleteBtn.className = 'button small delete';
                        deleteBtn.dataset.fieldId = field._id;
                        div.appendChild(deleteBtn);
                    }

                    fieldsListElement.appendChild(div);
                });
            } catch (err) {
                console.error('Ошибка получения полей:', err);
                fieldsListElement.innerHTML = '<p>Не удалось загрузить список полей.</p>';
            }
        }
        if (window.location.pathname === '/fields') {
            fetchAndDisplayFields();
        }

        // Удаление поля
        fieldsListElement.addEventListener('click', async (e) => {
            if (e.target.classList.contains('delete')) {
                const fieldId = e.target.dataset.fieldId;
                if (confirm('Вы уверены, что хотите удалить это поле?')) {
                    try {
                        const response = await fetch(`/api/fields/${fieldId}`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        const result = await response.json();
                        addChatMessage(result.message, response.ok ? 'success' : 'error');
                        if (response.ok) {
                            e.target.closest('.field-item').remove();
                        }
                    } catch (err) {
                        console.error('Ошибка удаления поля:', err);
                        addChatMessage('Ошибка сервера при удалении.', 'error');
                    }
                }
            }
        });
    }

    // Создание нового поля
    if (createFieldForm) {
        createFieldForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(createFieldForm).entries());
            try {
                const response = await fetch('/api/fields', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                addChatMessage(result.message, response.ok ? 'success' : 'error');
                if (response.ok) {
                    setTimeout(() => { window.location.href = '/fields'; }, 2000);
                }
            } catch (err) {
                console.error('Ошибка создания поля:', err);
                addChatMessage('Ошибка сети или сервера при создании поля.', 'error');
            }
        });
    }

    // Присоединение к полю
    const confirmJoinButton = document.getElementById('confirmJoinButton');
    const cancelJoinButton = document.getElementById('cancelJoinButton');
    const confirmFieldIdElement = document.getElementById('confirmFieldId');

    if (confirmJoinButton && cancelJoinButton && confirmFieldIdElement) {
        const fieldId = confirmFieldIdElement.value;
        confirmJoinButton.addEventListener('click', async () => {
            try {
                const response = await fetch(`/api/fields/join/${fieldId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const result = await response.json();
                addChatMessage(result.message, response.ok ? 'success' : 'error');
                if (response.ok && result.gameId) {
                    window.location.href = `/game/${result.gameId}`;
                } else if (response.status === 409) {
                    addChatMessage(result.message, 'warning');
                    setTimeout(() => { window.location.href = '/fields'; }, 2000);
                } else {
                    addChatMessage(result.message || 'Не удалось присоединиться.', 'error');
                }
            } catch (err) {
                console.error('Ошибка присоединения:', err);
                addChatMessage('Ошибка сети или сервера.', 'error');
            }
        });
        cancelJoinButton.addEventListener('click', () => {
            if (websocket && websocket.readyState === WebSocket.OPEN && fieldId) {
                websocket.send(JSON.stringify({ type: 'LEAVE_FIELD', payload: { fieldId } }));
            }
            window.location.href = '/fields';
        });
    }

    // Игра (страница /game/...)
    if (window.location.pathname.startsWith('/game/')) {
        connectWebSocket();

        // Отправка кораблей
        if (submitShipsButton) {
            submitShipsButton.addEventListener('click', () => {
                if (validateClientShipPlacement(myShips)) {
                    websocket.send(JSON.stringify({ type: 'SUBMIT_SHIPS', payload: { ships: myShips } }));
                    submitShipsButton.disabled = true;
                    if (shipPlacementArea) shipPlacementArea.style.display = 'none';
                } else {
                    alert('Некорректная расстановка кораблей.');
                }
            });
        }

        // Сдаться
        if (surrenderButton) {
            surrenderButton.addEventListener('click', () => {
                if (confirm('Вы уверены, что хотите сдаться?')) {
                    websocket.send(JSON.stringify({ type: 'SURRENDER', payload: { gameId: currentGameId } }));
                }
            });
        }

        // Перед уходом со страницы
        window.addEventListener('beforeunload', () => {
            if (websocket && websocket.readyState === WebSocket.OPEN && currentGameId && (gameState === 'in_progress' || gameState === 'waiting_for_ships')) {
                // Тут можно отправить сообщение о выходе
                // websocket.close(1001, 'Выход со страницы игры');
            } else if (websocket && websocket.readyState === WebSocket.OPEN) {
                websocket.close(1000, 'Выход со страницы');
            }
        });
    }

    // Общая функция для сообщений в UI
    function addChatMessage(sender, message, isMine = false) {
        const messageArea = document.getElementById('chatMessages');
        if (!messageArea) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message' + (isMine ? ' my-message' : ' opponent-message');

        const senderSpan = document.createElement('span');
        senderSpan.className = 'sender';
        senderSpan.textContent = `${sender}: `;

        const textSpan = document.createElement('span');
        textSpan.className = 'text';
        textSpan.textContent = message;

        msgDiv.appendChild(senderSpan);
        msgDiv.appendChild(textSpan);

        messageArea.appendChild(msgDiv);
        messageArea.scrollTop = messageArea.scrollHeight;
    }

    // Валидация расстановки кораблей на клиенте
    function validateClientShipPlacement(board) {
        if (!Array.isArray(board) || board.length !== 10 || !board.every(row => Array.isArray(row) && row.length === 10 && row.every(cell => cell === 0 || cell === 1))) return false;
        const shipsCount = { 4: 0, 3: 0, 2: 0, 1: 0 };
        const visited = Array(10).fill(0).map(() => Array(10).fill(false));
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
                if (board[i][j] === 1 && !visited[i][j]) {
                    const segments = [];
                    const stack = [[i, j]];
                    visited[i][j] = true;
                    let isHorizontal = null;
                    while (stack.length > 0) {
                        const [r, c] = stack.pop();
                        segments.push([r, c]);
                        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                        for (const [dr, dc] of directions) {
                            const nr = r + dr;
                            const nc = c + dc;
                            if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10 && board[nr][nc] === 1 && !visited[nr][nc]) {
                                visited[nr][nc] = true;
                                stack.push([nr, nc]);
                                if (segments.length === 1) {
                                    if (dr !== 0) isHorizontal = false;
                                    if (dc !== 0) isHorizontal = true;
                                } else if (segments.length > 1) {
                                    if (isHorizontal === true && dr !== 0) return false;
                                    if (isHorizontal === false && dc !== 0) return false;
                                }
                            }
                        }
                    }
                    const size = segments.length;
                    if (size < 1 || size > 4) return false;
                    shipsCount[size]++;
                    const allDirs = [
                        [-1, -1], [-1, 0], [-1, 1],
                        [0, -1], [0, 1],
                        [1, -1], [1, 0], [1, 1]
                    ];
                    for (const [sr, sc] of segments) {
                        for (const [dr, dc] of allDirs) {
                            const nr = sr + dr;
                            const nc = sc + dc;
                            if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10 && board[nr][nc] === 1) {
                                let isPart = false;
                                for (const [cr, cc] of segments) {
                                    if (cr === nr && cc === nc) {
                                        isPart = true; break;
                                    }
                                }
                                if (!isPart) return false;
                            }
                        }
                    }
                }
            }
        }
        return shipsCount[4] === 1 && shipsCount[3] === 2 && shipsCount[2] === 3 && shipsCount[1] === 4;
    }
});