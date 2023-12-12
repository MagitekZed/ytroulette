from flask import Flask, render_template, request
from flask_socketio import SocketIO
import game_logic

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/create_game', methods=['GET', 'POST'])
def create_game():
    if request.method == 'POST':
        player_name = request.form['player_name']
        game_code = game_logic.create_game(player_name)
        # Redirect to game page with game_code, or render a template with the code
        return game_code
    return redirect(url_for('game', game_code=game_code))

@app.route('/join_game', methods=['GET', 'POST'])
def join_game():
    if request.method == 'POST':
        player_name = request.form['player_name']
        game_code = request.form['game_code']
        if game_logic.join_game(game_code, player_name):
            # Redirect to game page, or render a template for the game
            return "Joined game " + game_code
        else:
            return "Error: Invalid code or name"
    return redirect(url_for('game', game_code=game_code))

@app.route('/game/<game_code>')
def game(game_code):
    if game_code in game_logic.games:
        players = game_logic.games[game_code]['players']
        return render_template('game.html', players=players, game_code=game_code)
    else:
        return "Game not found"

# Add more route definitions here

if __name__ == '__main__':
    socketio.run(app, debug=True)
