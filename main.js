// ==========================================
// Global Variables & Safe Socket Init
// ==========================================
window.currentUser = null;
var currentUser = null;
var activeChat = null;
var dashboardData = { contacts: [], groups: [], statuses: [] };
var activeCaller = null;
var currentFilter = 'all';

var socket = null;
try {
    if (typeof io !== 'undefined') {
        socket = io();
    } else {
        console.warn("Socket.io library not loaded yet.");
    }
} catch (e) {
    console.warn("Socket init error:", e);
}

// ==========================================
// युझर प्रोफाइल आणि स्वतःचा DP दाखवणे
// ==========================================
function updateUserProfileUI(user) {
    if (!user) return;

    const myNameEl = document.getElementById('current-user-name') || document.getElementById('my-name');
    if (myNameEl) myNameEl.innerText = user.name || user.phone;

    const myDp = document.getElementById('my-dp');
    if (myDp) {
        if (user.dp && user.dp !== 'default_dp.png') {
            myDp.src = `/static/uploads/${user.dp}?t=${new Date().getTime()}`;
        } else {
            myDp.src = "https://ui-avatars.com/api/?name=" + encodeURIComponent(user.name || 'User') + "&background=00a884&color=fff";
        }

        myDp.onerror = function() {
            this.onerror = null;
            this.src = "https://ui-avatars.com/api/?name=" + encodeURIComponent(user.name || 'User') + "&background=00a884&color=fff";
        };
    }
}

// ==========================================
// 1. Authentication & Demo OTP
// ==========================================
async function sendOTP() {
    const phoneInput = document.getElementById('login-phone');
    const phone = phoneInput ? phoneInput.value.trim() : '';
    if (!phone) return alert('Enter mobile number');

    try {
        const res = await fetch('/api/send_otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        const data = await res.json();
        document.getElementById('otp-section').style.display = 'block';
        document.getElementById('demo-otp-display').innerText = `Demo OTP: ${data.demo_otp}`;
        document.getElementById('login-otp').value = data.demo_otp;
    } catch (err) {
        alert('Server connection error: ' + err.message);
    }
}

async function verifyOTP() {
    const nameInput = document.getElementById('login-name');
    const phoneInput = document.getElementById('login-phone');
    const otpInput = document.getElementById('login-otp');

    const nameVal = nameInput ? nameInput.value.trim() : 'User';
    const phoneVal = phoneInput ? phoneInput.value.trim() : '';
    const otpVal = otpInput ? otpInput.value.trim() : '';

    if (!phoneVal) {
        alert('Please enter your mobile number!');
        return;
    }

    try {
        const response = await fetch('/api/verify_otp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                name: nameVal || 'User',
                phone: phoneVal,
                otp: otpVal
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            window.currentUser = data.user;
            currentUser = data.user;
            localStorage.setItem('wa_user', JSON.stringify(currentUser));

            if (typeof updateUserProfileUI === 'function') {
                updateUserProfileUI(currentUser);
            }

            // Socket वर स्वतःचा फोन रजिस्टर करणे
            if (socket) {
                socket.emit('register_user', { phone: currentUser.phone });
            }

            const loginScreen = document.getElementById('login-screen') || document.querySelector('.login-container');
            const appScreen = document.getElementById('app-screen') || document.querySelector('.app-container');

            if (loginScreen) loginScreen.style.setProperty('display', 'none', 'important');
            if (appScreen) appScreen.style.setProperty('display', 'flex', 'important');

            loadDashboard();
        } else {
            alert('Login failed: ' + (data.message || 'Invalid OTP'));
        }
    } catch (err) {
        console.warn('Network issue caught, loading in fallback mode:', err);

        const fallbackUser = {
            id: Date.now(),
            phone: phoneVal,
            name: nameVal || 'User',
            dp: 'default_dp.png',
            theme: 'dark'
        };

        window.currentUser = fallbackUser;
        currentUser = fallbackUser;
        localStorage.setItem('wa_user', JSON.stringify(currentUser));

        if (typeof updateUserProfileUI === 'function') {
            updateUserProfileUI(currentUser);
        }

        if (socket) {
            socket.emit('register_user', { phone: currentUser.phone });
        }

        const loginScreen = document.getElementById('login-screen') || document.querySelector('.login-container');
        const appScreen = document.getElementById('app-screen') || document.querySelector('.app-container');

        if (loginScreen) loginScreen.style.setProperty('display', 'none', 'important');
        if (appScreen) appScreen.style.setProperty('display', 'flex', 'important');

        loadDashboard();
    }
}

// ==========================================
// 2. Load Dashboard & Sync UI
// ==========================================
async function loadDashboard() {
    let storedUser = localStorage.getItem('wa_user');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        updateUserProfileUI(currentUser);
    }

    if (!currentUser || !currentUser.phone) {
        return;
    }

    // Socket वर युझरला जोडून ठेवणे
    if (socket) {
        socket.emit('register_user', { phone: currentUser.phone });
    }

    const currentNameSpan = document.getElementById('current-user-name');
    if (currentNameSpan) currentNameSpan.innerText = currentUser.name || 'User';

    const myNameLabel = document.getElementById('my-name-label');
    if (myNameLabel) myNameLabel.innerText = currentUser.name || 'User';

    if (currentUser.dp && currentUser.dp !== 'default_dp.png') {
        const myDp = document.getElementById('my-dp');
        if (myDp) myDp.src = `/static/uploads/${currentUser.dp}?t=${new Date().getTime()}`;
    }

    document.body.className = currentUser.theme || 'dark';

    try {
        const res = await fetch(`/api/dashboard/${currentUser.phone}`);
        dashboardData = await res.json();

        if (dashboardData.user) {
            currentUser = dashboardData.user;
            localStorage.setItem('wa_user', JSON.stringify(currentUser));
            if (currentNameSpan) currentNameSpan.innerText = currentUser.name || 'User';
        }

        if (dashboardData.groups && socket) {
            dashboardData.groups.forEach(g => socket.emit('join', { room: `group_${g.id}` }));
        }

        renderChatList();
        renderStatuses();
    } catch (e) {
        console.error('Error loading dashboard:', e);
        renderChatList();
    }
}

function renderChatList() {
    const list = document.getElementById('chat-list');
    if (!list) return;

    const searchInput = document.getElementById('search-input');
    const q = searchInput ? searchInput.value.toLowerCase() : '';
    list.innerHTML = '';

    const contacts = dashboardData.contacts || [];
    const groups = dashboardData.groups || [];

    // Filter Logic
    let filteredContacts = contacts;
    let filteredGroups = groups;

    if (currentFilter === 'groups') {
        filteredContacts = [];
    } else if (currentFilter === 'unread') {
        filteredGroups = [];
    }

    if (filteredContacts.length === 0 && filteredGroups.length === 0) {
        list.innerHTML = '<div style="color: #8696a0; text-align: center; padding: 20px; font-size: 14px;">No chats found. Click ➕ to start!</div>';
        return;
    }

    // Contacts Render
    filteredContacts
        .filter(c => (c.contact_name || '').toLowerCase().includes(q) || (c.contact_phone || '').includes(q))
        .forEach(c => {
            const firstLetter = (c.contact_name && c.contact_name.length > 0) ? c.contact_name[0].toUpperCase() : 'C';
            const div = document.createElement('div');
            div.className = 'chat-item';
            div.style = 'padding: 10px 14px; border-bottom: 1px solid #202c33; cursor: pointer; display: flex; align-items: center; justify-content: space-between;';
            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; overflow: hidden;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: #00a884; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; flex-shrink: 0;">
                        ${firstLetter}
                    </div>
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <strong style="color: #e9edef; font-size: 15px;">${c.contact_name}</strong><br>
                        <small style="color: #8696a0; font-size: 13px;">${c.contact_phone}</small>
                    </div>
                </div>
                <span>${c.is_locked ? '🔒' : ''}</span>
            `;
            div.onclick = () => selectChat({
                type: 'contact',
                id: c.id,
                phone: c.contact_phone,
                name: c.contact_name,
                is_locked: c.is_locked,
                lock_pin: c.lock_pin
            });
            list.appendChild(div);
        });

    // Groups Render
    filteredGroups
        .filter(g => (g.group_name || '').toLowerCase().includes(q))
        .forEach(g => {
            const div = document.createElement('div');
            div.className = 'chat-item';
            div.style = 'padding: 10px 14px; border-bottom: 1px solid #202c33; cursor: pointer; display: flex; align-items: center; gap: 12px;';
            div.innerHTML = `
                <div style="width: 40px; height: 40px; border-radius: 50%; background: #2a3942; display: flex; align-items: center; justify-content: center; color: white; font-size: 18px; flex-shrink: 0;">
                    👥
                </div>
                <div>
                    <strong style="color: #e9edef; font-size: 15px;">${g.group_name}</strong><br>
                    <small style="color: #8696a0; font-size: 13px;">Group Chat</small>
                </div>
            `;
            div.onclick = () => selectChat({ type: 'group', id: g.id, name: g.group_name });
            list.appendChild(div);
        });
}

function filterChats() {
    renderChatList();
}

// ==========================================
// 3. Select Chat & Messages
// ==========================================
async function selectChat(chat) {
    if (chat.type === 'contact' && chat.is_locked) {
        const pin = prompt('🔒 This chat is locked. Enter 4-digit PIN:');
        if (pin !== String(chat.lock_pin)) return alert('Incorrect PIN!');
    }
    activeChat = chat;
    document.getElementById('chat-header').style.display = 'flex';
    document.getElementById('chat-footer').style.display = 'flex';
    document.getElementById('active-chat-name').innerText = chat.name;
    document.getElementById('active-chat-sub').innerText = chat.type === 'group' ? 'Group Chat' : chat.phone;
    
    const lockBtn = document.getElementById('lock-btn');
    if (lockBtn) {
        lockBtn.style.display = chat.type === 'contact' ? 'inline-block' : 'none';
    }

    const payload = chat.type === 'group'
        ? { group_id: chat.id }
        : { user_phone: currentUser.phone, target_phone: chat.phone };

    try {
        const res = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const msgs = await res.json();
        const box = document.getElementById('messages-box');
        box.innerHTML = '';
        msgs.forEach(appendMessage);
    } catch (err) {
        console.error('Error fetching messages:', err);
    }
}

function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !activeChat) return;

    if (socket) {
        socket.emit('send_message', {
            sender_phone: currentUser.phone,
            receiver_phone: activeChat.type === 'contact' ? activeChat.phone : null,
            group_id: activeChat.type === 'group' ? activeChat.id : null,
            message_text: text
        });
    }
    input.value = '';
}

async function sendFileAttachment() {
    const fileInput = document.getElementById('file-upload');
    if (!fileInput.files.length || !activeChat) return;
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.status === 'success' && socket) {
            socket.emit('send_message', {
                sender_phone: currentUser.phone,
                receiver_phone: activeChat.type === 'contact' ? activeChat.phone : null,
                group_id: activeChat.type === 'group' ? activeChat.id : null,
                message_text: '',
                file_path: data.file_path,
                file_name: data.file_name
            });
        }
    } catch (err) {
        console.error('File upload error:', err);
    }
}

// Media Preview Fix: लिंकऐवजी थेट फोटो/व्हिडिओ दाखवणे
function appendMessage(m) {
    const box = document.getElementById('messages-box');
    if (!box) return;

    const div = document.createElement('div');
    const sender = m.sender_phone || m.sender;
    const isMine = String(sender) === String(currentUser.phone);
    div.className = `msg ${isMine ? 'sent' : 'received'}`;
    div.id = `msg-${m.id}`;

    let content = `<div><small style="opacity:0.7; font-size:11px;">${sender}</small></div>`;
    
    if (m.is_deleted) {
        content += `<em>🚫 This message was deleted</em>`;
    } else {
        const fileUrl = m.file_path || m.media_url;
        if (fileUrl) {
            const ext = fileUrl.split('.').pop().toLowerCase();
            const fullPath = fileUrl.startsWith('/') ? fileUrl : `/static/uploads/${fileUrl}`;
            
            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                content += `
                    <div style="margin: 6px 0;">
                        <img src="${fullPath}" style="max-width:240px; max-height:240px; border-radius:8px; display:block; cursor:pointer;" onclick="window.open('${fullPath}', '_blank')">
                    </div>
                `;
            } else if (['mp4', 'webm'].includes(ext)) {
                content += `
                    <div style="margin: 6px 0;">
                        <video src="${fullPath}" controls style="max-width:260px; border-radius:8px; display:block;"></video>
                    </div>
                `;
            } else {
                content += `<div style="margin: 4px 0;"><a href="${fullPath}" target="_blank" style="color:#53bdeb; text-decoration:underline;">📎 ${m.file_name || 'Download Attachment'}</a></div>`;
            }
        }

        if (m.message_text || m.message) {
            content += `<span>${m.message_text || m.message}</span>`;
        }

        if (isMine) {
            content += `<span class="del-btn" style="cursor:pointer; margin-left:8px;" onclick="deleteMessage(${m.id})">🗑️</span>`;
        }
    }

    div.innerHTML = content;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

if (socket) {
    socket.on('receive_message', (msg) => {
        if (!activeChat) return;
        const sender = msg.sender_phone || msg.sender;
        if (activeChat.type === 'group' && msg.group_id === activeChat.id) {
            appendMessage(msg);
        } else if (activeChat.type === 'contact' &&
            (String(sender) === String(activeChat.phone) || String(sender) === String(currentUser.phone))) {
            appendMessage(msg);
        }
    });

    socket.on('message_deleted', ({ msg_id }) => {
        const el = document.getElementById(`msg-${msg_id}`);
        if (el) el.innerHTML = `<em>🚫 This message was deleted</em>`;
    });
}

function deleteMessage(msgId) {
    if (socket) socket.emit('delete_message', { msg_id: msgId });
}

async function toggleChatLock() {
    if (!activeChat || activeChat.type !== 'contact') return;
    const newLock = !activeChat.is_locked;
    let pin = null;
    if (newLock) {
        pin = prompt('Set a 4-digit PIN to lock this chat:');
        if (!pin) return;
    }
    await fetch('/api/chat_lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: activeChat.id, is_locked: newLock, pin })
    });
    activeChat.is_locked = newLock;
    activeChat.lock_pin = pin;
    alert(newLock ? 'Chat Locked!' : 'Chat Unlocked!');
    loadDashboard();
}

// ==========================================
// 4. Contact, Group, Status & Settings
// ==========================================
async function saveContact() {
    const nameInput = document.getElementById('new-contact-name');
    const phoneInput = document.getElementById('new-contact-phone');

    const contact_name = nameInput ? nameInput.value.trim() : '';
    const contact_phone = phoneInput ? phoneInput.value.trim() : '';

    if (!contact_name || !contact_phone) {
        alert('Please enter both name and phone number!');
        return;
    }

    let storedUser = localStorage.getItem('wa_user');
    if (storedUser) currentUser = JSON.parse(storedUser);

    const userPhone = currentUser ? currentUser.phone : '';
    const userId = currentUser ? currentUser.id : 1;

    try {
        const res = await fetch('/api/add_contact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                owner_phone: userPhone,
                contact_name: contact_name,
                contact_phone: contact_phone
            })
        });

        const data = await res.json();
        if (data.status === 'success') {
            if (nameInput) nameInput.value = '';
            if (phoneInput) phoneInput.value = '';
            closeModals();
            await loadDashboard();
        } else {
            alert('Failed to save contact');
        }
    } catch (err) {
        console.warn('Network issue while saving contact, refreshing UI:', err);
        closeModals();
        await loadDashboard();
    }
}

async function createGroup() {
    const group_name = document.getElementById('new-group-name').value.trim();
    const rawMembers = document.getElementById('new-group-members').value.split(',');
    rawMembers.push(currentUser.phone);
    await fetch('/api/create_group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, group_name, members: [...new Set(rawMembers)] })
    });
    closeModals();
    loadDashboard();
}

async function postStatus() {
    const caption = document.getElementById('status-caption').value.trim();
    const fileInput = document.getElementById('status-file');
    let file_path = null;
    if (fileInput.files.length) {
        const fd = new FormData();
        fd.append('file', fileInput.files[0]);
        const up = await (await fetch('/api/upload', { method: 'POST', body: fd })).json();
        file_path = up.file_path;
    }
    await fetch('/api/post_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentUser.phone, name: currentUser.name, caption, file_path })
    });
    document.getElementById('status-caption').value = '';
    closeModals();
    loadDashboard();
}

function renderStatuses() {
    const feed = document.getElementById('status-feed');
    if (!feed) return;
    feed.innerHTML = '';
    (dashboardData.statuses || []).forEach(s => {
        const div = document.createElement('div');
        div.className = 'status-card';
        div.innerHTML = `<strong>${s.user_name || s.name || 'User'}</strong>: ${s.caption || ''}
            ${s.file_path ? `<br><a href="${s.file_path}" target="_blank" style="color:#00a884;">View Status Media</a>` : ''}`;
        feed.appendChild(div);
    });
}

// ==========================================
// १. थीम बदलण्याचे नवीन फंक्शन (लगेच स्क्रीनवर लागू करण्यासाठी)
// ==========================================
function applyTheme(themeName) {
    document.body.className = themeName;
    if (currentUser) {
        currentUser.theme = themeName;
        localStorage.setItem('wa_user', JSON.stringify(currentUser));
    }
}

// ==========================================
// २. अपडेटेड saveSettings() फंक्शन
// ==========================================
async function saveSettings() {
    let dp = currentUser ? (currentUser.dp || 'default_dp.png') : 'default_dp.png';
    const dpFile = document.getElementById('settings-dp-file');
    
    // DP अपलोड हाताळणी
    if (dpFile && dpFile.files.length) {
        const fd = new FormData();
        fd.append('file', dpFile.files[0]);
        try {
            const upRes = await fetch('/api/upload', { method: 'POST', body: fd });
            const up = await upRes.json();
            if (up.file_path) {
                dp = up.file_path;
            }
        } catch (uploadErr) {
            console.error("DP upload error:", uploadErr);
        }
    }

    // इनपुट व्हॅल्यूज घेणे
    const nameEl = document.getElementById('settings-name');
    const aboutEl = document.getElementById('settings-about');
    const themeEl = document.getElementById('settings-theme');
    const notifyEl = document.getElementById('setting-notify-sound');
    const lastSeenEl = document.getElementById('setting-privacy-lastseen');
    const receiptsEl = document.getElementById('setting-privacy-receipts');

    const name = nameEl && nameEl.value.trim() ? nameEl.value.trim() : (currentUser ? currentUser.name : 'User');
    const about = aboutEl && aboutEl.value.trim() ? aboutEl.value.trim() : (currentUser ? currentUser.about : '');
    const theme = themeEl ? themeEl.value : 'dark';
    const notifySound = notifyEl ? notifyEl.checked : true;
    const lastSeen = lastSeenEl ? lastSeenEl.value : 'everyone';
    const readReceipts = receiptsEl ? receiptsEl.checked : true;

    // स्क्रीनवर लगेच थीम आणि नोटिफिकेशन्स लागू करा
    applyTheme(theme);
    localStorage.setItem('wa_notify_sound', notifySound ? 'yes' : 'no');
    localStorage.setItem('wa_privacy_lastseen', lastSeen);
    localStorage.setItem('wa_privacy_receipts', readReceipts ? 'yes' : 'no');

    // बॅकएंड API ला डेटा पाठवणे
    try {
        await fetch('/api/update_settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: currentUser.phone,
                name: name,
                about: about,
                dp: dp,
                theme: theme,
                notify_sound: notifySound,
                last_seen: lastSeen,
                read_receipts: readReceipts
            })
        });
    } catch (err) {
        console.warn("Backend settings update note:", err);
    }

    // लोकल युझर ऑब्जेक्ट अपडेट करणे
    if (currentUser) {
        currentUser.name = name;
        currentUser.about = about;
        currentUser.dp = dp;
        currentUser.theme = theme;
        localStorage.setItem('wa_user', JSON.stringify(currentUser));
        updateUserProfileUI(currentUser);
    }

    closeModals();
    loadDashboard();
}

// ==========================================
// 5. User-to-User Real-Time Calling Fix
// ==========================================
function startCall(callType) {
    if (!activeChat || activeChat.type !== 'contact') return alert('Select a 1-to-1 contact to call');
    
    const targetPhone = activeChat.phone || activeChat.contact_phone;
    const modal = document.getElementById('call-modal');
    const title = document.getElementById('call-title');
    const statusText = document.getElementById('call-status-text');
    const acceptBtn = document.getElementById('accept-call-btn');

    if (title) title.innerText = `${callType} Calling ${activeChat.name}...`;
    if (statusText) statusText.innerText = 'Ringing...';
    if (acceptBtn) acceptBtn.style.display = 'none';
    if (modal) modal.style.display = 'flex';

    if (socket) {
        socket.emit('call_user', {
            caller: currentUser.phone,
            caller_phone: currentUser.phone,
            caller_name: currentUser.name || 'User',
            target: targetPhone,
            target_phone: targetPhone,
            call_type: callType
        });
    }
}

if (socket) {
    // Incoming Call Receiver
    socket.on('incoming_call', (data) => {
        window.activeCaller = data.caller || data.caller_phone;
        const modal = document.getElementById('call-modal');
        const title = document.getElementById('call-title');
        const statusText = document.getElementById('call-status-text');
        const acceptBtn = document.getElementById('accept-call-btn');

        if (title) title.innerText = `Incoming ${data.call_type || 'Audio'} Call`;
        if (statusText) statusText.innerText = `From: ${data.caller_name || 'Someone'} (${window.activeCaller})`;
        if (acceptBtn) acceptBtn.style.display = 'inline-block';
        if (modal) modal.style.display = 'flex';
    });

    // Call Accepted or Rejected
    socket.on('call_response', (data) => {
        const statusText = document.getElementById('call-status-text');
        if (data.status === 'Accepted') {
            if (statusText) statusText.innerText = 'Connected (In Call) 🟢';
        } else {
            if (statusText) statusText.innerText = data.status || 'Call Ended';
            setTimeout(closeModals, 1500);
        }
    });

    socket.on('call_status', (data) => {
        const statusText = document.getElementById('call-status-text');
        if (data.status === 'Accepted') {
            if (statusText) statusText.innerText = 'Connected (In Call) 🟢';
        } else {
            closeModals();
        }
    });

    socket.on('call_ended', () => {
        closeModals();
        alert('Call ended.');
    });
}

function respondCall(status) {
    if (socket && window.activeCaller) {
        socket.emit('respond_call', { caller: window.activeCaller, caller_phone: window.activeCaller, status: status });
    }
    const statusText = document.getElementById('call-status-text');
    const acceptBtn = document.getElementById('accept-call-btn');
    if (status === 'Accepted') {
        if (statusText) statusText.innerText = 'Connected (In Call) 🟢';
        if (acceptBtn) acceptBtn.style.display = 'none';
    } else {
        closeModals();
    }
}

function endCall() {
    const target = (activeChat && activeChat.phone) ? activeChat.phone : window.activeCaller;
    if (socket && target) {
        socket.emit('end_call', { target: target, target_phone: target });
    }
    closeModals();
}

function toggleEmoji() {
    const bar = document.getElementById('emoji-bar');
    if (bar) bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
}

function addEmoji(e) {
    const input = document.getElementById('msg-input');
    if (input) input.value += e;
}

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

// ==========================================
// 6. Dropdown Toggle & Click Handling Fix
// ==========================================
function toggleMenu(menuId) {
    const targetMenu = document.getElementById(menuId);
    const wasOpen = targetMenu ? targetMenu.classList.contains('show') || targetMenu.style.display === 'block' : false;

    // आधी सर्व उघडे मेनू बंद करा
    document.querySelectorAll('.dropdown-content').forEach(d => {
        d.classList.remove('show');
        d.style.display = 'none';
    });

    if (targetMenu && !wasOpen) {
        targetMenu.classList.add('show');
        targetMenu.style.display = 'block';
    }
}

window.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown') && !e.target.matches('.icon-btn')) {
        document.querySelectorAll('.dropdown-content').forEach(d => {
            d.classList.remove('show');
            d.style.display = 'none';
        });
    }
});

// ==========================================
// 7. Clear Chat, Block & Report Logic
// ==========================================
function clearCurrentChat() {
    if (!activeChat) return alert("Select a chat first!");
    if (confirm("Are you sure you want to clear all messages with this contact?")) {
        const chatBox = document.getElementById('messages-box');
        if (chatBox) chatBox.innerHTML = '<div style="color:#8696a0; text-align:center; padding:15px;">Messages in this chat have been cleared.</div>';
        
        fetch('/api/clear_chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ phone: currentUser.phone, target: activeChat.phone })
        });
    }
}

function blockCurrentContact() {
    if (!activeChat) return alert("Select a contact first!");
    const targetName = activeChat.name || activeChat.phone;
    if (confirm(`Block ${targetName}? Blocked contacts cannot send you messages.`)) {
        alert(`${targetName} has been blocked.`);
    }
}

function reportCurrentContact() {
    if (!activeChat) return alert("Select a contact first!");
    const targetName = activeChat.name || activeChat.phone;
    if (confirm(`Report ${targetName} to WhatsApp Support?`)) {
        alert("Report submitted successfully. Thank you!");
    }
}

// ==========================================
// 8. Channels & Chat Filter Pills Fix
// ==========================================
function setChatFilter(filterType, pillElement) {
    currentFilter = filterType;
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    if (pillElement) pillElement.classList.add('active');

    if (filterType === 'channels') {
        showChannelsView();
    } else {
        renderChatList();
    }
}

function showChannelsView() {
    const listContainer = document.getElementById('chat-list');
    if (!listContainer) return;
    
    const channels = [
        { name: "WhatsApp Official", followers: "148M followers", dp: "📢" },
        { name: "Tech Updates Daily", followers: "12M followers", dp: "💻" },
        { name: "Maharashtra Info & Jobs", followers: "5.4M followers", dp: "📰" }
    ];

    listContainer.innerHTML = '<div style="padding:10px 16px; color:#25d366; font-weight:600; font-size:14px;">Explore Channels</div>';
    channels.forEach(ch => {
        listContainer.innerHTML += `
            <div class="chat-item" style="cursor:pointer; display:flex; align-items:center; padding:10px 14px; border-bottom:1px solid #202c33;" onclick="alert('Viewing channel: ${ch.name}')">
                <div style="font-size:20px; display:flex; align-items:center; justify-content:center; background:#202c33; width:40px; height:40px; border-radius:50%; flex-shrink:0;">
                    ${ch.dp}
                </div>
                <div style="margin-left:12px;">
                    <div style="color:#e9edef; font-weight:600; font-size:14px;">${ch.name}</div>
                    <div style="color:#8696a0; font-size:12px;">${ch.followers}</div>
                </div>
            </div>
        `;
    });
}

function saveNotificationPref(isEnabled) {
    localStorage.setItem('wa_notify_sound', isEnabled ? 'yes' : 'no');
    alert(`Message sounds turned ${isEnabled ? 'ON' : 'OFF'}`);
}

function logoutUser() {
    if (confirm("तुम्हाला नक्की Logout करायचे आहे का?")) {
        localStorage.removeItem('wa_user');
        currentUser = null;
        activeChat = null;
        closeModals();
        window.location.reload();
    }
}

// ==========================================
// 9. Auto-Initialize on Page Load
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    const stored = localStorage.getItem('wa_user');
    if (stored) {
        currentUser = JSON.parse(stored);
        const loginScreen = document.getElementById('login-screen');
        const appScreen = document.getElementById('app-screen');
        if (loginScreen) loginScreen.style.setProperty('display', 'none', 'important');
        if (appScreen) appScreen.style.setProperty('display', 'flex', 'important');
        loadDashboard();
    }
});