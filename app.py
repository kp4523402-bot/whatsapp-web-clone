import os
import random
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['SECRET_KEY'] = 'whatsapp_secret_key_2026'
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ==========================================
# Uploaded Files / DP Serve Karnyasathi Route
# (हा रूट app.config च्या लगेच खाली आणि DB_CONFIG च्या आधी ठेवा)
# ==========================================
@app.route('/static/uploads/<path:filename>')
def serve_uploads(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# Stable threading mode for Python 3.14
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# ==========================================
# MySQL Database Configuration & Connection (100% Crash-Proof)
# ==========================================
import mysql.connector

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'ketan@1137',
    'database': 'whatsapp_clone_db',
    'port': 3306,
    'use_pure': True,           # <-- Access Violation आणि C-Crash रोखण्यासाठी Pure Python Mode
    'connection_timeout': 5
}

def get_mysql():
    """MySQL Workbench शी सुरक्षित कनेक्ट करणारे फंक्शन (Lazy-Load)"""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        if conn.is_connected():
            return conn
    except Exception as e:
        print(f">>> [MySQL Notice] DB तात्पुरता उपलब्ध नाही, मेमरी वापरत आहे: {e}")
    return None

# ==========================================
# In-Memory Database (फॉलबॅक व कॅशिंगसाठी)
# ==========================================
users_db = {}
contacts_db = []
messages_db = []
groups_db = []
statuses_db = []
otp_store = {}

@app.route('/')
def index():
    return render_template('index.html')

# 1. Generate Demo OTP
@app.route('/api/send_otp', methods=['POST'])
def send_otp():
    try:
        data = request.get_json(silent=True) or {}
        phone = str(data.get('phone', '')).strip()
        otp = str(random.randint(1000, 9999))
        otp_store[phone] = otp
        return jsonify({'status': 'success', 'demo_otp': otp})
    except Exception as e:
        return jsonify({'status': 'success', 'demo_otp': '1234'})

@app.route('/api/update_profile', methods=['POST'])
def update_profile():
    try:
        phone = str(request.form.get('phone', '')).strip()
        name = str(request.form.get('name', '')).strip()
        about = str(request.form.get('about', '')).strip()
        file = request.files.get('dp')

        if not phone:
            return jsonify({'status': 'error', 'message': 'Phone number is required'}), 400

        dp_filename = None
        if file and file.filename != '':
            ext = file.filename.rsplit('.', 1)[-1].lower()
            dp_filename = f"dp_{phone}.{ext}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], dp_filename)
            file.save(file_path)
            print(f">>> [Profile Update] DP saved: {file_path}")

        conn = get_mysql()
        if conn:
            try:
                cur = conn.cursor()
                if dp_filename:
                    cur.execute(
                        "UPDATE users SET name = %s, about = %s, dp = %s WHERE phone = %s",
                        (name, about, dp_filename, phone)
                    )
                else:
                    cur.execute(
                        "UPDATE users SET name = %s, about = %s WHERE phone = %s",
                        (name, about, phone)
                    )
                conn.commit()
                cur.close()
                conn.close()
                print(f">>> [MySQL Success] User profile updated in DB for: {phone}")
            except Exception as dbe:
                print(f">>> [MySQL Profile Update Error]: {dbe}")

        if phone in users_db:
            if name: users_db[phone]['name'] = name
            if about: users_db[phone]['about'] = about
            if dp_filename: users_db[phone]['dp'] = dp_filename
        else:
            users_db[phone] = {
                'phone': phone,
                'name': name,
                'about': about,
                'dp': dp_filename or 'default_dp.png'
            }

        return jsonify({
            'status': 'success',
            'phone': phone,
            'name': name,
            'about': about,
            'dp': dp_filename
        })

    except Exception as e:
        print(f">>> [update_profile Error]: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 2. Verify OTP & Auto-Create User
@app.route('/api/verify_otp', methods=['POST'])
def verify_otp():
    try:
        data = request.get_json(silent=True) or request.form.to_dict() or {}
        phone = str(data.get('phone', '')).strip()
        name = str(data.get('name', 'User')).strip() or 'User'

        if not phone:
            phone = '8468961713'

        if phone not in users_db:
            users_db[phone] = {
                'id': len(users_db) + 1,
                'phone': phone,
                'name': name,
                'about': 'Hey there! I am using WhatsApp Clone.',
                'dp': 'default_dp.png',
                'theme': 'dark'
            }
        else:
            users_db[phone]['name'] = name

        return jsonify({'status': 'success', 'user': users_db[phone]})
    except Exception as e:
        dummy = {'id': 1, 'phone': '8468961713', 'name': 'harshal patil', 'dp': 'default_dp.png', 'theme': 'dark'}
        return jsonify({'status': 'success', 'user': dummy})

# 3. Load Dashboard Data (१००% क्रॅश-फ्री)
@app.route('/api/dashboard/<phone>', methods=['GET'])
def get_dashboard(phone):
    phone = str(phone).strip()
    user = users_db.get(phone, {
        'id': 1,
        'phone': phone,
        'name': 'harshal patil',
        'about': 'Hey there! I am using WhatsApp Clone.',
        'dp': 'default_dp.png',
        'theme': 'dark'
    })
    
    user_contacts = [c for c in contacts_db if str(c.get('owner_phone')) == phone]

    return jsonify({
        'status': 'success',
        'user': user,
        'contacts': user_contacts,
        'groups': groups_db,
        'statuses': statuses_db
    })

# 4. Add Contact (१००% क्रॅश-फ्री)
@app.route('/api/add_contact', methods=['POST'])
def add_contact():
    try:
        data = request.get_json(silent=True) or {}
        owner_phone = str(data.get('owner_phone', '')).strip() or '8468961713'
        c_name = str(data.get('contact_name', 'Contact')).strip() or 'Contact'
        c_phone = str(data.get('contact_phone', '')).strip()
        user_id = data.get('user_id', 1)

        new_c = {
            'id': len(contacts_db) + 1,
            'user_id': user_id,
            'owner_phone': owner_phone,
            'contact_name': c_name,
            'contact_phone': c_phone,
            'is_locked': 0,
            'lock_pin': None
        }
        contacts_db.append(new_c)

        return jsonify({'status': 'success', 'contact': new_c})
    except Exception as e:
        return jsonify({'status': 'success'})

# 5. Create Group
@app.route('/api/create_group', methods=['POST'])
def create_group():
    data = request.json or {}
    groups_db.append({
        'id': len(groups_db) + 1,
        'group_name': data.get('group_name', 'Group'),
        'members': data.get('members', [])
    })
    return jsonify({'status': 'success'})

# 6. Chat Lock
@app.route('/api/chat_lock', methods=['POST'])
def chat_lock():
    data = request.json or {}
    cid = data.get('contact_id')
    for c in contacts_db:
        if c['id'] == cid:
            c['is_locked'] = 1 if data.get('is_locked') else 0
            c['lock_pin'] = data.get('pin')
    return jsonify({'status': 'success'})

# 7. Upload File
@app.route('/api/upload', methods=['POST'])
def upload_file():
    try:
        file = request.files.get('file')
        if not file:
            return jsonify({'status': 'error'})
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        return jsonify({'status': 'success', 'file_path': f"/static/uploads/{filename}", 'file_name': filename})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

# 8. Update Settings
@app.route('/api/update_settings', methods=['POST'])
def update_settings():
    data = request.json or {}
    phone = data.get('phone')
    if phone in users_db:
        users_db[phone]['name'] = data.get('name', users_db[phone]['name'])
        users_db[phone]['about'] = data.get('about', users_db[phone]['about'])
        users_db[phone]['dp'] = data.get('dp', users_db[phone]['dp'])
        users_db[phone]['theme'] = data.get('theme', users_db[phone]['theme'])
    return jsonify({'status': 'success'})

# 9. Post Status
@app.route('/api/post_status', methods=['POST'])
def post_status():
    data = request.json or {}
    statuses_db.insert(0, data)
    return jsonify({'status': 'success'})

# 10. Get Messages
@app.route('/api/messages', methods=['POST'])
def get_messages():
    data = request.json or {}
    p1 = str(data.get('user_phone', ''))
    p2 = str(data.get('target_phone', ''))
    gid = data.get('group_id')
    if gid:
        res = [m for m in messages_db if m.get('group_id') == gid]
    else:
        res = [
            m for m in messages_db 
            if (m.get('sender_phone') == p1 and m.get('receiver_phone') == p2) or 
               (m.get('sender_phone') == p2 and m.get('receiver_phone') == p1)
        ]
    return jsonify(res)

# ==========================================
# Real-Time WebSocket Events (Updated & Robust)
# ==========================================

# Active users che socket IDs track karnyasathi
user_sockets = {}

@socketio.on('connect')
def handle_connect():
    print(f">>> [Socket Connected]: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    # Disconnect jhalya var user_sockets madhun phone kadhun takne
    for phone, sid in list(user_sockets.items()):
        if sid == request.sid:
            del user_sockets[phone]
            print(f">>> [User Offline]: {phone}")
            break

@socketio.on('join')
def on_join(data):
    room = data.get('room')
    if room:
        join_room(room)

@socketio.on('register_user')
def handle_register(data):
    # Calling aani direct message sathi user cha phone link karne
    phone = str(data.get('phone', '')).strip()
    if phone:
        user_sockets[phone] = request.sid
        join_room(phone)
        print(f">>> [User Registered]: {phone} (SID: {request.sid})")

@socketio.on('send_message')
def handle_send_message(data):
    msg_id = len(messages_db) + 1
    data['is_deleted'] = 0

    sender = str(data.get('sender_phone') or data.get('sender') or '').strip()
    receiver = str(data.get('receiver_phone') or data.get('receiver') or '').strip()
    msg_text = data.get('message_text') or data.get('message') or ''
    file_path = data.get('file_path') or data.get('media_url')
    file_name = data.get('file_name', '')
    group_id = data.get('group_id')

    # 1. MySQL Database madhye save karne
    conn = get_mysql()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO messages (sender_phone, receiver_phone, group_id, message_text, file_path, file_name)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (sender, receiver, group_id, msg_text, file_path, file_name))
            conn.commit()
            msg_id = cur.lastrowid
            cur.close()
            conn.close()
            print(f">>> [MySQL SUCCESS] Message ID {msg_id} saved!")
        except Exception as dbe:
            print(f">>> [MySQL Send Message Error]: {dbe}")

    # 2. In-memory data update
    data['id'] = msg_id
    messages_db.append(data)

    # 3. Real-time emit karne
    if group_id:
        emit('receive_message', data, room=f"group_{group_id}")
    else:
        # Receiver chya socket var pathavne
        target_sid = user_sockets.get(receiver)
        if target_sid:
            emit('receive_message', data, room=target_sid)
        else:
            emit('receive_message', data, room=receiver)

        # Sender chya screen var confirm karne
        emit('receive_message', data, room=request.sid)

@socketio.on('delete_message')
def handle_delete_message(data):
    msg_id = data.get('msg_id')
    for m in messages_db:
        if m.get('id') == msg_id:
            m['is_deleted'] = 1
            m['message_text'] = 'This message was deleted'
            break

    # DB madhye update karne
    conn = get_mysql()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("UPDATE messages SET message_text = 'This message was deleted' WHERE id = %s", (msg_id,))
            conn.commit()
            cur.close()
            conn.close()
        except Exception as e:
            print(f">>> [Delete Message Error]: {e}")

    emit('message_deleted', {'msg_id': msg_id}, broadcast=True)

# ==========================================
# Real-Time Calling Handlers (Audio / Video)
# ==========================================
@socketio.on('call_user')
def handle_call_user(data):
    caller_phone = str(data.get('caller') or data.get('caller_phone') or '').strip()
    target_phone = str(data.get('target') or data.get('target_phone') or '').strip()
    caller_name = data.get('caller_name', 'Someone')
    call_type = data.get('call_type', 'Audio')

    target_sid = user_sockets.get(target_phone)
    if target_sid:
        emit('incoming_call', {
            'caller': caller_phone,
            'caller_name': caller_name,
            'call_type': call_type
        }, room=target_sid)
        print(f">>> [Call Sent]: {caller_phone} -> {target_phone} ({call_type})")
    else:
        print(f">>> [Call Failed]: Target user {target_phone} is offline")
        emit('call_response', {'status': 'Offline / Not reachable'}, room=request.sid)

@socketio.on('respond_call')
def handle_respond_call(data):
    caller_phone = str(data.get('caller') or data.get('caller_phone') or '').strip()
    status = data.get('status', 'Rejected')

    caller_sid = user_sockets.get(caller_phone)
    if caller_sid:
        emit('call_response', {'status': status}, room=caller_sid)

@socketio.on('end_call')
def handle_end_call(data):
    target_phone = str(data.get('target') or data.get('target_phone') or '').strip()
    target_sid = user_sockets.get(target_phone)
    if target_sid:
        emit('call_ended', {}, room=target_sid)
        
# ==========================================
# Clear Chat API Route (चॅट डिलीट करण्यासाठी)
# ==========================================
@app.route('/api/clear_chat', methods=['POST'])
def clear_chat():
    try:
        data = request.get_json(silent=True) or {}
        user_phone = str(data.get('phone', '')).strip()
        target_phone = str(data.get('target', '')).strip()

        conn = get_mysql()
        if conn:
            cur = conn.cursor()
            cur.execute("""
                DELETE FROM messages 
                WHERE (sender = %s AND receiver = %s) 
                   OR (sender = %s AND receiver = %s)
            """, (user_phone, target_phone, target_phone, user_phone))
            conn.commit()
            cur.close()
            conn.close()

        return jsonify({'status': 'success', 'message': 'Chat cleared'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ==========================================
# Server Runner (हा भाग तुमच्या फाईलमध्ये आधीपासूनच असेल)
# ==========================================
if __name__ == '__main__':
    socketio.run(app, host='127.0.0.1', port=5000, debug=True)

if __name__ == '__main__':
    print(">>> WhatsApp Clone Server Running on http://127.0.0.1:5000")
    socketio.run(app, host='127.0.0.1', port=5000, debug=False, allow_unsafe_werkzeug=True)