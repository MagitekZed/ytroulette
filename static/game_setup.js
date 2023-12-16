document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname.startsWith('/game_lobby/')) {
        var socket = io.connect(location.protocol + '//' + document.domain + ':' + location.port);

        let currentPlayers = {};

        if (window.gameCode) {
            socket.on('connect', function() {
                socket.emit('join', { 'game_code': window.gameCode });
            });
        }

        function createPlayerListItem(player) {
            console.log('Creating list item for player:', player); // Debugging line
            var playerItem = document.createElement('li');
            playerItem.className = 'player-item';
            playerItem.textContent = player.name + (player.isHost ? ' (Host)' : '');

            if (player.player_id === window.sessionId) {
                var readyButton = document.createElement('button');
                readyButton.className = 'ready-button ' + (player.ready ? 'ready' : 'not-ready');
                readyButton.textContent = player.ready ? 'Ready' : 'Not Ready';
                readyButton.onclick = function() {
                    socket.emit('player_ready', { 'ready': !player.ready });
                };
                playerItem.appendChild(readyButton);
            }

            return playerItem;
        }

        function updatePlayerReadyState(playerItem, player) {
            var readyButton = playerItem.querySelector('.ready-button');
            if (readyButton) {
                readyButton.className = 'ready-button ' + (player.ready ? 'ready' : 'not-ready');
                readyButton.textContent = player.ready ? 'Ready' : 'Not Ready';
            }
        }

        socket.on('update_players', function(data) {
            var playersList = document.getElementById('playersList');
            data.players.forEach(function(player) {
                var playerItem = currentPlayers[player.name];

                if (!playerItem) {
                    playerItem = createPlayerListItem(player);
                    playersList.appendChild(playerItem);
                    currentPlayers[player.name] = playerItem;
                } else {
                    updatePlayerReadyState(playerItem, player);
                }
            });
        });

        socket.on('player_ready_update', function(data) {
            var playerItem = currentPlayers[data.player_name];
            if (playerItem) {
                updatePlayerReadyState(playerItem, {
                    name: data.player_name,
                    ready: data.ready,
                    player_id: window.sessionId
                });
            }
        });
    }
});


function fadeIn(element) {
    element.style.display = 'block';
    element.style.opacity = 0;
    var last = +new Date();
    var tick = function() {
        element.style.opacity = +element.style.opacity + (new Date() - last) / 400;
        last = +new Date();

        if (+element.style.opacity < 1) {
            (window.requestAnimationFrame && requestAnimationFrame(tick)) || setTimeout(tick, 16);
        }
    };
    tick();
}

function fadeOut(element) {
    element.style.opacity = 1;
    var last = +new Date();
    var tick = function() {
        element.style.opacity = +element.style.opacity - (new Date() - last) / 400;
        last = +new Date();

        if (+element.style.opacity > 0) {
            (window.requestAnimationFrame && requestAnimationFrame(tick)) || setTimeout(tick, 16);
        } else {
            element.style.display = 'none';
        }
    };
    tick();
}

function showCreateGameForm() {
    fadeOut(document.getElementById('rulesBox'));
    fadeOut(document.getElementById('joinGameForm'));
    fadeIn(document.getElementById('createGameForm'));
}

function showJoinGameForm() {
    fadeOut(document.getElementById('rulesBox'));
    fadeOut(document.getElementById('createGameForm'));
    fadeIn(document.getElementById('joinGameForm'));
}

function showRules() {
    fadeOut(document.getElementById('createGameForm'));
    fadeOut(document.getElementById('joinGameForm'));
    fadeIn(document.getElementById('rulesBox'));
}

function hideRules() {
    fadeOut(document.getElementById('rulesBox'));
}

function hideForms() {
    fadeOut(document.getElementById('createGameForm'));
    fadeOut(document.getElementById('joinGameForm'));
}

if (window.location.pathname === '/') {
    showCreateGameForm();
}

function createGame() {
    var playerName = document.getElementById('createPlayerName').value.trim();

    if (!playerName) {
        alert('Please enter your name');
        return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/create_game', true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

    xhr.onreadystatechange = function() {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status === 200) {
                var response = JSON.parse(xhr.responseText);
                window.location.href = response.url;
            } else {
                alert('Error creating game');
            }
        }
    };

    xhr.send('player_name=' + encodeURIComponent(playerName));
}

function joinGame() {
    var playerName = document.getElementById('joinPlayerName').value.trim();
    var gameCode = document.getElementById('joinGameCode').value.trim();

    if (!playerName || !gameCode) {
        alert('Please enter your name and game code');
        return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/join_game', true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

    xhr.onreadystatechange = function() {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status === 200) {
                var response = JSON.parse(xhr.responseText);
                window.location.href = response.url;
            } else {
                alert('Error joining game');
            }
        }
    };

    xhr.send('player_name=' + encodeURIComponent(playerName) + '&game_code=' + encodeURIComponent(gameCode));
}

