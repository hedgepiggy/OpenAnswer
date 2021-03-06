from datetime import datetime
from email import utils
from flask import request
from flask_login import current_user
from flask_socketio import emit
from app import socketio, db
from app.chat.events import ONLINE_USERS
from app.models import Message
import hashlib


def generate_hash(username, question_title):
    # FIXME: Maybe timestamp isn't required so they go to the same question when asked the same thing twice.
    return hashlib.md5(b'%s-%s' % (username, question_title)).hexdigest()


@socketio.on('joined', namespace='/questions')
def joined(data):
    """Sent by clients when they enter a room.
    A status message is broadcast to all people in the room."""
    # FIXME: Sometimes stale connections keep trying to reconnect and keep emitting joined event
    # FIXME: Not sure if this is the right approach but suppress these warnings for now so it doesn't clutter the logs
    sid = request.sid
    if not current_user.is_anonymous:
        room = generate_hash(data['author'], data['question_title'])
        ONLINE_USERS.joined(sid, room)
        emit('status', {'viewing': ONLINE_USERS.get_users(room)}, room=room)


@socketio.on('disconnect', namespace='/chat')
def disconnect():
    sid = request.sid
    room = ONLINE_USERS.disconnected(sid)
    online = ['<div id="chat_username" user="%s">%s</div>' % (u, u) for u in ONLINE_USERS.get_users(room)]
    emit('status', {'online_users': online}, room=room)


@socketio.on('sent', namespace='/chat')
def receive(data):
    content = data['msg']
    room = data['room']
    username = current_user.username
    namespace = '/chat'
    m = Message(user_id=current_user.id, content=content, room=room, namespace=namespace)
    db.session.add(m)
    db.session.commit()
    emit('received',
         {
             'content': content,
             'username': username,
             'private': False,
             'timestamp': utils.format_datetime(m.timestamp),
         }, room=room)


@socketio.on('whispered', namespace='/chat')
def receive_whisper(data):
    content = data['msg']
    username = current_user.username
    to, *_ = content.split(' ', maxsplit=1)
    recipient_rooms = PRIVATE_ROOMS.get(to[1:])  # trim the leading @
    my_rooms = PRIVATE_ROOMS.get(username)
    ts = datetime.utcnow()
    if not recipient_rooms:
        content = 'Not delivered: ' + content
    else:
        for room in recipient_rooms:
            emit('received',
                 {
                     'content': content,
                     'username': username,
                     'private': True,
                     'timestamp': utils.format_datetime(ts),
                 }, room=room)

    for room in my_rooms:
        # Also emit to myself to see whether the message was delivered or not
        emit('received',
             {
                 'content': content,
                 'username': username,
                 'private': True,
                 'timestamp': utils.format_datetime(ts),
             }, room=room)
