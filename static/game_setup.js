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

function createGame() {
    // Implement AJAX call to server to create game
}

function joinGame() {
    // Implement AJAX call to server to join game
}

window.onload = function() {
    showCreateGameForm();
};

// Add event listeners for form submission if necessary
