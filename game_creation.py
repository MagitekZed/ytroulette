import random
import string

# Assuming you have a global dictionary to store games, it should be passed to these functions
games = {}

def generate_game_key(length=4, games_dict=None):
    characters = string.ascii_uppercase + string.digits
    while True:
        game_key = ''.join(random.choices(characters, k=length))
        if game_key not in games_dict:
            return game_key

def generate_unique_game_id(length=24, games_dict=None):
    characters = string.ascii_letters + string.digits
    while True:
        unique_id = ''.join(random.choices(characters, k=length))
        if unique_id not in games_dict:
            return unique_id

def create_game(player_name, games_dict):
    game_key = generate_game_key(games_dict=games_dict)
    unique_game_id = generate_unique_game_id(games_dict=games_dict)
    games_dict[game_key] = {
        'host': player_name,
        'players': {player_name: {'role': 'host', 'ready': False}},
        'status': 'waiting',
        'unique_id': unique_game_id
    }
    return game_key

def join_game(game_key, player_name, games_dict):
    if game_key in games_dict and player_name not in games_dict[game_key]['players']:
        games_dict[game_key]['players'][player_name] = {'role': 'player', 'ready': False}
        return True
    return False


def transition_game_key(old_key, games_dict):
    if old_key in games_dict:
        game_data = games_dict.pop(old_key)
        new_key = game_data['unique_id']
        games_dict[new_key] = game_data
        return new_key
    return None

def set_player_ready(games, game_key, player_id, ready_status):
    game = games.get(game_key)
    if game and player_id in game['players']:
        game['players'][player_id]['ready'] = ready_status
        return True
    return False