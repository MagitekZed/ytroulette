from flask import Flask, render_template, request, redirect, url_for, jsonify, session
from flask_socketio import SocketIO, emit, join_room
from datetime import timedelta
import game_creation
from game_creation import set_player_ready
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
app.config['SESSION_COOKIE'] = 'Player ID'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=12)  # Set session lifetime to 12 hours
socketio = SocketIO(app)

games = {}  # Global dictionary to store games

@app.route('/')
def index():
    player_id = session.get('player_id')
    game_key = session.get('game_key')

    # No changes needed here if the game_key is being sent to the template
    return render_template('index.html', game_key=game_key if player_id and game_key else None)

# Helper function to generate a unique player identifier
def generate_player_id():
    return str(uuid.uuid4())

@app.route('/create_game', methods=['POST'])
def create_game_route():
    player_name = request.form['player_name']
    # Generate a unique player ID and store it in the session
    player_id = generate_player_id()
    session['player_id'] = player_id
    # Create the game and store the game key in the session
    game_key = game_creation.create_game(player_name, games)
    session['game_key'] = game_key
    # Send back JSON with the URL for redirection
    return jsonify({'url': url_for('game_lobby', game_key=game_key)})

@app.route('/join_game', methods=['POST'])
def join_game_route():
    player_name = request.form['player_name']
    game_key = request.form['game_code']
    if game_creation.join_game(game_key, player_name, games):
        # Generate a unique player ID if one does not already exist
        if 'player_id' not in session:
            session['player_id'] = generate_player_id()
        # Store the game key in the session
        session['game_key'] = game_key
        updated_players = list(games[game_key]['players'].keys())
        socketio.emit('update_players', {'players': updated_players}, room=game_key)
        # Send back JSON with the URL for redirection
        return jsonify({'url': url_for('game_lobby', game_key=game_key)})
    else:
        return jsonify({'error': 'Invalid game code or name already taken'}), 400

@app.route('/game_lobby/<game_key>')
def game_lobby(game_key):
    if game_key in games:
        player_id = session.get('player_id')
        return render_template('game_lobby.html', game=games[game_key], game_code=game_key, player_id=player_id)
    else:
        return "Game not found"

@app.route('/clear_session', methods=['POST'])
def clear_session():
    # Clear the session cookies
    session.pop('player_id', None)
    session.pop('game_key', None)
    return jsonify({'status': 'session cleared'}), 200

# Add more route definitions here

# Server-side validation in app.py
@socketio.on('player_ready')
def handle_player_ready(data):
    player_id = session.get('player_id')
    game_key = session.get('game_key')
    ready_status = data.get('ready')

    # Check if the player_id in session matches the player_id in the game
    if games[game_key]['players'].get(player_id) and set_player_ready(games, game_key, player_id, ready_status):
        # Broadcast the player's readiness to all clients in the game room
        emit('player_ready_update', {'player_id': player_id, 'ready': ready_status}, room=game_key)

@socketio.on('join')
def on_join(data):
    room = data['game_code']
    join_room(room)
    game = games[room]
    players_info = [
        {'player_id': player_id, 'name': player_id, 'isHost': (info['role'] == 'host'), 'ready': info['ready']}
        for player_id, info in game['players'].items()
    ]
    print('Sending player info:', players_info)  # Debugging line
    socketio.emit('update_players', {'players': players_info}, room=room)

if __name__ == '__main__':
  socketio.run(app, host='0.0.0.0', port=8080)