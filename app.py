from flask import Flask, render_template
from flask_socketio import SocketIO

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

@app.route('/')
def home():
    return render_template('home.html')

@socketio.on('change_color')
def handle_change_color():
    global current_color
    current_color = "red" if current_color == "blue" else "blue"
    emit('color_change', {'color': current_color}, broadcast=True)

if __name__ == '__main__':
    socketio.run(app, debug=True)
