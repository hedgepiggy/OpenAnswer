$(document).ready(function () {
    var my_username = document.getElementById('_my_username').textContent;
    var is_visible = visibility(); //visibility returns a function, so is_visible is a function
    var unread = 0;
    var old_unread = 0;
    var room_name = location.pathname.substr(location.pathname.lastIndexOf('/') + 1);
    var socket = io.connect('http://' + document.domain + ':' + location.port + '/chat');

    // Grab the latest messages and populate the chat
    $.getJSON('../messages/' + room_name, function (data) {
        $.each(data.messages, function (idx, msg) {
            add_message(my_username, msg);
        })
    });
    scrollChatToBottom(1); //scroll after 1 second delay to let mathjax finish rendering

    socket.on('connect', function () {
        socket.emit('joined', {room: room_name});
    });

    socket.on('status', function (data) {
        var online_users_div = document.getElementById('users_in_room');
        online_users_div.innerHTML = 'Online: ' + data.online_users.join(' ');
    });

    socket.on('received', function (data) {
        add_message(my_username, data);

        if (!is_visible()) {
            unread += 1;
            var new_title = document.title.replace(old_unread.toString(), unread.toString());
            document.title = new_title;
        }
        old_unread = unread;
        
        scrollChatToBottom();
    });

    var text_area = $('#text');
    var latex_preview_div = $('#latex_preview');

    text_area.focus(function () {
        unread = 0;
        if (old_unread != 0) {
            document.title = document.title.replace(old_unread.toString(), unread.toString());
        }
    });

    text_area.keypress(function (e) {
        var code = e.keyCode || e.which;
        if (code == 13) {
            var text = text_area.val();
            text_area.val('');
            if ($.trim(text) != '') {
                text_area.contains_latex = false;
                latex_preview_div.collapse('hide');
                socket.emit('sent', {msg: text, room: room_name});
                if (text.match("^\@")) {
                    add_message(my_username, {username: my_username, content: text, private: true});
                    // We're not emitting any events so scroll down manually
                    scrollChatToBottom();
                }
            }
        }
    });

    text_area.keyup(function (e) {
        //FIXME: Investigate why the delay causes extra line endings
        var val = this.value;
        var latex_endings = {'(': '\\)', '[': '\\]'};
        var caret_pos = $(text_area).caret();
        if ($.inArray(e.key, Object.keys(latex_endings)) != -1) {
            // caret is after nth character, we want the character before that; and then subtract another one because strings are 0-index
            var previous_char = val[caret_pos-1-1]
            if (previous_char == '\\') {
                text_area.contains_latex = true;
                $(text_area).insertAtCaret(latex_endings[e.key]);
                text_area.caret(caret_pos);
            }
        }
        if (text_area.contains_latex & val !='') {
            preview_latex(val, latex_preview_div);
        }
        else {
            latex_preview_div.collapse('hide');
        }
    })
});

function add_message(my_username, data) {
    var content = data.content;
    var div_id = data.private ? "chat_message_private" : "chat_message";
    div_id = content.match(" " + my_username + " ") ? "chat_message_to_me" : div_id;

    var user = '<div id="chat_username" user="' + data.username +'">' + data.username + ':</div> ';
    // Patch xss vulnerability by using .text instead of .html and only converting back escaped html
    var msg = $('<div>').text(content).html();
    $('#chat_messages').append($('<li id="' + div_id + '">').html(user + msg + '</li>').linkify({target: "_blank"}));
    MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
}

function preview_latex(tex, latex_preview_div) {
    latex_preview_div.collapse('show');
    // FIXME: Why is this lowercase queue and the one in add_message uppercase
    MathJax.Hub.queue.Push(["Text", MathJax.Hub.getAllJax("latex_preview")[0], tex.replace(/\\\[|\\\]|\\\(|\\\)|\$\$/g, "")]);
}

function visibility() {
    var stateKey, eventKey, keys = {
        hidden: "visibilitychange",
        webkitHidden: "webkitvisibilitychange",
        mozHidden: "mozvisibilitychange",
        msHidden: "msvisibilitychange"
    };
    for (stateKey in keys) {
        if (stateKey in document) {
            eventKey = keys[stateKey];
            break;
        }
    }
    return function (c) {
        if (c) document.addEventListener(eventKey, c);
        return !document[stateKey];
    }
}

function scrollChatToBottom(delay) {
    var delay = 500 * delay;
    setTimeout(function () {
        var chatroom = $('#chatroom');
        chatroom.scrollTop(chatroom.prop("scrollHeight"));
    }, delay);
}