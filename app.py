from flask import Flask, render_template, request, redirect, url_for
from flask_socketio import SocketIO, emit, join_room
import game_logic

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

@socketio.on('join')
def on_join(data):
    game_code = data['game_code']
    player_name = data['player_name']
    game_logic.join_game(game_code, player_name)
    emit('update_players', {'players': list(game_logic.games[game_code]['players'])}, room=game_code)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/create_game', methods=['GET', 'POST'])
def create_game():
    if request.method == 'POST':
        player_name = request.form['player_name']
        game_code = game_logic.create_game(player_name)
        socketio.emit('join', {'game_code': game_code, 'player_name': player_name})
        return redirect(url_for('game', game_code=game_code, player_name=player_name))
    return render_template('create_game.html')

@app.route('/join_game', methods=['GET', 'POST'])
def join_game():
    if request.method == 'POST':
        player_name = request.form['player_name']
        game_code = request.form['game_code']
        if game_logic.join_game(game_code, player_name):
            socketio.emit('join', {'game_code': game_code, 'player_name': player_name})
            return redirect(url_for('game', game_code=game_code, player_name=player_name))
        else:
            return "Error: Invalid code or name"
    return render_template('join_game.html')

@socketio.on('join')
def on_join(data):
    room = data['game_code']
    join_room(room)
    emit('player_joined', {'players': list(game_logic.games[room]['players'])}, room=room)

@app.route('/game/<game_code>')
def game(game_code):
    if game_code in game_logic.games:
        players = game_logic.games[game_code]['players']
        player_name = request.args.get('player_name', '')  # Retrieve the player's name from the query parameters
        return render_template('game.html', players=players, game_code=game_code, player_name=player_name)
    else:
        return "Game not found"

# Add more route definitions here

if __name__ == '__main__':
    socketio.run(app, debug=True)
