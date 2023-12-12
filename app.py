from flask import Flask, render_template, request
from flask_socketio import SocketIO
import game_logic

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

@app.route('/')
def index():
    return render_template('index.html')

# Add more route definitions here

if __name__ == '__main__':
    socketio.run(app, debug=True)
