import random
import string

games = {}

def generate_game_code(length=4):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

def create_game(player_name):
    code = generate_game_code()
    games[code] = {'players': {player_name}, 'active': True}
    return code

def join_game(code, player_name):
    if code in games and player_name not in games[code]['players']:
        games[code]['players'].add(player_name)
        return True
    return False

# Additional game logic functions here
